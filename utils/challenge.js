/**
 * Weekly challenge (F21). Every ISO week (Monday 00:00 UTC) has one setup for everybody – map,
 * nation, ability, KI level, events, wonders – derived from the week's id, so it needs no
 * storage and no admin. A player has one attempt per week: a Rundenspiel alone against three KI
 * (async/service.js, `config.challenge` = the week), played on the server like every other.
 * When it ends, its result is recorded; the leaderboard ranks a victory first, then fewer
 * rounds, then more points, then who finished first. Resigning or a KI takeover is a loss.
 *
 * Results: models/ChallengeResult.js. The game counts like any unranked Rundenspiel (history,
 * statistics, badges); it changes no MMR.
 */
const crypto = require('crypto');
const { ChallengeResult } = require('../models');
const engine = require('../engine-adapter');

const DAY = 86400000;
const BOARD_SIZE = 20;
const MAPS = ['0', 'gross'];

/** The ISO week of a date: { id: '2026-W45', startsAt (Monday 00:00 UTC), endsAt }. */
function weekOf(date) {
    const d = new Date(date);
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
    const thursday = new Date(monday.getTime() + 3 * DAY);       // the ISO year is the Thursday's
    const year = thursday.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));                 // always in week 1
    const firstThursday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + 3 * DAY);
    const week = 1 + Math.round((thursday - firstThursday) / (7 * DAY));
    return { id: `${year}-W${String(week).padStart(2, '0')}`, startsAt: monday, endsAt: new Date(monday.getTime() + 7 * DAY) };
}

const WEEK_RE = /^\d{4}-W\d{2}$/;

/** The setup of a week (the same for everybody, from a hash of its id). */
function setupOf(weekId) {
    const h = crypto.createHash('sha256').update('hochciv-challenge:' + weekId).digest();
    const civs = engine.engineConst('CIVS') || [];
    const civ = civs[h[1] % civs.length] || { k: 'griechenland', abilities: [{ k: 'basis' }] };
    const abilities = civ.abilities || [{ k: 'basis' }];
    const levels = (engine.engineConst('KI_LEVELS') || [{ k: 'mittel' }, { k: 'schwer' }]).map(l => l.k);
    return {
        week: weekId,
        mapKey: MAPS[h[0] % MAPS.length],
        civ: civ.k,
        ability: abilities[h[2] % abilities.length].k,
        playerCount: 4,
        kiCount: 3,
        difficulty: levels.slice(-2)[h[3] % 2] || 'mittel',      // the two hardest levels
        events: h[4] % 2 === 0,
        eventMode: h[5] % 2 === 0 ? 'easy' : 'hard',
        wonders: h[6] % 3 !== 0,
        seed: h.readUInt32BE(8) & 0x7fffffff,
    };
}

const publicRow = (r, rank) => ({ rank, userId: r.userId, username: r.username, won: r.won, rounds: r.rounds, points: r.points, finishedAt: r.finishedAt, gameId: r.gameId });

/** Finished attempts of a week, best first. */
async function ranked(weekId) {
    const rows = await ChallengeResult.findAll({ where: { weekId, finished: true } });
    rows.sort((a, b) => (b.won - a.won)
        || (a.won ? (a.rounds || 0) - (b.rounds || 0) : 0)
        || (b.points || 0) - (a.points || 0)
        || new Date(a.finishedAt) - new Date(b.finishedAt));
    return rows;
}

/** This week (or `weekId`): setup, leaderboard, and – logged in – one's own attempt. */
async function info(user, weekId) {
    const now = weekOf(new Date());
    const week = weekId && WEEK_RE.test(weekId) ? weekId : now.id;
    if (week > now.id) return { error: 'Diese Woche hat noch nicht begonnen.' };
    const bounds = week === now.id ? now : null;
    const rows = await ranked(week);
    const playing = await ChallengeResult.count({ where: { weekId: week, finished: false } });
    let me = null;
    if (user) {
        const r = await ChallengeResult.findOne({ where: { weekId: week, userId: user.id } });
        if (r) {
            const rank = rows.findIndex(x => x.userId === user.id);
            me = { status: r.finished ? 'finished' : 'playing', asyncId: r.asyncId, ...(r.finished ? publicRow(r, rank + 1) : {}) };
        }
    }
    const prev = weekOf(new Date((bounds ? bounds.startsAt : now.startsAt).getTime() - 3 * DAY)).id;
    return {
        week: { id: week, current: week === now.id, startsAt: bounds && bounds.startsAt, endsAt: bounds && bounds.endsAt, previous: week === now.id ? prev : null },
        setup: setupOf(week),
        list: rows.slice(0, BOARD_SIZE).map((r, i) => publicRow(r, i + 1)),
        finished: rows.length, playing,
        me,
    };
}

/** Start this week's attempt (or return the running one). */
async function start(user) {
    if (user.accountType === 'bot') return { error: 'Die Wochen-Challenge ist für Spieler, nicht für Bots.' };
    const week = weekOf(new Date()).id;
    const had = await ChallengeResult.findOne({ where: { weekId: week, userId: user.id } });
    if (had) return had.finished ? { error: 'Du hast die Challenge dieser Woche schon gespielt.' } : { asyncId: had.asyncId, running: true };
    let row;
    try { row = await ChallengeResult.create({ weekId: week, userId: user.id, username: user.username }); }
    catch (_) { return { error: 'Die Challenge startet gerade schon.' }; }     // a second click at the same time
    const s = setupOf(week);
    const service = require('../async/service');
    const r = await service.create(user, {
        config: { mapKey: s.mapKey, civMode: 'fixed', events: s.events, eventMode: s.eventMode, wonders: s.wonders,
            difficulty: s.difficulty, playerCount: s.playerCount, kiCount: s.kiCount, isPublic: false, turnDays: 7 },
        civ: s.civ, ability: s.ability,
    }, { challenge: week, seed: s.seed });
    if (r.error) { await row.destroy(); return r; }
    await row.update({ asyncId: r.id });
    return { asyncId: r.id };
}

/** The attempt's Rundenspiel ended (async/service.js processResult). */
async function recordResult(g, players, gameId) {
    const week = g.config.challenge;
    const seat = g.seats.find(s => s.userId === g.hostUserId);
    const p = seat && players[g.seats.indexOf(seat)];
    await ChallengeResult.update({
        finished: true,
        won: !!(p && p.isWinner && !seat.replaced),
        rounds: g.state ? g.state.round : null,
        points: p ? p.points : 0,
        gameId,
        finishedAt: new Date(),
    }, { where: { weekId: week, userId: g.hostUserId } });
}

/** Account deleted: its attempts go. */
async function removeUser(userId, transaction) {
    await ChallengeResult.destroy({ where: { userId }, transaction });
}

/** Discord Activity account merged: its attempts move unless the real account has that week. */
async function mergeUser(fromId, into, transaction) {
    for (const r of await ChallengeResult.findAll({ where: { userId: fromId }, transaction })) {
        if (await ChallengeResult.count({ where: { userId: into.id, weekId: r.weekId }, transaction })) await r.destroy({ transaction });
        else await r.update({ userId: into.id, username: into.username }, { transaction });
    }
}

module.exports = { weekOf, setupOf, info, start, recordResult, removeUser, mergeUser, WEEK_RE };
