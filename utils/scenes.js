/**
 * Records what happens in a game as scenes for the clients (F14, client/scenes.js): every
 * action (log entry of class 'act' – KI, bots and humans alike) and every battle, each with the
 * map snapshot after it (animSnap of js/anim.js), stored as a chain of diffs.
 *
 *   log = { n0, base, frames: [{ n, seq, pi, t, m, art, d, k }] }
 *
 * `base` is the snapshot after frame n0; frame n is the change to the one before. `seq` is the
 * game's log position (S.logSeq) when the frame was taken – the marks of "since your last turn"
 * (utils/summary.js) use the same numbers, so a player's away time is `seq > mark.seq`.
 *
 * Live games keep the log in the session, Rundenspiele in their data. A state carries its log
 * under a symbol (attach), not as a property: it is neither sent nor stored with the state, and
 * the KI's planning copies (kiClone) do not get it.
 *
 * Recording needs js/anim.js in the engine (v94 and later); older versions record nothing.
 */
const { diff, apply } = require('../client/scenes');

const LOG = Symbol('hochciv.scenes');
const MAX_FRAMES = 3000;                   // a safety net; trim() keeps far fewer
const tips = new WeakMap();                // log → its last snapshot (rebuilt after a restart)

const can = E => typeof E.animSnap === 'function';

/** The scene log `holder[key]` (created if missing) attached to the state. Returns the log. */
function attach(E, S, holder, key = 'scenes') {
    if (!S || !can(E)) return null;
    let log = holder[key];
    // a new game in the same session (rematch), or a log from another state
    const last = log && log.frames.length ? log.frames[log.frames.length - 1] : null;
    if (!log || !log.base || (last && last.seq > (S.logSeq || 0)) || (log.base.players || []).length !== S.players.length) {
        log = holder[key] = { n0: 0, base: E.animSnap(S), frames: [] };
        tips.set(log, log.base);
    }
    Object.defineProperty(S, LOG, { value: log, configurable: true, writable: true, enumerable: false });
    return log;
}

const logOf = S => (S && S[LOG]) || null;

function tip(log) {
    let t = tips.get(log);
    if (!t) {
        t = log.base;
        for (const f of log.frames) t = apply(t, f.d);
        tips.set(log, t);
    }
    return t;
}

function push(log, S, frame, snap) {
    // a copy: the engine's snapshots share nested objects (city lists, player fields) with the
    // live state, which goes on changing
    snap = JSON.parse(JSON.stringify(snap));
    const t = tip(log), d = diff(t, snap);
    if (!d && frame.t === 's') return;
    const n = log.n0 + log.frames.length + 1;
    const f = Object.assign({ n, seq: S.logSeq || 0 }, frame);
    if (d) f.d = d;
    log.frames.push(f);
    tips.set(log, apply(t, d));
    if (log.frames.length > MAX_FRAMES) fold(log, log.frames.length - MAX_FRAMES);
}

/** The engine's LOG_HOOK (engine-adapter.js): an action has just changed the state. */
function onLog(E, S, e) {
    const log = logOf(S);
    if (!log || e.c !== 'act') return;
    const f = { pi: S.cur, t: 'a', m: e.m };
    if (e.art) f.art = e.art;
    push(log, S, f, E.animSnap(S));
}

/**
 * Bring the chain up to the state (income, turn change, round start …) as a silent frame, so
 * the next action's scene starts from what the player really had.
 */
function sync(E, S) {
    const log = logOf(S);
    if (log) push(log, S, { pi: S.cur, t: 's' }, E.animSnap(S));
}

/**
 * The `rec` for finishTurn(S, rec): the engine pushes every battle with the map before it
 * (combatEntry). Null without a log – then finishTurn records nothing, as before.
 */
function fights(S) {
    const log = logOf(S);
    if (!log) return undefined;
    return {
        push(e) {
            const { snap, ...k } = e;
            push(log, S, { pi: e.pi, t: 'f', k: JSON.parse(JSON.stringify(k)) }, Object.assign({}, tip(log), snap));
        },
    };
}

/** Frames up to index `count` go into the base. */
function fold(log, count) {
    if (count <= 0) return;
    let base = log.base;
    for (const f of log.frames.slice(0, count)) base = apply(base, f.d);
    log.base = base;
    log.frames = log.frames.slice(count);
    log.n0 += count;
}

/** Keep only what someone may still have to see: frames after the earliest mark of a human. */
function trim(log, marks, S) {
    if (!log || !S) return;
    let min = Infinity;
    for (let i = 0; i < S.players.length; i++) {
        if (S.players[i].kind !== 'human') continue;
        const m = marks && marks[i];
        if (!m) return;                      // someone has not finished a turn yet: keep all
        min = Math.min(min, m.seq);
    }
    if (min === Infinity) return;
    const k = log.frames.findIndex(f => f.seq > min);
    fold(log, k === -1 ? log.frames.length : k);
}

/**
 * The chain for a client: the frames with `n > afterN` (or `seq > afterSeq`), with the snapshot
 * before them as base. Null when there is nothing to play.
 */
function chain(log, { afterN, afterSeq } = {}) {
    if (!log || !log.frames.length) return null;
    let i = afterN != null ? log.frames.findIndex(f => f.n > afterN)
        : log.frames.findIndex(f => f.seq > (afterSeq || 0));
    if (i === -1) return null;
    let base = log.base;
    for (const f of log.frames.slice(0, i)) base = apply(base, f.d);
    const frames = log.frames.slice(i).map(({ seq, ...f }) => f);
    if (!frames.some(f => f.t !== 's')) return null;
    return { from: frames[0].n - 1, to: frames[frames.length - 1].n, base, frames };
}

/** The number of the last frame (0 without any). */
const lastN = log => (log ? log.n0 + log.frames.length : 0);

module.exports = { attach, onLog, sync, fights, trim, fold, chain, lastN, logOf, LOG };
