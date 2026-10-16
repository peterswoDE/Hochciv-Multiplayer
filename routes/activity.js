/**
 * Discord Activity (Embedded App SDK). Discord shows the game in an iframe on
 * https://<client id>.discordsays.com and forwards every request to this server (URL mapping
 * "/" → this server's host). The bridge (activity/bridge.js) uses these routes:
 *
 *   GET  /api/activity/config  – the Discord client ID
 *   POST /api/activity/token   – exchanges the SDK's OAuth code for an access token
 *   POST /api/activity/lobby   – seats the Discord user in the lobby of their activity instance
 *
 * The Activity uses the Discord application configured as OAuth provider in the admin panel
 * (client ID + secret; the optional bot token there checks instance membership).
 *
 *   POST /api/activity/log     – progress and errors of the bridge, written to the server log
 *                                (Discord's console is hard to reach while testing)
 *
 * One lobby per activity instance: everyone who launches the Activity in the same call lands
 * in the same lobby. Each Discord user gets a secret clientId per instance, so reopening the
 * Activity puts them back into their seat. If the lobby is gone (host left before the start,
 * game over), the next player to join creates a fresh one.
 */
const express = require('express');
const crypto = require('crypto');
const rateLimitLib = require('express-rate-limit');
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const { OAuthProvider, User } = require('../models');
const config = require('../config');

const router = express.Router();
const DISCORD_API = 'https://discord.com/api/v10';
const INSTANCE_TTL_MS = 12 * 60 * 60 * 1000;

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false
});

/** Express 4 does not catch rejected promises of async handlers. */
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

/** { clientId, clientSecret, botToken } of the Discord application, or null if not configured. */
async function discordApp() {
    const p = await OAuthProvider.findOne({ where: { provider: 'discord' } });
    return p && p.clientId && p.clientSecret
        ? { clientId: p.clientId, clientSecret: p.clientSecret, botToken: p.botToken || '' } : null;
}

async function discordFetch(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

/** With a bot token: is the user really part of that activity instance? Without one: yes. */
async function inInstance(app, instanceId, userId) {
    if (!app.botToken) return true;
    const r = await discordFetch(`${DISCORD_API}/applications/${app.clientId}/activity-instances/${encodeURIComponent(instanceId)}`,
        { headers: { Authorization: `Bot ${app.botToken}` } });
    if (!r.ok) console.warn(`[Activity] Instance check failed (${r.status}) – does the bot token belong to app ${app.clientId}?`);
    return r.ok && Array.isArray(r.data.users) && r.data.users.includes(userId);
}

function displayName(user) {
    const n = String(user.global_name || user.username || '').replace(/[\u0000-\u001f<>]/g, '').trim();
    return n || `Discord ${String(user.id).slice(-4)}`;
}

// ── Lobby per activity instance ─────────────────────────────────────────────

const instances = new Map();    // instanceId → { sessionId, clients: Map(discordUserId → clientId), touched }
const locks = new Map();        // instanceId → tail of the running operation

/** Run fn exclusively per instance, so two players starting at once do not create two lobbies. */
function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const run = prev.then(fn);
    const tail = run.catch(() => { });
    locks.set(key, tail);
    tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
}

// Same defaults as "Neues Spiel hosten" in mp.js; the host changes them in the lobby.
function defaultGameConfig() {
    return {
        seed: crypto.randomInt(2 ** 31),
        isPublic: false,
        duel: false,
        events: false,
        eventMode: 'hard',
        wonders: false,
        difficulty: 'prinz',
        mapKey: '0',
    };
}

/** → { sessionId, joinCode, password, clientId, playerIndex, created } or an error string */
function seat(instanceId, user) {
    return withLock(instanceId, async () => {
        let rec = instances.get(instanceId);
        let s = rec && sessions.getSession(rec.sessionId);
        // Finished games count as gone, so "play again" gets a fresh lobby
        if (rec && (!s || (s.state && s.state.over))) {
            instances.delete(instanceId);
            rec = null;
        }
        const name = displayName(user);

        if (!rec) {
            if (serverState.state.maintenanceMode) {
                return 'Der Server befindet sich im Wartungsmodus. Es können keine neuen Lobbys erstellt werden.';
            }
            const clientId = crypto.randomUUID();
            const r = sessions.createSession(defaultGameConfig(), { name, clientId });
            if (typeof r === 'string') return r;
            instances.set(instanceId, { sessionId: r.sessionId, clients: new Map([[user.id, clientId]]), touched: Date.now() });
            return { ...r, clientId, playerIndex: 0, created: true };
        }

        const clientId = rec.clients.get(user.id) || crypto.randomUUID();
        const r = sessions.joinSession(s.joinCode, s.password, { name, clientId });
        if (typeof r === 'string') return r;
        rec.clients.set(user.id, clientId);
        rec.touched = Date.now();
        return { sessionId: s.id, joinCode: s.joinCode, password: s.password, clientId, playerIndex: r.playerIndex, created: false };
    });
}

/** A free username from the Discord name, same rules as registration (3–30 of A–Z a–z 0–9 _ -). */
async function freeUsername(discordUser) {
    let base = String(discordUser.username || discordUser.global_name || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24);
    if (base.replace(/_/g, '').length < 3) base = `discord_${String(discordUser.id).slice(-6)}`;
    for (let i = 0; ; i++) {
        const name = i === 0 ? base : `${base}_${i + 1}`;
        if (!(await User.findOne({ where: { username: name } }))) return name;
    }
}

const creating = new Map();     // discordId → Promise<User>, so parallel requests create only one account

/**
 * The Hochciv account of a Discord user: the linked one, or a new account without e-mail and
 * password (origin 'activity'). Linking Discord on the website later merges it into that account.
 */
function activityAccount(discordUser) {
    const discordId = String(discordUser.id);
    if (creating.has(discordId)) return creating.get(discordId);
    const p = (async () => {
        const user = await User.findOne({ where: { discordId } });
        if (user) return user;
        const created = await User.create({
            username: await freeUsername(discordUser),
            email: null,
            password_hash: null,
            isActive: true,
            origin: 'activity',
            discordId,
            avatarUrl: discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png` : null,
        });
        console.log(`[Activity] Created account ${created.username} for Discord user ${discordId}.`);
        return created;
    })().finally(() => creating.delete(discordId));
    creating.set(discordId, p);
    return p;
}

/**
 * The Activity iframe sends no site cookie, so the socket has no logged-in user. Tie the seat
 * to the player's account instead – for game history and MMR.
 */
function linkAccount(result, user) {
    const s = sessions.getSession(result.sessionId);
    const player = s && s.players.find(p => p.clientId === result.clientId);
    if (!player) return;
    player.dbUserId = user.id;
    player.dbUsername = user.username;
    player.mmr = user.mmr;
}

const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - INSTANCE_TTL_MS;
    for (const [id, rec] of instances) {
        if (rec.touched < cutoff || !sessions.getSession(rec.sessionId)) instances.delete(id);
    }
}, 10 * 60 * 1000);
cleanupTimer.unref();

// ── Routes ──────────────────────────────────────────────────────────────────

router.get('/config', wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const app = await discordApp();
    if (!app) return res.status(503).json({ error: 'Discord-Activity ist auf diesem Server nicht eingerichtet.' });
    // Same-origin links (Impressum …) open on the public website through Discord
    res.json({ clientId: app.clientId, publicSiteUrl: config.BASE_URL });
}));

router.post('/token', limit, wrap(async (req, res) => {
    const code = req.body && req.body.code;
    if (typeof code !== 'string' || !code || code.length > 200) return res.status(400).json({ error: 'Ungültiger Code.' });
    const app = await discordApp();
    if (!app) return res.status(503).json({ error: 'Discord-Activity ist auf diesem Server nicht eingerichtet.' });

    const r = await discordFetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: app.clientId,
            client_secret: app.clientSecret,
            grant_type: 'authorization_code',
            code,
        }),
    });
    if (!r.ok || !r.data.access_token) {
        console.warn(`[Activity] Token exchange failed (${r.status}): ${r.data.error || 'unknown'}`);
        return res.status(401).json({ error: 'Discord-Anmeldung fehlgeschlagen.' });
    }
    res.json({ access_token: r.data.access_token });
}));

router.post('/lobby', limit, wrap(async (req, res) => {
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const instanceId = req.body && req.body.instanceId;
    if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
    if (typeof instanceId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(instanceId)) {
        return res.status(400).json({ error: 'Ungültige Activity-Instanz.' });
    }
    const app = await discordApp();
    if (!app) return res.status(503).json({ error: 'Discord-Activity ist auf diesem Server nicht eingerichtet.' });

    const me = await discordFetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!me.ok || !me.data.id) return res.status(401).json({ error: 'Discord-Anmeldung abgelaufen. Bitte die Activity neu starten.' });
    if (!(await inInstance(app, instanceId, me.data.id))) {
        return res.status(403).json({ error: 'Du bist nicht Teil dieser Activity.' });
    }

    const account = await activityAccount(me.data);
    if (account.isBanned) return res.status(403).json({ error: 'Dein Hochciv-Konto ist gesperrt.' });

    const result = await seat(instanceId, me.data);
    if (typeof result === 'string') return res.status(409).json({ error: result });
    linkAccount(result, account);
    res.json(result);
}));

const logLimit = rateLimitLib({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
router.post('/log', logLimit, (req, res) => {
    const b = req.body || {};
    const level = b.level === 'error' ? 'error' : 'info';
    const text = String(b.msg || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 500);
    const frame = String(b.frame || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64);
    (level === 'error' ? console.error : console.log)(`[Activity client ${frame}] ${text}`);
    res.status(204).end();
});

module.exports = router;
// For tests: seat a user without the Discord round trip
module.exports.seat = seat;
