/**
 * Fast loading of the page (server.js, inject.js, utils/assets.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   node tests/loading/loading.test.js [http://localhost:3000]
 *
 *   · every script and stylesheet of index.html (and of an older version's page) carries the
 *     hash of its file; with the current hash the server lets browsers keep it for a year,
 *     without it or with an old one the browser has to ask again;
 *   · pages, scripts and API answers are gzipped;
 *   · the page's files do not touch the session: a logged-in visitor's ~30 files cost no
 *     database queries (the session's expiry stays as it is – an API request moves it).
 *
 * The test account is deleted afterwards.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = 'hochciv-multiplayer-local';
const YEAR = 'public, max-age=31536000, immutable';
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');

const assets = html => [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m => m[1]);
const abs = (page, url) => new URL(url, BASE + page).pathname + new URL(url, BASE + page).search;

async function hashes(page) {
    const html = await (await fetch(BASE + page)).text();
    const urls = assets(html);
    const own = urls.filter(u => !u.startsWith('/socket.io/'));
    const bare = own.filter(u => !/\?v=[0-9a-f]{12}$/.test(u));
    ok(own.length >= 20 && !bare.length, `${page}: every script and stylesheet has its hash`, bare.length ? bare.join(', ') : `${own.length} files`);

    const heads = await Promise.all(own.map(async u => {
        const r = await fetch(BASE + abs(page, u), { headers: { 'Accept-Encoding': 'gzip' } });
        await r.arrayBuffer();
        return { u, status: r.status, cc: r.headers.get('cache-control'), enc: r.headers.get('content-encoding') };
    }));
    const notKept = heads.filter(h => h.status !== 200 || h.cc !== YEAR);
    ok(!notKept.length, `${page}: with the current hash each file is kept for a year`, notKept.map(h => `${h.u} ${h.status} ${h.cc}`).join(', '));
    return own;
}

(async () => {
    // ── Hashes and caching ───────────────────────────────────────────────────
    const own = await hashes('/');
    const old = require('../../engine-adapter').OLD_VERSIONS[0];
    if (old) await hashes(`/${old}/`);

    const ui = own.find(u => u.startsWith('js/ui.js'));
    const plain = await fetch(`${BASE}/js/ui.js`);
    ok(plain.headers.get('cache-control') !== YEAR, 'without a hash the file is checked again', plain.headers.get('cache-control'));
    const stale = await fetch(`${BASE}/js/ui.js?v=000000000000`);
    ok(stale.status === 200 && stale.headers.get('cache-control') !== YEAR, 'with an old hash the file is checked again', stale.headers.get('cache-control'));
    const page = await fetch(`${BASE}/`);
    ok(page.headers.get('cache-control') !== YEAR, 'index.html itself is checked again', page.headers.get('cache-control'));

    // ── gzip ────────────────────────────────────────────────────────────────
    for (const u of ['/', '/' + ui, '/api/stats']) {
        const r = await fetch(BASE + u, { headers: { 'Accept-Encoding': 'gzip' } });
        await r.arrayBuffer();
        ok(r.headers.get('content-encoding') === 'gzip', `gzip: ${u.replace(/\?.*/, '')}`, `${r.status} ${r.headers.get('content-encoding')}`);
    }

    // ── The page's files do not touch the session ───────────────────────────
    const name = 'ld_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    try {
        const login = await fetch(`${BASE}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
            body: JSON.stringify({ username: name, password: PASSWORD }),
        });
        const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
        ok(login.status === 200 && cookie, 'login', login.status);
        const sid = decodeURIComponent(cookie.split('=')[1] || '').replace(/^s:/, '').split('.')[0];
        const expire = () => sql(`SELECT extract(epoch FROM expire)::bigint FROM session WHERE sid = '${sid}'`);
        // one day left – a request through the session would set it to 30 days again
        sql(`UPDATE session SET expire = now() + interval '1 day' WHERE sid = '${sid}'`);
        const before = expire();

        await Promise.all(['/', ...own.map(u => '/' + u.replace(/^\//, ''))].map(async u => (await fetch(BASE + u, { headers: { Cookie: cookie } })).arrayBuffer()));
        ok(before && expire() === before, `logged in: index.html and ${own.length} files leave the session alone`, `${before} → ${expire()}`);

        const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } });
        const user = me.ok ? await me.json() : {};
        ok(me.status === 200 && JSON.stringify(user).includes(name), 'logged in: the API still knows the player', me.status);
        ok(Number(expire()) > Number(before) + 20 * 86400, 'logged in: an API request still keeps the session alive', `${before} → ${expire()}`);
    } finally {
        sql(`DELETE FROM users WHERE id = '${id}'`);
    }

    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
