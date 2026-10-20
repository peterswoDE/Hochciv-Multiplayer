/**
 * Tests of the push notifications for the Android app (routes/push.js, the push channel in
 * utils/notify.js, utils/push.js) against the local docker setup.
 *
 * Real messages need a Firebase project, so the server runs with a stub for the connection to
 * Firebase (fcm-stub.js): it writes the messages to tests/push/sent.jsonl. Everything else is the
 * production code.
 *
 *   1. Server with the stub and a dummy service account – an override file next to
 *      docker-compose.local.yml, not committed:
 *        services:
 *          hochciv-local:
 *            environment:
 *              - NODE_OPTIONS=--require /app/tests/push/fcm-stub.js
 *              - 'FCM_SERVICE_ACCOUNT={"project_id":"test","client_email":"t@test","private_key":"x"}'
 *            volumes:
 *              - ./tests:/app/tests
 *        docker compose -f docker-compose.local.yml -f <override> up -d --build
 *   2. node tests/push/push.test.js [http://localhost:3000]
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const SENT = path.join(__dirname, 'sent.jsonl');
const CONTAINER = 'hochciv-multiplayer-local';
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

/** Runs a script inside the server container (its models, its database). */
const inServer = code => execFileSync('docker', ['exec', '-w', '/app', CONTAINER, 'node', '-e', code]).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

function client() {
    const cookies = new Map();
    return async (p, opts = {}) => {
        const headers = Object.assign({ 'content-type': 'application/json' }, opts.headers);
        if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(BASE + p, Object.assign({}, opts, { headers, redirect: 'manual' }));
        for (const c of res.headers.getSetCookie()) {
            const [kv] = c.split(';');
            const i = kv.indexOf('=');
            cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1));
        }
        let body = null;
        try { body = await res.json(); } catch (e) { /* not JSON */ }
        return { status: res.status, body };
    };
}

/** An active account with password, created directly in the database. */
function makeUser() {
    const name = 'push_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const bcrypt = require('bcryptjs'); const { User } = require('./models');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('Geheim-12345', 8), isActive: true })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
async function login(u) {
    const c = client();
    const r = await c('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u.name, password: 'Geheim-12345' }) });
    if (r.status !== 200) throw new Error('login failed: ' + JSON.stringify(r.body));
    return c;
}
/** Sends a "your turn" notification through utils/notify.js, as the Rundenspiele do. */
function notifyTurn(userId, gameId) {
    inServer(`require('./utils/notify').notify(['${userId}'], { type: 'turn', gameId: '${gameId}', subject: 'Du bist am Zug',
        text: 'Du bist in deinem Rundenspiel am Zug (Runde 3).' }).then(() => process.exit(0))`);
}
const sent = () => fs.existsSync(SENT)
    ? fs.readFileSync(SENT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const tokenFor = tag => `${tag}_${crypto.randomBytes(24).toString('hex')}:APA91b`;
const post = (c, p, body) => c(p, { method: 'POST', body: JSON.stringify(body) });

(async () => {
    if (fs.existsSync(SENT)) fs.unlinkSync(SENT);

    let r = await post(client(), '/api/push/token', { token: tokenFor('x') });
    ok(r.status === 401, 'guests cannot register a device', r.status);

    const a = makeUser(), b = makeUser();
    const ca = await login(a), cb = await login(b);

    r = await post(ca, '/api/push/token', { token: 'kurz' });
    ok(r.status === 400, 'invalid token is refused', r.status);
    r = await post(ca, '/api/push/token', { token: 'x'.repeat(30) + '<script>' });
    ok(r.status === 400, 'token with foreign characters is refused', r.status);

    const phone = tokenFor('phone');
    r = await post(ca, '/api/push/token', { token: phone, platform: 'android' });
    ok(r.status === 200 && r.body.ok && r.body.enabled === true, 'device registered, push enabled on the server', JSON.stringify(r.body));
    await post(ca, '/api/push/token', { token: phone });
    ok(sql(`SELECT count(*) FROM device_tokens WHERE token = '${phone}'`) === '1', 'registering again keeps one row');

    const list = await ca('/api/async');
    ok(list.status === 200 && list.body.notifyPush === true, 'Rundenspiele list reports the push setting', list.body && list.body.notifyPush);

    // ---- "your turn" reaches the phone
    notifyTurn(a.id, 'game-1');
    const msgs = sent().filter(x => x.message.token === phone);
    const m = msgs[0] && msgs[0].message;
    ok(msgs.length === 1, 'turn notification sent to the phone', msgs.length);
    ok(m && !m.notification && m.data.type === 'turn' && m.data.gameId === 'game-1' && m.data.title === 'Hochciv: Du bist am Zug'
        && /Runde 3/.test(m.data.body) && /\/\?async=game-1$/.test(m.data.link) && m.android.priority === 'high',
        'data-only message with title, text, game link, high priority', m && JSON.stringify(m.data));
    ok(msgs[0] && /\/v1\/projects\/test\/messages:send$/.test(msgs[0].url), 'FCM HTTP v1 endpoint of the project');

    // ---- the same phone, now logged in as B: the token moves, A gets nothing more on it
    await post(cb, '/api/push/token', { token: phone });
    ok(sql(`SELECT "UserId" FROM device_tokens WHERE token = '${phone}'`) === b.id, 'logging in with another account moves the device');
    notifyTurn(a.id, 'game-2');
    ok(!sent().some(x => x.message.data.gameId === 'game-2'), 'the old account no longer reaches that phone');

    // ---- push off
    r = await post(cb, '/api/push/notify', { on: false });
    ok(r.status === 200 && r.body.notifyPush === false, 'push can be switched off');
    notifyTurn(b.id, 'game-3');
    ok(!sent().some(x => x.message.data.gameId === 'game-3'), 'switched off: nothing is sent');
    await post(cb, '/api/push/notify', { on: true });

    // ---- an uninstalled app (FCM: UNREGISTERED) loses its token
    const dead = tokenFor('dead');
    await post(cb, '/api/push/token', { token: dead });
    notifyTurn(b.id, 'game-4');
    ok(sent().some(x => x.message.token === phone && x.message.data.gameId === 'game-4'), 'live device still gets it');
    ok(sql(`SELECT count(*) FROM device_tokens WHERE token = '${dead}'`) === '0', 'token rejected by FCM is deleted');

    // ---- logout of the app removes the device
    r = await cb('/api/push/token', { method: 'DELETE', body: JSON.stringify({ token: phone }) });
    ok(r.status === 200 && sql(`SELECT count(*) FROM device_tokens WHERE token = '${phone}'`) === '0', 'DELETE removes the device');
    r = await ca('/api/push/token', { method: 'DELETE', body: JSON.stringify({ token: tokenFor('other') }) });
    ok(r.status === 200, 'deleting an unknown token is harmless');

    // ---- deleting the account takes its devices along
    const last = tokenFor('gone');
    await post(ca, '/api/push/token', { token: last });
    sql(`DELETE FROM users WHERE id IN ('${a.id}', '${b.id}')`);
    ok(sql(`SELECT count(*) FROM device_tokens WHERE token = '${last}'`) === '0', 'deleted account: its devices are gone (cascade)');

    if (fs.existsSync(SENT)) fs.unlinkSync(SENT);
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
