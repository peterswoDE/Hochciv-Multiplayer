/**
 * The tab "Leistung" (Grafana in the admin page, utils/grafana.js, docs/operations/monitoring.md)
 * against the local server with its monitoring containers (docker-compose.local.yml).
 *
 *   node tests/admin/monitoring.test.js [http://localhost:3000]
 *
 * Checks that only admins get through /admin/grafana/, that a header sent by the browser can't
 * choose the Grafana user, that the dashboard shows inside the admin page, and that the server
 * serves its figures for Prometheus.
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

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser(role) {
    const name = 'mon_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

(async () => {
    const { chromium } = require('playwright-core');
    const admin = makeUser('admin'), user = makeUser('user');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        const login = async (ctx, u) => (await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } })).status();

        // ── nobody else gets through ─────────────────────────────────────────────────────
        const anon = await browser.newContext();
        ok((await anon.request.get(BASE + '/admin/grafana/api/health')).status() === 403, 'anonymous: /admin/grafana/ is 403');
        ok((await anon.request.get(BASE + '/admin/grafana/api/user', { headers: { 'X-WEBAUTH-USER': admin.name } })).status() === 403,
            'anonymous with a forged X-WEBAUTH-USER: 403');

        const other = await browser.newContext();
        ok(await login(other, user) === 200, 'user logs in');
        ok((await other.request.get(BASE + '/admin/grafana/api/user')).status() === 403, 'normal user: /admin/grafana/ is 403');
        ok((await other.request.get(BASE + '/api/admin/monitoring')).status() === 403, 'normal user: /api/admin/monitoring is 403');

        // ── the admin is the Grafana user, whatever the browser sends ──────────────────────
        const ctx = await browser.newContext({ locale: 'de-DE' });
        ok(await login(ctx, admin) === 200, 'admin logs in');
        const mon = await (await ctx.request.get(BASE + '/api/admin/monitoring')).json();
        ok(mon.enabled === true, 'admin: monitoring is on', JSON.stringify(mon));
        const me = await ctx.request.get(BASE + '/admin/grafana/api/user', { headers: { 'X-WEBAUTH-USER': 'someone-else', 'X-WEBAUTH-ROLE': 'Admin' } });
        const meBody = me.status() === 200 ? await me.json() : {};
        ok(meBody.login === admin.name, 'Grafana user is the admin, not the forged header', `${me.status()} ${meBody.login}`);
        const org = await (await ctx.request.get(BASE + '/admin/grafana/api/user/orgs')).json().catch(() => []);
        ok(Array.isArray(org) && org[0] && org[0].role === 'Viewer', 'an admin is a Grafana Viewer', JSON.stringify(org));
        const dash = await ctx.request.get(BASE + '/admin/grafana/api/dashboards/uid/hochciv-overview');
        ok(dash.status() === 200, 'dashboard hochciv-overview is provisioned', String(dash.status()));
        const q = await ctx.request.get(BASE + '/admin/grafana/api/datasources/proxy/uid/prometheus/api/v1/query?query=up');
        const up = q.status() === 200 ? (await q.json()).data.result : [];
        ok(up.length >= 3 && up.every(r => r.value[1] === '1'), 'Prometheus: every target is up',
            up.map(r => `${r.metric.job}=${r.value[1]}`).join(' '));

        // ── the tab in the admin page ────────────────────────────────────────────────────
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(BASE + '/client/admin.html');
        const tab = page.locator('[data-target="tab-admin-perf"]');
        await tab.waitFor({ state: 'visible' });
        ok(await tab.isVisible(), 'tab "Leistung" is shown to admins');
        await tab.click();
        const frameEl = page.locator('#admin-perf-frame');
        await frameEl.waitFor({ state: 'visible' });
        ok(/\/admin\/grafana\/d\/hochciv-overview\//.test(await frameEl.getAttribute('src')), 'iframe points at the dashboard');
        const frame = page.frameLocator('#admin-perf-frame');
        let panels = 0;
        try {
            await frame.locator('[data-testid="data-testid panel content"], .react-grid-item').first().waitFor({ timeout: 30000 });
            panels = await frame.locator('.react-grid-item').count();
        } catch (_) { /* counted below */ }
        ok(panels >= 5, 'dashboard renders inside the admin page', `${panels} panels`);
        const loginForm = await frame.locator('input[name="user"], input[name="password"]').count().catch(() => 0);
        const text = await frame.locator('body').innerText().catch(() => '');
        ok(!loginForm && !/Unauthorized|failed to load/i.test(text.slice(0, 2000)), 'no login form or error page in the frame');
        ok(!errors.length, 'no script errors on the admin page', errors.join(' | '));

        // ── the figures for Prometheus ───────────────────────────────────────────────────
        const metrics = inServer(`require('http').get('http://localhost:9464/metrics', r => { let b = ''; r.on('data', d => b += d);
            r.on('end', () => process.stdout.write(b)); })`);   // no process.exit: it would cut a long answer off
        for (const m of ['hochciv_http_request_duration_seconds_bucket', 'hochciv_db_query_duration_seconds_bucket',
            'hochciv_db_pool_connections', 'hochciv_sockets', 'hochciv_matches_24h', 'hochciv_nodejs_eventloop_lag_seconds']) {
            ok(metrics.includes(m), `/metrics has ${m}`);
        }
        ok(!/route="\/api\/profile\/[0-9a-f]{8}-/.test(metrics), 'routes are patterns, not ids');
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id IN ('${admin.id}', '${user.id}')`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
