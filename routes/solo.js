/**
 * Single-player games (F28, utils/solo.js) – client/solo.js sends each finished game here.
 *
 *   POST /api/solo/games  – { cid, ver, state, t, rounds } → { ok, id, duplicate? } (login, no bots)
 *
 * Bodies up to 2 MB (server.js lets this path past the usual 20 KB limit).
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const { isAuthenticated, noBots } = require('../utils/auth');
const solo = require('../utils/solo');

const router = express.Router();

const limit = rateLimitLib({
    windowMs: 60 * 60 * 1000,
    max: 120,
    keyGenerator: req => (req.user ? 'u:' + req.user.id : rateLimitLib.ipKeyGenerator(req.ip)),
    message: { error: 'Zu viele Einzelspiele auf einmal. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/games', isAuthenticated, noBots, limit, async (req, res) => {
    try {
        const r = await solo.store(req.user, req.body);
        if (r.error) return res.status(400).json(r);
        res.json(r);
    } catch (err) {
        console.error('[Solo]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
