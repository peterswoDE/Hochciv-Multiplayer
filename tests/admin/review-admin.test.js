/**
 * The review admin (role 'reviewadmin', routes/admin.js readOnly) and the OAuth secrets,
 * against the local docker setup.
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/admin/review-admin.test.js [http://localhost:3000]
 *
 * A review admin reads every admin endpoint (the OAuth tab too), but every change is refused
 * – checked against the database afterwards. Only a superadmin hands out the role, and an
 * admin can't touch a review admin's account. On the page: the note, no buttons that change
 * something, locked switches. OAuth secrets never leave the server: the GET only says whether
 * one is stored, an empty field keeps it, a new value replaces it. The stored secrets are put
 * back afterwards; test accounts are removed.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = 'hochciv-multiplayer-local';
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const lit = v => (v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const made = [];
function makeUser(role) {
    const name = 'rev_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`).split('\n').pop();
    made.push(id);
    return { name, id };
}

(async () => {
    const { chromium } = require('playwright-core');
    const review = makeUser('reviewadmin'), admin = makeUser('admin'), sup = makeUser('superadmin'), target = makeUser('user');
    // the stored OAuth rows, to put back at the end
    const oauthBefore = sql(`select provider || '|' || "clientSecret" || '|' || "botToken" from oauth_providers`)
        .split('\n').filter(Boolean).map(l => l.split('|'));
    const browser = await chromium.launch({ executablePath: BROWSER });
    let s = null;          // the superadmin, also to reload the OAuth strategies at the end
    const login = async u => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const st = (await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } })).status();
        ok(st === 200, `${u.name} logs in`, String(st));
        return ctx;
    };
    try {
        const r = await login(review);
        const get = async (ctx, p) => (await ctx.request.get(BASE + p)).status();

        // ── reading: everything a superadmin can read ────────────────────────────────────
        for (const p of ['/api/admin/metrics', '/api/admin/users', `/api/admin/users/${target.id}/mfa`, '/api/admin/reports?status=open&offset=0',
            '/api/admin/words', '/api/admin/lobbies', '/api/admin/games?offset=0', '/api/admin/stats', '/api/admin/running', '/api/admin/oauth']) {
            ok(await get(r, p) === 200, `review admin reads ${p}`);
        }
        const check = await r.request.post(BASE + '/api/admin/words/check', { data: { text: 'hallo' } });
        ok(check.status() === 200, 'review admin may use the word check (changes nothing)');

        // ── changing: always refused ─────────────────────────────────────────────────────
        const tries = [
            ['post', '/api/admin/config', { maintenanceMode: true }],
            ['post', `/api/admin/users/${target.id}/action`, { action: 'ban' }],
            ['post', `/api/admin/users/${target.id}/action`, { action: 'set_role', role: 'admin' }],
            ['post', `/api/admin/users/${target.id}/action`, { action: 'force_password', newPassword: 'Xx-123456789' }],
            ['delete', `/api/admin/users/${target.id}/mfa/totp`],
            ['delete', `/api/admin/users/${target.id}`],
            ['post', '/api/admin/words', { word: 'revtestwort', kind: 'ban', match: 'word' }],
            ['delete', '/api/admin/words/00000000-0000-0000-0000-000000000000'],
            ['post', '/api/admin/reports/00000000-0000-0000-0000-000000000000', { status: 'resolved' }],
            ['post', '/api/admin/maps/00000000-0000-0000-0000-000000000000/unpublish', {}],
            ['post', '/api/admin/lobbies/none/action', { action: 'close' }],
            ['post', '/api/admin/stats/recompute', {}],
            ['post', '/api/admin/oauth/google', { clientId: 'x', clientSecret: 'y', enabled: false }],
        ];
        for (const [m, p, data] of tries) {
            const res = await r.request[m](BASE + p, data ? { data } : {});
            const body = await res.json().catch(() => ({}));
            ok(res.status() === 403 && /Nur Lesezugriff/.test(body.error || ''), `review admin: ${m.toUpperCase()} ${p} refused`, `${res.status()} ${body.error || ''}`);
        }
        const t = sql(`select "isBanned" || '|' || role from users where id = '${target.id}'`);
        ok(t === 'false|user', 'target account unchanged', t);
        ok(sql(`select count(*) from users where id = '${target.id}'`) === '1', 'target account still there');
        ok(!(await (await r.request.get(BASE + '/api/admin/metrics')).json()).maintenanceMode, 'maintenance mode still off');
        ok(sql(`select count(*) from banned_words where word = 'revtestwort'`) === '0', 'no word added');

        // ── who hands out the role, and who may touch it ────────────────────────────────
        const a = await login(admin);
        const setRole = async (ctx, id, role) => (await ctx.request.post(BASE + `/api/admin/users/${id}/action`, { data: { action: 'set_role', role } })).status();
        ok(await setRole(a, target.id, 'reviewadmin') === 403, 'an admin may not hand out the review admin role');
        ok((await a.request.post(BASE + `/api/admin/users/${review.id}/action`, { data: { action: 'ban' } })).status() === 403, 'an admin may not ban a review admin');
        s = await login(sup);
        ok(await setRole(s, target.id, 'reviewadmin') === 200, 'a superadmin hands out the review admin role');
        ok(sql(`select role from users where id = '${target.id}'`) === 'reviewadmin', 'role stored');
        ok(await setRole(s, target.id, 'user') === 200, 'and takes it back');

        // ── OAuth secrets never leave the server ────────────────────────────────────────
        for (const [who, ctx] of [['superadmin', s], ['review admin', r]]) {
            const text = await (await ctx.request.get(BASE + '/api/admin/oauth')).text();
            const leaked = oauthBefore.some(([, sec, tok]) => (sec.length > 3 && text.includes(sec)) || (tok.length > 3 && text.includes(tok)));
            ok(!leaked && !/clientSecret|botToken"/.test(text), `${who}: GET /oauth has no secrets`, text.slice(0, 160));
        }
        const o = await (await s.request.get(BASE + '/api/admin/oauth')).json();
        const google = oauthBefore.find(x => x[0] === 'google');
        if (google) ok(o.google && o.google.hasClientSecret === !!google[1], 'it says whether a secret is stored', JSON.stringify(o.google));
        const save = body => s.request.post(BASE + '/api/admin/oauth/discord', { data: body });
        const secret = () => sql(`select "clientSecret" || '|' || "botToken" from oauth_providers where provider = 'discord'`);
        const enabledBefore = sql(`select enabled from oauth_providers where provider = 'discord'`) !== 'f';
        await save({ clientSecret: 'first-secret', botToken: 'first-token', enabled: enabledBefore });
        ok(secret() === 'first-secret|first-token', 'a new value replaces the secret', secret());
        await save({ clientSecret: '', botToken: '', enabled: enabledBefore });
        ok(secret() === 'first-secret|first-token', 'empty fields keep the stored secrets', secret());
        await save({ clientSecret: '', botToken: '', clearBotToken: true, enabled: enabledBefore });
        ok(secret() === 'first-secret|', '"Bot-Token entfernen" clears just the bot token', secret());

        // ── the page ─────────────────────────────────────────────────────────────────────
        for (const width of [1280, 390]) {
            const page = await r.newPage({ viewport: { width, height: 900 } });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(BASE + '/client/admin.html#users');
            await page.waitForSelector('#table-admin-users tbody tr td b');
            ok(await page.isVisible('#admin-readonly-note'), `${width}px: the read-only note is shown`);
            ok(await page.isVisible('[data-target="tab-admin-oauth"]') || width < 600, `${width}px: OAuth tab shown`);
            const visibleWrites = await page.$$eval('#tab-admin-users .w', els => els.filter(e => e.offsetParent !== null).length);
            ok(visibleWrites === 0, `${width}px: no buttons that change a user`, String(visibleWrites));
            ok(await page.$$eval('#tab-admin-users select', els => els.length) === 0, `${width}px: roles shown as text, no select`);
            await page.goto(BASE + '/client/admin.html#dashboard');
            await page.waitForFunction(() => document.getElementById('admin-uptime').textContent !== '-');
            ok(await page.isDisabled('#btn-toggle-maintenance') && await page.isDisabled('#admin-registration'), `${width}px: switches locked`);
            await page.goto(BASE + '/client/admin.html#oauth');
            await page.waitForTimeout(600);
            ok(await page.$eval('#oauth-discord-secret', e => e.value === '' && e.disabled), `${width}px: OAuth secret empty and locked`);
            ok(!(await page.isVisible('[onclick="saveOAuthConfig(\'discord\')"]')), `${width}px: no save button`);
            if (width === 1280) await page.screenshot({ path: process.env.SHOT || 'review-admin.png', fullPage: true });
            ok(errors.length === 0, `${width}px: no page errors`, errors.join(' | '));
            await page.close();
        }
        const ap = await a.newPage();
        await ap.goto(BASE + '/client/admin.html#users');
        await ap.waitForSelector('#table-admin-users tbody tr td b');
        ok(!(await ap.isVisible('#admin-readonly-note')), 'a normal admin sees no read-only note');
        ok(await ap.$$eval('#tab-admin-users select', els => els.length) > 0, 'a normal admin still gets the role select');
    } finally {
        for (const [provider, sec, tok] of oauthBefore) {
            sql(`update oauth_providers set "clientSecret" = ${lit(sec)}, "botToken" = ${lit(tok)} where provider = ${lit(provider)}`);
        }
        // an empty save keeps the restored secrets and reloads the server's login strategies
        if (s) for (const [provider] of oauthBefore) await s.request.post(BASE + '/api/admin/oauth/' + provider, { data: {} }).catch(() => null);
        if (made.length) sql(`delete from users where id in (${made.map(lit).join(',')})`);
        await browser.close();
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
