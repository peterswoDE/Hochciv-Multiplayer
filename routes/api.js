const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const Settings = require('../utils/settings');
const rateLimitLib = require('../utils/rateLimit');
const BotFilter = require('../utils/botfilter');
const { User } = require('../models');

// Lobbies live in memory – limit how fast one client can create/join them
const lobbyLimit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false
});

/** The id of the logged-in bot account, undefined for humans and guests. */
const botId = req => (req.user && req.user.accountType === 'bot' ? req.user.id : undefined);

/** A bot account's seat: the account, its owner and – for the host's bot filter – whether it is
 *  friends with the host of `session` (utils/botfilter.js). Nothing for humans and guests. */
async function botInfo(req, session) {
    const id = botId(req);
    if (!id) return {};
    return { botUserId: id, botOwnerId: req.user.ownerId || null, botFriend: session ? await BotFilter.isHostFriend(session, id) : false };
}

// ── POST /api/sessions — create a new session ───────────────────────────────
router.post('/sessions', lobbyLimit, async (req, res) => {
    if (serverState.state.maintenanceMode) {
        return res.status(503).json({ error: 'Der Server befindet sich im Wartungsmodus. Es können keine neuen Lobbys erstellt werden.' });
    }

    const { config, host } = req.body || {};
    if (!host || typeof host.name !== 'string' || typeof host.clientId !== 'string' || !host.name || !host.clientId) {
        return res.status(400).json({ error: 'host.name und host.clientId sind erforderlich.' });
    }
    if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
        return res.status(400).json({ error: 'Ungültige Konfiguration.' });
    }
    // Only the host's settings; the seed is the server's (a chosen seed means a known map and dice)
    const gameConfig = { ...sessions.cleanHostConfig(config), seed: crypto.randomInt(2 ** 31) };
    // a bot account plays its seat itself (sessions.js playerBotPolicy)
    const result = sessions.createSession(gameConfig, { ...host, ...(await botInfo(req, null)) });
    if (typeof result === 'string') return res.status(503).json({ error: result });
    res.status(201).json(result);
});

// ── POST /api/sessions/join — join with code + password ─────────────────────
router.post('/sessions/join', lobbyLimit, async (req, res) => {
    const { joinCode, password, player } = req.body || {};
    if (typeof joinCode !== 'string' || typeof password !== 'string' || !joinCode || !password || !player
        || typeof player.name !== 'string' || typeof player.clientId !== 'string' || !player.name || !player.clientId) {
        return res.status(400).json({ error: 'joinCode, password, player.name und player.clientId sind erforderlich.' });
    }
    // the account, for the host's ban list (R-23)
    let bot;
    try { bot = await botInfo(req, sessions.lobbyByCode(joinCode)); } catch (err) {
        console.error('Bot join', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
    const result = sessions.joinSession(joinCode, password, { ...player, ...bot, userId: req.user ? req.user.id : undefined });
    if (typeof result === 'string') {
        return res.status(400).json({ error: result });
    }
    res.json(result);
});

// ── POST /api/sessions/watch — watch with code + password (spectator) ───────
router.post('/sessions/watch', lobbyLimit, (req, res) => {
    const { joinCode, password, viewer } = req.body || {};
    if (typeof joinCode !== 'string' || typeof password !== 'string' || !joinCode || !password || !viewer
        || typeof viewer.name !== 'string' || typeof viewer.clientId !== 'string' || !viewer.clientId) {
        return res.status(400).json({ error: 'joinCode, password, viewer.name und viewer.clientId sind erforderlich.' });
    }
    const result = sessions.addSpectator(joinCode, password, viewer);
    if (typeof result === 'string') return res.status(400).json({ error: result });
    res.json(result);
});

// ── POST /api/sessions/preview — invite link: the lobby behind code + password ──
router.post('/sessions/preview', lobbyLimit, (req, res) => {
    const { joinCode, password } = req.body || {};
    if (typeof joinCode !== 'string' || typeof password !== 'string' || !joinCode || !password) {
        return res.status(400).json({ error: 'joinCode und password sind erforderlich.' });
    }
    const result = sessions.previewSession(joinCode, password);
    if (typeof result === 'string') return res.status(400).json({ error: result });
    res.json(result);
});

// ── GET /api/public-sessions — public lobbies and running public games ──────
// A bot account also learns per lobby whether the host's bot filter lets it in (playerBotsForYou)
router.get('/public-sessions', async (req, res) => {
    const id = botId(req);
    if (!id) return res.json(sessions.getPublicSessions());
    try {
        const { Op } = require('sequelize');
        const { Friendship } = require('../models');
        const rows = await Friendship.findAll({ where: { status: 'accepted', [Op.or]: [{ userId: id }, { friendId: id }] }, attributes: ['userId', 'friendId'] });
        const friendIds = new Set(rows.map(r => (r.userId === id ? r.friendId : r.userId)));
        res.json(sessions.getPublicSessions({ id, ownerId: req.user.ownerId || null, friendIds }));
    } catch (err) {
        console.error('Public sessions', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── GET /api/playerbots — the bot accounts a lobby host can choose from (bot filter) ──
// Every bot that may play (not banned), with its owner; for a logged-in person also whether it is
// their own bot and whether they are friends (utils/botfilter.js).
router.get('/playerbots', async (req, res) => {
    try {
        const bots = await User.findAll({
            where: { accountType: 'bot', isBanned: false },
            attributes: ['id', 'username', 'ownerId'],
            order: [['username', 'ASC']],
            limit: 500,
        });
        const ownerIds = [...new Set(bots.map(b => b.ownerId).filter(Boolean))];
        const owners = new Map((await User.findAll({ where: { id: ownerIds }, attributes: ['id', 'username'] })).map(o => [o.id, o.username]));
        const me = req.user && req.user.accountType !== 'bot' ? req.user.id : null;
        const friends = me ? await BotFilter.friendsAmong(me, bots.map(b => b.id)) : new Set();
        res.json({
            bots: bots.map(b => ({
                id: b.id, username: b.username, owner: owners.get(b.ownerId) || null,
                own: !!me && b.ownerId === me, friend: friends.has(b.id),
            })),
        });
    } catch (err) {
        console.error('Player bots', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ── GET /api/settings — what the admin set for every page: the Discord invite link ──
router.get('/settings', async (req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=60');
        res.json(await Settings.publicSettings());
    } catch (err) {
        console.error('[Settings]', err);
        res.json({ discordInvite: null });
    }
});

// ── GET /api/sessions/:id — session info ────────────────────────────────────
router.get('/sessions/:id', (req, res) => {
    const session = sessions.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sitzung nicht gefunden.' });
    // Send public info (no password, no full state)
    res.json({
        id: session.id,
        joinCode: session.joinCode,
        status: session.status,
        players: session.players.map(p => ({
            index: p.index,
            name: p.name,
            civ: p.civ,
            connected: p.connected,
        })),
        currentPlayer: session.state ? session.state.cur : null,
        round: session.state ? session.state.round : null,
        over: session.state ? session.state.over : null,
    });
});

// ── DELETE /api/sessions/:id — host cancels session (body: { clientId } of the host)
router.delete('/sessions/:id', (req, res) => {
    const session = sessions.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sitzung nicht gefunden.' });
    const host = session.players[session.hostIndex];
    const clientId = (req.body || {}).clientId;
    if (!host || typeof clientId !== 'string' || host.clientId !== clientId) {
        return res.status(403).json({ error: 'Nur der Host kann die Sitzung beenden.' });
    }
    sessions.removeSession(req.params.id);
    res.json({ ok: true });
});

// ── GET /api/leaderboard[?type=bot] — global ranking ────────────────────────
// Humans and bot accounts share the MMR, but each has its own list (utils/bots.js)

router.get('/leaderboard', async (req, res) => {
    try {
        const users = await User.findAll({
            where: { accountType: req.query.type === 'bot' ? 'bot' : 'human' },
            attributes: ['id', 'username', 'mmr', 'gamesPlayed'],
            order: [['mmr', 'DESC']],
            limit: 100
        });
        res.json(users);
    } catch (err) {
        console.error('Leaderboard error', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
