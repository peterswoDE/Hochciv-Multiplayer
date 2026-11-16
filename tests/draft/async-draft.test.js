/**
 * Turn positions and the nation draft in Rundenspiele (F34, async/logic.js). Runs without the
 * docker setup:
 *
 *   node tests/draft/async-draft.test.js
 *
 * Covered: picking a position on creating and joining (taken positions refused), the join
 * dialog's choices, the KI on the free positions, random positions, nations picked on joining
 * (a fixed map: each once), dealt and drafted (reverse position order, KI picks on its own,
 * the deadline picks at random), the tile placement and the Marathon draft after the nation
 * draft, the setup timeout, and that the game plays the seats in position order.
 */
const L = require('../../async/logic');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const host = { id: 'h', username: 'Host' };
const user = n => ({ id: 'u' + n, username: 'U' + n });
const make = (cfg, opts) => {
    const r = L.create(host, Object.assign({ config: cfg }, opts || {}));
    if (r.error) throw new Error(r.error);
    return r.g;
};
const slotOf = (g, id) => g.seats.find(s => s.userId === id).slot;
const turnOrder = g => g.state.players.map(p => p.slot).join();
const D = g => g.pre.civdraft;
const pickFor = (g, id, ability) => {
    const free = D(g).pool.find(e => e.left > 0);
    return L.civDraftPick(g, id, free.id, ability);
};
const cur = g => D(g).order[D(g).at];

// ── 1. Positions picked, nations drafted, tile map ───────────────────────────────
{
    const g = make({ mapKey: 'plaettchen', playerCount: 4, kiCount: 1, civMode: 'draft', turnOrder: 'pick' }, { pos: 2 });
    ok(g.status === 'setup' && slotOf(g, 'h') === 2 && g.seats.every(s => s.kind === 'human' && !s.civ), 'created: the host on position 3, no nation, no KI seat yet');
    const free = L.freeSeats(g);
    ok(free.map(f => f.slot).join() === '0,1,3' && free.every(f => f.civ === null), 'join dialog: the free positions, no nation (drafted)', JSON.stringify(free));
    ok(L.join(g, user(1), { pos: 2 }) === 'Diese Position ist schon vergeben.', 'a taken position is refused');
    ok(L.join(g, user(1), { pos: 0 }) === null && slotOf(g, 'u1') === 0, 'a joiner takes position 1');
    ok(L.join(g, user(2), { pos: 3 }) === null, 'the last human joins');
    ok(g.status === 'civdraft' && g.seats.length === 4 && g.seats[1].kind === 'ki', 'full: the KI takes the free position 2, the nation draft begins', g.status);
    ok(D(g).order.join() === '3,2,1,0', 'reverse turn order: position 4 picks first');
    ok(L.waitingOn(g).userIds.join() === 'u2', 'the game waits for the one whose pick it is');
    ok(L.civDraftPick(g, 'u1', 'england') === 'Du bist nicht dran.', 'nobody picks out of turn');
    ok(pickFor(g, 'u2') === null, 'position 4 picks');
    ok(cur(g) === 2 && L.waitingOn(g).userIds.join() === 'h', 'next: the host (position 3)');
    const ab = 'basis';
    ok(L.civDraftPick(g, 'h', D(g).pool.find(e => e.left > 0).id, ab) === null, 'the host picks with an ability');
    ok(cur(g) === 0 && g.seats[1].civ === null && D(g).picks[1], 'the KI on position 2 picked on its own');
    const view = L.view(g, 'u1');
    ok(view.civdraft && view.civdraft.cur === 0, 'the view carries the draft');
    ok(pickFor(g, 'u1') === null, 'position 1 picks last');
    ok(g.status === 'placement' && g.seats.every(s => s.civ) && !g.pre.civdraft, 'after the draft: the start tiles', g.status);
    ok(L.view(g, 'u1').placement.seatOrder === true, 'the placement view shows the turn order by position');
    // every human lays the start tile on the first spot that fits
    for (const id of ['u1', 'h', 'u2']) {
        let done = false;
        for (let o = 0; o < 6 && !done; o++) for (let c = 0; c < 40 && !done; c++) done = L.place(g, id, o, c) === null;
    }
    ok(g.status === 'playing' && turnOrder(g) === '0,1,2,3' && g.state.cur === 0, 'the game plays the positions in order, position 1 first', turnOrder(g));
    ok(g.state.players[0].name === 'U1', 'position 1 is the one who asked for it');
}

// ── 2. Random positions, random nations, fixed map (Marathon has its own draft) ──
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 2, civMode: 'random', turnOrder: 'random' });
    ok(L.freeSeats(g).length === 1 && L.freeSeats(g)[0].slot === null, 'random order: no position to pick');
    ok(L.join(g, user(1)) === null, 'the second human joins');
    ok(g.status === 'playing' && new Set(g.seats.map(s => s.civ)).size === 4 && turnOrder(g) === '0,1,2,3', 'fixed map: four different nations, the game plays by position', g.seats.map(s => s.civ).join());
    ok(g.seats.filter(s => s.kind === 'ki').length === 2 && g.seats.every(s => s.ability), 'two KI seats, every seat with an ability');
    let hostFirst = 0;
    for (let i = 0; i < 40; i++) {
        const x = make({ mapKey: '0', playerCount: 2, kiCount: 0, civMode: 'random', turnOrder: 'random' });
        L.join(x, user(1));
        if (x.seats[0].userId === 'h') hostFirst++;
    }
    ok(hostFirst > 5 && hostFirst < 35, 'random order: the host is not always first', hostFirst + '/40');
}

// ── 3. Positions with nations picked on joining, fixed map ───────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 1, civMode: 'fixed', turnOrder: 'pick' }, { pos: 1, civ: 'england', ability: 'basis' });
    ok(g.seats[1].civ === 'england' && g.seats[1].userId === 'h', 'the host picks position and nation');
    const free = L.freeSeats(g);
    ok(!free.some(f => f.civ === 'england') && new Set(free.map(f => f.slot)).size === 3, 'join dialog: free positions × the nations still to have');
    ok(L.join(g, user(1), { pos: 0, civ: 'england' }) === 'Diese Nation ist schon vergeben.', 'fixed map: a nation only once');
    ok(L.join(g, user(1), { pos: 0, civ: 'russland', ability: 'basis' }) === null, 'joins with another nation');
    L.join(g, user(2), { pos: 3, civ: 'wikinger' });
    ok(g.status === 'playing' && g.seats[2].kind === 'ki' && g.seats[2].civ === 'griechenland', 'the KI takes the free position with the nation nobody has', g.seats[2].civ);
    ok(g.state.players.map(p => p.civ).join() === 'russland,england,griechenland,wikinger', 'turn order by position, not by nation');
}

// ── 4. Random draft on a free map, the deadline picks ────────────────────────────
{
    const g = make({ mapKey: 'eigene', customMap: require('../../maps/builtin').find(m => m.code === 'URKART').map, playerCount: 3, kiCount: 0, civMode: 'randomDraft', turnOrder: 'pick' }, { pos: 0 });
    L.join(g, user(1), { pos: 1 });
    L.join(g, user(2), { pos: 2 });
    ok(g.status === 'civdraft' && D(g).pool.length === 3 && D(g).pool.every(e => e.ability), 'random draft: one nation per empire, abilities dealt');
    L.timeout(g);
    ok(g.status === 'civdraft' && D(g).picks[2] && g.seats[2].kind === 'human' && !g.seats[2].replaced, 'deadline: a random pick, the player keeps the seat');
    pickFor(g, 'u1');
    ok(g.status === 'playing' && g.seats.every(s => s.civ) && g.seats[0].userId === 'h', 'the first to move gets what is left – the game starts');
    // three of the four start points are in play (the farthest apart); position n takes the n-th of them
    const spawns = require('../../maps/builtin').find(m => m.code === 'URKART').map.spawns;
    const at = g.state.players.map((p, i) => g.state.cities.find(c => c.owner === i && c.cap))
        .map(c => spawns.findIndex(sp => sp[0] === c.r && sp[1] === c.c));
    ok(at.every((k, i) => k >= 0 && (i === 0 || k > at[i - 1])), 'custom map: the positions take the start points in their order', at.join());
}

// ── 5. Setup timeout, Marathon after the nation draft ────────────────────────────
{
    const g = make({ mapKey: 'marathon', playerCount: 4, kiCount: 1, civMode: 'draft', turnOrder: 'random' });
    L.join(g, user(1));
    L.timeout(g);
    ok(g.status === 'civdraft' && g.seats.filter(s => s.kind === 'ki').length === 2 && D(g).noAbility, 'timeout: the KI takes the free seats, the draft without abilities (Marathon)');
    while (g.status === 'civdraft') pickFor(g, g.seats[cur(g)].userId);
    ok(g.status === 'draft' && new Set(g.seats.map(s => s.civ)).size === 4, 'then the Marathon draft, four different nations', g.status);
}
{
    const g = make({ mapKey: 'plaettchen', playerCount: 3, kiCount: 0, civMode: 'fixed', turnOrder: 'pick' }, { pos: 2, civ: 'england' });
    L.join(g, user(1), { pos: 0, civ: 'england' });
    L.timeout(g);
    ok(g.status === 'placement' && g.seats.length === 2 && g.seats[1].userId === 'h' && g.seats[0].userId === 'u1', 'without KI: the free position leaves, the order stays', JSON.stringify(g.seats.map(s => s.userId)));
}

// ── 6. Leaving frees the position ────────────────────────────────────────────────
{
    const g = make({ mapKey: 'plaettchen', playerCount: 4, kiCount: 1, civMode: 'fixed', turnOrder: 'pick' }, { pos: 0, civ: 'russland' });
    L.join(g, user(1), { pos: 3, civ: 'england' });
    ok(L.leave(g, 'u1') === null && L.freeSeats(g).some(f => f.slot === 3) && g.seats[3].civ === null, 'leaving frees the position and its nation');
}

// ── 7. Old games keep their rules ────────────────────────────────────────────────
{
    const g = make({ mapKey: '0', playerCount: 4, kiCount: 0, civMode: 'fixed' }, { civ: 'england' });
    ok(g.config.turnOrder === 'classic' && g.seats.length === 4 && g.seats.every(s => s.civ), 'no turn order given: classic, one seat per nation as before');
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
