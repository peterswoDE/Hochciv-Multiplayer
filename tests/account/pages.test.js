/**
 * The account page (client/account.html) and the admin page (client/admin.html) as pages of
 * their own, against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/account/pages.test.js [http://localhost:3000]
 *
 * The game's "Mein Konto" opens the page (no iframe); #history opens the history; a player sees
 * no admin link and is sent from admin.html to account.html; logged out, both go back to the
 * game; an admin gets the link and every admin section; an old game version that still frames
 * the page in an iframe is taken to the page itself; on a phone nothing scrolls sideways.
 * Test accounts are removed afterwards.
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

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser(role) {
    const name = 'acc_' + crypto.randomBytes(3).toString('hex');
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
    const errors = [];
    const login = async (ctx, u) => (await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } })).status();
    const visible = (page, sel) => page.isVisible(sel);
    try {
        // ── logged out: both pages go back to the game ──────────────────────────────────
        const anon = await browser.newPage();
        await anon.goto(BASE + '/client/account.html');
        await anon.waitForURL(u => !/account\.html/.test(u.toString()), { timeout: 8000 }).catch(() => null);
        ok(!/account\.html/.test(anon.url()), 'logged out: account page goes back to the game', anon.url());
        await anon.goto(BASE + '/client/admin.html');
        await anon.waitForURL(u => !/admin\.html/.test(u.toString()), { timeout: 8000 }).catch(() => null);
        ok(!/admin\.html/.test(anon.url()), 'logged out: admin page goes back to the game', anon.url());

        // ── a player ─────────────────────────────────────────────────────────────────────
        const uc = await browser.newContext({ locale: 'de-DE' });
        ok(await login(uc, user) === 200, 'player logs in');
        const up = await uc.newPage();
        up.on('pageerror', e => errors.push('player: ' + e.message));
        await up.goto(BASE + '/');
        await up.waitForFunction(() => /Mein Konto/.test((document.getElementById('mp-main-auth-container') || {}).textContent || ''));
        await up.click('#mp-main-auth-container button:has-text("Mein Konto")');
        await up.waitForURL(/\/client\/account\.html/);
        ok(!(await up.$('iframe')), 'game: "Mein Konto" opens the page itself, not an iframe');
        await up.waitForFunction(n => document.getElementById('display-username').textContent === n, user.name);
        ok(await visible(up, '#tab-profile'), 'account page: opens on "Profil"');
        ok(!(await visible(up, '.admin-link')), 'player: no link to the admin page');
        ok(!(await visible(up, '[data-target="tab-bots"]')), 'player: no "Meine Bots"');
        await up.click('[data-target="tab-security"]');
        ok(/#security$/.test(up.url()) && await visible(up, '#tab-security') && !(await visible(up, '#tab-profile')), 'a section is in the address', up.url());
        await up.goto(BASE + '/client/account.html#history');
        await up.waitForTimeout(800);
        ok(await visible(up, '#tab-history') && await up.$eval('[data-target="tab-history"]', b => b.classList.contains('active')), '#history opens the history');
        await up.goto(BASE + '/client/admin.html');
        await up.waitForURL(/account\.html/, { timeout: 8000 }).catch(() => null);
        ok(/account\.html/.test(up.url()), 'player: admin.html sends them to account.html', up.url());

        // an old game version frames the page – it takes the whole window instead
        await up.goto(BASE + '/');
        await up.evaluate(() => {
            const f = document.createElement('iframe');
            f.src = '/client/account.html?modal=true';
            document.body.appendChild(f);
        });
        await up.waitForURL(/\/client\/account\.html/, { timeout: 8000 }).catch(() => null);
        ok(/\/client\/account\.html/.test(up.url()), 'in an iframe: the page opens in the whole window', up.url());

        // phone width: the navigation scrolls, the page does not
        await up.setViewportSize({ width: 375, height: 800 });
        for (const tab of ['tab-profile', 'tab-security', 'tab-history']) {
            await up.click(`[data-target="${tab}"]`);
            await up.waitForTimeout(300);
            const overflow = await up.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            ok(overflow <= 0, `phone: no horizontal page scroll (${tab})`, overflow + ' px');
        }

        // ── an admin ─────────────────────────────────────────────────────────────────────
        const ac = await browser.newContext({ locale: 'de-DE' });
        ok(await login(ac, admin) === 200, 'admin logs in');
        const ap = await ac.newPage();
        ap.on('pageerror', e => errors.push('admin: ' + e.message));
        await ap.goto(BASE + '/client/account.html');
        await ap.locator('a.acc-switch.admin-link').waitFor({ state: 'visible' });
        ok(!(await ap.$('[data-target^="tab-admin"]')), 'account page: no admin sections, only the link');
        await ap.click('a.acc-switch.admin-link');
        await ap.waitForURL(/admin\.html/);
        await ap.locator('[data-target="tab-admin-dashboard"]').waitFor({ state: 'visible' });
        await ap.waitForFunction(() => document.getElementById('admin-uptime').textContent !== '-');
        ok(await visible(ap, '#table-admin-lobbies'), 'admin: the overview has the lobbies');
        for (const tab of ['tab-admin-running', 'tab-admin-games', 'tab-admin-stats', 'tab-admin-users', 'tab-admin-reports']) {
            await ap.click(`[data-target="${tab}"]`);
            await ap.waitForTimeout(500);
            ok(await visible(ap, '#' + tab), `admin: section ${tab}`);
        }
        ok(!(await visible(ap, '[data-target="tab-admin-oauth"]')), 'admin (not super admin): no OAuth');
        await ap.click('[data-target="tab-admin-users"]');
        await ap.waitForFunction(n => document.querySelector('#table-admin-users tbody').textContent.includes(n), admin.name);
        await ap.fill('#admin-users-q', admin.name);
        const rows = await ap.$$eval('#table-admin-users tbody tr', trs => trs.length);
        ok(rows === 1, 'admin: the user filter', rows + ' rows');
        await ap.setViewportSize({ width: 375, height: 800 });
        await ap.click('[data-target="tab-admin-users"]');
        await ap.waitForTimeout(300);
        const overflow = await ap.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(overflow <= 0, 'phone: admin page has no horizontal page scroll', overflow + ' px');

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id IN ('${admin.id}', '${user.id}')`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
