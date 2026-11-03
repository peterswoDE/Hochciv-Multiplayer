/**
 * Weekly challenge (F21, utils/challenge.js).
 *
 *   GET  /api/challenge?week=<YYYY-Www>  – the week's setup, leaderboard (top 20), how many play,
 *                                          and – logged in – one's own attempt (public)
 *   POST /api/challenge/start            – start this week's attempt, or get the running one (login)
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const challenge = require('../utils/challenge');

const router = express.Router();
router.use(rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
}));

const send = (res, p) => p.then(r => {
    if (r && r.error) return res.status(400).json(r);
    res.json(r);
}).catch(err => {
    console.error('[Challenge API]', err);
    res.status(500).json({ error: 'Serverfehler' });
});

router.get('/', (req, res) => send(res, challenge.info(req.user || null, typeof req.query.week === 'string' ? req.query.week : null)));
router.post('/start', (req, res) => {
    if (!(req.isAuthenticated && req.isAuthenticated())) return res.status(401).json({ error: 'Die Wochen-Challenge gibt es nur mit Anmeldung.' });
    send(res, challenge.start(req.user));
});

module.exports = router;
