/**
 * The rev of live games instead of the full resync (scalability P1.8). Needs no server: the
 * socket handlers of sockets/game.js run in-process against a fake Socket.IO server, the
 * heartbeat shortened to 300 ms (LIVE_HEARTBEAT_MS).
 *
 *   node tests/sync/rev.test.js
 *
 *   · game:start carries the rev, every state:update a new one
 *   · the heartbeat state:rev carries the rev of the latest update, no state
 *   · a client that missed an update gets the state again with state:request – the same rev,
 *     `resync`, no scenes; a second request within 2 s is refused; a socket of no game gets nothing
 *   · every 4th heartbeat the full state goes out again (the safety resync) to a game played lately
 */
process.env.LIVE_HEARTBEAT_MS = '300';
const crypto = require('crypto');
const sessions = require('../../sessions');
const registerHandlers = require('../../sockets/game');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── A fake Socket.IO server: rooms, emits recorded per socket ────────────────
const sockets = new Map();
let onConnection = null;
const deliver = (target, event, data) => {
    for (const s of sockets.values()) if (s.id === target || s.rooms.has(target)) s.got.push({ event, data });
};
const io = {
    on: (ev, cb) => { if (ev === 'connection') onConnection = cb; },
    to: target => ({ emit: (event, data) => deliver(target, event, data) }),
    sockets: { sockets },
};
registerHandlers(io);

function connect() {
    const s = {
        id: crypto.randomUUID(), rooms: new Set(), got: [], handlers: {}, request: { user: null },
        on(ev, fn) { this.handlers[ev] = fn; },
        join(room) { this.rooms.add(room); },
        leave(room) { this.rooms.delete(room); },
        emit(event, data) { this.got.push({ event, data }); },
    };
    sockets.set(s.id, s);
    onConnection(s);
    return s;
}
const call = (s, ev, data) => new Promise(res => s.handlers[ev](data, res));
const last = (s, ev) => [...s.got].reverse().find(m => m.event === ev);
const all = (s, ev) => s.got.filter(m => m.event === ev);

(async () => {
    const host = { name: 'Host', clientId: crypto.randomUUID() };
    const r = sessions.createSession({ mapKey: '0', playerCount: 2, kiCount: 0, civMode: 'fixed' }, host);
    const s = sessions.getSession(r.sessionId);
    const guest = crypto.randomUUID();
    sessions.joinSession(r.joinCode, r.password, { name: 'Gast', clientId: guest });
    Object.assign(s.players[0], { civ: 'england', ability: 'basis' });
    Object.assign(s.players[1], { civ: 'russland', ability: 'basis' });
    const a = connect(), b = connect();
    await call(a, 'session:connect', { sessionId: r.sessionId, password: r.password, clientId: host.clientId });
    await call(b, 'session:connect', { sessionId: r.sessionId, password: r.password, clientId: guest });
    const err = registerHandlers.startGame(io, s);
    ok(!err && s.status === 'playing', 'the live game runs', err || s.status);

    const start = last(a, 'game:start');
    ok(start && start.data.rev === 0, 'game:start carries the rev', start && String(start.data.rev));

    // the player on turn ends it: everybody gets the update with a new rev
    const onTurn = () => (s.state.players[s.state.cur].slot === 0 ? a : b);
    let res = await call(onTurn(), 'action', { type: 'endTurn', params: {} });
    const u1 = last(b, 'state:update');
    ok(!res.error && u1 && u1.data.rev === 1 && last(a, 'state:update').data.rev === 1, 'a state:update has a new rev', res.error || (u1 && String(u1.data.rev)));

    // B misses the next update (out of the room for a moment)
    b.rooms.delete(r.sessionId);
    res = await call(onTurn(), 'action', { type: 'endTurn', params: {} });
    b.rooms.add(r.sessionId);
    ok(!res.error && s.rev === 2 && last(b, 'state:update').data.rev === 1, 'B missed update 2', res.error);

    // the heartbeat tells B that its state is old
    b.got.length = 0;
    await sleep(450);
    const beat = last(b, 'state:rev');
    ok(beat && beat.data.rev === 2 && Object.keys(beat.data).join() === 'rev', 'the heartbeat carries the rev only', beat && JSON.stringify(beat.data));

    // B asks for the state: to B only, the same rev, no scenes
    a.got.length = 0;
    b.got.length = 0;
    res = await call(b, 'state:request', {});
    const again = last(b, 'state:update');
    ok(res.ok && again && again.data.rev === 2 && again.data.resync === true && again.data.state && again.data.scenes === undefined,
        'state:request: the full state again, the same rev, without scenes', JSON.stringify(res));
    ok(!last(a, 'state:update'), 'state:request: the others get nothing');
    res = await call(b, 'state:request', {});
    ok(res.error && all(b, 'state:update').length === 1, 'state:request: not again within 2 s', res.error);
    const stranger = connect();
    res = await call(stranger, 'state:request', {});
    ok(res.error && !last(stranger, 'state:update'), 'state:request: a socket of no game gets nothing', res.error);

    // the safety resync: every 4th heartbeat the full state (a game played in the last minute)
    a.got.length = 0;
    await sleep(4 * 300 + 200);
    const beats = all(a, 'state:rev').length, full = all(a, 'state:update');
    ok(full.length >= 1 && full.every(m => m.data.state) && beats >= 2, 'every 4th heartbeat the full state again', `${beats} heartbeats, ${full.length} full`);

    clearInterval(io.__syncInterval);
    clearInterval(io.__turnInterval);
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
