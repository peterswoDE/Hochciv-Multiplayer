/**
 * Player profiles – public, so names can be clicked anywhere (end of game, game history, the
 * in-game player list), also in the Discord Activity, which has no login cookie.
 *
 *   GET /api/profile/:userId[?offset=n]  – name, MMR, games played, wins and the player's games
 *
 * Only public data goes out: no e-mail, no role, no account flags. The client side is
 * client/profile.js – new profile content goes there and here.
 */
const express = require('express');
const rateLimitLib = require('express-rate-limit');
const { sequelize, User, Game } = require('../models');
const engine = require('../engine-adapter');

const router = express.Router();
const PAGE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/** Display name of a civ key ("griechenland" → "Griechenland"), the key if unknown. */
function civName(key) {
    const civs = (engine.getEngine() || {}).CIVS || [];
    const c = civs.find(x => x.k === key);
    return c ? c.n : key || null;
}

/** One game as the profile shows it, seen from `userId`. */
function gameEntry(g, userId) {
    const me = g.participants.find(p => p.dbUserId === userId || p.replacedUserId === userId) || {};
    return {
        id: g.id,
        matchDate: g.matchDate,
        rounds: g.durationRounds,
        hasStats: !!g.get('hasStats'),        // statistics over the rounds (GET /api/games/:id)
        async: g.participants.some(p => p.async),
        ranked: g.participants.some(p => p.mmrShift != null),
        won: !!me.isWinner && me.dbUserId === userId,
        replaced: me.replacedUserId === userId,
        civ: civName(me.civ),
        points: me.points || 0,
        mmrShift: me.mmrShift != null ? me.mmrShift : null,
        players: g.participants.map(p => ({
            name: p.name,
            userId: p.dbUserId || null,
            isBot: !!p.isBot,
            civ: civName(p.civ),
            points: p.points || 0,
            isWinner: !!p.isWinner,
            mmrShift: p.mmrShift != null ? p.mmrShift : null,
            scoreDetails: p.scoreDetails || null,
        })),
    };
}

router.get('/:userId', limit, async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!UUID_RE.test(userId)) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
        const user = await User.findByPk(userId, {
            attributes: ['id', 'username', 'mmr', 'gamesPlayed', 'avatarUrl', 'createdAt'],
        });
        if (!user) return res.status(404).json({ error: 'Spieler nicht gefunden.' });

        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        const has = field => `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ [field]: user.id }]))}::jsonb`;
        const { count, rows } = await Game.findAndCountAll({
            where: sequelize.literal(`(${has('dbUserId')} OR ${has('replacedUserId')})`),
            // the statistics themselves are loaded per match when opened
            attributes: { exclude: ['stats'], include: [[sequelize.literal('"stats" IS NOT NULL'), 'hasStats']] },
            order: [['matchDate', 'DESC']],
            offset,
            limit: PAGE,
        });

        const wins = await Game.count({
            where: sequelize.literal(`"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ dbUserId: user.id, isWinner: true }]))}::jsonb`),
        });

        res.json({
            id: user.id,
            username: user.username,
            mmr: user.mmr,
            gamesPlayed: user.gamesPlayed,
            wins,
            avatarUrl: user.avatarUrl,
            memberSince: user.createdAt,
            games: { total: count, offset, pageSize: PAGE, list: rows.map(g => gameEntry(g, user.id)) },
        });
    } catch (err) {
        console.error('[Profile]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
