/**
 * Layout of the multiplayer HUD in a live game (mp.js, client/chat.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/layout/hud.test.js [http://localhost:3000]
 *
 * At a desktop window, a phone held sideways and a phone held upright (the game turns the page):
 * code, password and turn timer stay on one line in the header, the collapsed chat is a pill
 * labelled "Chat", the game log does not cover the map's zoom buttons, and open panels
 * (chat, player list, log) never cover each other – opening one collapses the one in its way.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
const SIZES = [[1280, 720], [844, 390], [390, 844]];
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

// rectangles of the open panels and the zoom buttons, and which of them overlap
const overlaps = page => page.evaluate(() => {
    const rect = el => el && el.offsetWidth ? el.getBoundingClientRect() : null;
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const panels = ['mp-chat', 'mp-players-container', 'mp-persistent-log-container']
        .map(id => document.getElementById(id))
        .filter(el => el && el.offsetWidth && !el.classList.contains('mp-log-minimized'))
        .map(el => ({ id: el.id, r: rect(el) }));
    const zoom = rect(document.querySelector('#map') && document.querySelector('#map').parentNode.querySelector('.m-zoom'));
    const out = [];
    panels.forEach((p, i) => panels.slice(i + 1).forEach(q => { if (hit(p.r, q.r)) out.push(p.id + ' / ' + q.id); }));
    const log = document.getElementById('mp-persistent-log-container');
    if (zoom && rect(log) && hit(rect(log), zoom)) out.push('log / zoom buttons');
    return out;
});

async function run(browser, [w, h]) {
    const size = `${w}x${h}`;
    const mobile = w < 900 || h < 500;
    const newPage = async () => {
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
        const page = await ctx.newPage();
        page.on('pageerror', e => ok(false, `${size}: no page error`, e.message));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CHAT !== 'undefined');
        await page.evaluate(() => { try { localStorage.clear(); } catch (_) { } MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage(), b = await newPage();
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', 'LayoutA');
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.selectOption('#mp-p-civ-0', 'griechenland');
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
    await b.evaluate(() => MP.setMode('join'));
    await b.fill('#mp-c', cred.code);
    await b.fill('#mp-p', cred.pw);
    await b.fill('#mp-n', 'LayoutB');
    await b.evaluate(() => MP.join());
    await b.waitForSelector('#mp-p-civ-1');
    await b.selectOption('#mp-p-civ-1', 'russland');
    await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0, mapKey: '0', turnTime: 120 }));
    await a.waitForFunction(() => MP.gameConfig.turnTime === 120);
    await a.evaluate(() => MP.startGame());
    await a.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
    await a.evaluate(() => closeModal());
    await a.waitForSelector('#mp-turn-clock:not([hidden])');

    // header: one line (same top for credentials and clock, no wrapped text)
    const head = await a.evaluate(() => {
        const c = document.querySelector('#mp-cred-wrapper .res'), t = document.getElementById('mp-turn-clock');
        const lh = parseFloat(getComputedStyle(document.getElementById('mp-cred-box')).lineHeight) || 20;
        return { credH: c.getBoundingClientRect(), clock: t.getBoundingClientRect(), lh, text: c.textContent.trim() };
    });
    const turned = w < h;   // the game turns the page: heights become widths
    const credThick = turned ? head.credH.width : head.credH.height;
    ok(credThick < 2 * head.lh + 8, `${size}: code and password on one line`, head.text.replace(/\s+/g, ' '));
    ok(Math.abs((turned ? head.credH.left : head.credH.top) - (turned ? head.clock.left : head.clock.top)) < 12, `${size}: turn timer beside the code, not below`);

    // collapsed chat: a labelled pill
    const pill = await a.$eval('#mp-chat', el => ({ min: el.classList.contains('mp-log-minimized'), label: getComputedStyle(el, '::before').content }));
    ok(pill.min && /Chat/.test(pill.label), `${size}: closed chat is labelled`, pill.label);

    // the log appears (as after the first turn), then the chat opens
    await a.evaluate(() => {
        document.getElementById('mp-persistent-log-container').classList.remove('mp-log-minimized');
        S.log.push(...Array.from({ length: 8 }, () => ({ txt: 'Testzeile für das Layout', r: S.round })));
        MP.updatePersistentLog();
    });
    await a.waitForTimeout(400);
    let hits = await overlaps(a);
    ok(hits.length === 0, `${size}: log shown – nothing covered`, hits.join(', '));
    await a.click('#mp-chat');
    await a.waitForTimeout(400);
    ok(await a.evaluate(() => CHAT.isOpen()), `${size}: chat opens`);
    hits = await overlaps(a);
    ok(hits.length === 0, `${size}: chat open – nothing covered`, hits.join(', '));

    // the player list opened again wins over what is in its way
    await a.click('#mp-players-container');
    await a.waitForTimeout(400);
    ok(await a.$eval('#mp-players-container', el => !el.classList.contains('mp-log-minimized')), `${size}: player list opens`);
    hits = await overlaps(a);
    ok(hits.length === 0, `${size}: player list open – nothing covered`, hits.join(', '));

    await a.context().close();
    await b.context().close();
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        for (const s of SIZES) await run(browser, s);
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
