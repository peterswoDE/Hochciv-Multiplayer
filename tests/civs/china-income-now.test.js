/**
 * China "Mandat des Himmels" (v111): once per game the player collects the income now. The game
 * offers it as a button (sheets.js), but the server had no action for it – online the move ran
 * only on the local copy (mp.js ACTIONS) and bot clients could not send it at all.
 * Runs without the docker setup:
 *
 *   node tests/civs/china-income-now.test.js
 *
 *   · applyAction 'collectIncomeNow' adds the income once and marks the round;
 *   · a second time, or another nation, is refused with the engine's message;
 *   · engines before v111 answer "Unbekannte Aktion";
 *   · mp.js sends it to the server.
 */
const fs = require('fs');
const path = require('path');
const engine = require('../../engine-adapter');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const newGame = (eng, civs) => eng.createGame({
    gameConfig: { mapKey: 'random', playerCount: 2, seed: 11, expCivs: true },
    players: civs.map(civ => ({ civ, ability: 'basis', kind: 'human' })),
});

// ── current engine ──────────────────────────────────────────────────────────
const S = newGame(engine, ['china', 'england']);
const pi = S.players.findIndex(p => p.civ === 'china');
ok(pi >= 0, 'China sits in the game');
S.cur = pi;
// at the start China has no city and no income yet: give it one on a free grass field
const E = engine.getEngine();
let spot = null;
S.map.rows.forEach((row, r) => [...row].forEach((t, c) => {
    if (!spot && t === 'G' && S.cities.every(x => Math.abs(x.r - r) + Math.abs(x.c - c) > 6)) spot = [r, c];
}));
S.cities.push({ id: S.nextId++, owner: pi, r: spot[0], c: spot[1], pop: 3, cap: true, grown: 0, born: 0 });
S.players[pi].res = { sci: 3, food: 4, coins: 5 };
const inc = E.income(S, pi);
ok(inc.sci + inc.food + inc.coins > 0, 'China has income to collect', JSON.stringify(inc));
const want = { sci: 3 + Math.max(0, inc.sci), food: 4 + Math.max(0, inc.food), coins: 5 + Math.max(0, inc.coins) };
const err = engine.applyAction(S, pi, 'collectIncomeNow', {}, null);
ok(err === null, 'China collects the income now', err);
const got = S.players[pi].res;
ok(got.sci === want.sci && got.food === want.food && got.coins === want.coins, 'income added once, never negative',
    `income ${JSON.stringify(inc)}, res ${JSON.stringify(got)}`);
ok(S.log && JSON.stringify(S.log).includes('sammelt sofort Einkommen'), 'the move is logged');
ok(S.players[pi].incomeNowUsed === S.round, 'the round is marked');
const again = engine.applyAction(S, pi, 'collectIncomeNow', {}, null);
ok(typeof again === 'string' && again.length > 0, 'a second time is refused', again);

const E2 = newGame(engine, ['england', 'russland']);
E2.cur = 0;
const other = engine.applyAction(E2, 0, 'collectIncomeNow', {}, null);
ok(typeof other === 'string' && other.length > 0, 'another nation is refused', other);

const notMine = newGame(engine, ['china', 'england']);
const ci = notMine.players.findIndex(p => p.civ === 'china');
notMine.cur = 1 - ci;
ok(engine.applyAction(notMine, ci, 'collectIncomeNow', {}, null) === 'Du bist nicht am Zug.', 'only on the own turn');

// ── older engines ───────────────────────────────────────────────────────────
for (const v of engine.OLD_VERSIONS || []) {
    const eng = engine.forVersion(v);
    const G = newGame(eng, ['england', 'russland']);
    G.cur = 0;
    const r = eng.applyAction(G, 0, 'collectIncomeNow', {}, null);
    ok(typeof r === 'string' && r.length > 0, `${v}: refused`, r);
}

// ── client ──────────────────────────────────────────────────────────────────
const mp = fs.readFileSync(path.join(__dirname, '..', '..', 'mp.js'), 'utf8');
ok(/collectIncomeNow:\s*\(state, pi\) => \(\{ type: 'collectIncomeNow'/.test(mp), 'mp.js sends collectIncomeNow to the server');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
