/**
 * Continuity findings of the findings report (R-08 – R-12, R-23, R-24). Needs no server: the
 * socket handlers of sockets/game.js run in-process against a fake Socket.IO server.
 *
 *   node tests/security/continuity.test.js
 *
 *   · R-08 a socket that binds to another session gives up its old seat (offline, room left)
 *   · R-12 a disconnect in the lobby keeps the seat for LOBBY_GRACE_MS; a reconnect keeps it,
 *          afterwards the seat is freed and a host's lobby handed over
 *   · R-10 an empty running game survives the cleanup for EMPTY_RUNNING_GRACE_MS, a lobby does not
 *   · R-11 a paused game is not removed after the 2 h idle timeout
 *   · R-09 a start that fails puts the lobby back (no KI seats, the players' nations, the settings)
 *   · R-23 a kicked player can't rejoin – same tab or same account
 *   · R-24 the tile placement has a deadline without a turn timer
 */
process.env.LOBBY_GRACE_MS = '300';
const crypto = require('crypto');
const config = require('../../config');
const sessions = require('../../sessions');
const engine = require('../../engine-adapter');
const registerHandlers = require('../../sockets/game');
const { startGame } = registerHandlers;

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── A fake Socket.IO server: rooms, emits recorded per socket ────────────────
const sockets = new Map();
let onConnection = null;
const roomsOf = id => (sockets.get(id) ? sockets.get(id).rooms : new Set());
const deliver = (target, event, data) => {
    for (const s of sockets.values()) if (s.id === target || s.rooms.has(target)) s.got.push({ event, data });
};
const io = {
    on: (ev, cb) => { if (ev === 'connection') onConnection = cb; },
    to: target => ({ emit: (event, data) => deliver(target, event, data) }),
    sockets: { sockets },
};
registerHandlers(io);
clearInterval(io.__syncInterval);     // the turn timer stays: it runs the placement timeout (R-24)

function connect(user) {
    const s = {
        id: crypto.randomUUID(), rooms: new Set(), got: [], handlers: {},
        request: { user: user || null },
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
const drop = s => { s.handlers.disconnect(); sockets.delete(s.id); };

function lobby(cfg = {}) {
    const host = { name: 'Host', clientId: crypto.randomUUID() };
    const r = sessions.createSession({ ...cfg }, host);
    return { ...r, s: sessions.getSession(r.sessionId), hostId: host.clientId };
}
function join(l, name, extra = {}) {
    const clientId = crypto.randomUUID();
    const r = sessions.joinSession(l.joinCode, l.password, { name, clientId, ...extra });
    return { clientId, r };
}
const bind = (sock, l, clientId) => call(sock, 'session:connect', { sessionId: l.sessionId, password: l.password, clientId });

(async () => {
    // ── R-12: lobby grace period ─────────────────────────────────────────────
    {
        const l = lobby();
        const b = join(l, 'Bea');
        const hs = connect(), bs = connect();
        await bind(hs, l, l.hostId);
        await bind(bs, l, b.clientId);
        drop(bs);
        const seat = l.s.players.find(p => p.clientId === b.clientId);
        ok(seat && seat.connected === false, 'R-12 a lobby disconnect keeps the seat (offline)');
        const back = connect();
        const ack = await bind(back, l, b.clientId);
        ok(ack.ok && seat.connected, 'R-12 the player comes back to the same seat within the grace period');
        await sleep(450);
        ok(l.s.players.includes(seat), 'R-12 an expired timer of an earlier disconnect frees nothing');
        drop(back);
        await sleep(450);
        ok(!l.s.players.includes(seat) && sessions.getSession(l.sessionId), 'R-12 after the grace period the seat is freed, the lobby stays');

        // the host: the lobby goes to the next connected player
        const c = join(l, 'Cem');
        const cs = connect();
        await bind(cs, l, c.clientId);
        drop(hs);
        ok(sessions.getSession(l.sessionId) && l.s.players[l.s.hostIndex].clientId === l.hostId, 'R-12 the host\'s disconnect does not close the lobby at once');
        await sleep(450);
        ok(sessions.getSession(l.sessionId) && l.s.players.length === 1 && l.s.players[l.s.hostIndex].clientId === c.clientId,
            'R-12 after the grace period the host seat is freed and the next player is host');
        drop(cs);
        await sleep(450);
        ok(!sessions.getSession(l.sessionId), 'R-12 nobody left: the lobby is closed');
    }

    // ── R-08: switching sessions releases the old seat ──────────────────────
    {
        const l1 = lobby(), l2 = lobby();
        const a1 = join(l1, 'Ada'), a2 = join(l2, 'Ada');
        const h1 = connect();
        await bind(h1, l1, l1.hostId);
        const sock = connect();
        await bind(sock, l1, a1.clientId);
        const old = l1.s.players.find(p => p.clientId === a1.clientId);
        await bind(sock, l2, a2.clientId);
        ok(!old.connected && old.socketId === null, 'R-08 the old seat is offline after binding to another session');
        ok(!sock.rooms.has(l1.sessionId) && sock.rooms.has(l2.sessionId), 'R-08 the socket left the old room');
        sock.got.length = 0;
        deliver(l1.sessionId, 'probe', 1);
        ok(!sock.got.some(e => e.event === 'probe'), 'R-08 no more updates of the old session');
        drop(sock); drop(h1);
    }

    // ── R-23: ban list ───────────────────────────────────────────────────────
    {
        const l = lobby();
        const hs = connect();
        await bind(hs, l, l.hostId);
        const user = { id: crypto.randomUUID(), username: 'troll', accountType: 'user' };
        const t = join(l, 'Troll');
        const ts = connect(user);
        await bind(ts, l, t.clientId);
        const idx = l.s.players.findIndex(p => p.clientId === t.clientId);
        const k = await call(hs, 'session:kick', { playerIndex: idx });
        ok(k.ok, 'R-23 the host kicks');
        ok(sessions.joinSession(l.joinCode, l.password, { name: 'Troll', clientId: t.clientId }) === sessions.BANNED, 'R-23 the same tab can\'t rejoin');
        ok(join(l, 'Troll2', { userId: user.id }).r === sessions.BANNED, 'R-23 the same account can\'t rejoin from a new tab');
        const g = join(l, 'Guest');
        ok(typeof g.r === 'object', 'R-23 other players still join');
        const gs = connect(user);
        const ack = await bind(gs, l, g.clientId);
        ok(ack.error === sessions.BANNED && !l.s.players.some(p => p.clientId === g.clientId), 'R-23 a guest seat logging in with the kicked account is removed');
        drop(hs);
        sessions.removeSession(l.sessionId);
    }

    // ── R-10 / R-11: cleanup ─────────────────────────────────────────────────
    {
        const now = Date.now();
        const mk = (status, extra) => { const l = lobby(); Object.assign(l.s, { status, ...extra }); return l; };
        const runEmpty = mk('playing', { emptySince: now - 10 * 60 * 1000 });
        const runGone = mk('playing', { emptySince: now - config.EMPTY_RUNNING_GRACE_MS - 1000 });
        const lobbyEmpty = mk('lobby', { emptySince: now - 1000 });
        const paused = mk('playing', { paused: { by: 0, at: now }, lastActivity: now - 3 * 60 * 60 * 1000, emptySince: now - 60 * 60 * 1000 });
        const idle = mk('playing', { lastActivity: now - 3 * 60 * 60 * 1000 });
        idle.s.players[0].connected = true;
        sessions.cleanup();
        ok(!!sessions.getSession(runEmpty.sessionId), 'R-10 a running game everyone left 10 minutes ago survives the cleanup');
        ok(!sessions.getSession(runGone.sessionId), 'R-10 … but not after EMPTY_RUNNING_GRACE_MS');
        ok(!sessions.getSession(lobbyEmpty.sessionId), 'R-10 an empty lobby goes at the next run');
        ok(!!sessions.getSession(paused.sessionId), 'R-11 a paused game survives 3 h without activity (and an empty hour)');
        ok(!sessions.getSession(idle.sessionId), 'R-11 an unpaused game still ends after the 2 h idle timeout');
        [runEmpty, paused].forEach(l => sessions.removeSession(l.sessionId));
    }

    // ── R-09: a failed start restores the lobby ──────────────────────────────
    {
        const l = lobby({ mapKey: 'plaettchen', playerCount: 4, kiCount: 2, civMode: 'random', turnOrder: 'random' });
        const b = join(l, 'Bea');
        const hs = connect(), bs = connect();
        await bind(hs, l, l.hostId);
        await bind(bs, l, b.clientId);
        const before = l.s.players.map(p => ({ ...p }));
        const cfgBefore = JSON.stringify(l.s.gameConfig);
        const E = engine.getEngine();
        const tilePlan = E.tilePlan;
        E.tilePlan = () => { throw new Error('test: engine fails'); };
        let err;
        try { err = startGame(io, l.s); } finally { E.tilePlan = tilePlan; }
        ok(err === 'Fehler beim Spielstart.', 'R-09 the start fails with a message', err);
        ok(l.s.status === 'lobby' && l.s.players.length === 2 && !l.s.players.some(p => p.kind === 'ki'), 'R-09 no KI seats are left behind');
        ok(l.s.players.every((p, i) => p.clientId === before[i].clientId && p.civ === before[i].civ && p.ability === before[i].ability && p.index === i),
            'R-09 seat order and the players\' nations are back');
        ok(JSON.stringify(l.s.gameConfig) === cfgBefore && !l.s.startSnapshot, 'R-09 the settings are back');

        // a failure after the placement sends everyone back to the lobby
        const err2 = startGame(io, l.s);
        ok(!err2 && l.s.status === 'placement', 'R-09 the next attempt starts (placement)', err2);
        ok(l.s.placementState && l.s.placementState.deadline > Date.now(), 'R-24 the placement has a deadline without a turn timer');
        // the time is up: the KI places the missing tiles (turn timer, once a second) – and the game fails to start
        const createGame = engine.createGame;
        engine.createGame = () => { throw new Error('test: engine fails'); };
        hs.got.length = 0;
        l.s.placementState.deadline = Date.now() - 1;
        for (let i = 0; i < 40 && l.s.status !== 'lobby'; i++) await sleep(100);
        engine.createGame = createGame;
        const back = hs.got.find(e => e.event === 'session:rematch');
        ok(l.s.status === 'lobby' && l.s.players.length === 2 && !l.s.state && !l.s.placementState, 'R-09 a failure after the placement returns to the lobby (was: stuck in placement)');
        ok(back && back.data.error === 'Fehler beim Spielstart.' && bs.got.some(e => e.event === 'session:rematch'), 'R-09 the players are sent back to the lobby with the error');
        drop(hs); drop(bs);
    }

    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
