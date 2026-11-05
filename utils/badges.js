/**
 * Badges on the player profile (F10), computed from the account's matches (participants and
 * the facts of utils/facts.js) and its closed seasons (season_results). Nothing is stored: a
 * badge appears as soon as the history has earned it, also for matches before this feature.
 *
 * Returns [{ k, n?, of? }] – the client (client/profile.js) has the names and descriptions.
 */
const { sequelize, Game, SeasonResult } = require('../models');
const engine = require('../engine-adapter');

const VICTORIES = ['military', 'science', 'economy', 'culture'];
const TIER_ORDER = ['bronze', 'silber', 'gold', 'platin', 'diamant'];
const MAX_GAMES = 3000;

/** The nations a player can win with (the current game's list). */
function nationKeys() {
    const civs = engine.engineConst('CIVS') || [];
    return civs.map(c => c.k).filter(Boolean);
}

async function badgesOf(userId) {
    const has = `"participants"::jsonb @> ${sequelize.escape(JSON.stringify([{ dbUserId: userId }]))}::jsonb`;
    const games = await Game.findAll({ where: sequelize.literal(has), attributes: ['participants', 'facts'], order: [['matchDate', 'DESC']], limit: MAX_GAMES });
    let played = 0, wins = 0, wonders = 0, duelWins = 0;
    const victories = new Set(), wonWith = new Set();
    for (const g of games) {
        const parts = g.participants || [];
        const k = parts.findIndex(p => p.dbUserId === userId);
        if (k < 0) continue;
        const me = parts[k];
        played++;
        const f = g.facts || null;
        // the facts list the empires in state order; find ours by nation (and result)
        const fp = f && Array.isArray(f.p) ? (f.p.filter(x => x.civ === me.civ).find(x => !!x.won === !!me.isWinner) || f.p.find(x => x.civ === me.civ)) : null;
        if (fp && Array.isArray(fp.w)) wonders += fp.w.length;
        if (!me.isWinner) continue;
        wins++;
        if (me.civ) wonWith.add(me.civ);
        if (f && VICTORIES.includes(f.win)) victories.add(f.win);
        if (parts.length === 2 || (f && f.n === 2)) duelWins++;
    }
    const out = [];
    const add = (k, extra) => out.push({ k, ...(extra || {}) });
    if (wins >= 1) add('first_win');
    if (wins >= 10) add('wins_10');
    if (wins >= 50) add('wins_50');
    if (played >= 10) add('games_10');
    if (played >= 50) add('games_50');
    if (played >= 100) add('games_100');
    for (const v of VICTORIES) if (victories.has(v)) add('victory_' + v);
    if (VICTORIES.every(v => victories.has(v))) add('all_victories');
    const nations = nationKeys();
    const nWon = nations.filter(n => wonWith.has(n)).length;
    if (nations.length && nWon === nations.length) add('nations_all');
    if (wonders >= 10) add('wonders_10');
    if (duelWins >= 5) add('duels_5');
    // seasons: the best tier ever, and podium places
    const results = await SeasonResult.findAll({ where: { userId }, attributes: ['tier', 'rank', 'games'] });
    const best = results.reduce((b, r) => Math.max(b, TIER_ORDER.indexOf(r.tier)), -1);
    if (best >= TIER_ORDER.indexOf('gold')) add('season_' + TIER_ORDER[best]);
    if (results.some(r => r.rank === 1 && r.tier)) add('season_champion');
    else if (results.some(r => r.rank <= 3 && r.tier)) add('season_podium');
    return { badges: out, progress: { nations: { n: nWon, of: nations.length }, wonders, wins, played } };
}

module.exports = { badgesOf, VICTORIES };
