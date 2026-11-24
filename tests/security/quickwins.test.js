/**
 * Small hardening fixes of the findings report (R-05, R-13, R-14, R-20, R-21, R-25, R-27)
 * against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   node tests/security/quickwins.test.js [http://localhost:3000]
 *
 * 1. In process (R-13, R-25): sessions.js refuses a missing or non-string clientId and a
 *    non-string join code instead of throwing or storing "undefined".
 * 2. In process (R-05): a production start with a SESSION_SECRET under 25 characters fails,
 *    one of 25–31 characters only warns.
 * 3. Server (R-27): /health answers { ok: true } without uptime.
 * 4. Server (R-14): CORS reflects only allowed origins (never '*'); a foreign origin gets no
 *    Access-Control-Allow-Origin.
 * 5. Server (R-21): POST /api/activity/log answers 404 (ACTIVITY_DEBUG is off by default).
 * 6. Server (R-20): deleting a bot without a recent login is refused with reauthRequired; with
 *    one it works.
 *
 * The test account and bot are deleted afterwards.
 */
const crypto = require('crypto');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const ROOT = path.join(__dirname, '..', '..');
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').pop();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

function sessionsUnit() {
    const sessions = require('../../sessions');
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
        ok(sessions.createSession({ mapKey: '0' }, { name: 'H', clientId: bad }) === 'Ungültige Client-ID.', `R-13: createSession refuses clientId ${JSON.stringify(bad)}`);
    }
    const r = sessions.createSession({ mapKey: '0' }, { name: 'H', clientId: 'qw-host' });
    ok(r && r.joinCode, 'R-13: a valid clientId still creates a session');
    ok(sessions.joinSession(r.joinCode, r.password, { name: 'B' }) === 'Ungültige Client-ID.', 'R-13: joinSession without clientId is refused');
    ok(sessions.addSpectator(r.joinCode, r.password, { name: 'W', clientId: 7 }) === 'Ungültige Client-ID.', 'R-13: addSpectator with a number as clientId is refused');
    ok(!sessions.getSession(r.sessionId).players.some(p => p.clientId === 'undefined'), 'R-13: no seat with clientId "undefined"');
    let threw = null, res;
    try { res = sessions.joinSession(12345, r.password, { name: 'B', clientId: 'qw-b' }); } catch (e) { threw = e.message; }
    ok(!threw && res === 'Ungültiger Beitrittscode.', 'R-25: joinSession with a non-string join code answers instead of throwing', threw || JSON.stringify(res));
    const j = sessions.joinSession(r.joinCode.toLowerCase(), r.password, { name: 'B', clientId: 'qw-b' });
    ok(j && j.playerIndex === 1, 'R-25: a valid join code still works');
    ok(typeof sessions.getSessionByCode === 'undefined', 'R-25: the unused getSessionByCode is gone');
    sessions.removeSession(r.sessionId);
}

function secretStart() {
    const start = secret => spawnSync(process.execPath, ['-e', "require('./server.js'); setTimeout(() => process.exit(0), 1500)"], {
        cwd: ROOT, timeout: 20000,
        env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z', SESSION_SECRET: secret, BASE_URL: 'https://example.com', PORT: '0' },
    });
    const short = start('a'.repeat(24));
    ok(/shorter than 25 characters/.test(String(short.stderr)) && short.status !== 0, 'R-05: production refuses a 24-character secret', String(short.status));
    const mid = start('b'.repeat(27));
    const out = String(mid.stdout) + String(mid.stderr);
    ok(!/shorter than 25/.test(out) && /shorter than 32 characters/.test(out), 'R-05: a 27-character secret starts with a warning');
}

async function server() {
    const health = await fetch(BASE + '/health').then(r => r.json());
    ok(health.ok === true && !('uptime' in health), 'R-27: /health answers without uptime', JSON.stringify(health));

    const foreign = await fetch(BASE + '/api/auth/me', { headers: { Origin: 'https://evil.example' } });
    const acao = foreign.headers.get('access-control-allow-origin');
    ok(!acao, 'R-14: a foreign origin gets no Access-Control-Allow-Origin', String(acao));
    const discord = 'https://123456.discordsays.com';
    const allowed = await fetch(BASE + '/api/auth/me', { headers: { Origin: discord } });
    ok(allowed.headers.get('access-control-allow-origin') === discord && allowed.headers.get('access-control-allow-credentials') === 'true',
        'R-14: an allowed origin is reflected (not *) with credentials', allowed.headers.get('access-control-allow-origin'));
    const sockForeign = await fetch(BASE + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://evil.example' } });
    ok(sockForeign.headers.get('access-control-allow-origin') !== '*', 'R-14: Socket.IO never answers *', String(sockForeign.headers.get('access-control-allow-origin')));

    const log = await fetch(BASE + '/api/activity/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'error', msg: 'quickwins-test' }) });
    ok(log.status === 404, 'R-21: the Activity log endpoint is off by default', String(log.status));

    // R-20: a bot creator with one bot
    const name = 'qw_' + crypto.randomBytes(3).toString('hex');
    const ids = JSON.parse(inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        (async () => {
            const u = await User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
                isActive: true, emailOtpEnabled: false, role: 'botcreator', termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() });
            const b = await User.create({ username: '${name}_bot', accountType: 'bot', ownerId: u.id, isActive: true });
            console.log(JSON.stringify({ u: u.id, b: b.id })); process.exit(0);
        })().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(0); });`));
    if (ids.error) throw new Error(ids.error);
    users.push(ids.b, ids.u);
    const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: PASSWORD }) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    ok(login.status === 200 && cookie, 'R-20: the bot creator logs in', String(login.status));
    // the login is no longer recent
    sql(`UPDATE session SET sess = jsonb_set(sess::jsonb, '{authAt}', '0')::json WHERE sess::text LIKE '%${ids.u}%'`);
    const del = () => fetch(BASE + '/api/bots/' + ids.b, { method: 'DELETE', headers: { Cookie: cookie } });
    const stale = await del();
    const body = await stale.json().catch(() => ({}));
    ok(stale.status === 403 && body.reauthRequired === true, 'R-20: deleting a bot without a recent login asks for re-authentication', `${stale.status} ${JSON.stringify(body)}`);
    ok(sql(`SELECT count(*) FROM users WHERE id = '${ids.b}'`) === '1', 'R-20: the bot is still there');
    const re = await fetch(BASE + '/api/account/reauth', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
    ok(re.status === 200, 'R-20: re-authentication with the password', String(re.status));
    const fresh = await del();
    ok(fresh.status === 200 && sql(`SELECT count(*) FROM users WHERE id = '${ids.b}'`) === '0', 'R-20: after it, the bot is deleted', String(fresh.status));
}

(async () => {
    sessionsUnit();
    secretStart();
    await server();
})().catch(e => { console.error(e); failed++; }).finally(() => {
    for (const id of users) sql(`DELETE FROM users WHERE id = '${id}'`);
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
});
