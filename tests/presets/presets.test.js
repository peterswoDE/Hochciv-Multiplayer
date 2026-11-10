/**
 * Lobby presets (F25: utils/presets.js, routes/account.js, client/presets.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/presets/presets.test.js [http://localhost:3000]
 *
 * 1. API: only with a login; unknown keys and values out of range are dropped, names trimmed and
 *    unique, at most 10.
 * 2. Live lobby (logged-in host): the row, saving the settings as a preset, loading it after the
 *    settings were changed; a guest host has no row.
 * 3. "Neues Rundenspiel": loading the same preset fills the form; saving it there keeps the live
 *    lobby's time per turn and adds the days; deleting it.
 *
 * Test accounts are deleted afterwards. Uses an installed Chrome or Edge (no browser download);
 * set HOCHCIV_BROWSER to its path if it is not found.
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
const inServer = (code, env = {}) => execFileSync('docker', ['exec', '-i', '-w', '/app',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'pre_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

async function api(browser, user) {
    const anon = await fetch(BASE + '/api/account/presets');
    ok(anon.status === 401 || anon.status === 403, 'API: only with a login', String(anon.status));
    const ctx = await browser.newContext();
    await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    const put = list => ctx.request.put(BASE + '/api/account/presets', { data: { list } });
    const r = await put([
        { name: '  Abend   Runde ', s: { map: 'tiles', total: 5, ki: 9, turnTime: 77, turnDays: 3, events: 'ja', wonders: true, evil: '<b>', difficulty: 'schwer' } },
        { name: 'x', s: { map: 'mars' } }, { name: 'x', s: { map: '0' } }, { name: '', s: {} },
    ]);
    const d = await r.json();
    ok(r.status() === 200 && d.list.length === 2 && d.list[0].name === 'Abend Runde'
        && JSON.stringify(d.list[0].s) === JSON.stringify({ map: 'tiles', wonders: true, total: 5, difficulty: 'schwer', turnDays: 3 })
        && d.list[1].name === 'x' && d.list[1].s.map === '0',
        'API: names trimmed and unique, unknown keys and bad values dropped', JSON.stringify(d.list));
    const many = await put(Array.from({ length: 11 }, (_, i) => ({ name: 'p' + i, s: {} })));
    ok(many.status() === 400, 'API: at most 10 presets', String(many.status()));
    await put([]);
    await ctx.close();
}

async function ui(browser, user, errors) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('host: ' + e.message));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined' && MP.user && typeof PRESETS !== 'undefined');
    await page.evaluate(() => MP.showLobby());
    await page.waitForFunction(() => typeof MP.setMode === 'function');
    await page.evaluate(() => MP.host());
    await page.waitForSelector('#mpp-live select:not([disabled])');
    ok(await page.$eval('#mpp-sel-live', s => s.options[0].textContent) === '– noch keine Vorlage –', 'lobby: the presets row for a logged-in host');
    // settings, then save them as "Abend"
    await page.evaluate(() => MP.socket.emit('lobby:config', { mapKey: 'random', events: true, wonders: true, playerCount: 3, kiCount: 1, turnTime: 120 }));
    await page.waitForFunction(() => MP.gameConfig.turnTime === 120 && MP.gameConfig.events === true);
    await page.click('#mpp-live button:has-text("Als Vorlage")');
    await page.fill('#mpp-name-live', 'Abend');
    await page.click('#mpp-live button:has-text("Speichern")');
    await page.waitForFunction(() => PRESETS.list && PRESETS.list.length === 1);
    const saved = await (await ctx.request.get(BASE + '/api/account/presets')).json();
    const s = saved.list[0] && saved.list[0].s;
    ok(saved.list.length === 1 && saved.list[0].name === 'Abend' && s.map === 'tiles' && s.events && s.wonders && s.total === 3 && s.ki === 1 && s.turnTime === 120 && s.turnDays === undefined,
        'lobby: "Als Vorlage" saves the settings with the account', JSON.stringify(saved.list));
    // change everything, then load the preset
    await page.evaluate(() => MP.socket.emit('lobby:config', { mapKey: '0', events: false, wonders: false, playerCount: 4, kiCount: 2, turnTime: 0 }));
    await page.waitForFunction(() => MP.gameConfig.turnTime === 0 && MP.gameConfig.mapKey === '0');
    await page.waitForSelector('#mpp-sel-live:not([disabled])');
    await page.selectOption('#mpp-sel-live', 'Abend');
    await page.waitForFunction(() => MP.gameConfig.turnTime === 120);
    const gc = await page.evaluate(() => ({ map: MP.gameConfig.mapKey, ev: MP.gameConfig.events, wo: MP.gameConfig.wonders, n: MP.gameConfig.playerCount, ki: MP.gameConfig.kiCount }));
    ok(gc.map === 'random' && gc.ev && gc.wo && gc.n === 3 && gc.ki === 1, 'lobby: picking the preset sets the lobby again', JSON.stringify(gc));

    // "Neues Rundenspiel" in another tab
    const p2 = await ctx.newPage();
    p2.on('pageerror', e => errors.push('async: ' + e.message));
    await p2.goto(BASE + '/');
    await p2.waitForFunction(() => typeof ASYNC !== 'undefined' && MP.user && typeof PRESETS !== 'undefined');
    await p2.evaluate(() => ASYNC.showCreate());
    await p2.waitForSelector('#mpp-async select:not([disabled])');
    await p2.selectOption('#mpp-sel-async', 'Abend');
    await p2.waitForFunction(() => ASYNC.form.mapKey === 'plaettchen');
    const f = await p2.evaluate(() => ({ ev: $('mpa-events').checked, wo: $('mpa-wonders').checked, n: $('mpa-total').value, ki: $('mpa-ki').value, map: $('mpa-map').value }));
    ok(f.map === 'plaettchen' && f.ev && f.wo && f.n === '3' && f.ki === '1', 'Rundenspiel form: the preset fills it', JSON.stringify(f));
    await p2.selectOption('#mpa-days', '3');
    await p2.click('#mpp-async button:has-text("Als Vorlage")');
    ok(await p2.$eval('#mpp-name-async', i => i.value) === 'Abend', 'Rundenspiel form: the name of the loaded preset is suggested');
    await p2.click('#mpp-async button:has-text("Speichern")');
    await p2.waitForFunction(() => PRESETS.list && PRESETS.list[0].s.turnDays === 3);
    const both = (await (await ctx.request.get(BASE + '/api/account/presets')).json()).list;
    ok(both.length === 1 && both[0].s.turnDays === 3 && both[0].s.turnTime === 120, 'Rundenspiel form: saving keeps the live time per turn and adds the days', JSON.stringify(both[0].s));
    p2.once('dialog', d => d.accept());
    await p2.click('#mpp-async button[title="Vorlage löschen"]');
    await p2.waitForFunction(() => PRESETS.list && PRESETS.list.length === 0);
    ok((await (await ctx.request.get(BASE + '/api/account/presets')).json()).list.length === 0, 'Rundenspiel form: 🗑 deletes the preset');
    await ctx.close();

    // a guest host has no row
    const g = await browser.newContext({ locale: 'de-DE' });
    const gp = await g.newPage();
    gp.on('pageerror', e => errors.push('guest: ' + e.message));
    await gp.goto(BASE + '/');
    await gp.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
    await gp.evaluate(() => MP.showLobby());
    await gp.waitForFunction(() => typeof MP.setMode === 'function');
    await gp.fill('#mp-n', 'PresetGuest');
    await gp.evaluate(() => MP.host());
    await gp.waitForSelector('#mp-p-civ-0');
    ok(!(await gp.$('#mpp-live')), 'lobby: a guest host has no presets row');
    await g.close();
}

(async () => {
    const user = makeUser();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await api(browser, user);
        await ui(browser, user, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id = '${user.id}'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
