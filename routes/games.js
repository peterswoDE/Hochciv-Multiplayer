/**
 * Finished matches – public by id, like the player profiles that link to them.
 *
 *   GET /api/games/:id         – date, version, rounds, the players with their points, the
 *                                statistics over the rounds (utils/stats.js; null for older
 *                                matches) and whether there is a replay
 *   GET /api/games/:id/replay  – the replay (utils/replay.js): { v, version, names, frames } as
 *                                stored, Brotli-compressed (Content-Encoding: br) for browsers
 *                                that accept it, else decompressed
 *
 * Only public data goes out: names, nations, points, MMR changes – no account data. The ids are
 * random UUIDs; the client side is client/stats.js.
 */
const express = require('express');
const zlib = require('zlib');
const rateLimitLib = require('express-rate-limit');
const { Game, Replay } = require('../models');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.get('/:id', limit, async (req, res) => {
    try {
        if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Spiel nicht gefunden.' });
        const g = await Game.findByPk(req.params.id);
        if (!g) return res.status(404).json({ error: 'Spiel nicht gefunden.' });
        res.json({
            id: g.id,
            matchDate: g.matchDate,
            version: g.version,
            rounds: g.durationRounds,
            players: (g.participants || []).map(p => ({
                name: p.name, userId: p.dbUserId || null, civ: p.civ, isBot: !!p.isBot,
                points: p.points || 0, isWinner: !!p.isWinner, mmrShift: p.mmrShift != null ? p.mmrShift : null,
            })),
            stats: g.stats || null,
            replay: !!(await Replay.count({ where: { gameId: g.id } })),
        });
    } catch (err) {
        console.error('[Games]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

router.get('/:id/replay', limit, async (req, res) => {
    try {
        if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Spiel nicht gefunden.' });
        const r = await Replay.findByPk(req.params.id);
        if (!r) return res.status(404).json({ error: 'Für dieses Spiel gibt es keine Wiederholung.' });
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.set('Cache-Control', 'private, max-age=3600');
        res.set('Vary', 'Accept-Encoding');
        if (/\bbr\b/.test(req.headers['accept-encoding'] || '')) {
            res.set('Content-Encoding', 'br');
            return res.end(r.data);
        }
        res.end(zlib.brotliDecompressSync(r.data));      // plain http (localhost) – browsers send br only over https
    } catch (err) {
        console.error('[Games] Replay', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
