/**
 * Tests of the Android app's Google sign-in (GET /api/auth/google/app-config,
 * POST /api/auth/google/idtoken, POST /api/auth/google/playgames) against the local docker setup.
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
const { generateSecret, generateSync } = require('otplib');

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
        // a body function is called per try: authenticator codes don't outlast the wait below
        const send = () => fetch(BASE + path, Object.assign({}, opts, {
            headers, redirect: 'manual', body: typeof opts.body === 'function' ? opts.body() : opts.body,
        }));
        let res = await send();
        // The auth routes allow 15 requests a minute per IP – this test needs more: wait it out.
        if (res.status === 429) {
            const wait = (+res.headers.get('ratelimit-reset') || 60) + 1;
            console.log(`      (rate limit – waiting ${wait} s)`);
            await new Promise(r => setTimeout(r, wait * 1000));
            res = await send();
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

    // ---- second factor: only for a new link, not for logging in with a linked account
    const secret = generateSecret();
    const code = () => generateSync({ secret });
    const uname2 = 'apptest_' + crypto.randomBytes(3).toString('hex');
    const email2 = `${uname2}@example.com`;
    await client()('/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: uname2, email: email2, password: 'Sehr-geheim-123!' }),
    });
    const set2fa = on => sql(`UPDATE users SET "isActive" = true, "totpEnabled" = ${on}, "totpSecret" = ${on ? `'${secret}'` : 'NULL'} WHERE username = '${uname2}'`);
    const googleId = () => sql(`SELECT COALESCE("googleId", '') FROM users WHERE username = '${uname2}'`);
    const totpLogin = c2 => c2('/api/auth/login/totp', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: () => JSON.stringify({ token: code() }),
    });
    set2fa(true);
    const sub2 = 'g' + crypto.randomBytes(8).toString('hex');
    const google2 = (c2, sub, mail) => nonceFor(c2).then(n => post(c2, token(claims(n, { sub, email: mail }))));

    const c7 = client();
    r = await google2(c7, sub2, email2);
    ok(r.body && r.body.ok === false && r.body.reason === 'mfa', 'new link by e-mail waits for the second factor', JSON.stringify(r.body));
    ok(googleId() === '', 'and nothing is linked yet', googleId());
    ok((await c7('/api/auth/me')).status === 401, 'and there is no login yet');

    const c8 = client();
    r = await google2(c8, sub2, email2);
    ok(r.body && r.body.reason === 'mfa', 'still asked, without the factor the link never happens');
    r = await totpLogin(c8);
    ok(r.status === 200 && r.body.username === uname2, 'the code finishes the login', JSON.stringify(r.body));
    ok(googleId() === sub2, 'and makes the link', googleId());

    const c9 = client();
    r = await google2(c9, sub2, email2);
    const me9 = await c9('/api/auth/me');
    ok(r.body && r.body.ok === true && me9.body.username === uname2, 'linked account: Google logs in without the second factor', JSON.stringify(r.body));
    r = await c9('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    ok(r.status === 403 && r.body.reauthRequired, 'but that login is not enough for sensitive changes', `${r.status}`);
    r = await c9('/api/mfa/totp/none', { method: 'DELETE' });
    ok(r.status === 403 && r.body.reauthRequired, 'not even for removing the second factor', `${r.status}`);
    r = await c9('/api/account/reauth', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: () => JSON.stringify({ token: code() }),
    });
    ok(r.status === 200, 'the second factor confirms it', `${r.status}`);

    const c10 = client();
    await google2(c10, sub2, email2);
    r = await c10('/api/account/recent-auth');
    ok(r.status === 200, 'linking on the account page: no extra re-confirmation before the provider', `${r.status}`);
    const sub3 = 'g' + crypto.randomBytes(8).toString('hex');
    r = await google2(c10, sub3, `other.${email2}`);
    ok(r.body && r.body.reason === 'mfa' && googleId() === sub2, 'a new link while logged in waits for the second factor', JSON.stringify(r.body));
    r = await c10('/api/auth/mfa-pending');
    ok(r.status === 200 && r.body.methods.totp, 'the dialog can see what is missing', `${r.status}`);
    r = await totpLogin(c10);
    ok(r.status === 200 && googleId() === sub3, 'and the code makes it', googleId());

    const c11 = client();
    await google2(c11, sub3, `other.${email2}`);
    r = await google2(c11, sub3, `other.${email2}`);
    ok(r.body && r.body.reason === 'mfa', 're-confirming with the linked account asks for the second factor too', JSON.stringify(r.body));

    set2fa(false);
    const c12 = client();
    r = await google2(c12, sub3, `other.${email2}`);
    r = await c12('/api/account/recent-auth');
    ok(r.status === 200, 'no second factor: the Google login counts as recent, as before', `${r.status}`);

    // ---- Play Games sign-in (POST /api/auth/google/playgames): existing accounts only
    const pgCode = extra => 'test-code.' + Buffer.from(JSON.stringify(claims(undefined, extra))).toString('base64url');
    const pg = (c2, body, headers) => c2('/api/auth/google/playgames', {
        method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers),
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    r = await pg(client(), 'code=x', { 'content-type': 'application/x-www-form-urlencoded' });
    ok(r.status === 415, 'Play Games: form posts are refused (login CSRF)', r.status);
    r = await pg(client(), { code: 'not-a-code' });
    ok(r.status === 401 && r.body.reason === 'failed', 'Play Games: a code Google refuses → failed', `${r.status} ${r.body && r.body.reason}`);
    r = await pg(client(), { code: pgCode({ aud: 'someone-else.apps.googleusercontent.com' }) });
    ok(r.status === 401 && r.body.reason === 'failed', 'Play Games: ID token for another app → failed', `${r.status}`);

    const newMail = `pg.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const cp1 = client();
    r = await pg(cp1, { code: pgCode({ email: newMail }) });
    ok(r.status === 403 && r.body.reason === 'noaccount', 'Play Games: unknown Google account → noaccount', `${r.status} ${r.body && r.body.reason}`);
    ok(sql(`SELECT count(*) FROM users WHERE email = '${newMail}'`) === '0', 'and no account is created');
    ok((await cp1('/api/auth/me')).status === 401, 'and there is no login');

    const cp2 = client();
    r = await pg(cp2, { code: pgCode({ sub: first.sub, email: first.email }) });
    const mp2 = await cp2('/api/auth/me');
    ok(r.body && r.body.ok === true && mp2.body && mp2.body.id === me.body.id, 'Play Games: linked Google account logs in, without a nonce',
        JSON.stringify(r.body));
    r = await pg(cp2, { code: pgCode({ sub: first.sub, email: first.email }) });
    ok(r.status === 409, 'Play Games: only a login, not a link while logged in', `${r.status}`);

    const uname3 = 'apptest_' + crypto.randomBytes(3).toString('hex');
    await client()('/api/auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: uname3, email: `${uname3}@example.com`, password: 'Sehr-geheim-123!' }),
    });
    const cp3 = client();
    r = await pg(cp3, { code: pgCode({ email: `${uname3}@example.com` }) });
    const mp3 = await cp3('/api/auth/me');
    ok(r.body && r.body.ok && mp3.body && mp3.body.username === uname3 && mp3.body.googleLinked,
        'Play Games: verified e-mail of an existing account logs in and links', mp3.body && mp3.body.username);
    r = await pg(client(), { code: pgCode({ email: `${uname3}@example.com`, email_verified: false }) });
    ok(r.status === 403 && r.body.reason === 'noaccount', 'Play Games: unverified e-mail → no takeover, no new account', `${r.status} ${r.body && r.body.reason}`);
    r = await pg(client(), { code: pgCode({ email }) });
    ok(r.status === 403 && r.body.reason === 'banned', 'Play Games: banned user is refused', `${r.status} ${r.body && r.body.reason}`);

    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
