/**
 * TEST ONLY – runs inside the server container, called by win-bonus.test.js (stdin → node -).
 *
 * Plays a two-player game on the original map to its end (the KI moves for both seats), then
 * hands it to the real result code: MODE=live → sockets/game.js processGameOverMmr, MODE=async →
 * async/service.js processResult. Prints the engine's verdict and scores as JSON.
 *
 * Env: USER_A, NAME_A, USER_B, NAME_B, MODE.
 */
const engine = require('./engine-adapter');

(async () => {
    const seats = [['A', 'griechenland'], ['B', 'england']].map(([k, civ], slot) => ({
        slot, civ, id: process.env['USER_' + k], name: process.env['NAME_' + k],
    }));
    const session = {
        id: 'score-test',
        players: seats.map(s => ({ name: s.name, civ: s.civ, kind: 'human', ability: 'basis', dbUserId: s.id, dbUsername: s.name })),
        gameConfig: { mapKey: '0', playerCount: 2 },
    };
    const S = engine.createGame(session);
    const E = engine.getEngine();

    // the KI plays both seats; afterwards they are humans again, as in a real game
    const kinds = S.players.map(p => [p.kind, p.kiLevel]);
    S.players.forEach(p => { p.kind = 'ki'; p.kiLevel = p.kiLevel || 'mittel'; });
    for (let n = 0; n < 400 && !S.over; n++) {
        engine.autoTurn(S);
        E.finishTurn(S);
        if (!S.over) E.advanceTurn(S);
    }
    S.players.forEach((p, i) => { [p.kind, p.kiLevel] = kinds[i]; });
    if (!S.over) throw new Error('the game did not end');

    const scores = seats.map(s => {
        const i = engine.stateIndexOf(S, s.slot);
        return { name: s.name, total: E.victoryScore(S, i).total, winner: S.over.winners.includes(i) };
    });

    if (process.env.MODE === 'live') {
        session.state = S;
        await require('./sockets/game').processGameOverMmr(session, null, session.id, true);
    } else {
        const g = {
            id: 'score-test', engine: engine.version(), config: { ranked: true }, state: S,
            seats: seats.map(s => ({ slot: s.slot, userId: s.id, name: s.name, civ: s.civ, kind: 'human' })),
        };
        await require('./async/service').processResult(g);
        if (!g.result || g.result.error) throw new Error('processResult failed');
    }
    console.log(JSON.stringify({ how: S.over.how, round: S.round, scores }));
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
