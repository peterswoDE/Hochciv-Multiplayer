/**
 * Research validation (engine-adapter.js, action 'research'). Runs without the docker setup:
 *
 *   node tests/security/research.test.js
 *
 * The engine's doResearch only checks the cost. A client that skips the sheet could research a
 * tech that was never rolled as available, pay twice for one it knows, or take the Singularity
 * without a modern tech in every field. The server must refuse all three and still allow a tech
 * that researchable() offers. Checked for every engine version the server can load.
 */
const engine = require('../../engine-adapter');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const versions = [['current', engine], ...(engine.OLD_VERSIONS || []).map(v => [v, engine.forVersion(v)])];
for (const [label, eng] of versions) {
    const E = eng.getEngine();
    const S = eng.createGame({
        gameConfig: { mapKey: '0', playerCount: 2, seed: 7 },
        players: ['england', 'russland'].map(civ => ({ civ, ability: 'basis', kind: 'human' })),
    });
    const pi = S.cur, p = S.players[pi];
    p.sci = 100000;   // money is never the reason in this test
    const offered = E.researchable(S, pi);
    // TECHS is a const inside the engine's sandbox, not a property of it
    const pool = require('vm').runInContext('TECHS', E);
    const notOffered = pool.find(t => !p.avail[t.k] && !p.techs[t.k]);

    const sing = eng.applyAction(S, pi, 'research', { tech: 'singularitaet' });
    ok(sing && !p.techs.singularitaet && !S.over, `${label}: Singularity without the prerequisites is refused`, sing);
    if (notOffered) {
        const err = eng.applyAction(S, pi, 'research', { tech: notOffered.k });
        ok(err && !p.techs[notOffered.k], `${label}: a tech that is not available is refused`, `${notOffered.k}: ${err}`);
    }
    ok(notOffered, `${label}: found a tech that is not available`);
    const legal = offered[0];
    const err = legal && eng.applyAction(S, pi, 'research', { tech: legal.k });
    ok(legal && !err && p.techs[legal.k], `${label}: an offered tech can be researched`, legal ? `${legal.k}: ${err}` : 'nothing offered');
    if (legal) {
        const before = p.sci;
        const again = eng.applyAction(S, pi, 'research', { tech: legal.k });
        ok(again && p.sci === before, `${label}: a known tech is not paid for twice`, `${legal.k}: ${again}`);
    }
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
