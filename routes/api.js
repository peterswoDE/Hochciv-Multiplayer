const express = require('express');
const router = express.Router();
const sessions = require('../sessions');
const serverState = require('../utils/serverState');
const rateLimitLib = require('express-rate-limit');

// Lobbies live in memory – limit how fast one client can create/join them
const lobbyLimit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false
});

// ── POST /api/sessions — create a new session ───────────────────────────────
router.post('/sessions', lobbyLimit, (req, res) => {
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
    const result = sessions.createSession(config || {}, host);
    if (typeof result === 'string') return res.status(503).json({ error: result });
    res.status(201).json(result);
});

// ── POST /api/sessions/join — join with code + password ─────────────────────
router.post('/sessions/join', lobbyLimit, (req, res) => {
    const { joinCode, password, player } = req.body || {};
    if (typeof joinCode !== 'string' || typeof password !== 'string' || !joinCode || !password || !player
        || typeof player.name !== 'string' || typeof player.clientId !== 'string' || !player.name || !player.clientId) {
        return res.status(400).json({ error: 'joinCode, password, player.name und player.clientId sind erforderlich.' });
    }
    const result = sessions.joinSession(joinCode, password, player);
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

// ── GET /api/public-sessions — public lobbies and running public games ──────
router.get('/public-sessions', (req, res) => {
    res.json(sessions.getPublicSessions());
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

// ── GET /api/leaderboard — global ranking ──────────────────────────────────
const { User } = require('../models');

router.get('/leaderboard', async (req, res) => {
    try {
        const users = await User.findAll({
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
