/**
 * The Discord invite link (utils/settings.js, routes/admin.js /settings, GET /api/settings,
 * mp.js, client/index.html) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/settings/discord-invite.test.js [http://localhost:3000]
 *
 * An admin sets the link in the admin panel; the spellings of an invite are accepted and
 * stored as https://discord.gg/<code>, anything else is refused; a review admin can't change it.
 * With a link: the main menu has the button (English too), the game's footer and the portal's
 * footer link it, and it is in the database. Not in the Discord Activity (?frame_id=…). Cleared:
 * button and links are gone. The value from before the test is put back; test accounts are
 * deleted.
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
    const name = 'dcinv_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

async function loggedIn(browser, user) {
    const ctx = await browser.newContext();
    const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    ok(r.status() === 200, `${user.name} logs in`);
    return ctx;
}

/** The game's main menu in a fresh browser (no cached /api/settings). */
async function menu(browser, { lang = 'de', query = '' } = {}) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(l => { try { localStorage.setItem('hochciv.lang', l); } catch (e) { } }, lang);
    const page = await ctx.newPage();
    await page.goto(BASE + '/' + query);
    await page.waitForFunction(() => typeof MP !== 'undefined' && document.getElementById('mp-legal-footer')
        && /Impressum|Legal/.test(document.getElementById('mp-legal-footer').textContent));
    await page.waitForTimeout(800);            // the settings request
    const r = await page.evaluate(() => {
        const btn = document.getElementById('mp-discord-btn');
        const foot = [...document.querySelectorAll('#mp-legal-footer a')].find(a => a.textContent === 'Discord');
        return { btn: btn ? btn.textContent : null, foot: foot ? foot.getAttribute('href') : null };
    });
    await ctx.close();
    return r;
}

async function portal(browser) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/index.html');
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({
        shown: !document.getElementById('portal-discord').hidden,
        href: document.getElementById('portal-discord-link').getAttribute('href'),
    }));
    await ctx.close();
    return r;
}

(async () => {
    const { chromium } = require('playwright-core');
    const admin = makeUser('admin'), review = makeUser('reviewadmin');
    const before = sql(`SELECT value FROM settings WHERE key = 'discordInvite'`) || null;
    const browser = await chromium.launch({ executablePath: BROWSER });
    let actx;
    try {
        actx = await loggedIn(browser, admin);
        const set = v => actx.request.post(BASE + '/api/admin/settings', { data: { discordInvite: v } });

        // ── values ──────────────────────────────────────────────────────────────────────────
        for (const [input, want] of [
            ['https://discord.gg/abc123', 'https://discord.gg/abc123'],
            ['discord.gg/Hoch-Civ', 'https://discord.gg/Hoch-Civ'],
            ['https://discord.com/invite/xyz789/', 'https://discord.gg/xyz789'],
            ['https://discordapp.com/invite/old42', 'https://discord.gg/old42'],
        ]) {
            const r = await set(input);
            const j = await r.json();
            ok(r.status() === 200 && j.discordInvite === want, `accepted: ${input}`, JSON.stringify(j));
        }
        for (const bad of ['https://evil.example/discord.gg/abc', 'javascript:alert(1)', 'https://discord.gg/', 'https://discord.gg/a b']) {
            const r = await set(bad);
            ok(r.status() === 400, `refused: ${bad}`, String(r.status()));
        }
        ok((await actx.request.post(BASE + '/api/admin/settings', { data: { other: 'x' } })).status() === 400, 'refused: unknown key');

        const rctx = await loggedIn(browser, review);
        ok((await rctx.request.post(BASE + '/api/admin/settings', { data: { discordInvite: 'https://discord.gg/nope' } })).status() === 403, 'review admin cannot change it');
        ok((await (await rctx.request.get(BASE + '/api/admin/settings')).json()).discordInvite === 'https://discord.gg/old42', 'review admin sees it');
        await rctx.close();
        ok((await (await browser.newContext()).request.post(BASE + '/api/admin/settings', { data: { discordInvite: '' } })).status() >= 401, 'logged out: refused');

        // ── the admin panel ────────────────────────────────────────────────────────────────
        const ap = await actx.newPage();
        await ap.goto(BASE + '/client/admin.html');
        await ap.waitForFunction(() => document.getElementById('admin-discord-invite').value === 'https://discord.gg/old42');
        ok(true, 'admin panel: shows the stored link');
        await ap.fill('#admin-discord-invite', 'discord.gg/HochCivTest');
        await ap.click('#admin-discord-form button[type="submit"]');
        await ap.waitForFunction(() => !document.getElementById('admin-discord-msg').hidden);
        const saved = await ap.evaluate(() => [document.getElementById('admin-discord-invite').value, document.getElementById('admin-discord-msg').textContent]);
        ok(saved[0] === 'https://discord.gg/HochCivTest', 'admin panel: saves and shows the clean link', saved.join(' | '));
        await ap.fill('#admin-discord-invite', 'not a link');
        await ap.click('#admin-discord-form button[type="submit"]');
        await ap.waitForFunction(() => document.getElementById('admin-discord-msg').classList.contains('error'));
        ok(/Discord-Einladungslink/.test(await ap.textContent('#admin-discord-msg')), 'admin panel: a bad link gives an error');
        ok(sql(`SELECT value FROM settings WHERE key = 'discordInvite'`) === 'https://discord.gg/HochCivTest', 'stored in the database');
        ok((await (await actx.request.get(BASE + '/api/settings')).json()).discordInvite === 'https://discord.gg/HochCivTest', 'GET /api/settings has it');

        // ── shown ──────────────────────────────────────────────────────────────────────────
        let m = await menu(browser);
        ok(m.btn === '💬 Discord-Server', 'main menu: the button', JSON.stringify(m));
        ok(m.foot === 'https://discord.gg/HochCivTest', 'game footer: the link', JSON.stringify(m));
        m = await menu(browser, { lang: 'en' });
        ok(m.btn === '💬 Discord server', 'main menu in English', JSON.stringify(m));
        m = await menu(browser, { query: '?frame_id=test&instance_id=test' });
        ok(!m.btn && !m.foot, 'Discord Activity: no button, no link', JSON.stringify(m));
        let p = await portal(browser);
        ok(p.shown && p.href === 'https://discord.gg/HochCivTest', 'portal footer: the link', JSON.stringify(p));

        // ── cleared ────────────────────────────────────────────────────────────────────────
        const cleared = await (await set('')).json();
        ok(cleared.discordInvite === null && sql(`SELECT count(*) FROM settings WHERE key = 'discordInvite'`) === '0', 'cleared: removed from the database');
        m = await menu(browser);
        ok(!m.btn && !m.foot, 'cleared: no button, no link', JSON.stringify(m));
        p = await portal(browser);
        ok(!p.shown, 'cleared: portal footer without the link', JSON.stringify(p));
    } finally {
        if (actx) await actx.request.post(BASE + '/api/admin/settings', { data: { discordInvite: before || '' } }).catch(() => { });
        if (actx) await actx.close();
        await browser.close();
        sql(`DELETE FROM users WHERE id IN ('${admin.id}', '${review.id}')`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
