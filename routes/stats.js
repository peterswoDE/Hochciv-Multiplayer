/**
 * Overall statistics (F13) – public, like the profiles and match pages.
 *
 *   GET /api/stats?seats=humans|bots|players|ki|all&n=all|2|3|4|5+&mode=all|normal|duel|marathon&ver=all|vNN&origin=all|online|solo
 *   GET /api/stats/player/:userId?n=…&mode=…&ver=…   – the same over one account's seats (F23),
 *                                                   public like its profile (routes/profile.js)
 *
 * Every match counts under its game type, so normal, 1 gegen 1 and Marathon can be viewed on
 * their own; 'all' puts them together.
 *
 * Win rates per nation, ability and turn position, victory types, what winners have at the end,
 * technologies and wonders (utils/gamestats.js). Anonymous: no names, no accounts. The admin
 * variant with more detail is GET /api/admin/stats (routes/admin.js).
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const GameStats = require('../utils/gamestats');

const router = express.Router();

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/** The filters from the query string, each limited to its known values. */
function query(q) {
    const pick = (v, ok) => (ok.test(String(v || '')) ? String(v) : 'all');
    return {
        seats: GameStats.SEATS.includes(String(q.seats)) ? String(q.seats) : 'humans',
        n: pick(q.n, /^(2|3|4|5\+)$/),
        mode: pick(q.mode, /^(normal|duel|marathon)$/),
        ver: pick(q.ver, /^v\d{1,4}$/),
        origin: pick(q.origin, /^(online|solo)$/),       // F28: online games, single-player games, or all
    };
}

router.get('/', limit, async (req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=60');
        res.json(await GameStats.overall(query(req.query), false));
    } catch (err) {
        console.error('[Stats] Overall', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/player/:userId', limit, async (req, res) => {
    try {
        const userId = String(req.params.userId);
        if (!UUID_RE.test(userId)) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
        res.set('Cache-Control', 'private, max-age=60');
        res.json(await GameStats.overall(Object.assign(query(req.query), { user: userId }), false));
    } catch (err) {
        console.error('[Stats] Player', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
module.exports.query = query;
