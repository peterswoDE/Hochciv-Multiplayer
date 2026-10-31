/**
 * The multiplayer texts follow the game's language (client/i18n.js), against the local docker
 * setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/i18n/english.test.js [http://localhost:3000]
 *
 * With English chosen, every screen the multiplayer layer adds is checked for German left
 * over: main menu and login bar, live lobby (hosting), the turn-based games list and form, the
 * player profile, the portal / login page and the account page with all admin tabs. The flag
 * buttons switch the menu texts both ways, and German stays German. A test admin is created and
 * removed again; the lobby is closed when the browser goes.
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

/* Visible German: umlauts / ß or common German words. Names the test itself chose and the
   German-only legal pages are not texts of ours. */
const GERMAN = /[äöüÄÖÜß]|\b(und|oder|der|die|das|ein|eine|nicht|mit|für|Spiel|Spiele|Spieler|Runde|Anmelden|Abmelden|Konto|Beitreten|Zurück|Weiter|Warte|warte|Karte|Bitte|Du|Dein|deine|ist|wird|kein|keine|noch|Gast|Lade|Fehler|Passwort|Speichern|Löschen|Abbrechen|Einladen|Erstellen|Öffnen|Laufende|Rundenspiel|Rundenspiele|Mitspieler|Reiche|Menschen|Zufall|Eigene|Benutzername|Aktualisieren|Wartungsmodus|Spielhistorie|Profil|Nationen|gewertet|Gewertet)\b/;
async function germanLeft(page, scope) {
    return page.evaluate(([src, scope]) => {
        const re = new RegExp(src), out = new Set();
        const root = scope ? document.querySelector(scope) : document.body;
        if (!root) return ['(no ' + scope + ')'];
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n; (n = walk.nextNode());) {
            const el = n.parentElement, s = n.nodeValue.trim();
            if (!s || !el || el.closest('script,style,[data-i18n-ignore]')) continue;
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === 'hidden') continue;
            if (re.test(s)) out.add(s.slice(0, 90));
        }
        root.querySelectorAll('[placeholder],[title]').forEach(e => {
            const s = e.getAttribute('placeholder') || e.getAttribute('title');
            if (e.getBoundingClientRect().width && re.test(s)) out.add('[attr] ' + s);
        });
        return [...out];
    }, [GERMAN.source, scope]);
}
const clean = async (page, name, scope) => { const g = await germanLeft(page, scope); ok(!g.length, name, g.join(' | ')); };

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeAdmin() {
    const name = 'lang_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: 'superadmin' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

(async () => {
    const { chromium } = require('playwright-core');
    const admin = makeAdmin();
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('lang-set')) { localStorage.setItem('hochciv.lang', 'en'); sessionStorage.setItem('lang-set', '1'); } } catch (e) { } });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));

        // ── main menu, logged out ────────────────────────────────────────────────────────
        await page.goto(BASE + '/');
        await page.waitForFunction(() => document.getElementById('mp-main-auth-container') && document.getElementById('mp-main-auth-container').textContent.trim());
        const menu = await page.evaluate(() => ({
            live: document.getElementById('mp-live-btn').textContent, async: document.getElementById('mp-async-btn').textContent,
            auth: document.getElementById('mp-main-auth-container').textContent.replace(/\s+/g, ' ').trim(),
            footer: document.getElementById('mp-legal-footer').textContent.replace(/\s+/g, ' ').trim(),
        }));
        ok(menu.async === 'Turn-based games', 'menu: turn-based games button', menu.async);
        ok(/Guest/.test(menu.auth) && /Log in/.test(menu.auth), 'menu: login bar in English', menu.auth);
        ok(/Privacy policy \(German\)/.test(menu.footer) && /All rights reserved/.test(menu.footer), 'menu: legal footer says the texts are German', menu.footer);
        await clean(page, 'main menu: no German left', '#screen-menu');

        // ── flag buttons: German and back, mp.js texts follow ────────────────────────────
        await page.click('#m-lang [data-lang="de"]');
        const de = await page.evaluate(() => [document.getElementById('mp-async-btn').textContent, document.getElementById('mp-main-auth-container').textContent.replace(/\s+/g, ' ').trim()]);
        ok(de[0] === 'Rundenspiele' && /Gast/.test(de[1]) && /Anmelden/.test(de[1]), 'switch to German: menu texts German', de.join(' / '));
        await page.click('#m-lang [data-lang="en"]');
        const en = await page.evaluate(() => document.getElementById('mp-async-btn').textContent);
        ok(en === 'Turn-based games', 'switch back to English', en);

        // ── live lobby: host a game ──────────────────────────────────────────────────────
        await page.click('#mp-live-btn');
        await page.waitForSelector('#overlay.show, .overlay.show, #ov-body', { state: 'visible' });
        await clean(page, 'multiplayer menu', '#ov-body');
        await page.evaluate(() => MP.setMode('host'));
        await clean(page, 'host form', '#ov-body');
        await page.evaluate(() => MP.setMode('public-list'));
        await page.waitForTimeout(800);
        await clean(page, 'public lobby list', '#ov-body');
        await page.evaluate(() => MP.setMode('host'));
        await page.fill('#mp-hn', 'Tester');
        await page.evaluate(() => MP.host());
        await page.waitForFunction(() => /Game settings/.test(document.getElementById('ov-body').textContent), null, { timeout: 15000 });
        await clean(page, 'lobby (host view)', '#ov-body');
        for (const key of ['random', 'marathon']) {
            await page.selectOption('#mp-set-map', key);
            await page.waitForTimeout(600);
            await clean(page, `lobby with map "${key}"`, '#ov-body');
        }
        await page.check('#mp-set-events');
        await page.waitForTimeout(600);
        await clean(page, 'lobby with events', '#ov-body');

        // ── logged in: turn-based games ──────────────────────────────────────────────────
        const login = await ctx.request.post(BASE + '/api/auth/login', { data: { username: admin.name, password: PASSWORD } });
        ok(login.status() === 200, 'admin logs in');
        await page.goto(BASE + '/');
        await page.waitForFunction(() => /Logged in as/.test(document.getElementById('mp-main-auth-container').textContent), null, { timeout: 15000 });
        await clean(page, 'main menu, logged in', '#screen-menu');
        await page.click('#mp-async-btn');
        await page.waitForFunction(() => /New turn-based game/.test(document.getElementById('ov-body').textContent), null, { timeout: 15000 });
        await clean(page, 'turn-based games list', '#ov-body');
        await page.evaluate(() => ASYNC.showCreate());
        await clean(page, 'turn-based game form', '#ov-body');
        for (const [sel, val] of [['#mpa-map', 'plaettchen'], ['#mpa-map', 'marathon'], ['#mpa-mode', 'random']]) {
            await page.selectOption(sel, val);
            await page.waitForTimeout(400);
            await clean(page, `turn-based form, ${sel.slice(5)} = ${val}`, '#ov-body');
        }
        // a server message comes back in English
        const msg = await page.evaluate(async () => { try { await ASYNC.api('/code/XXXXXX'); return ''; } catch (e) { return e.message; } });
        ok(msg && !/[äöü]|Kein|Spiel/.test(msg), 'server message translated', msg);

        // ── player profile ───────────────────────────────────────────────────────────────
        await page.evaluate(id => PROFILE.open(id), admin.id);
        await page.waitForFunction(() => /Member since/.test(document.getElementById('hcp-body').textContent), null, { timeout: 15000 });
        await clean(page, 'player profile', '#hcp-box');
        await page.evaluate(() => PROFILE.close());

        // ── account page with every tab (admin included) ─────────────────────────────────
        const acc = await ctx.newPage();
        acc.on('pageerror', e => errors.push(e.message));
        await acc.goto(BASE + '/client/account.html');
        await acc.locator('[data-target="tab-admin-oauth"]').waitFor({ state: 'visible' });
        await acc.waitForTimeout(1500);
        for (const tab of ['tab-profile', 'tab-history', 'tab-bots', 'tab-admin-dashboard', 'tab-admin-lobbies', 'tab-admin-running', 'tab-admin-games', 'tab-admin-users', 'tab-admin-oauth']) {
            await acc.click(`[data-target="${tab}"]`);
            await acc.waitForTimeout(1200);
            await clean(acc, `account page: ${tab}`, `#${tab}`);
        }
        await clean(acc, 'account page: tab row and header', '.nav-tabs');
        ok(/Account overview/.test(await acc.title()) || /Account/.test(await acc.title()), 'account page title', await acc.title());
        await acc.click('[data-target="tab-admin-users"]');
        await acc.waitForTimeout(600);
        await acc.evaluate(id => window.toggleAdminUserMfa(id), admin.id);
        await acc.waitForTimeout(800);
        await clean(acc, 'admin: user MFA panel', '#tab-admin-users');

        // ── portal / login page, logged out ──────────────────────────────────────────────
        const anon = await browser.newContext();
        await anon.addInitScript(() => { try { localStorage.setItem('hochciv.lang', 'en'); } catch (e) { } });
        const portal = await anon.newPage();
        portal.on('pageerror', e => errors.push(e.message));
        await portal.goto(BASE + '/client/index.html?modal=true');
        await portal.waitForTimeout(1500);
        await clean(portal, 'login page');
        for (const tab of ['form-register']) {
            await portal.click(`.tab-btn[data-target="${tab}"]`);
            await clean(portal, `login page: ${tab}`);
        }
        await portal.click('.tab-btn[data-target="form-login"]');
        await portal.fill('#login-username', 'nobody_' + Date.now());
        await portal.fill('#login-password', 'wrong-password');
        await portal.click('#form-login button[type="submit"]');
        await portal.waitForTimeout(1200);
        const err = await portal.evaluate(() => document.getElementById('login-error').innerText);
        ok(err === 'Wrong username or password', 'login error from the server in English', err);

        // ── nothing the pages asked for was missing from the table ───────────────────────
        const missing = [...new Set([].concat(
            await page.evaluate(() => HC_I18N.missing()), await acc.evaluate(() => HC_I18N.missing()), await portal.evaluate(() => HC_I18N.missing())))];
        ok(missing.length === 0, 'no text without English', missing.join(' | '));

        // ── German stays German ──────────────────────────────────────────────────────────
        const deCtx = await browser.newContext();
        await deCtx.addInitScript(() => { try { localStorage.setItem('hochciv.lang', 'de'); } catch (e) { } });
        const dePage = await deCtx.newPage();
        await dePage.goto(BASE + '/client/index.html?modal=true');
        await dePage.waitForTimeout(800);
        ok(/Benutzername oder E-Mail/.test(await dePage.textContent('body')), 'German: login page unchanged');
        // counter-check: the German detector above does find German where there is some
        const found = (await germanLeft(dePage)).length;
        ok(found >= 3, 'counter-check: German page is detected as German', found + ' texts');
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id = '${admin.id}'`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
