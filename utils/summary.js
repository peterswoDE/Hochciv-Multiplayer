/**
 * "Since your last turn" (F5): what the others did while a player waited for their turn.
 *
 * When a human's turn ends, a mark is kept for that seat – log position, the counts of every
 * empire (utils/stats.js snapshot), who owns which city, which wonders exist. When their next
 * turn begins, the summary compares the state with that mark:
 *
 *   summary = { me, since, round, key,
 *               players: [{ pi, ds, dc, dt, dw, da, out }],     // score, cities, techs, wonders, armies
 *               lost: [{ by, n }], gained: [{ from, n }],          // cities (by: -1 = destroyed)
 *               wonders: [{ pi, k }], log: [entries after the mark] }
 *
 * Live games keep the marks in the session, Rundenspiele with the game. The popup is drawn by
 * mp.js; e-mails and push messages of Rundenspiele get a short text (text()).
 */
const { snapshot } = require('./stats');

const LOG_MAX = 150;
const isHuman = p => !!p && p.kind === 'human';
const turnKey = S => `${S.round}:${S.cur}`;

function mark(E, S) {
    const owners = {};
    for (const c of S.cities) owners[c.id] = c.owner;
    return {
        seq: S.logSeq || 0,
        round: S.round,
        snap: snapshot(E, S),
        owners,
        wonders: (S.wonders || []).map(w => w.k),
    };
}

/**
 * Called on every state change. When the turn has moved on, the seat whose turn ended gets a
 * new mark (humans only). Returns the marks object { last, [stateIndex]: mark }.
 */
function track(marks, E, S) {
    marks = marks || { last: null };
    const key = turnKey(S);
    if (marks.last && marks.last.key !== key && isHuman(S.players[marks.last.cur])) {
        marks[marks.last.cur] = mark(E, S);
    }
    marks.last = { key, cur: S.cur };
    return marks;
}

/** The summary for state player `pi` from their mark, or null (first turn, nothing happened). */
function summarize(E, S, marks, pi) {
    const m = marks && marks[pi];
    if (!m || !S || S.over) return null;
    const now = snapshot(E, S);
    const players = S.players.map((p, i) => {
        const a = m.snap.p[i] || {}, b = now.p[i] || {};
        return {
            pi: i, ds: (b.s || 0) - (a.s || 0), dc: b.c - a.c, dt: b.t - a.t, dw: b.w - a.w, da: b.a - a.a,
            out: !!(b.d && !a.d),
        };
    }).filter((p, i) => S.players[i].kind !== 'barbar');

    const ownerNow = {};
    for (const c of S.cities) ownerNow[c.id] = c.owner;
    const lost = {}, gained = {};
    for (const [id, was] of Object.entries(m.owners)) {
        const is = id in ownerNow ? ownerNow[id] : -1;          // -1: the city is gone
        if (was === pi && is !== pi) lost[is] = (lost[is] || 0) + 1;
        if (is === pi && was !== pi) gained[was] = (gained[was] || 0) + 1;
    }
    const wonders = (S.wonders || []).filter(w => !m.wonders.includes(w.k)).map(w => ({ pi: w.owner, k: w.k }));
    const log = (S.log || []).filter(e => (e.seq || 0) > m.seq).slice(-LOG_MAX);
    if (!log.length && !wonders.length && !Object.keys(lost).length) return null;
    return {
        me: pi, since: m.round, round: S.round, key: turnKey(S),
        players,
        lost: Object.entries(lost).map(([by, n]) => ({ by: +by, n })),
        gained: Object.entries(gained).map(([from, n]) => ({ from: +from, n })),
        wonders, log,
    };
}

/**
 * Short German text for e-mails ({ summary }, several lines) and push messages ({ short }, one
 * line). `name(i)` gives the display name of state player i, `wonder(k)` a wonder's name.
 */
function text(sum, name, wonder) {
    if (!sum) return null;
    const lines = [];
    for (const l of sum.lost) {
        lines.push(l.by === -1 ? `Du hast ${l.n === 1 ? 'eine Stadt' : l.n + ' Städte'} verloren.`
            : `${name(l.by)} hat dir ${l.n === 1 ? 'eine Stadt' : l.n + ' Städte'} abgenommen.`);
    }
    for (const g of sum.gained) lines.push(`Du hast ${g.n === 1 ? 'eine Stadt' : g.n + ' Städte'} von ${name(g.from)} erobert.`);
    for (const p of sum.players) if (p.out) lines.push(`${name(p.pi)} ist ausgeschieden.`);
    for (const w of sum.wonders) lines.push(`${name(w.pi)} baut ${wonder(w.k)}.`);
    const scores = sum.players.map(p => `${p.pi === sum.me ? 'du' : name(p.pi)} ${p.ds >= 0 ? '+' : ''}${p.ds}`);
    const short = (lines.length ? lines.slice(0, 2).join(' ') + ' ' : '') + `Punkte seit deinem Zug: ${scores.join(', ')}.`;
    const long = 'Seit deinem letzten Zug:\n' + lines.map(l => '• ' + l).join('\n') + (lines.length ? '\n' : '') + `• Punkte: ${scores.join(', ')}.`;
    return { short, summary: long };
}

module.exports = { track, summarize, text, mark };
