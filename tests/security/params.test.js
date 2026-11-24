/**
 * Action parameters (R-01 of the findings report): coordinates and ids must be integers on the
 * map. Runs the engine adapter in-process, no server needed:
 *
 *   node tests/security/params.test.js
 *
 * 1. A move with string coordinates (r:'3') is refused; before the fix it was stored as a
 *    string, armyAt() no longer found the army and a second army could join it on the tile.
 * 2. Floats, negative values and coordinates off the map are refused.
 * 3. A valid numeric move still goes through the engine (no parameter error).
 */
const adapter = require('../../engine-adapter');

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };

if (!adapter.ensureEngineLoaded()) { console.error('Engine not loaded'); process.exit(2); }
const civs = adapter.civsFor({}).map(c => c.k);
const session = {
    players: civs.slice(0, 3).map((civ, i) => ({ name: 'P' + i, civ, ability: 'basis', kind: 'human' })),
    gameConfig: { playerCount: 3, seed: 7 },
};
const S = adapter.createGame(session);
const pi = S.cur;
const cap = S.cities.find(x => x.owner === pi && x.cap);
// two armies of the current player in the capital, ready to move (as after building them)
for (let i = 0; i < 2; i++) S.armies.push({ id: S.nextId++, owner: pi, r: cap.r, c: cap.c, mp: 3, born: S.round - 1 });
const [army, army2] = S.armies.filter(a => a.owner === pi);
const r = army.r, c = army.c;
const isParamErr = e => typeof e === 'string' && e.startsWith('Ungültiger Parameter');

for (const [label, p] of [
    ["string r", { armyId: army.id, r: String(r + 1), c }],
    ["string c", { armyId: army.id, r, c: String(c) }],
    ["string armyId", { armyId: String(army.id), r: r + 1, c }],
    ["float r", { armyId: army.id, r: r + 0.5, c }],
    ["negative r", { armyId: army.id, r: -1, c }],
    ["r off the map", { armyId: army.id, r: S.map.rows.length, c }],
    ["c off the map", { armyId: army.id, r, c: S.map.rows[r].length }],
]) {
    const err = adapter.applyAction(S, pi, 'moveArmy', p);
    check(isParamErr(err), `${label} refused (${err})`);
}
check(typeof army.r === 'number' && typeof army.c === 'number', 'army coordinates still numbers');
// a free neighbour tile both armies can reach
const E = adapter.getEngine();
const target = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dr, dc]) => [r + dr, c + dc])
    .find(([tr, tc]) => { const t = S.map.rows[tr] && S.map.rows[tr][tc]; return t && t !== '~' && !S.cities.some(x => x.r === tr && x.c === tc); });
const err = adapter.applyAction(S, pi, 'moveArmy', { armyId: army.id, r: target[0], c: target[1] });
check(!isParamErr(err), `numeric move passes the parameter check (${err || 'ok'})`);
if (!err) {
    const err2 = adapter.applyAction(S, pi, 'moveArmy', { armyId: army2.id, r: target[0], c: target[1] });
    const stacked = S.armies.filter(a => a.r === target[0] && a.c === target[1]).length;
    console.log(`      second army onto the same tile: ${err2 || 'ok'} (${stacked} on the tile)`);
}
check(isParamErr(adapter.applyAction(S, pi, 'buildRoad', { r, c, target: '2' })), 'buildRoad target "2" refused');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
