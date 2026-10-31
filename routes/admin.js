const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, User, Passkey, TotpToken, OAuthProvider, Game, AsyncGame } = require('../models');
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const { refreshOAuthStrategies } = require('../utils/oauth');
const config = require('../config');
const { validPassword, MIN_PASSWORD_LENGTH, destroyOtherSessions } = require('../utils/auth');
const bcrypt = require('bcryptjs');
const { deleteAccount } = require('../utils/deleteAccount');
const reports = require('../utils/reports');
const profanity = require('../utils/profanity');
const { detachUser } = require('../utils/detachUser');
const engine = require('../engine-adapter');
const { engineVersionOf } = require('../async/logic');
const GameStats = require('../utils/gamestats');
const Facts = require('../utils/facts');
const { query: statsQuery } = require('./stats');
const Bots = require('../utils/bots');

/** Banned, deleted or no longer allowed to run bots: their bots leave games and connections too. */
async function detachBotsOf(io, ownerId) {
    for (const bot of await User.findAll({ where: { accountType: 'bot', ownerId }, attributes: ['id'] })) {
        await destroyOtherSessions(sequelize, bot.id);
        await detachUser(io, bot.id);
    }
}

const ROLES = ['user', 'botcreator', 'admin', 'superadmin'];
const isPrivileged = role => role === 'admin' || role === 'superadmin';

/**
 * Admins manage normal users. Anything that touches an admin/superadmin account, or that
 * hands out admin rights, needs a superadmin.
 */
function mayManage(actor, target) {
    if (actor.role === 'superadmin') return true;
    return !isPrivileged(target.role);
}

// Admin Middleware (allows admin and superadmin)
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && (req.user.role === 'admin' || req.user.role === 'superadmin')) return next();
    res.status(403).json({ error: 'Nur für Administratoren' });
}

// Super Admin Middleware (superadmin only)
function isSuperAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'superadmin') return next();
    res.status(403).json({ error: 'Nur für Super-Administratoren' });
}

router.use(isAdmin);

// --- Metrics & Config ---
router.get('/metrics', (req, res) => {
    const activeLobbies = Array.from(sessions.getAllSessions().values());
    const playersOnline = activeLobbies.reduce((sum, lobby) => sum + lobby.players.length, 0);

    res.json({
        ...serverState.getMetrics(),
        lobbiesActive: activeLobbies.length,
        playersOnline
    });
});

router.post('/config', (req, res) => {
    const { maintenanceMode, registrationEnabled } = req.body;
    if (maintenanceMode !== undefined) serverState.state.maintenanceMode = maintenanceMode === true;
    if (registrationEnabled !== undefined) serverState.state.registrationEnabled = registrationEnabled === true;
    res.json({ ok: true });
});

// --- User Management ---
router.get('/users', async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'mmr', 'gamesPlayed', 'isActive', 'isBanned', 'role', 'createdAt',
                'accountType', 'ownerId', 'botLimit'],
            order: [['createdAt', 'DESC']]
        });
        // bot accounts: their owner's name; bot creators: how many bots they have and may have
        const byId = new Map(users.map(u => [u.id, u]));
        const owned = {};
        users.forEach(u => { if (u.accountType === 'bot' && u.ownerId) owned[u.ownerId] = (owned[u.ownerId] || 0) + 1; });
        res.json(users.map(u => {
            const j = u.toJSON();
            if (u.accountType === 'bot') {
                const owner = byId.get(u.ownerId) || null;
                j.owner = owner ? { id: owner.id, username: owner.username } : null;
                j.botDisabled = Bots.botUsable(u, owner);
            } else if (Bots.canCreateBots(u)) {
                const limit = Bots.botLimitOf(u);
                j.bots = { count: owned[u.id] || 0, limit: limit === Infinity ? null : limit };
            }
            return j;
        }));
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.get('/users/:id/mfa', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

        const tokens = [];
        if (targetUser.totpSecret) tokens.push({ type: 'totp', id: null, name: 'Authenticator App (Legacy)' });

        const totpTokens = await TotpToken.findAll({ where: { UserId: targetUser.id } });
        totpTokens.forEach(t => tokens.push({ type: 'totp', id: t.id, name: t.name }));

        if (targetUser.emailOtpEnabled) tokens.push({ type: 'email', name: 'E-Mail OTP' });

        const passkeys = await Passkey.findAll({ where: { UserId: targetUser.id } });
        passkeys.forEach(pk => tokens.push({ type: 'passkey', id: pk.id, name: 'Passkey (' + new Date(pk.createdAt).toLocaleDateString() + ')' }));

        res.json(tokens);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/users/:id/mfa/:type/:tokenId?', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (!mayManage(req.user, targetUser)) return res.status(403).json({ error: 'Nur für Super-Administratoren' });

        const { type, tokenId } = req.params;
        if (type === 'totp') {
            if (tokenId && tokenId !== 'null') {
                await TotpToken.destroy({ where: { id: tokenId, UserId: targetUser.id } });
            } else {
                targetUser.totpSecret = null;
            }

            const remaining = await TotpToken.count({ where: { UserId: targetUser.id } });
            if (remaining === 0 && !targetUser.totpSecret) {
                targetUser.totpEnabled = false;
            }
            await targetUser.save();
        } else if (type === 'email') {
            targetUser.emailOtpEnabled = false;
            await targetUser.save();
        } else if (type === 'passkey' && tokenId) {
            await Passkey.destroy({ where: { id: tokenId, UserId: targetUser.id } });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/users/:id/action', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, mmr, newPassword } = req.body;

        const targetUser = await User.findByPk(id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (!mayManage(req.user, targetUser)) return res.status(403).json({ error: 'Nur für Super-Administratoren' });

        let logoutEverywhere = false;
        let detach = false;
        let detachBots = false;
        const bot = Bots.isBot(targetUser);
        if (bot && ['force_password', 'make_admin', 'set_role', 'reset_mfa', 'set_bot_limit'].includes(action)) {
            return res.status(400).json({ error: 'Das geht bei Bot-Konten nicht.' });
        }
        if (action === 'ban') {
            if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst bannen.' });
            targetUser.isBanned = true;
            logoutEverywhere = true;
            detach = true;              // also out of running games and open connections
            detachBots = true;          // … and so are the bots it owns (utils/bots.js)
        } else if (action === 'unban') {
            targetUser.isBanned = false;
        } else if (action === 'set_mmr') {
            const value = Number(mmr);
            targetUser.mmr = Number.isInteger(value) && value >= 0 && value <= 10000 ? value : 1000;
        } else if (action === 'force_password') {
            if (!validPassword(newPassword)) {
                return res.status(400).json({ error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.` });
            }
            targetUser.password_hash = await bcrypt.hash(newPassword, 10);
            logoutEverywhere = true;
        } else if (action === 'make_admin' || action === 'set_role') {
            const role = action === 'make_admin' ? 'admin' : req.body.role;
            if (!ROLES.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
            if (isPrivileged(role) && req.user.role !== 'superadmin') {
                return res.status(403).json({ error: 'Nur Super-Administratoren vergeben Admin-Rechte.' });
            }
            if (targetUser.id === req.user.id) return res.status(400).json({ error: 'Du kannst deine eigene Rolle nicht ändern.' });
            // without bot rights the bots stop; they work again when the rights come back
            detachBots = Bots.canCreateBots(targetUser) && !Bots.BOT_CREATOR_ROLES.includes(role);
            targetUser.role = role;
        } else if (action === 'set_bot_limit') {
            // null: back to the default (config.BOTS_PER_OWNER)
            const value = req.body.botLimit;
            if (value === null || value === '') targetUser.botLimit = null;
            else if (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1000) targetUser.botLimit = Number(value);
            else return res.status(400).json({ error: 'Ungültige Anzahl.' });
        } else if (action === 'reset_mfa') {
            targetUser.totpEnabled = false;
            targetUser.totpSecret = null;
            await TotpToken.destroy({ where: { UserId: targetUser.id } });
            await Passkey.destroy({ where: { UserId: targetUser.id } });
            targetUser.emailOtpEnabled = true;
        } else {
            return res.status(400).json({ error: 'Unbekannte Aktion' });
        }

        await targetUser.save();
        if (logoutEverywhere) await destroyOtherSessions(sequelize, targetUser.id);
        if (detach) await detachUser(req.app.locals.io, targetUser.id);
        if (detachBots) await detachBotsOf(req.app.locals.io, targetUser.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const targetUser = await User.findByPk(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        if (!mayManage(req.user, targetUser)) return res.status(403).json({ error: 'Nur für Super-Administratoren' });
        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Dein eigenes Konto löschst du auf der Profil-Seite.' });
        }
        const error = await deleteAccount(targetUser, { io: req.app.locals.io, byAdmin: req.user.username });
        if (error) return res.status(400).json({ error });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// --- Chat reports (utils/reports.js) ---
router.get('/reports', async (req, res) => {
    try {
        res.json(await reports.list({ status: req.query.status === 'closed' ? 'closed' : 'open', offset: req.query.offset }));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/reports/:id', async (req, res) => {
    try {
        const error = await reports.update(req.params.id, { status: req.body.status, note: req.body.note }, req.user);
        if (error) return res.status(400).json({ error });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// --- Chat word filter (utils/profanity.js): the admins' own entries ---
router.get('/words', async (req, res) => {
    try {
        res.json({ list: await profanity.list() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/words', async (req, res) => {
    try {
        const error = await profanity.add({ word: req.body.word, kind: req.body.kind, match: req.body.match }, req.user);
        if (error) return res.status(400).json({ error });
        res.json({ list: await profanity.list() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.delete('/words/:id', async (req, res) => {
    try {
        const error = await profanity.remove(req.params.id);
        if (error) return res.status(404).json({ error });
        res.json({ list: await profanity.list() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Try a text against the filter as it is now
router.post('/words/check', (req, res) => {
    const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 300) : '';
    res.json({ words: profanity.check(text) });
});

// --- Lobby Management ---
router.get('/lobbies', (req, res) => {
    const list = Array.from(sessions.getAllSessions().values()).map(s => ({
        id: s.id,
        joinCode: s.joinCode,
        status: s.status,
        createdAt: s.createdAt,
        players: s.players.map(p => ({ name: p.name, connected: p.connected }))
    }));
    res.json(list);
});

// --- Game overview: every finished game (newest first, paged) ---
const GAMES_PAGE = 50;
router.get('/games', async (req, res) => {
    try {
        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const q = String(req.query.q || '').trim().slice(0, 50);
        // Player search: matches names and usernames inside the participants JSON
        const where = q ? sequelize.where(sequelize.cast(sequelize.col('participants'), 'text'),
            { [Op.iLike]: `%${q.replace(/[\\%_]/g, c => '\\' + c)}%` }) : undefined;
        const { count, rows } = await Game.findAndCountAll({
            where, order: [['matchDate', 'DESC']], offset, limit: GAMES_PAGE,
        });
        res.json({ total: count, offset, pageSize: GAMES_PAGE, finished: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

/* --- Overall statistics (F13): the public numbers (GET /api/stats) plus matches per version,
   KI levels and where the facts come from; the raw facts as a download; recomputing them. --- */
router.get('/stats', async (req, res) => {
    try {
        res.json(await GameStats.overall(statsQuery(req.query), true));
    } catch (err) {
        console.error('[Stats] Admin', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.get('/stats/export', async (req, res) => {
    try {
        const rows = await GameStats.rows();
        res.set('Content-Disposition', `attachment; filename="hochciv-stats-${new Date().toISOString().slice(0, 10)}.json"`);
        res.json(rows.map(x => ({ id: x.id, date: x.date, version: x.ver, facts: x.f })));
    } catch (err) {
        console.error('[Stats] Export', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// Facts are computed once per match; after a change to utils/facts.js they can be rebuilt
router.post('/stats/recompute', isSuperAdmin, async (req, res) => {
    try {
        const [count] = await Game.update({ facts: null }, { where: {} });
        Facts.backfill().catch(err => console.error('[Facts] Recompute failed:', err));
        res.json({ success: true, games: count });
    } catch (err) {
        console.error('[Stats] Recompute', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

/* --- Running games: live games past the lobby and Rundenspiele that are not over, each with
   the game version it is played with. Live games always run the current version; a
   Rundenspiel keeps the version it was started on (engineVersionOf, async/logic.js), so the
   counts per version show when an old HochCiv-vNN/ folder is no longer needed. --- */
const LIVE_RUNNING = ['placement', 'draft', 'playing'];
router.get('/running', async (req, res) => {
    try {
        const current = engine.version();
        const live = Array.from(sessions.getAllSessions().values())
            .filter(s => LIVE_RUNNING.includes(s.status))
            .map(s => {
                const S = s.state;
                const turn = S && S.players && S.players[S.cur];
                const seat = turn && s.players[turn.slot];
                return {
                    id: s.id, joinCode: s.joinCode, status: s.status, version: current,
                    round: S ? S.round : null,
                    turn: seat ? seat.name : null,
                    createdAt: s.createdAt, lastActivity: s.lastActivity,
                    players: s.players.map(p => ({ name: p.name, kind: p.kind, connected: !!p.connected })),
                };
            })
            .sort((a, b) => b.lastActivity - a.lastActivity);

        const rows = await AsyncGame.findAll({
            where: { status: { [Op.notIn]: ['finished', 'cancelled'] } },
            attributes: ['id', 'joinCode', 'status', 'round', 'isPublic', 'waitSince', 'createdAt', 'updatedAt', 'data'],
            order: [['updatedAt', 'DESC']],
        });
        const rundenspiele = rows.map(g => {
            const d = g.data || {};
            return {
                id: g.id, joinCode: g.joinCode, status: g.status, round: g.round, isPublic: g.isPublic,
                version: engineVersionOf(d), ranked: !!(d.config && d.config.ranked),
                waitingFor: (d.meta && d.meta.waitingFor) || null, waitSince: g.waitSince,
                createdAt: g.createdAt, updatedAt: g.updatedAt,
                players: (d.seats || []).map(seat => ({
                    name: seat.name || seat.civ, isBot: seat.kind === 'bot' || (seat.kind === 'ki' && !seat.replaced), replaced: !!seat.replaced,
                    userId: seat.replaced ? null : seat.userId || null,
                })),
            };
        });

        // Games per version, the current one first, then the older ones as in GAME_DIRS
        const order = [current, ...engine.OLD_VERSIONS];
        const versions = {};
        for (const v of order) versions[v] = { live: 0, rundenspiele: 0 };
        live.forEach(g => { (versions[g.version] = versions[g.version] || { live: 0, rundenspiele: 0 }).live++; });
        rundenspiele.forEach(g => { (versions[g.version] = versions[g.version] || { live: 0, rundenspiele: 0 }).rundenspiele++; });

        res.json({ current, versions, live, rundenspiele });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/lobbies/:id/action', (req, res) => {
    const { id } = req.params;
    const { action, message } = req.body;

    if (action === 'close') {
        sessions.removeSession(id);
        // Force disconnect sockets if we have io instance attached to app locals
        if (req.app.locals.io) {
            req.app.locals.io.to(id).emit('session:kicked', { reason: 'Admin hat die Lobby geschlossen.' });
            req.app.locals.io.to(id).disconnectSockets(true);
        }
        res.json({ ok: true });
    } else if (action === 'broadcast') {
        if (req.app.locals.io && typeof message === 'string' && message) {
            req.app.locals.io.to(id).emit('sys:message', message.slice(0, 500));
            res.json({ ok: true });
        } else {
            res.status(400).json({ error: 'Keine Nachricht oder io nicht bereit' });
        }
    } else {
        res.status(400).json({ error: 'Unbekannte Aktion' });
    }
});


// --- OAuth Provider Management (Super Admin only) ---
router.get('/oauth', isSuperAdmin, async (req, res) => {
    try {
        const providers = await OAuthProvider.findAll({
            attributes: ['id', 'provider', 'clientId', 'clientSecret', 'botToken', 'enabled']
        });
        // Return a map with all known providers, filling in defaults for missing ones
        // callbackBase: what the server really uses in redirect_uri (from BASE_URL)
        const result = { google: null, discord: null, callbackBase: config.BASE_URL };
        for (const p of providers) {
            result[p.provider] = {
                id: p.id,
                clientId: p.clientId,
                clientSecret: p.clientSecret,
                botToken: p.botToken,
                enabled: p.enabled
            };
        }
        res.json(result);
    } catch (err) {
        console.error('OAuth config load error', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.post('/oauth/:provider', isSuperAdmin, async (req, res) => {
    try {
        const { provider } = req.params;
        if (!['google', 'discord'].includes(provider)) {
            return res.status(400).json({ error: 'Ungültiger Provider' });
        }
        const { clientId, clientSecret, botToken, enabled } = req.body;

        const [oauthProvider] = await OAuthProvider.findOrCreate({
            where: { provider },
            defaults: { clientId: clientId || '', clientSecret: clientSecret || '', enabled: !!enabled }
        });

        // Update fields
        if (clientId !== undefined) oauthProvider.clientId = clientId;
        if (clientSecret !== undefined) oauthProvider.clientSecret = clientSecret;
        // Bot token: Discord Activity only
        if (provider === 'discord' && typeof botToken === 'string') oauthProvider.botToken = botToken.trim();
        if (enabled !== undefined) oauthProvider.enabled = enabled;
        await oauthProvider.save();

        // Refresh Passport strategies
        await refreshOAuthStrategies();

        res.json({ ok: true });
    } catch (err) {
        console.error('OAuth config save error', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
