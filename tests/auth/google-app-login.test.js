/**
 * Tests of the Android app's Google sign-in (GET /api/auth/google/app-config,
 * POST /api/auth/google/idtoken) against the local docker setup.
 *
 * Real Google ID tokens can only come from Google, so the server runs with a test stub for the
 * signature check (google-id-token-stub.js); everything after it is the production code.
 *
 *   1. Google provider in the local database (client ID must match CLIENT_ID below):
 *        docker exec hochciv-db psql -U hochciv -d hochciv -c "INSERT INTO oauth_providers
 *          (id, provider, \"clientId\", \"clientSecret\", enabled, \"createdAt\", \"updatedAt\")
 *          VALUES (gen_random_uuid(), 'google', 'test-client.apps.googleusercontent.com', 'x', true, now(), now())
 *          ON CONFLICT (provider) DO UPDATE SET \"clientId\" = EXCLUDED.\"clientId\", enabled = true"
 *   2. Server with the stub – an override file next to docker-compose.local.yml, not committed:
 *        services: { hochciv-local: { environment: [NODE_OPTIONS=--require /app/tests/auth/google-id-token-stub.js],
 *                                     volumes: [./tests:/app/tests] } }
 *        docker compose -f docker-compose.local.yml -f <override> up -d --build
 *   3. node tests/auth/google-app-login.test.js [http://localhost:3000]
 *
 * Without the stub only the first block (rejections) can pass.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

/** A browser-like client: keeps its cookies (the session). */
function client() {
    const cookies = new Map();
    return async (path, opts = {}) => {
        const headers = Object.assign({}, opts.headers);
        if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
        let res = await fetch(BASE + path, Object.assign({}, opts, { headers, redirect: 'manual' }));
        // The auth routes allow 15 requests a minute per IP – this test needs more: wait it out.
        if (res.status === 429) {
            const wait = (+res.headers.get('ratelimit-reset') || 60) + 1;
            console.log(`      (rate limit – waiting ${wait} s)`);
            await new Promise(r => setTimeout(r, wait * 1000));
            res = await fetch(BASE + path, Object.assign({}, opts, { headers, redirect: 'manual' }));
        }
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

const token = payload => 'test.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
const claims = (nonce, extra) => Object.assign({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600,
    nonce, sub: 'g' + crypto.randomBytes(8).toString('hex'), name: 'App Tester',
    email: `app.${crypto.randomBytes(4).toString('hex')}@example.com`, email_verified: true,
}, extra);
const post = (c, idToken, headers) => c('/api/auth/google/idtoken', {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: JSON.stringify({ idToken }),
});
/** Fresh nonce in the client's session. */
async function nonceFor(c) {
    const r = await c('/api/auth/google/app-config');
    return r.body && r.body.nonce;
}
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

(async () => {
    // ---- configuration and rejections
    let c = client();
    const cfg = await c('/api/auth/google/app-config');
    ok(cfg.status === 200 && cfg.body.clientId === CLIENT_ID && cfg.body.nonce && cfg.body.nonce.length >= 20,
        'app-config: client id and nonce', `${cfg.status}`);

    let r = await c('/api/auth/google/idtoken', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'idToken=x' });
    ok(r.status === 415, 'form posts are refused (login CSRF)', r.status);

    r = await post(client(), token(claims('whatever')));
    ok(r.status === 400 && r.body.reason === 'state', 'no nonce in the session → state', `${r.status} ${r.body && r.body.reason}`);

    c = client();
    let nonce = await nonceFor(c);
    r = await post(c, token(claims('another-nonce')));
    ok(r.status === 401 && r.body.reason === 'state', 'token with a foreign nonce → state', `${r.status} ${r.body && r.body.reason}`);
    r = await post(c, token(claims(nonce)));
    ok(r.status === 400 && r.body.reason === 'state', 'a nonce counts once, even after a failed try', `${r.status}`);

    nonce = await nonceFor(c);
    r = await post(c, 'eyJhbGciOiJSUzI1NiJ9.e30.forged');
    ok(r.status === 401 && r.body.reason === 'failed', 'forged token → failed', `${r.status} ${r.body && r.body.reason}`);

    nonce = await nonceFor(c);
    r = await post(c, token(claims(nonce, { aud: 'someone-else.apps.googleusercontent.com' })));
    ok(r.status === 401 && r.body.reason === 'failed', 'token for another app → failed', `${r.status}`);

    // ---- new account
    c = client();
    nonce = await nonceFor(c);
    const first = claims(nonce);
    r = await post(c, token(first));
    ok(r.status === 200 && r.body.ok === true && r.body.linked === false, 'new Google user is signed in', JSON.stringify(r.body));
    const me = await c('/api/auth/me');
    ok(me.status === 200 && me.body.googleLinked === true && me.body.email === first.email, 'session works, account linked to Google',
        me.body && me.body.username);

    // ---- same Google account again, new session → same user
    const c2 = client();
    nonce = await nonceFor(c2);
    r = await post(c2, token(claims(nonce, { sub: first.sub, email: first.email })));
    const me2 = await c2('/api/auth/me');
    ok(r.body && r.body.ok && me2.body && me2.body.id === me.body.id, 'same Google account → same user');

    // ---- existing (unactivated) account with the same verified e-mail → linked and activated
    const uname = 'apptest_' + crypto.randomBytes(3).toString('hex');
    const email = `${uname}@example.com`;
    const reg = await client()('/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: uname, email, password: 'Sehr-geheim-123!' }),
    });
    ok(reg.status === 200 || reg.status === 201, 'test account registered', `${reg.status} ${JSON.stringify(reg.body)}`);
    const c3 = client();
    nonce = await nonceFor(c3);
    r = await post(c3, token(claims(nonce, { email })));
    const me3 = await c3('/api/auth/me');
    ok(r.body && r.body.ok && me3.body && me3.body.username === uname && me3.body.googleLinked,
        'verified e-mail links the existing account', me3.body && me3.body.username);

    // ---- unverified e-mail must not take over an account
    const c4 = client();
    nonce = await nonceFor(c4);
    r = await post(c4, token(claims(nonce, { email, email_verified: false })));
    const me4 = await c4('/api/auth/me');
    ok(r.body && r.body.ok && me4.body && me4.body.username !== uname, 'unverified e-mail → separate new account, no takeover',
        me4.body && me4.body.username);

    // ---- banned user
    sql(`UPDATE users SET "isBanned" = true WHERE username = '${uname}'`);
    const c5 = client();
    nonce = await nonceFor(c5);
    r = await post(c5, token(claims(nonce, { email })));
    ok(r.status === 403 && r.body.reason === 'banned', 'banned user is refused', `${r.status} ${r.body && r.body.reason}`);
    const me5 = await c5('/api/auth/me');
    ok(me5.status === 401, 'and has no session');

    // ---- linking while logged in needs a recent login (here: the session from the Google login is recent)
    const c6 = client();
    nonce = await nonceFor(c6);
    await post(c6, token(claims(nonce)));
    nonce = await nonceFor(c6);
    r = await post(c6, token(claims(nonce, { sub: first.sub, email: first.email })));
    ok(r.status === 403 && r.body.reason === 'taken', 'linking a Google account that belongs to someone else → taken', `${r.status} ${r.body && r.body.reason}`);

    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
