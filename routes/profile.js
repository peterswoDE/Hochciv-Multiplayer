/**
 * Player profiles – public, so names can be clicked anywhere (end of game, game history, the
 * in-game player list), also in the Discord Activity, which has no login cookie.
 *
 *   GET /api/profile/:userId[?offset=n]  – name, MMR, games played, wins and the player's games
 *
 * Only public data goes out: no e-mail, no role, no account flags – only whether it is a bot
 * account, who owns it and any public bot description. The client side is
 * client/profile.js – new profile content goes there and here.
 */
const express = require('express');
const rateLimitLib = require('../utils/rateLimit');
const { sequelize, User, Game } = require('../models');
const engine = require('../engine-adapter');
const seasons = require('../utils/seasons');
const { badgesOf } = require('../utils/badges');
const GamePlayers = require('../utils/gameplayers');
const Facts = require('../utils/facts');

const router = express.Router();
const PAGE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What depends on the matches (the page of matches, the numbers, the badges) is kept for a
// minute: a bot's profile is opened often and has thousands of matches. A stored match drops the
// entries of its accounts at once (Facts.onChange), so results show right away; without an id
// (deletions, merges, a closed season) everything goes. The account itself is read every time.
const CACHE_MS = 60 * 1000, CACHE_MAX = 500;
const cache = new Map();          // `${userId}:${offset}` / `${userId}:badges` → { at, value }
const cached = key => { const c = cache.get(key); return c && Date.now() - c.at < CACHE_MS ? c.value : null; };
function remember(key, value) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
}
async function once(key, load) {
    const hit = cached(key);
    return hit || remember(key, await load());
}
function forget(userIds) {
    const ids = new Set(userIds);
    for (const key of [...cache.keys()]) if (ids.has(key.split(':')[0])) cache.delete(key);
}
Facts.onChange(gameId => {
    if (!gameId) { cache.clear(); return; }
    GamePlayers.usersOf(gameId).then(forget, () => cache.clear());
});

const limit = rateLimitLib({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/** Display name of a civ key ("griechenland" → "Griechenland"), the key if unknown. */
function civName(key) {
    const civs = engine.allCivs();       // also the experimental nations (v111)
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
        hasReplay: !!g.get('hasReplay'),      // replay (GET /api/games/:id/replay)
        async: g.participants.some(p => p.async),
        solo: g.participants.some(p => p.solo),           // a single-player game (F28, utils/solo.js)
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
            botAccount: !!p.botAccount,
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
            attributes: ['id', 'username', 'mmr', 'gamesPlayed', 'avatarUrl', 'createdAt', 'accountType', 'ownerId', 'botDescription'],
        });
        if (!user) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
        // a bot account shows who runs it (utils/bots.js)
        const owner = user.accountType === 'bot' && user.ownerId
            ? await User.findByPk(user.ownerId, { attributes: ['id', 'username'] }) : null;

        const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
        // the account's matches and numbers from game_players (utils/gameplayers.js)
        const { list, counts } = await once(`${user.id}:${offset}`, async () => {
            const [ids, counts] = await Promise.all([GamePlayers.gameIdsOf(user.id, { limit: PAGE, offset }), GamePlayers.countsOf(user.id)]);
            const rows = ids.length ? GamePlayers.inOrder(ids, await Game.findAll({
                where: { id: ids },
                // the statistics themselves are loaded per match when opened
                attributes: { exclude: ['stats', 'facts'], include: [
                    [sequelize.literal('"stats" IS NOT NULL'), 'hasStats'],
                    [sequelize.literal('EXISTS (SELECT 1 FROM replays r WHERE r."gameId" = "Game"."id")'), 'hasReplay'],
                ] },
            })) : [];
            return { list: rows.map(g => gameEntry(g, user.id)), counts };
        });
        const count = counts.total;
        // the tiles count multiplayer games; single-player games (F28) have their own numbers
        const { wins, soloGames, soloWins } = counts;

        // season tier and badges (F10) – only with the first page
        // (the season badges follow the closed seasons: their list, read fresh, is part of the key)
        let extra = {};
        if (!offset) {
            const season = await seasons.profileOf(user);
            const closed = (season.seasons || []).map(s => s.id).join(',');
            extra = { ...season, ...(await once(`${user.id}:badges:${closed}`, () => badgesOf(user.id))) };
        }
        res.json({
            ...extra,
            id: user.id,
            username: user.username,
            mmr: user.mmr,
            gamesPlayed: user.gamesPlayed,
            wins,
            played: count - soloGames,                    // multiplayer games (live, Rundenspiele)
            solo: { games: soloGames, wins: soloWins },
            avatarUrl: user.avatarUrl,
            memberSince: user.createdAt,
            isBotAccount: user.accountType === 'bot',
            ...(user.accountType === 'bot' ? { description: user.botDescription } : {}),
            owner: owner ? { id: owner.id, username: owner.username } : null,
            games: { total: count, offset, pageSize: PAGE, list },
        });
    } catch (err) {
        console.error('[Profile]', err);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
