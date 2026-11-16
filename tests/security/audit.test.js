/**
 * Fixes from the security audit of 16.11.2026. Runs without the docker setup:
 *
 *   node tests/security/audit.test.js
 *
 *   · buildRoad: only the numbers 1 (road) and 2 (railway) – the string "2" skipped the tech
 *     check of the engine (target === 2) and was stored as a railway;
 *   · dice state: a started game rolls with a seed only the server knows; clients get the
 *     state without S.seed (live and Rundenspiel use stateForPlayer);
 *   · nation and ability: checkCivChoice refuses an unknown nation and another nation's ability,
 *     the live start (sockets/game.js startGame) refuses such a seat;
 *   · host settings: lobby:config and POST /api/sessions keep only the host's settings – seed,
 *     fixedDice, startPlayer, map, setup and matchmaking stay the server's;
 *   · ranked live games need two humans;
 *   · kick: the host's seat is protected, not seat 0 (after a rematch the host may sit elsewhere).
 *
 * Engine checks run for every engine version the server can load.
 */
const engine = require('../../engine-adapter');
const sessions = require('../../sessions');
const game = require('../../sockets/game');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const versions = [['current', engine], ...(engine.OLD_VERSIONS || []).map(v => [v, engine.forVersion(v)])];
for (const [label, eng] of versions) {
    const newGame = seed => eng.createGame({
        gameConfig: { mapKey: '0', playerCount: 2, seed },
        players: ['england', 'russland'].map(civ => ({ civ, ability: 'basis', kind: 'human' })),
    });

    // ── 1. road target ────────────────────────────────────────────────────────
    const S = newGame(7);
    const pi = S.cur, p = S.players[pi];
    p.coins = 1000;
    const cap = S.cities.find(c => c.owner === pi && c.cap);
    for (const target of ['2', '1', 99, 2.5, '7,9']) {
        const err = eng.applyAction(S, pi, 'buildRoad', { r: cap.r, c: cap.c, target });
        ok(err && S.roads[`${cap.r},${cap.c}`] === undefined, `${label}: road target ${JSON.stringify(target)} is refused`, err);
    }
    const noRail = eng.applyAction(S, pi, 'buildRoad', { r: cap.r, c: cap.c, target: 2 });
    ok(/Eisenbahn/.test(noRail || ''), `${label}: a railway without Eisenbahn is still refused`, noRail);
    p.techs.rad = true;
    const road = eng.applyAction(S, pi, 'buildRoad', { r: cap.r, c: cap.c, target: 1 });
    ok(!road && S.roads[`${cap.r},${cap.c}`] === 1, `${label}: a road with Rad is built`, road);

    // ── 3. dice state ─────────────────────────────────────────────────────────
    const A = newGame(4242), B = newGame(4242);
    ok(A.seed !== B.seed, `${label}: two games from the same start seed roll with different dice`, `${A.seed} / ${B.seed}`);
    ok(JSON.stringify(A.players.map(x => x.avail)) === JSON.stringify(B.players.map(x => x.avail)),
        `${label}: the start roll (available techs) still follows the start seed`);
    const view = eng.stateForPlayer(A, A.cur);
    ok(!('seed' in view) && A.seed !== undefined, `${label}: the state for clients has no seed, the server's has`);

    // ── 2. nation and ability ─────────────────────────────────────────────────
    ok(eng.checkCivChoice('england', 'siedler'), `${label}: England with Russia's Siedlertrecks is refused`);
    ok(eng.checkCivChoice('atlantis', 'basis'), `${label}: an unknown nation is refused`);
    ok(!eng.checkCivChoice('russland', 'siedler') && !eng.checkCivChoice('england', 'basis')
        && !eng.checkCivChoice('random', 'random') && !eng.checkCivChoice('wikinger', 'random'),
        `${label}: real choices and 'random' pass`);
}

// ── 4. host settings ──────────────────────────────────────────────────────────
const raw = { mapKey: 'random', playerCount: 3, ranked: true, isPublic: true, seed: 4242, fixedDice: 99, startPlayer: 1,
    map: { rows: [] }, setup: {}, matchmaking: true, __proto__x: 1 };
const clean = sessions.cleanHostConfig(raw);
ok(['seed', 'fixedDice', 'startPlayer', 'map', 'setup', 'matchmaking', '__proto__x'].every(k => !(k in clean)),
    'host settings: server fields are dropped', Object.keys(clean).join(','));
ok(clean.mapKey === 'random' && clean.playerCount === 3 && clean.ranked === true && clean.isPublic === true,
    'host settings: the lobby settings are kept');

const created = sessions.createSession({ mapKey: '0', seed: 1 }, { name: 'Host', clientId: 'audit-host' });
const sess = sessions.getSession(created.sessionId);
sessions.updateConfig(sess.id, { seed: 4242, fixedDice: 99, startPlayer: 1, events: true });
ok(sess.gameConfig.seed === 1 && sess.gameConfig.fixedDice === undefined && sess.gameConfig.startPlayer === undefined
    && sess.gameConfig.events === true, 'lobby:config: seed, fixedDice and startPlayer stay as they were');

// ── 7. kick after a rematch: the host sits at seat 1 ──────────────────────────
const j = sessions.joinSession(created.joinCode, created.password, { name: 'B', clientId: 'audit-b' });
ok(j.playerIndex === 1, 'kick: a second player joins');
sess.hostIndex = 1;
ok(!sessions.kickPlayer(sess.id, 1), 'kick: the host at seat 1 cannot be kicked');
ok(sessions.kickPlayer(sess.id, 0) && sess.players.length === 1, 'kick: the host at seat 1 can kick seat 0');
ok(!sessions.kickPlayer(sess.id, 5), 'kick: a seat that does not exist is not "kicked"');
sessions.removeSession(sess.id);

// ── 5. + 2. the live start ────────────────────────────────────────────────────
const io = { to: () => ({ emit() {} }) };
const lobby = (cfg, players) => {
    const r = sessions.createSession(cfg, { name: 'H', clientId: 'audit-' + Math.random() });
    const s = sessions.getSession(r.sessionId);
    players.slice(1).forEach((pl, i) => sessions.joinSession(r.joinCode, r.password, { name: 'P' + i, clientId: 'audit-p' + i + Math.random() }));
    players.forEach((pl, i) => Object.assign(s.players[i], pl));
    return s;
};
let s = lobby({ mapKey: 'random', playerCount: 2, kiCount: 1, ranked: true, civMode: 'fixed' }, [{ civ: 'england', ability: 'basis' }]);
let err = game.startGame(io, s);
ok(/mindestens 2 Spieler/.test(err || ''), 'ranked: one human against the KI does not start', err);
sessions.removeSession(s.id);

s = lobby({ mapKey: 'random', playerCount: 2, kiCount: 0, civMode: 'fixed' }, [{ civ: 'england', ability: 'siedler' }, { civ: 'russland', ability: 'basis' }]);
err = game.startGame(io, s);
ok(/gehört nicht/.test(err || '') && s.status === 'lobby', 'start: England with Siedlertrecks does not start', err);
s.players[0].ability = 'basis';
s.players[1].civ = 'atlantis';
err = game.startGame(io, s);
ok(/Unbekannte Nation/.test(err || '') && s.status === 'lobby', 'start: a made-up nation does not start', err);
s.players[1].civ = 'russland';
s.players[1].ability = 'siedler';
err = game.startGame(io, s);
ok(!err && s.status !== 'lobby', 'start: real nations and abilities start', err || s.status);
sessions.removeSession(s.id);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
