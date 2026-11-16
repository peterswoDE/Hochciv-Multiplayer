/**
 * Random nations in Rundenspiele are dealt at the start (F32: async/logic.js dealRandom). Runs
 * without the docker setup:
 *
 *   node tests/random/deal.test.js
 *
 * Before the last human joins, no seat has a nation – the host's neither – and the join dialog's
 * free seat has none, so nobody can pick a nation by skipping or recreating games. Once the last
 * human joins, every seat is dealt: the host moves first, the others follow in join order, the
 * KI takes the last positions. Covered: a fixed map with KI, without KI, the tile map (placement
 * phase), leaving before the start, the setup timeout with and without KI, and a game created
 * before F32 (nations dealt at creation) that keeps its old rules.
 */
const L = require('../../async/logic');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const host = { id: 'h', username: 'Host' };
const user = n => ({ id: 'u' + n, username: 'U' + n });
const make = cfg => {
    const r = L.create(host, { config: Object.assign({ civMode: 'random' }, cfg) });
    if (r.error) throw new Error(r.error);
    return r.g;
};
const civs = g => g.seats.map(s => s.civ);
const posOf = (g, id) => g.config.order.indexOf(g.seats.find(s => s.userId === id).slot);
const firstMover = g => g.seats[g.state.players[g.state.cur].slot];

// ── 1. Fixed map, 4 empires, 3 humans + 1 KI ─────────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 1 });
    ok(g.status === 'setup' && civs(g).every(c => c === null), 'created: setup, no nation dealt (the host neither)', JSON.stringify(civs(g)));
    ok(!g.state, 'created: the game does not start right away');
    const free = L.freeSeats(g);
    ok(free.length === 1 && free[0].civ === null, 'join dialog: the free seat shows no nation', JSON.stringify(free));
    ok(L.join(g, user(1)) === null && civs(g).every(c => c === null) && g.status === 'setup', 'second human joins: still nothing dealt');
    ok(L.join(g, user(2)) === null, 'last human joins');
    ok(g.status === 'playing' && g.state && civs(g).every(Boolean), 'full: every seat dealt, the game runs', JSON.stringify(civs(g)));
    ok(new Set(civs(g)).size === 4, 'fixed map: four different nations');
    ok(posOf(g, 'h') === 0 && posOf(g, 'u1') === 1 && posOf(g, 'u2') === 2, 'turn positions: host first, then join order');
    const ki = g.seats.filter(s => s.kind === 'ki');
    ok(ki.length === 1 && g.config.order.indexOf(ki[0].slot) === 3 && !ki[0].userId, 'the KI takes the last position');
    ok(firstMover(g).userId === 'h', 'the host moves first');
    ok(g.seats.every(s => s.ability), 'every seat has an ability');
    ok(L.join(g, user(3)) === 'Das Spiel ist schon voll.', 'nobody joins a full game');
}

// ── 2. Without KI ────────────────────────────────────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 2, kiCount: 0 });
    ok(L.freeSeats(g)[0].civ === null, 'no KI: the free seat shows no nation');
    L.join(g, user(1));
    ok(g.status === 'playing' && g.seats.length === 2 && civs(g).every(Boolean) && firstMover(g).userId === 'h', 'no KI: dealt and started with the host first', JSON.stringify(civs(g)));
}

// ── 3. Tile map: the placement phase follows the deal ────────────────────────────
{
    const g = make({ mapKey: 'plaettchen', playerCount: 4, kiCount: 2 });
    ok(civs(g).every(c => c === null), 'tile map: nothing dealt before');
    L.join(g, user(1));
    ok(g.status === 'placement' && civs(g).every(Boolean) && g.pre && g.pre.plan, 'tile map: dealt, then the start tiles are placed', g.status);
}

// ── 4. Leaving before the start ──────────────────────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 1 });
    L.join(g, user(1));
    ok(L.leave(g, 'u1') === null && L.freeSeats(g).length === 1 && civs(g).every(c => c === null), 'leaving before the start frees the seat, still nothing dealt');
    L.join(g, user(2));
    L.join(g, user(3));
    ok(g.status === 'playing' && posOf(g, 'u2') === 1 && posOf(g, 'u3') === 2, 'after a leave: dealt in the order of those who are there');
}

// ── 5. Setup timeout ─────────────────────────────────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 1 });
    L.join(g, user(1));
    L.timeout(g);
    ok(g.status === 'playing' && civs(g).every(Boolean) && g.seats.filter(s => s.kind === 'ki').length === 2
        && posOf(g, 'h') === 0 && posOf(g, 'u1') === 1, 'timeout with KI: dealt, the KI takes the free seat', JSON.stringify(g.seats.map(s => [s.civ, s.kind, s.userId])));
}
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 0 });
    L.join(g, user(1));
    L.join(g, user(2));
    L.timeout(g);
    ok(g.status === 'playing' && g.seats.length === 3 && civs(g).every(Boolean) && g.seats.every(s => s.userId)
        && firstMover(g).userId === 'h', 'timeout without KI: the three who are there are dealt in', JSON.stringify(g.seats.map(s => [s.civ, s.userId])));
}

// ── 6. A game created before F32 keeps its rules ─────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 0 });
    // the old create(): dealt at creation, the turn order known, no dealAtStart
    const dealt = ['griechenland', 'england', 'russland', 'wikinger'];
    g.seats.forEach((s, i) => { s.civ = dealt[i]; });
    g.config.order = [0, 1, 2, 3];
    delete g.config.dealAtStart;
    const free = L.freeSeats(g);
    ok(free.length === 1 && free[0].civ === 'england', 'old game: the next seat in turn order as before', JSON.stringify(free));
    L.join(g, user(1));
    ok(g.seats[1].userId === 'u1' && g.seats[1].civ === 'england', 'old game: the joiner takes that seat');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
