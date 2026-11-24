/**
 * Single-player games (F28, utils/solo.js) – client/solo.js sends each finished game here.
 *
 *   POST /api/solo/games  – { cid, ver, state, t, rounds } → { ok, id, duplicate? } (login, no bots)
 *
 * Bodies up to 2 MB (server.js lets this path past the usual 20 KB limit); stored are at most
 * 200 KB per game and 100 games per account and day (utils/solo.js, R-17). Uploads: 30 per hour
 * and 150 per day and account (refused ones don't count).
 */
const express = require('express');
const rateLimitLib = require('../utils/rateLimit');
const { isAuthenticated, noBots } = require('../utils/auth');
const solo = require('../utils/solo');

const router = express.Router();

const limit = rateLimitLib({
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyGenerator: req => (req.user ? 'u:' + req.user.id : rateLimitLib.ipKeyGenerator(req.ip)),
    message: { error: 'Zu viele Einzelspiele auf einmal. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// a hotseat game carries no account, so the daily cap of utils/solo.js doesn't see it
const daily = rateLimitLib({
    windowMs: 24 * 60 * 60 * 1000,
    max: 150,
    skipFailedRequests: true,
    keyGenerator: req => (req.user ? 'u:' + req.user.id : rateLimitLib.ipKeyGenerator(req.ip)),
    message: { error: 'Für heute sind genug Einzelspiele gespeichert. Morgen geht es weiter.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/games', isAuthenticated, noBots, limit, daily, async (req, res) => {
    try {
        const r = await solo.store(req.user, req.body);
        if (r.error) return res.status(r.limit ? 429 : 400).json({ error: r.error });
        res.json(r);
    } catch (err) {
        console.error('[Solo]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
