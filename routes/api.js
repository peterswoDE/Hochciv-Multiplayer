const express = require('express');
const router = express.Router();
const sessions = require('../sessions');

// ── POST /api/sessions — create a new session ───────────────────────────────
router.post('/sessions', (req, res) => {
    const { config, host } = req.body || {};
    if (!host || !host.name || !host.clientId) {
        return res.status(400).json({ error: 'host.name und host.clientId sind erforderlich.' });
    }
    const result = sessions.createSession(config || {}, host);
    res.status(201).json(result);
});

// ── POST /api/sessions/join — join with code + password ─────────────────────
router.post('/sessions/join', (req, res) => {
    const { joinCode, password, player } = req.body || {};
    if (!joinCode || !password || !player || !player.name || !player.clientId) {
        return res.status(400).json({ error: 'joinCode, password, player.name und player.clientId sind erforderlich.' });
    }
    const result = sessions.joinSession(joinCode, password, player);
    if (typeof result === 'string') {
        return res.status(400).json({ error: result });
    }
    res.json(result);
});

// ── GET /api/public-sessions — list all public sessions ─────────────────────
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

// ── DELETE /api/sessions/:id — host cancels session ─────────────────────────
router.delete('/sessions/:id', (req, res) => {
    const session = sessions.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sitzung nicht gefunden.' });
    sessions.removeSession(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
