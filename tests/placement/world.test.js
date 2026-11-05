/**
 * The "Welt" button while start tiles are placed in a live game (v99+, mp.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/placement/world.test.js [http://localhost:3000]
 *
 * mp.js dresses the other humans up as bots for the placement. The world view must not show
 * that: A and B host a tile map game, and each sees two empires with their abilities in the
 * order the game will really have, the own one marked.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && info ? `  (${info})` : ''}`);
    if (!cond) failed++;
};

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
    const errors = [];
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined');
        await page.evaluate(() => MP.showLobby());
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    try {
        const a = await newPage('A'), b = await newPage('B');
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-n', 'WeltA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(() => MP.setMode('join'));
        await b.fill('#mp-c', cred.code); await b.fill('#mp-p', cred.pw); await b.fill('#mp-n', 'WeltB');
        await b.evaluate(() => MP.join());
        await b.waitForSelector('#mp-p-civ-1');
        await b.selectOption('#mp-p-civ-1', 'russland');
        await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0, mapKey: 'random', wonders: true }));
        await a.waitForFunction(() => MP.gameConfig.mapKey === 'random');
        await a.evaluate(() => MP.startGame());
        for (const [name, p] of [['A', a], ['B', b]]) {
            await p.waitForFunction(() => document.getElementById('screen-place').classList.contains('show'));
            await p.evaluate(() => document.getElementById('pl-world').click());
            const w = await p.evaluate(() => ({
                text: document.getElementById('ov-body').textContent,
                rows: document.querySelectorAll('#ov-body .civ-row').length,
                self: document.querySelectorAll('#ov-body .civ-row.self').length,
                kinds: placeState.cfg.players.map(x => x.kind),
                me: MP.lobbyIndex,
            }));
            ok(w.rows === 2 && w.self === 1, `${name}: two empires, the own one marked`, JSON.stringify(w));
            ok(!/Bots haben keine/.test(w.text), `${name}: the other human has an ability`, w.text.slice(0, 200));
            ok(w.kinds[1 - w.me] === 'bot', `${name}: placing still treats the other seat as a bot`, w.kinds.join());
            await p.evaluate(() => closeModal());
        }
        ok(!errors.length, 'no page errors', errors.join(' | '));
    } catch (e) {
        ok(false, 'scenario ran through', e.message);
    }
    await browser.close();
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})();
