/**
 * Facts of a finished match for the overall statistics (F13, utils/gamestats.js): who played
 * which nation and ability from which turn position, who won and how, and what each empire had
 * at the end – down to the round in which it got each technology. Anonymous: no names, no
 * account ids, so account deletion and merging don't touch them.
 *
 *   facts = {
 *     v: 1, src: 'replay' | 'record', ver, r: rounds, n: empires, mode: 'normal' | 'duel' | 'marathon',
 *     map, ev, wo,                                   // map name, events / wonders on
 *     win: 'military' | 'science' | 'economy' | 'culture' | 'other' | null, shared,
 *     p: [{ civ, ab, kind, lvl, pos, won, dead, s, c, pop, a,
 *           w: [wonder], t: { tech: round } }]       // t and pos are null for 'record'
 *   }
 *
 * Computed from the replay (the state after every turn, utils/replay.js) right after a match is
 * stored, and for older matches at server start (backfill). A match without a replay falls back
 * to what the match record has ('record': participants and the statistics over the rounds).
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { Op } = require('sequelize');
const { Game, Replay } = require('../models');
const engine = require('../engine-adapter');

const decompress = promisify(zlib.brotliDecompress);

/** How the game was won, from S.over (the engine's texts are German on the server). */
function victoryOf(over) {
    if (!over) return null;
    if (over.military) return 'military';
    const how = String(over.how || '');
    if (/Forschungssieg/.test(how)) return 'science';
    if (/Wirtschaftssieg/.test(how)) return 'economy';
    if (/Kultursieg/.test(how)) return 'culture';
    if (/Militärsieg/.test(how)) return 'military';
    return 'other';
}

/** The engine a match was played with ('v93' → HochCiv-v93, anything else → the current one). */
const engineFor = version => engine.forVersion(version).getEngine();

const isBarbarian = p => p && p.kind === 'barbar';

/**
 * Facts from the states of a match (first = start, last = end). The round of a technology is
 * the round of the turn in which it appeared: a frame is the state after a turn, so a tech new
 * in frame j was researched in the turn of frame j-1 (whose round may be one less).
 */
function fromStates(states, version) {
    const S = states[states.length - 1];
    if (!S || !S.players) return null;
    const E = engineFor(version);
    const t = S.players.map(() => ({}));
    states.forEach((st, j) => {
        const round = j ? states[j - 1].round : st.round;
        (st.players || []).forEach((p, i) => {
            for (const k in p.techs || {}) if (p.techs[k] && t[i] && t[i][k] == null) t[i][k] = round;
        });
    });
    // turn position: 1 = start player, counted over the empires (barbarians don't take turns)
    const start = S.startIdx != null ? S.startIdx : (states[0] && states[0].cur) || 0;
    const order = [];
    for (let k = 0; k < S.players.length; k++) {
        const i = (start + k) % S.players.length;
        if (!isBarbarian(S.players[i])) order.push(i);
    }
    const winners = (S.over && S.over.winners) || [];
    const players = [];
    S.players.forEach((p, i) => {
        if (isBarbarian(p)) return;
        let s = null;
        try { const v = E.victoryScore ? E.victoryScore(S, i) : null; s = v ? v.total : null; } catch (_) { /* older engine */ }
        const cities = S.cities.filter(c => c.owner === i);
        players.push({
            civ: p.civ,
            ab: Array.isArray(p.drafted) && p.drafted.length ? p.drafted.slice() : (p.ability || 'basis'),
            kind: p.kind === 'human' ? 'human' : p.kind === 'bot' ? 'bot' : 'ki',
            lvl: p.kind === 'ki' ? p.kiLevel || null : p.kind === 'bot' ? p.diff || null : null,
            pos: order.indexOf(i) + 1,
            won: winners.includes(i),
            dead: !!p.dead,
            s,
            c: cities.length,
            pop: cities.reduce((n, c) => n + (c.pop || 0), 0),
            a: S.armies.filter(a => a.owner === i).length,
            w: (S.wonders || []).filter(w => w.owner === i).map(w => w.k),
            t: t[i],
        });
    });
    return {
        v: 1, src: 'replay', ver: version || null, r: S.round, n: players.length,
        mode: S.marathon ? 'marathon' : S.duel ? 'duel' : 'normal',
        map: (S.map && S.map.name) || null, ev: !!S.ev, wo: !!S.wo,
        win: victoryOf(S.over), shared: winners.length > 1,
        p: players,
    };
}

/** Facts from the match record alone (no replay): no techs, no turn positions. */
function fromRecord(game) {
    const parts = game.participants || [];
    if (!parts.length) return null;
    const st = game.stats || null;
    const last = st && st.rounds && st.rounds[st.rounds.length - 1];
    const players = parts.map((x, k) => {
        const si = st && st.players ? st.players.findIndex(p => p.slot === k && p.civ === x.civ) : -1;
        const pt = last && si >= 0 ? last.p[si] : null;
        const d = x.scoreDetails || {};
        return {
            civ: x.civ, ab: Array.isArray(x.drafted) && x.drafted.length ? x.drafted.slice() : (x.ability || 'basis'),
            kind: x.isBot ? 'ki' : 'human', lvl: null, pos: null, won: !!x.isWinner, dead: pt ? !!pt.d : false,
            s: d.total != null ? d.total : pt ? pt.s : null,
            c: pt ? pt.c : null, pop: pt ? pt.pop : d.pop != null ? d.pop : null, a: pt ? pt.a : null,
            w: null, t: null,
        };
    });
    return {
        v: 1, src: 'record', ver: game.version || null, r: game.durationRounds, n: players.length,
        mode: null, map: null, ev: null, wo: null, win: null,
        shared: players.filter(p => p.won).length > 1, p: players,
    };
}

/** The states of a stored replay, or null. */
async function replayStates(gameId) {
    const r = await Replay.findByPk(gameId);
    if (!r) return null;
    const doc = JSON.parse((await decompress(r.data)).toString('utf8'));
    return Array.isArray(doc.frames) && doc.frames.length ? doc.frames : null;
}

/** Compute and store the facts of a match (from its replay if there is one). */
async function store(gameId) {
    const game = await Game.findByPk(gameId);
    if (!game) return null;
    let facts = null;
    try {
        const states = await replayStates(gameId);
        if (states) facts = fromStates(states, game.version);
    } catch (err) {
        console.error(`[Facts] Replay of ${gameId} unusable:`, err.message);
    }
    if (!facts) facts = fromRecord(game);
    // a match without any data stays out of the statistics, but is not tried again
    await game.update({ facts: facts || { v: 1, src: 'none', p: [] } });
    if (typeof onChange === 'function') onChange();
    return facts;
}

/** Called after a match is stored (sockets/game.js, async/service.js); never throws. */
function storeLater(gameId) {
    if (!gameId) return;
    setImmediate(() => store(gameId).catch(err => console.error(`[Facts] ${gameId}:`, err)));
}

let onChange = null;
/** utils/gamestats.js drops its cache when facts change. */
function setOnChange(fn) { onChange = fn; }

/** All matches without facts (older ones, or after "recompute"), one after another. */
async function backfill() {
    const rows = await Game.findAll({ where: { facts: { [Op.is]: null } }, attributes: ['id'], order: [['matchDate', 'ASC']] });
    let n = 0;
    for (const { id } of rows) {
        try { await store(id); n++; } catch (err) { console.error(`[Facts] Backfill ${id}:`, err); }
    }
    if (rows.length) console.log(`[Facts] Backfill: ${n} of ${rows.length} matches.`);
    return n;
}

function startBackfill() {
    setTimeout(() => backfill().catch(err => console.error('[Facts] Backfill failed:', err)), 30 * 1000).unref();
}

module.exports = { fromStates, fromRecord, victoryOf, store, storeLater, backfill, startBackfill, setOnChange };
