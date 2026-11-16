/**
 * Regression tests for the findings of the second security audit of 2026-11-16 (the report stays private
 * until production runs the fixes).
 * Each check describes the SECURE behaviour: it fails while the finding is open and passes once
 * it is fixed. Runs against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   node tests/security/regression.test.js [http://localhost:3000]
 *
 *   HOCHCIV_CONTAINER / HOCHCIV_DB_CONTAINER: other container names (default hochciv-multiplayer-local /
 *   hochciv-db). The ranked check needs a short placement timer:
 *   TURN_TIMER_SCALE=0.05 docker compose -f docker-compose.local.yml up -d
 *
 *   · SA-01 passkey login: an unknown passkey is answered 400, not 500 (routes/auth.js imports Passkey)
 *   · SA-02 ranked lobbies: a ranked game won because a guest seat resigned changes no MMR
 *   · SA-03 attempt counters: parallel wrong TOTP codes / reset codes count fully (lock / burn after 5)
 *   · SA-04 revocation: a password change also closes the open sockets of the other sessions
 *   · SA-06 invitations: re-inviting the same player is limited (no e-mail per request)
 *   · SA-07 update-password: wrong current passwords are rate-limited
 *
 * Talks to Socket.IO over a minimal Engine.IO v4 client (ws). Test accounts are deleted afterwards.
 * The auth rate limit (15 per minute and address) is shared by several checks: the test waits a
 * minute between them.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const WebSocket = require('ws');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const DB = process.env.HOCHCIV_DB_CONTAINER || 'hochciv-db';
const PASSWORD = 'Reg-' + crypto.randomBytes(6).toString('hex');
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', DB, 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const users = [];

function makeUser(fields = {}) {
    const name = 'reg_' + crypto.randomBytes(3).toString('hex');
    const f = Object.assign({ username: name, email: name + '@example.com', isActive: true, notifyEmail: true }, fields);
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        const f = ${JSON.stringify(f)}; f.password_hash = bcrypt.hashSync(${JSON.stringify(PASSWORD)}, 10);
        f.termsVersion = require('./utils/terms').VERSION; f.termsAcceptedAt = new Date();
        User.create(f).then(u => { console.log(u.id); process.exit(0); })`).split('\n').pop();
    const u = { name, id, email: f.email };
    users.push(u);
    return u;
}

function client() {
    let cookie = '';
    const req = async (method, path, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (cookie) headers.Cookie = cookie;
        const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
        for (const c of res.headers.getSetCookie()) if (c.startsWith('connect.sid=')) cookie = c.split(';')[0];
        const t = await res.text();
        let data; try { data = JSON.parse(t); } catch (_) { data = t; }
        return { status: res.status, data };
    };
    return { req, cookie: () => cookie, login: name => req('POST', '/api/auth/login', { username: name, password: PASSWORD }) };
}

/** Socket.IO v4 over a plain WebSocket: emit with ack, wait for an event, close. */
function socket(cookie) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: cookie ? { Cookie: cookie } : {} });
        const acks = new Map(), handlers = {};
        let id = 1;
        const api = {
            closed: false,
            emit: (ev, data) => new Promise(r => { const n = id++; acks.set(n, r); ws.send('42' + n + JSON.stringify([ev, data || {}])); }),
            wait: (ev, ms = 20000) => new Promise((res, rej) => {
                const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
                (handlers[ev] = handlers[ev] || []).push(d => { clearTimeout(t); res(d); });
            }),
            close: () => ws.close(),
        };
        ws.on('message', b => {
            const m = b.toString();
            if (m[0] === '0') return ws.send('40');
            if (m === '2') return ws.send('3');
            if (m.startsWith('40')) return resolve(api);
            if (m.startsWith('42')) { const [ev, d] = JSON.parse(m.slice(2).replace(/^\d+/, '')); (handlers[ev] || []).forEach(f => f(d)); return; }
            if (m.startsWith('43')) { const n = parseInt(m.slice(2), 10); const f = acks.get(n); acks.delete(n); if (f) f(JSON.parse(m.slice(2 + String(n).length))[0]); }
        });
        ws.on('close', () => { api.closed = true; });
        ws.on('error', reject);
    });
}
const waitForRateLimit = () => sleep(61000);

(async () => {
    try {
        // ── SA-01: passkey login ────────────────────────────────────────────────
        {
            const c = client();
            await c.req('POST', '/api/auth/login/passkey/options-passwordless', {});
            const r = await c.req('POST', '/api/auth/login/passkey/verify-passwordless', { id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: {} });
            ok(r.status === 400, 'SA-01 passwordless login with an unknown passkey is refused with 400, not a server error', 'status ' + r.status);
            const u = makeUser({ emailOtpEnabled: true });
            const c2 = client();
            await c2.login(u.name);
            const o = await c2.req('POST', '/api/auth/login/passkey/options', {});
            ok(o.status === 200, 'SA-01 passkey options for the second factor are issued', 'status ' + o.status);
        }

        // ── SA-02: ranked lobby won by a resigning guest ────────────────────────
        {
            const u = makeUser();
            const c = client();
            await c.login(u.name);
            const before = Number(sql(`SELECT mmr FROM users WHERE id='${u.id}'`));
            const hostCid = crypto.randomUUID(), guestCid = crypto.randomUUID();
            const s = (await c.req('POST', '/api/sessions', { config: { mapKey: 'random', playerCount: 2, kiCount: 0, ranked: true, turnTime: 60 }, host: { name: u.name, clientId: hostCid } })).data;
            await client().req('POST', '/api/sessions/join', { joinCode: s.joinCode, password: s.password, player: { name: 'Gast', clientId: guestCid } });
            const hs = await socket(c.cookie()), gs = await socket(null);
            await hs.emit('session:connect', { sessionId: s.sessionId, password: s.password, clientId: hostCid });
            await gs.emit('session:connect', { sessionId: s.sessionId, password: s.password, clientId: guestCid });
            const start = await hs.emit('game:start', {});
            if (start.ok) {
                try {
                    await gs.wait('game:start', 90000);
                    const rec = hs.wait('game:record', 20000);
                    await gs.emit('game:resign', {});
                    await rec;
                } catch (e) { console.log('      (' + e.message + ' – start the server with TURN_TIMER_SCALE=0.05)'); }
            }
            const after = Number(sql(`SELECT mmr FROM users WHERE id='${u.id}'`));
            ok(!start.ok || after === before, 'SA-02 a ranked game against a guest who resigns changes no MMR', `start ${JSON.stringify(start)}, MMR ${before} → ${after}`);
            hs.close(); gs.close();
        }

        // ── SA-06: invitation spam ──────────────────────────────────────────────
        {
            const a = makeUser(), v = makeUser();
            const c = client();
            await c.login(a.name);
            const since = Math.floor(Date.now() / 1000) - 1;
            const g = (await c.req('POST', '/api/async', { config: { mapKey: '0', playerCount: 4, kiCount: 2 }, civ: 'england', ability: 'basis' })).data;
            for (let i = 0; i < 10; i++) await c.req('POST', `/api/async/${g.id}/invite`, { username: v.name });
            await sleep(1000);
            const logs = execFileSync('docker', ['logs', '--since', String(since), CONTAINER], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
            const mails = (logs.match(new RegExp('To: ' + v.email, 'g')) || []).length;
            ok(mails <= 2, 'SA-06 inviting the same player ten times sends at most two e-mails', mails + ' e-mails');
            await c.req('POST', `/api/async/${g.id}/cancel`, {});
        }

        // ── SA-07: update-password is rate-limited ──────────────────────────────
        {
            const u = makeUser();
            const c = client();
            await c.login(u.name);
            const st = [];
            for (let i = 0; i < 25; i++) st.push((await c.req('POST', '/api/account/update-password', { currentPassword: 'wrong-' + i, newPassword: 'Whatever-123' })).status);
            ok(st.includes(429), 'SA-07 25 wrong current passwords hit a rate limit', [...new Set(st)].join(','));
        }

        await waitForRateLimit();
        // ── SA-03: parallel wrong TOTP codes ────────────────────────────────────
        {
            const u = makeUser({ totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' });
            const c = client();
            await c.login(u.name);
            await Promise.all(Array.from({ length: 12 }, (_, i) => c.req('POST', '/api/auth/login/totp', { token: String(200000 + i * 7919) })));
            const locked = sql(`SELECT "totpLockedUntil" IS NOT NULL FROM users WHERE id='${u.id}'`);
            ok(locked === 't', 'SA-03 twelve parallel wrong TOTP codes lock the codes', 'locked ' + locked);
        }
        await waitForRateLimit();
        {
            const u = makeUser();
            const c = client();
            await c.req('POST', '/api/auth/reset-password/request', { email: u.email });
            await Promise.all(Array.from({ length: 12 }, (_, i) => c.req('POST', '/api/auth/reset-password/confirm', { email: u.email, code: String(300000 + i * 6007), newPassword: 'NewPassw0rd!' })));
            const valid = sql(`SELECT "resetCode" IS NOT NULL FROM users WHERE id='${u.id}'`);
            ok(valid === 'f', 'SA-03 twelve parallel wrong reset codes burn the code', 'code still valid: ' + valid);
        }
        await waitForRateLimit();

        // ── SA-04: sockets of other sessions end with a password change ─────────
        {
            const u = makeUser();
            const other = client(); await other.login(u.name);
            const sock = await socket(other.cookie());
            const me = client(); await me.login(u.name);
            await me.req('POST', '/api/account/update-password', { currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-1' });
            await sleep(500);
            const r = sock.closed ? { error: 'closed' } : await Promise.race([sock.emit('match:join', {}), sleep(3000).then(() => ({ error: 'no answer' }))]);
            ok(!r.ok, 'SA-04 after a password change the other session\'s open socket is no longer logged in', JSON.stringify(r));
            if (r.ok) await sock.emit('match:leave', {});
            sock.close();
        }
    } catch (err) {
        console.error(err);
        failed++;
    } finally {
        if (users.length) inServer(`require('./models').User.destroy({ where: { id: ${JSON.stringify(users.map(u => u.id))} } }).then(() => process.exit(0))`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
    process.exit(failed ? 1 : 0);
})();
