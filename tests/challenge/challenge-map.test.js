/**
 * The weekly challenge's map (utils/challenge.js setupOf, async/logic.js create): from
 * TILE_MAP_FROM on, every week has its own tile map from the week's seed – the same in every
 * attempt, another one the next week; earlier weeks keep the original map. Runs without docker:
 *
 *   node tests/challenge/challenge-map.test.js
 */
const C = require('../../utils/challenge');
const L = require('../../async/logic');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
/** An attempt as utils/challenge.js start() creates it. */
const attempt = (week, user) => {
    const s = C.setupOf(week);
    const r = L.create({ id: user, username: user }, {
        config: { mapKey: s.mapKey, civMode: 'fixed', events: s.events, eventMode: s.eventMode, wonders: s.wonders,
            difficulty: s.difficulty, playerCount: s.playerCount, kiCount: s.kiCount, isPublic: false, turnDays: 7 },
        civ: s.civ, ability: s.ability, challenge: week, seed: s.seed,
    });
    if (r.error) throw new Error(r.error);
    return r.g;
};
const mapOf = g => JSON.stringify(g.pre.plan.seats.filter(ps => g.seats[ps.idx].kind === 'ki').map(ps => [ps.idx, ps.o, ps.cell]))
    + JSON.stringify(g.pre.plan.tiles || g.pre.plan.grid || null);

ok(C.setupOf('2026-W47').mapKey === '0' && C.setupOf('2026-W45').mapKey === '0', 'weeks before ' + C.TILE_MAP_FROM + ' keep the original map');
ok(C.setupOf(C.TILE_MAP_FROM).mapKey === 'plaettchen' && C.setupOf('2027-W10').mapKey === 'plaettchen', 'from ' + C.TILE_MAP_FROM + ' on: the tile map');

const w = '2026-W50';
const a = attempt(w, 'a'), b = attempt(w, 'b');
ok(a.status === 'placement' && a.seats.filter(s => s.kind === 'ki').length === 3, 'an attempt starts with placing the start tile, three KI', a.status);
ok(new Set(a.seats.map(s => s.civ)).size === 4 && a.seats.every(s => s.kind !== 'ki' || s.ability === 'basis'), 'four different nations, the KI with the base ability');
ok(JSON.stringify(a.seats.map(s => s.civ)) === JSON.stringify(b.seats.map(s => s.civ)), 'the same opponents in every attempt');
ok(mapOf(a) === mapOf(b), 'the same tile map and KI start tiles in every attempt');
const other = attempt('2026-W51', 'a');
ok(other.config.seed !== a.config.seed && mapOf(other) !== mapOf(a), 'the next week has another map');

// the challenger places the start tile; then the game runs, the challenger's turn

let placed = false;
for (let o = 0; o < 6 && !placed; o++) for (let c = 0; c < 40 && !placed; c++) placed = L.place(a, 'a', o, c) === null;
ok(placed && a.status === 'playing' && a.state.fixedDice === a.config.seed, 'after placing: the game runs with the week\'s fixed dice', a.status);
const old = attempt('2026-W46', 'a');
ok(old.status === 'playing' && old.config.mapKey === '0', 'an old week: the original map, starts at once');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
