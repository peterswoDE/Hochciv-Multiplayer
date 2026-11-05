/**
 * Ranked seasons (F10). A season is a calendar quarter ('2026-Q4'). The first season the server
 * sees starts without a reset; when a new quarter begins, the old season is closed:
 *   1. every account with ranked games in it gets its final standing (season_results): MMR,
 *      rank among its type (humans and bots apart), tier, games and wins of the season;
 *   2. every MMR moves halfway back to 1000 (soft reset: 1400 → 1200, 800 → 900).
 * The MMR stays one number (utils/mmr.js); the season only adds the standings and the tiers.
 *
 * Tiers by MMR, once an account has PLACEMENT_GAMES ranked games in the season (before that it
 * is "unplaced"). `ensure()` runs at startup and every hour (server.js).
 */
const { Op } = require('sequelize');
const { sequelize, User, Season, SeasonResult } = require('../models');

const TIERS = [                          // highest first
    { k: 'diamant', min: 1400 },
    { k: 'platin', min: 1250 },
    { k: 'gold', min: 1100 },
    { k: 'silber', min: 950 },
    { k: 'bronze', min: 0 },
];
const PLACEMENT_GAMES = 5;
const BOARD_SIZE = 100;

function tierOf(mmr, games) {
    if (games < PLACEMENT_GAMES) return null;
    return TIERS.find(t => mmr >= t.min).k;
}

/** The quarter of a date: { id, startsAt, endsAt }. */
function quarterOf(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1;
    return {
        id: `${y}-Q${q}`,
        startsAt: new Date(Date.UTC(y, (q - 1) * 3, 1)),
        endsAt: new Date(Date.UTC(q === 4 ? y + 1 : y, q === 4 ? 0 : q * 3, 1)),
    };
}

/**
 * Ranked games and wins per account within [from, to). A ranked seat has its MMR change in the
 * match record (oldMmr); a seat taken over or resigned has no dbUserId and doesn't count.
 * Returns Map(userId → { games, wins }).
 */
async function statsBetween(from, to, userIds) {
    const [rows] = await sequelize.query(`
        SELECT p->>'dbUserId' AS uid, COUNT(*)::int AS games,
               SUM(CASE WHEN (p->>'isWinner')::boolean THEN 1 ELSE 0 END)::int AS wins
        FROM games g, jsonb_array_elements(g.participants::jsonb) p
        WHERE g."matchDate" >= :from AND g."matchDate" < :to
          AND p ? 'oldMmr' AND p->>'dbUserId' IS NOT NULL
          ${userIds ? "AND p->>'dbUserId' IN (:ids)" : ''}
        GROUP BY 1`, { replacements: { from, to, ids: userIds && userIds.length ? userIds : [''] } });
    return new Map(rows.map(r => [r.uid, { games: r.games, wins: r.wins }]));
}

/** The current season (the newest one); creates the first. */
async function current() {
    return (await Season.findOne({ order: [['startsAt', 'DESC']] })) || ensure();
}

/**
 * Make sure the season of `now` exists; close the previous one first. Returns the current
 * season. `now` can be passed for tests and the admin's "close the season now".
 */
let running = null;
function ensure(now = new Date()) {
    // one at a time: the hourly check and a startup must not close a season twice
    running = (running || Promise.resolve()).then(() => ensureNow(now)).catch(err => {
        console.error('[Seasons] Check failed:', err);
        return null;
    });
    return running;
}
async function ensureNow(now) {
    const q = quarterOf(now);
    const latest = await Season.findOne({ order: [['startsAt', 'DESC']] });
    if (!latest) {
        console.log(`[Seasons] First season ${q.id} (no reset)`);
        return Season.create({ id: q.id, startsAt: q.startsAt, endsAt: q.endsAt });
    }
    if (latest.id === q.id || q.startsAt <= latest.startsAt) return latest;
    await sequelize.transaction(async transaction => {
        await close(latest, now, transaction);
        await Season.create({ id: q.id, startsAt: q.startsAt, endsAt: q.endsAt }, { transaction });
    });
    console.log(`[Seasons] Season ${latest.id} closed, ${q.id} begins (MMR halfway back to 1000)`);
    return Season.findByPk(q.id);
}

/** Final standings of `season`, then the soft reset. */
async function close(season, now, transaction) {
    const stats = await statsBetween(season.startsAt, now);
    const ids = [...stats.keys()];
    const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'username', 'mmr', 'accountType'], transaction }) : [];
    const rows = [];
    for (const type of ['human', 'bot']) {
        users.filter(u => (u.accountType === 'bot' ? 'bot' : 'human') === type)
            .sort((a, b) => b.mmr - a.mmr || a.username.localeCompare(b.username))
            .forEach((u, i) => {
                const s = stats.get(u.id);
                rows.push({ seasonId: season.id, userId: u.id, username: u.username, accountType: type, mmr: u.mmr, rank: i + 1, tier: tierOf(u.mmr, s.games), games: s.games, wins: s.wins });
            });
    }
    if (rows.length) await SeasonResult.bulkCreate(rows, { transaction });
    await season.update({ closedAt: now, endsAt: now < season.endsAt ? now : season.endsAt }, { transaction });
    await sequelize.query('UPDATE users SET mmr = ROUND(1000 + (mmr - 1000) / 2.0) WHERE mmr <> 1000', { transaction });
}

/** The leaderboard of a season: the current one live, a closed one from its results. */
async function leaderboard({ seasonId, type, me }) {
    type = type === 'bot' ? 'bot' : 'human';
    const cur = await current();
    const season = seasonId && seasonId !== cur.id ? await Season.findByPk(String(seasonId)) : cur;
    if (!season) return { error: 'Diese Saison gibt es nicht.' };
    const seasons = (await Season.findAll({ order: [['startsAt', 'DESC']] })).map(s => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, closed: !!s.closedAt }));
    const head = { season: { id: season.id, startsAt: season.startsAt, endsAt: season.endsAt, closed: !!season.closedAt }, seasons, type, placementGames: PLACEMENT_GAMES, tiers: TIERS };

    if (season.closedAt) {
        const rows = await SeasonResult.findAll({ where: { seasonId: season.id, accountType: type }, order: [['rank', 'ASC']], limit: BOARD_SIZE });
        const list = rows.map(r => ({ id: r.userId, username: r.username, mmr: r.mmr, rank: r.rank, tier: r.tier, games: r.games, wins: r.wins }));
        let mine = null;
        if (me && !list.some(r => r.id === me.id)) {
            const r = await SeasonResult.findOne({ where: { seasonId: season.id, userId: me.id } });
            if (r) mine = { id: r.userId, username: r.username, mmr: r.mmr, rank: r.rank, tier: r.tier, games: r.games, wins: r.wins };
        }
        return { ...head, list, me: mine };
    }
    // the running season: everyone who ever played, by MMR; the season's games and tiers
    const where = { accountType: type, [Op.or]: [{ gamesPlayed: { [Op.gt]: 0 } }, { mmr: { [Op.ne]: 1000 } }], isBanned: false };
    const users = await User.findAll({ where, attributes: ['id', 'username', 'mmr'], order: [['mmr', 'DESC'], ['username', 'ASC']], limit: BOARD_SIZE });
    const ids = users.map(u => u.id);
    if (me && !ids.includes(me.id)) ids.push(me.id);
    const stats = await statsBetween(season.startsAt, season.endsAt, ids);
    const entry = (u, rank) => {
        const s = stats.get(u.id) || { games: 0, wins: 0 };
        return { id: u.id, username: u.username, mmr: u.mmr, rank, tier: tierOf(u.mmr, s.games), games: s.games, wins: s.wins };
    };
    const list = users.map((u, i) => entry(u, i + 1));
    let mine = null;
    if (me && !list.some(r => r.id === me.id) && (me.accountType === 'bot' ? 'bot' : 'human') === type) {
        const above = await User.count({ where: { ...where, mmr: { [Op.gt]: me.mmr } } });
        mine = entry(me, above + 1);
    }
    return { ...head, list, me: mine };
}

/** For the profile: the account's tier in the running season and its closed seasons. */
async function profileOf(user) {
    const season = await current();
    const s = (await statsBetween(season.startsAt, season.endsAt, [user.id])).get(user.id) || { games: 0, wins: 0 };
    const past = await SeasonResult.findAll({ where: { userId: user.id }, order: [['seasonId', 'DESC']] });
    return {
        season: { id: season.id, endsAt: season.endsAt, tier: tierOf(user.mmr, s.games), games: s.games, wins: s.wins, placementGames: PLACEMENT_GAMES },
        seasons: past.map(r => ({ id: r.seasonId, tier: r.tier, rank: r.rank, mmr: r.mmr, games: r.games })),
    };
}

/** Account deleted: its standings go with it. */
async function removeUser(userId, transaction) {
    await SeasonResult.destroy({ where: { userId }, transaction });
}

function start() {
    ensure();
    setInterval(() => ensure(), 60 * 60 * 1000).unref();
}

module.exports = { TIERS, PLACEMENT_GAMES, tierOf, quarterOf, statsBetween, current, ensure, leaderboard, profileOf, removeUser, start };
