/**
 * Weekly challenge (F21). Every ISO week (Monday 00:00 UTC) has one setup for everybody – map,
 * nation, ability, KI level, events, wonders – derived from the week's id, so it needs no
 * storage and no admin. The week's seed is also the game's fixed dice (config.fixedDice): which
 * techs become available and the event of every round are the same in every attempt, however it
 * is played – only battles and the like still depend on the play. An attempt is a Rundenspiel alone against three KI (async/service.js,
 * `config.challenge` = the week), played on the server like every other.
 *
 * Attempts: as many as a player likes, but one running at a time – starting one (of any week)
 * resigns the running one. Past weeks can be played too, back to the first week anyone played
 * (weeks before the challenge existed can't be viewed). The leaderboard of a week holds each player's
 * best attempt that finished before the week ended – after that the week is closed and later
 * attempts are practice. Best: a victory first, then fewer rounds, then more points, then who
 * finished first. Resigning or a KI takeover is a loss.
 *
 * Results: models/ChallengeResult.js. The game counts like any unranked Rundenspiel (history,
 * statistics, badges); it changes no MMR.
 */
const crypto = require('crypto');
const { ChallengeResult } = require('../models');
const engine = require('../engine-adapter');

const DAY = 86400000;
const BOARD_SIZE = 20;

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

/** The bounds of a week id like weekOf, or null when there is no such week ('2027-W53'). */
function boundsOf(weekId) {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekId || '');
    if (!m) return null;
    const jan4 = new Date(Date.UTC(+m[1], 0, 4));
    const start = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + (+m[2] - 1) * 7 * DAY);
    const w = weekOf(start);
    return w.id === weekId ? w : null;
}

/** The first challenge week: the oldest one anyone played, else this one. */
async function firstWeek(now) {
    const [row] = await ChallengeResult.sequelize.query('SELECT min("weekId") AS w FROM challenge_results', { type: 'SELECT' });
    return row && row.w && row.w < now.id ? row.w : now.id;
}

/** The weeks that can be played (from `first` to `now`), newest first. */
function weeksUntil(now, first) {
    const out = [];
    for (let t = now.startsAt.getTime(); ; t -= 7 * DAY) {
        const id = weekOf(new Date(t)).id;
        if (id < first) break;
        out.push(id);
    }
    return out;
}

/** The setup of a week (the same for everybody, from a hash of its id). */
function setupOf(weekId) {
    const h = crypto.createHash('sha256').update('hochciv-challenge:' + weekId).digest();
    const civs = engine.engineConst('CIVS') || [];
    const civ = civs[h[1] % civs.length] || { k: 'griechenland', abilities: [{ k: 'basis' }] };
    const abilities = civ.abilities || [{ k: 'basis' }];
    const levels = (engine.engineConst('KI_LEVELS') || [{ k: 'mittel' }, { k: 'schwer' }]).map(l => l.k);
    return {
        week: weekId,
        mapKey: '0',
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

/** Sort order of attempts: the better one first. */
const better = (a, b) => (b.won - a.won)
    || (a.won ? (a.rounds || 0) - (b.rounds || 0) : 0)
    || (b.points || 0) - (a.points || 0)
    || new Date(a.finishedAt) - new Date(b.finishedAt);

/** Counts for the leaderboard: finished before the week ended. */
const inTime = (r, bounds) => !!r.finishedAt && new Date(r.finishedAt) < bounds.endsAt;

/** The leaderboard of a week: each player's best attempt in time, best first. */
async function ranked(weekId, bounds) {
    const rows = (await ChallengeResult.findAll({ where: { weekId, finished: true } })).filter(r => inTime(r, bounds)).sort(better);
    const seen = new Set();
    return rows.filter(r => !seen.has(r.userId) && seen.add(r.userId));
}

/** This week (or `weekId`): setup, leaderboard, and – logged in – one's own attempts. */
async function info(user, weekId) {
    const now = weekOf(new Date());
    const week = weekId && WEEK_RE.test(weekId) ? weekId : now.id;
    if (week > now.id) return { error: 'Diese Woche hat noch nicht begonnen.' };
    const bounds = boundsOf(week);
    const first = await firstWeek(now);
    if (!bounds || week < first) return { error: 'Diese Woche gibt es nicht.' };
    const rows = await ranked(week, bounds);
    const playing = await ChallengeResult.count({ where: { weekId: week, finished: false } });
    let me = null;
    if (user) {
        const done = (await ChallengeResult.findAll({ where: { weekId: week, userId: user.id, finished: true } })).sort(better);
        const running = await ChallengeResult.findOne({ where: { userId: user.id, finished: false } });      // of any week
        const rank = rows.findIndex(x => x.userId === user.id);
        me = {
            attempts: done.length,
            running: running ? { asyncId: running.asyncId, week: running.weekId } : null,
            ranked: rank >= 0 ? publicRow(rows[rank], rank + 1) : null,
            // the best attempt of all when it is a later one, not on the leaderboard (practice)
            best: done.length && !inTime(done[0], bounds) && (rank < 0 || better(done[0], rows[rank]) < 0) ? publicRow(done[0], null) : null,
        };
    }
    const weeks = weeksUntil(now, first);
    const i = weeks.indexOf(week);
    return {
        week: { id: week, current: week === now.id, startsAt: bounds.startsAt, endsAt: bounds.endsAt, previous: weeks[i + 1] || null, next: weeks[i - 1] || null },
        weeks,
        setup: setupOf(week),
        list: rows.slice(0, BOARD_SIZE).map((r, i) => publicRow(r, i + 1)),
        finished: rows.length, playing,
        me,
    };
}

const starting = new Set();             // userId: one start at a time (a double click)

/** Start an attempt at this week (or `weekId`); a running attempt (of any week) is resigned, a loss. */
async function start(user, weekId) {
    if (user.accountType === 'bot') return { error: 'Die Wochen-Challenge ist für Spieler, nicht für Bots.' };
    const now = weekOf(new Date());
    const week = weekId || now.id;
    if (week > now.id) return { error: 'Diese Woche hat noch nicht begonnen.' };
    if (!boundsOf(week) || week < await firstWeek(now)) return { error: 'Diese Woche gibt es nicht.' };
    if (starting.has(user.id)) return { error: 'Die Challenge startet gerade schon.' };
    starting.add(user.id);
    try {
        const service = require('../async/service');
        for (const had of await ChallengeResult.findAll({ where: { userId: user.id, finished: false } })) {
            // the result comes with the game's end (recordResult); a game that is gone is closed here
            const r = had.asyncId ? await service.resign(user, had.asyncId) : { error: true };
            if (r && r.error) await had.update({ finished: true, finishedAt: new Date() });
        }
        const s = setupOf(week);
        const row = await ChallengeResult.create({ weekId: week, userId: user.id, username: user.username });
        const r = await service.create(user, {
            config: { mapKey: s.mapKey, civMode: 'fixed', events: s.events, eventMode: s.eventMode, wonders: s.wonders,
                difficulty: s.difficulty, playerCount: s.playerCount, kiCount: s.kiCount, isPublic: false, turnDays: 7 },
            civ: s.civ, ability: s.ability,
        }, { challenge: week, seed: s.seed });
        if (r.error) { await row.destroy(); return r; }
        await row.update({ asyncId: r.id });
        return { asyncId: r.id };
    } finally {
        starting.delete(user.id);
    }
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
    }, { where: { weekId: week, userId: g.hostUserId, asyncId: g.id } });
}

/** Account deleted: its attempts go. */
async function removeUser(userId, transaction) {
    await ChallengeResult.destroy({ where: { userId }, transaction });
}

/** Discord Activity account merged: its attempts move over. */
async function mergeUser(fromId, into, transaction) {
    await ChallengeResult.update({ userId: into.id, username: into.username }, { where: { userId: fromId }, transaction });
}

/** Until 2026-11 the table had one attempt per week and player; that unique index goes. */
async function migrate() {
    await ChallengeResult.sequelize.query('DROP INDEX IF EXISTS "challenge_results_week_user_key"');
}

module.exports = { weekOf, boundsOf, setupOf, info, start, recordResult, removeUser, mergeUser, migrate, WEEK_RE };
