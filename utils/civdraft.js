/**
 * Nation draft and turn positions (F34) – pure logic, shared by live games (sockets/game.js) and
 * Rundenspiele (async/logic.js). No engine, no I/O: the nations come in as `civs`
 * ([{ k, abilities: [{ k }] }]) and the random numbers as `rnd` (() => [0, 1)).
 *
 * Nation modes (gameConfig.civMode):
 *   fixed        everybody picks in the lobby (Standard)
 *   random       dealt at the start (F32)
 *   draft        picked one after another in reverse turn order, with the ability
 *   randomDraft  a pool of random nations (one per empire, repeats allowed) with random abilities,
 *                picked in the same order; the first to move gets what is left
 *
 * Turn order (gameConfig.turnOrder):
 *   classic      host first, then the order of the nations (the engine's ORDER)
 *   pick         everybody picks a position; free positions are dealt at random
 *   random       the positions are dealt at random
 * With pick/random the seats are arranged in position order and the engine runs with seatOrder.
 */

const CIV_MODES = ['fixed', 'random', 'draft', 'randomDraft'];
const TURN_ORDERS = ['classic', 'pick', 'random'];
const isDraft = mode => mode === 'draft' || mode === 'randomDraft';

/** The modes of a config, also for configs from before F34 (randomCivs / civMode fixed|random). */
function modesOf(cfg) {
    cfg = cfg || {};
    let civMode = CIV_MODES.includes(cfg.civMode) ? cfg.civMode : (cfg.randomCivs ? 'random' : 'fixed');
    let turnOrder = TURN_ORDERS.includes(cfg.turnOrder) ? cfg.turnOrder : 'classic';
    // a draft needs the turn order before the nations: classic order follows the nations
    if (isDraft(civMode) && turnOrder === 'classic') turnOrder = 'random';
    return { civMode, turnOrder };
}

/**
 * Experimental nations (game v111) for a config: switched on (expCivs), on a map with free
 * nations (tile map, custom maps) and not in the Marathon – as the game's setup offers them.
 * Which nations that are is the engine's (engine-adapter.js civsFor).
 */
function expCivsOn(cfg) {
    cfg = cfg || {};
    const custom = cfg.mapKey === 'eigene';
    const free = cfg.mapKey === 'plaettchen' || cfg.mapKey === 'random' || custom;
    const marathon = cfg.mapKey === 'marathon' || !!(custom && cfg.customMap && cfg.customMap.marathon);
    return !!cfg.expCivs && free && !marathon && !cfg.ranked;
}

/**
 * Positions for `n` seats: perm[pos] = seat. `wishes[seat]` is the position a seat asked for
 * (0-based, only with mode 'pick'); a position asked for twice goes to the first who asked,
 * everybody without a valid wish gets a free position at random.
 */
function arrange(n, mode, wishes, rnd) {
    const perm = new Array(n).fill(null);
    const placed = new Set();
    if (mode === 'pick' && Array.isArray(wishes)) {
        wishes.forEach((w, seat) => {
            if (seat < n && Number.isInteger(w) && w >= 0 && w < n && perm[w] === null) { perm[w] = seat; placed.add(seat); }
        });
    }
    const rest = shuffle([...Array(n).keys()].filter(s => !placed.has(s)), rnd);
    for (let pos = 0; pos < n; pos++) if (perm[pos] === null) perm[pos] = rest.shift();
    return perm;
}

function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}
const pickOne = (list, rnd) => list[Math.floor(rnd() * list.length)];

/**
 * A new draft for `n` seats that sit in turn order (seat 0 moves first, so it picks last).
 *   uniqueCivs  every nation at most once (a map with one start point per nation)
 *   noAbility   the ability is not picked here (Marathon drafts abilities afterwards)
 * Returns D = { mode, order, at, pool: [{ id, civ, ability, left }], picks: { seat: { civ, ability } }, noAbility }.
 */
function newDraft({ mode, n, civs, uniqueCivs, noAbility, rnd }) {
    const keys = civs.map(c => c.k);
    let pool;
    if (mode === 'randomDraft') {
        const drawn = uniqueCivs ? shuffle(keys.slice(), rnd).slice(0, n)
            : Array.from({ length: n }, () => pickOne(keys, rnd));
        pool = drawn.map((civ, i) => ({ id: 'r' + i, civ, ability: noAbility ? null : randomAbility(civs, civ, rnd), left: 1 }));
    } else {
        const cap = uniqueCivs ? 1 : Math.ceil(n / keys.length);
        pool = keys.map(civ => ({ id: civ, civ, ability: null, left: cap }));
    }
    const D = { mode, order: [...Array(n).keys()].reverse(), at: 0, pool, picks: {}, noAbility: !!noAbility };
    return D;
}

function randomAbility(civs, civ, rnd) {
    const def = civs.find(c => c.k === civ);
    return def && def.abilities.length ? pickOne(def.abilities, rnd).k : 'basis';
}

const current = D => (D && D.at < D.order.length ? D.order[D.at] : null);
const done = D => !D || D.at >= D.order.length;

/** Seat `seat` picks pool entry `id` (draft: plus an ability of that nation; none = random). */
function pick(D, seat, id, ability, civs, rnd) {
    if (done(D)) return 'Der Draft ist vorbei.';
    if (current(D) !== seat) return 'Du bist nicht dran.';
    const e = D.pool.find(x => x.id === id);
    if (!e || e.left < 1) return 'Diese Nation ist nicht mehr zu haben.';
    let ab = e.ability;
    if (D.mode === 'draft' && !D.noAbility) {
        const def = civs.find(c => c.k === e.civ);
        if (ability == null || ability === 'random') ab = randomAbility(civs, e.civ, rnd);
        else if (def && def.abilities.some(a => a.k === ability)) ab = ability;
        else return 'Diese Fähigkeit gibt es bei dieser Nation nicht.';
    }
    e.left--;
    D.picks[seat] = { civ: e.civ, ability: ab || 'basis' };
    D.at++;
    return null;
}

/** A random pick for the seat whose turn it is (KI, timeout). */
function autoPick(D, civs, rnd) {
    const seat = current(D);
    if (seat === null) return null;
    const e = pickOne(D.pool.filter(x => x.left > 0), rnd);
    return pick(D, seat, e.id, null, civs, rnd);
}

/**
 * Picks nobody has to make: the last one of a random draft (or of a draft without abilities)
 * when only one entry is left. `isAuto(seat)` – the KI picks on its own, too.
 */
function settle(D, civs, rnd, isAuto) {
    while (!done(D)) {
        const open = D.pool.filter(x => x.left > 0);
        const forced = open.length === 1 && (D.mode === 'randomDraft' || D.noAbility);
        if (!forced && !(isAuto && isAuto(current(D)))) break;
        autoPick(D, civs, rnd);
    }
}

/** What everybody sees of a draft (no secrets in it). */
function payload(D) {
    return { mode: D.mode, order: D.order.slice(), at: D.at, cur: current(D), noAbility: D.noAbility,
        pool: D.pool.map(e => ({ ...e })), picks: JSON.parse(JSON.stringify(D.picks)) };
}

module.exports = { CIV_MODES, TURN_ORDERS, isDraft, modesOf, expCivsOn, arrange, shuffle, newDraft, pick, autoPick, settle, current, done, payload };
