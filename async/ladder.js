/**
 * The bot ladder of the Rundenspiele: bot accounts whose owner opted them in (users.arenaLadderOptIn,
 * routes/bots.js) are paired automatically, as long as an admin has the ladder switched on
 * (routes/ladder-admin.js, stored in the `settings` table).
 *
 * A ladder game is an ordinary Rundenspiel between two bot accounts on the tile map, nations and
 * turn order random (async/logic.js createLadderGame), public to watch. It follows the usual rules:
 * a bot that doesn't play in time is replaced by the KI and loses. A finished game counts for the
 * standings.
 *
 *   seen(bot)            – a bot asked for its games (async/service.js list): it is there to play
 *   tick()               – pair the bots that are there, opted in, allowed to play and without a
 *                          running ladder game; at the admin's pairing interval
 *   report(version)      – standings and the latest games of one game version (GET /api/async/ladder),
 *                          kept REPORT_CACHE_MS (60 s); a new ladder game, a booked one and new
 *                          settings drop it
 *   enter(g) / book(...) – the bots of a new ladder game get their row in arena_standings; a booked
 *                          game is counted there (in the booking's transaction)
 *   settings/configure   – { enabled, turnDays, avoidRematches, sameOwnerRanked, pairingIntervalSeconds,
 *                            placement, recentGamesLimit }
 */
const { Op } = require('sequelize');
const { AsyncGame, Setting, User, sequelize } = require('../models');
const { version } = require('../engine-adapter');
const { botBlockedReason } = require('../utils/bots');
const serverState = require('../utils/serverState');

const key = 'arena-correspondence-ladder';
const defaults = { enabled: false, turnDays: 3, avoidRematches: true, sameOwnerRanked: false,
    pairingIntervalSeconds: 15, placement: 'leaderboard', recentGamesLimit: 30 };
const enrolled = { accountType: 'bot', arenaLadderOptIn: true };
const REPORT_CACHE_MS = 60 * 1000;
const closedStatuses = ['finished', 'cancelled'];
const presence = new Map();
const readyForMs = 5 * 60 * 1000;          // a bot counts as there this long after its last request
const testTickMs = Number(process.env.LADDER_TICK_MS);
const TURN_DAYS = [1, 3, 7];
let timer;
let timerMs;
let running = false;
let lastCheckAt = null;
let reportCache = null;                     // { at, editions, byVersion: Map(version → Promise of the report) }

function seen(bot) {
    if (bot.arenaLadderOptIn) presence.set(bot.id, Date.now());
    else presence.delete(bot.id);
}

async function settings() {
    const row = await Setting.findByPk(key);
    return row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
}

/** @returns the stored settings, or { error } */
async function configure(body, by) {
    const { enabled, turnDays, avoidRematches, sameOwnerRanked, pairingIntervalSeconds, placement,
        recentGamesLimit } = body || {};
    if (!TURN_DAYS.includes(turnDays) || [enabled, avoidRematches, sameOwnerRanked].some(v => typeof v !== 'boolean')
        || (pairingIntervalSeconds !== undefined && (!Number.isInteger(pairingIntervalSeconds)
            || pairingIntervalSeconds < 5 || pairingIntervalSeconds > 300))
        || (placement !== undefined && !['leaderboard', 'main-menu'].includes(placement))
        || (recentGamesLimit !== undefined && (!Number.isSafeInteger(recentGamesLimit) || recentGamesLimit < 1))) {
        return { error: 'Ungültiger Wert.' };
    }
    const saved = await settings();
    const options = { enabled, turnDays, avoidRematches, sameOwnerRanked,
        pairingIntervalSeconds: pairingIntervalSeconds ?? saved.pairingIntervalSeconds,
        placement: placement ?? saved.placement,
        recentGamesLimit: recentGamesLimit ?? saved.recentGamesLimit };
    await Setting.upsert({ key, value: JSON.stringify(options), updatedBy: by || null });
    schedule(options.pairingIntervalSeconds);
    changed();
    return options;
}

const ofVersion = rules => sequelize.where(sequelize.literal("data->>'engine'"), rules);

/** The booked ladder games of one game version, oldest first: who played whom (selectMatchups). */
async function bookedGames(rules) {
    return AsyncGame.findAll({
        where: { arenaLadder: true, status: 'finished', [Op.and]: [ofVersion(rules),
            sequelize.literal("data->'result'->>'gameId' IS NOT NULL")] },
        attributes: ['status', 'participantIds', [sequelize.literal("jsonb_build_object('gameId', data->'result'->'gameId')"), 'result']],
        order: [['createdAt', 'ASC'], ['id', 'ASC']], raw: true,
    });
}

/** The latest ladder games of one game version, newest first. */
async function latestGames(rules, limit) {
    return AsyncGame.findAll({
        where: { arenaLadder: true, [Op.and]: [ofVersion(rules)] },
        attributes: ['id', 'status', 'round',
            [sequelize.literal("data->'config'->'ranked'"), 'ranked'],
            [sequelize.literal("data->'config'->'turnDays'"), 'turnDays'],
            [sequelize.literal("data->'result'"), 'result'],
            [sequelize.literal("data->'seats'"), 'seats']],
        order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, raw: true,
    });
}

function activeLadderGames() {
    return AsyncGame.findAll({
        where: { arenaLadder: true, status: { [Op.notIn]: closedStatuses } },
        attributes: ['participantIds'],
        raw: true,
    });
}

function presentBotIds() {
    const now = Date.now();
    for (const [id, lastSeen] of presence) if (now - lastSeen > readyForMs) presence.delete(id);
    return [...presence.keys()];
}

async function availableBots(ids, ladderActive) {
    if (!ids.length) return [];
    const service = require('./service');
    const [bots, active] = await Promise.all([
        User.findAll({ where: { ...enrolled, id: ids, isActive: true } }),
        AsyncGame.findAll({ where: { status: service.ACTIVE, participantIds: { [Op.overlap]: ids } },
            attributes: ['participantIds'], raw: true }),
    ]);
    const busy = new Set(ladderActive.flatMap(game => game.participantIds));
    const total = new Map();
    for (const game of active) for (const id of game.participantIds) total.set(id, (total.get(id) || 0) + 1);
    const owners = await User.findAll({ where: { id: bots.map(bot => bot.ownerId).filter(Boolean) } });
    const byId = new Map(owners.map(owner => [owner.id, owner]));
    return bots.filter(bot => !busy.has(bot.id) && (total.get(bot.id) || 0) < service.MAX_ACTIVE_PER_USER
        && !botBlockedReason(bot, byId.get(bot.ownerId)));
}

async function status() {
    const [optedIn, active] = await Promise.all([User.count({ where: enrolled }), activeLadderGames()]);
    const ready = await availableBots(presentBotIds(), active);
    return { optedIn, available: ready.length, activeGames: active.length, lastCheckAt };
}

const counted = game => game.status === 'finished' && !!game.result?.gameId;       // booked (async/service.js processResult)
const opponentKey = (a, b) => [a, b].sort().join('/');

/**
 * Who plays whom next: the bots with the fewest counted games first, each against the opponent
 * it has met least often (then the one with fewer games, then the closest MMR). With
 * avoidRematches nobody gets the opponent of its last game again right away.
 */
function selectMatchups(bots, games, avoidRematches) {
    const past = new Map(), last = new Map(), count = new Map();
    for (const game of games) {
        if (!counted(game)) continue;
        const [a, b] = game.participantIds;
        last.set(a, b);
        last.set(b, a);
        count.set(a, (count.get(a) || 0) + 1);
        count.set(b, (count.get(b) || 0) + 1);
        const k = opponentKey(a, b);
        past.set(k, (past.get(k) || 0) + 1);
    }
    const pool = [...bots].sort((a, b) => (count.get(a.id) || 0) - (count.get(b.id) || 0));
    const matches = [];
    while (pool.length >= 2) {
        const a = pool.shift();
        const choices = pool.filter(b => !avoidRematches || last.get(a.id) !== b.id || last.get(b.id) !== a.id);
        choices.sort((b, c) => (past.get(opponentKey(a.id, b.id)) || 0) - (past.get(opponentKey(a.id, c.id)) || 0)
            || (count.get(b.id) || 0) - (count.get(c.id) || 0)
            || Math.abs(a.mmr - b.mmr) - Math.abs(a.mmr - c.mmr));
        if (!choices.length) continue;
        const b = choices[0];
        pool.splice(pool.indexOf(b), 1);
        matches.push([a, b]);
    }
    return matches;
}

async function tick() {
    if (running || serverState.state.maintenanceMode) return;
    running = true;
    try {
        const options = await settings();
        schedule(options.pairingIntervalSeconds);
        if (!options.enabled) return;
        lastCheckAt = new Date().toISOString();
        const ids = presentBotIds();
        if (ids.length < 2) return;
        const ready = await availableBots(ids, await activeLadderGames());
        if (ready.length < 2) return;
        const service = require('./service');
        const rules = version();              // ladder games are played with the current game version
        for (const [a, b] of selectMatchups(ready, await bookedGames(rules), options.avoidRematches)) {
            const ranked = a.ownerId !== b.ownerId || options.sameOwnerRanked;
            const result = await service.createLadderGame(a, b, { ranked, turnDays: options.turnDays });
            if (result.error) console.error('[Ladder]', result.error);
            else console.log(`[Ladder] ${a.username} – ${b.username}: game ${result.id}`);
        }
    } finally {
        running = false;
    }
}

function schedule(seconds) {
    const ms = testTickMs > 0 ? testTickMs : seconds * 1000;
    if (timerMs === ms) return;
    clearInterval(timer);
    timerMs = ms;
    timer = setInterval(() => tick().catch(error => console.error('[Ladder]', error.message)), ms).unref();
}

function start() {
    settings().then(options => schedule(options.pairingIntervalSeconds), error => {
        console.error('[Ladder]', error.message);
        schedule(defaults.pairingIntervalSeconds);
    });
}

/** The standings over the games of one game version: every bot that played, the best score rate first. */
function standingsOf(field) {
    const scores = new Map();
    for (const game of field) for (const { userId, name } of game.seats) {
        if (!userId) continue;
        if (!scores.has(userId)) scores.set(userId, { name, games: 0, wins: 0, draws: 0 });
    }
    for (const game of field.filter(counted)) for (const { userId, name, replaced } of game.seats) {
        if (!userId) continue;
        const score = scores.get(userId);
        score.games++;
        if (replaced) continue;             // the KI finished the game for this bot: a loss, whatever the KI made of it
        const { draw, win } = outcome(game.result.winners, name);
        if (draw) score.draws++;
        else if (win) score.wins++;
    }
    return rank([...scores.values()]);
}

/** One winner wins, more than one is a draw (for the bots that played to the end). */
const outcome = (winners, name) => ({ draw: winners.length !== 1, win: winners.length === 1 && winners.includes(name) });

/** Score rate, the best first; a bot without a counted game has none and comes last. */
const rank = rows => rows.map(({ name, games, wins, draws }) => ({ name, games, wins, draws, score: games ? (wins + draws / 2) / games : null }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.games - a.games || a.name.localeCompare(b.name));

/** A new ladder game: its bots are listed in the standings of its game version (without a game yet). */
async function enter(g) {
    const seats = g.seats.filter(seat => seat.userId);
    if (!g.engine || !seats.length) return;
    await sequelize.query(`INSERT INTO arena_standings (version, "userId", name)
        SELECT :version, u, n FROM unnest(ARRAY[:ids]::uuid[], ARRAY[:names]::varchar[]) AS t(u, n) ON CONFLICT DO NOTHING`,
    { replacements: { version: g.engine, ids: seats.map(s => s.userId), names: seats.map(s => s.name || '') } });
    changed();
}

/**
 * A booked ladder game (async/service.js processResult, inside the booking's transaction – so it
 * is counted exactly once): every bot of it one game more, a win or a draw unless the KI replaced it.
 */
async function book(g, winners, transaction) {
    if (!g.engine) return;
    for (const seat of g.seats) {
        if (!seat.userId) continue;
        const { draw, win } = seat.replaced ? {} : outcome(winners, seat.name);
        await sequelize.query(`INSERT INTO arena_standings (version, "userId", name, games, wins, draws) VALUES (:version, :id, :name, 1, :win, :draw)
            ON CONFLICT (version, "userId") DO UPDATE SET games = arena_standings.games + 1,
                wins = arena_standings.wins + EXCLUDED.wins, draws = arena_standings.draws + EXCLUDED.draws`,
        { replacements: { version: g.engine, id: seat.userId, name: seat.name || '', win: win ? 1 : 0, draw: draw ? 1 : 0 }, transaction });
    }
}

/** The standings or the ladder games changed: the next report is read again. */
function changed() {
    reportCache = null;
}

const newestFirst = (a, b) => Number(b.slice(1)) - Number(a.slice(1));

async function buildReport(rules) {
    const [rows, games] = await Promise.all([
        sequelize.query('SELECT name, games, wins, draws FROM arena_standings WHERE version = :rules',
            { replacements: { rules }, type: sequelize.QueryTypes.SELECT }),
        settings().then(({ recentGamesLimit }) => latestGames(rules, recentGamesLimit)),
    ]);
    const publicGame = ({ id, status, round, ranked, turnDays, result, seats }) => ({
        id, status, round, ranked, turnDays, names: (seats || []).map(seat => seat.name),
        winners: result?.winners || [], replay: result?.replay && result.gameId,
    });
    return { standings: rank(rows), games: games.map(publicGame) };
}

/** Standings and the latest games of a game version (the current one unless another has ladder games). */
async function report(requestedVersion) {
    if (!reportCache || Date.now() - reportCache.at > REPORT_CACHE_MS) {
        const at = Date.now();
        const rows = await sequelize.query('SELECT DISTINCT version FROM arena_standings', { type: sequelize.QueryTypes.SELECT });
        reportCache = { at, editions: [...new Set([version(), ...rows.map(r => r.version)])].sort(newestFirst), byVersion: new Map() };
    }
    const cache = reportCache;
    const rules = cache.editions.includes(requestedVersion) ? requestedVersion : version();
    if (!cache.byVersion.has(rules)) {
        const built = buildReport(rules);
        cache.byVersion.set(rules, built);
        built.catch(() => { if (cache.byVersion.get(rules) === built) cache.byVersion.delete(rules); });
    }
    const { standings, games } = await cache.byVersion.get(rules);
    return { version: rules, editions: cache.editions, standings, games };
}

module.exports = { settings, configure, status, seen, start, tick, report, enter, book, changed, selectMatchups, standingsOf };
