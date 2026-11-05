/**
 * Ranked seasons and the leaderboard (F10, utils/seasons.js). Public.
 *
 *   GET /api/seasons/leaderboard?season=<id>&type=human|bot
 *       – the top 100 of a season (default: the running one) with tier, games and wins of the
 *         season, the list of seasons, and – logged in – one's own row if not in the top 100
 *
 * The plain top 100 by MMR stays at GET /api/leaderboard (routes/api.js).
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const seasons = require('../utils/seasons');

const router = express.Router();
router.use(rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
}));

router.get('/leaderboard', async (req, res) => {
    try {
        const r = await seasons.leaderboard({
            seasonId: typeof req.query.season === 'string' ? req.query.season.slice(0, 16) : null,
            type: req.query.type,
            me: req.user || null,
        });
        if (r.error) return res.status(404).json(r);
        res.json(r);
    } catch (err) {
        console.error('[Seasons]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
