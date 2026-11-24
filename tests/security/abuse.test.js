/**
 * Abuse findings of the findings report that need no server:
 *
 *   node tests/security/abuse.test.js
 *
 *   · R-15 every socket event goes through a token bucket; a flood gets error acks and is
 *          disconnected, normal play and a bot waiting for its acks are not
 *   · R-16 wrong lobby passwords are counted per lobby; the lock stops new players even with the
 *          right password, players of the lobby and the server's own callers get in
 */
const crypto = require('crypto');
const SocketLimit = require('../../utils/socket-limit');
const sessions = require('../../sessions');

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

/** A socket with Socket.IO's per-packet middleware: send() returns 'handled' or the ack reply. */
function fakeSocket() {
    const s = {
        id: 'test', mw: [], disconnected: false,
        use(fn) { this.mw.push(fn); },
        disconnect() { this.disconnected = true; },
        send(event, data = {}, withAck = true) {
            let reply = 'no ack', handled = false;
            const packet = withAck ? [event, data, r => { reply = r; }] : [event, data];
            this.mw[0](packet, () => { handled = true; });
            return handled ? 'handled' : reply;
        },
    };
    SocketLimit.attach(s);
    return s;
}

(async () => {
    // ── R-15 ─────────────────────────────────────────────────────────────────
    {
        const { LIMITS } = SocketLimit;
        const s = fakeSocket();
        let handled = 0;
        for (let i = 0; i < LIMITS.other.burst; i++) if (s.send('lobby:config') === 'handled') handled++;
        ok(handled === LIMITS.other.burst, 'R-15 a burst up to the bucket size is handled', String(handled));
        const r = s.send('lobby:config');
        ok(r && r.error === SocketLimit.MESSAGE, 'R-15 the next event gets an error ack instead of being handled');
        ok(s.send('action') === 'handled', 'R-15 game moves have their own bucket');
        ok(!s.disconnected, 'R-15 a few dropped events do not disconnect');

        // the bucket refills with time
        const b = SocketLimit.bucket(LIMITS.other);
        for (let i = 0; i < LIMITS.other.burst; i++) SocketLimit.take(b, b.at);
        ok(!SocketLimit.take(b, b.at) && SocketLimit.take(b, b.at + 1000 / LIMITS.other.rate + 1), 'R-15 the bucket refills at its rate');

        // a flood is disconnected
        const f = fakeSocket();
        let errors = 0;
        for (let i = 0; i < 1000 && !f.disconnected; i++) if (f.send('game:trend').error) errors++;
        ok(f.disconnected && errors >= SocketLimit.MAX_STRIKES - 1, 'R-15 a socket that floods is disconnected', `${errors} error acks`);
        const q = fakeSocket();
        for (let i = 0; i < LIMITS.other.burst; i++) q.send('game:trend', {}, false);
        ok(q.send('game:trend', {}, false) === 'no ack', 'R-15 an event without an ack is dropped silently');

        // a bot sending one move per 40 ms for 10 s stays below the limit
        const m = SocketLimit.bucket(LIMITS.move);
        let refused = 0;
        for (let t = 0; t < 10000; t += 40) if (!SocketLimit.take(m, m.at + t)) refused++;
        ok(refused === 0, 'R-15 25 moves per second for 10 s pass');
    }

    // ── R-16 ─────────────────────────────────────────────────────────────────
    {
        const id = () => crypto.randomUUID();
        const host = { name: 'Host', clientId: id() };
        const l = sessions.createSession({}, host);
        const pw = l.password;
        const wrong = pw === '000000' ? '111111' : '000000';
        const inside = id();
        ok(typeof sessions.joinSession(l.joinCode, pw, { name: 'Bea', clientId: inside }) === 'object', 'R-16 the right password joins');
        let last;
        for (let i = 0; i < sessions.PASSWORD_MAX_FAILS; i++) last = sessions.joinSession(l.joinCode, wrong, { name: 'X', clientId: id() });
        ok(last === 'Falsches Passwort.', 'R-16 wrong passwords are refused', last);
        ok(sessions.joinSession(l.joinCode, pw, { name: 'Cem', clientId: id() }) === sessions.PASSWORD_LOCKED, 'R-16 after 10 failures the lobby is locked, also for the right password');
        ok(sessions.previewSession(l.joinCode, pw) === sessions.PASSWORD_LOCKED, 'R-16 … for the invite preview');
        ok(sessions.addSpectator(l.joinCode, pw, { name: 'W', clientId: id() }) === sessions.PASSWORD_LOCKED, 'R-16 … and for watching');
        ok(typeof sessions.joinSession(l.joinCode, pw, { name: 'Bea', clientId: inside }) === 'object', 'R-16 a player of the lobby still gets back in');
        ok(typeof sessions.joinSession(l.joinCode, pw, { name: 'Dan', clientId: id() }, { trusted: true }) === 'object', 'R-16 the server\'s own callers are not locked out');
        const s = sessions.getSession(l.sessionId);
        s.passwordGuard.lockedUntil = Date.now() - 1;
        ok(typeof sessions.joinSession(l.joinCode, pw, { name: 'Eva', clientId: id() }) === 'object', 'R-16 after the lock the right password works again');
        ok(sessions.passwordMatches(s, pw) && !sessions.passwordMatches(s, wrong) && !sessions.passwordMatches(s, undefined) && !sessions.passwordMatches(s, pw + '0'),
            'R-16 the constant-time compare');
        sessions.removeSession(l.sessionId);
    }

    // ── R-17 ─────────────────────────────────────────────────────────────────
    {
        const Solo = require('../../utils/solo');
        const size = r => Buffer.byteLength(JSON.stringify(r));
        const point = { s: 123456, c: 12, pop: 345, t: 23, a: 45, w: 2, d: 7 };
        const game = n => ({
            version: 'v110', durationRounds: n, participants: [{ name: 'A' }], facts: {},
            stats: { players: [], events: [], rounds: Array.from({ length: n }, (_, i) => ({ r: i + 1, p: Array(8).fill(point) })) },
        });
        const small = game(50);
        ok(Solo.fitSize(small) && small.stats.rounds.length === 50, 'R-17 a normal game is stored as it is');
        const long = Solo.fitSize(game(2000));
        ok(long && size(long) <= Solo.MAX_STORED_BYTES && long.stats.rounds.length < 2000 && long.stats.rounds.at(-1).r === 2000,
            'R-17 a long game keeps a thinned chart under 200 KB, with its last round', long && `${long.stats.rounds.length} rounds, ${size(long)} bytes`);
        const huge = game(10);
        huge.facts = { junk: 'x'.repeat(Solo.MAX_STORED_BYTES) };
        ok(Solo.fitSize(huge) === null, 'R-17 a game that doesn\'t fit even without a chart is refused');
    }

    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
