/**
 * Lobby ready check (F17: 'lobby:ready', mp.js readyCell / startClick) against the local docker
 * setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/ready/ready.test.js [http://localhost:3000]
 *
 * A hosts, B and C join. Checked: the status column ("Wählt noch …", host, own button), the
 * count on the start button, B's tick reaching A, new settings clearing it (with a note to B),
 * taking it back, the host asked before starting while someone isn't ready (declining keeps the
 * lobby), no question once everyone is ready, the game starts, English.
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
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const newPage = async (name, en) => {
        const ctx = await browser.newContext({ locale: en ? 'en-US' : 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        if (en) await page.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await page.evaluate(() => MP.showLobby());
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const start = p => p.textContent('#mp-start-btn');
    try {
        const a = await newPage('A'), b = await newPage('B'), c = await newPage('C', true);
        await a.fill('#mp-n', 'ReadyHost');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 1 }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(c => MP.joinWith(c.code, c.pw, 'ReadyB'), cred);
        await c.evaluate(c => MP.joinWith(c.code, c.pw, 'ReadyC'), cred);
        await b.waitForSelector('#mp-p-civ-1');
        await c.waitForSelector('#mp-p-civ-2');
        await a.waitForFunction(() => MP.players.length === 3 && MP.players.every(p => p.connected));
        await b.selectOption('#mp-p-civ-1', 'russland');
        await c.selectOption('#mp-p-civ-2', 'england');

        const aText = await a.textContent('#overlay');
        ok(/Wählt noch/.test(aText) && /\(0\/2 bereit\)/.test(await start(a)), 'host: others "Wählt noch …", start button 0/2', (await start(a)).trim());
        ok(await b.isVisible('#mp-ready-btn') && !(await b.$('#mp-start-btn')) && /Ich bin bereit/.test(await b.textContent('#mp-ready-btn')), 'B: own "Ich bin bereit" button, no start button');
        ok(/Wähle deine Nation/.test(await b.textContent('.mp-ready-hint')), 'B: the hint');

        await b.click('#mp-ready-btn');
        await a.waitForFunction(() => /\(1\/2 bereit\)/.test(document.getElementById('mp-start-btn').textContent), null, { timeout: 5000 });
        ok(/✓ Bereit/.test(await a.textContent('#overlay')), 'A sees B ready, 1/2');
        await b.waitForFunction(() => /✓ Bereit/.test(document.getElementById('mp-ready-btn').textContent));
        ok(/Der Host startet/.test(await b.textContent('.mp-ready-hint')), 'B: button and hint follow');

        // new settings: the tick is gone, B is told
        const toasts = [];
        await b.exposeFunction('__toast', t => toasts.push(t));
        await b.evaluate(() => { const t = window.toast; window.toast = m => { window.__toast(m); return t(m); }; });
        await a.evaluate(() => MP.socket.emit('lobby:config', { wonders: true }));
        await a.waitForFunction(() => /\(0\/2 bereit\)/.test(document.getElementById('mp-start-btn').textContent), null, { timeout: 5000 });
        ok(true, 'new settings clear the ticks');
        await sleep(300);
        ok(toasts.some(t => /bitte bestätige erneut/.test(t)), 'B is told to confirm again', toasts.join(' | '));
        ok(/Ich bin bereit/.test(await b.textContent('#mp-ready-btn')), 'B: button back to "Ich bin bereit"');

        // tick and take back
        await b.click('#mp-ready-btn');
        await a.waitForFunction(() => /\(1\/2/.test(document.getElementById('mp-start-btn').textContent));
        await b.click('#mp-ready-btn');
        await a.waitForFunction(() => /\(0\/2/.test(document.getElementById('mp-start-btn').textContent));
        ok(true, 'a tick can be taken back');

        // C (English) ticks; B not: the host is asked, declining keeps the lobby
        ok(/Still choosing/.test(await c.textContent('#overlay')) && /I'm ready/.test(await c.textContent('#mp-ready-btn')), 'English: status and button');
        await c.click('#mp-ready-btn');
        await a.waitForFunction(() => /\(1\/2/.test(document.getElementById('mp-start-btn').textContent));
        let asked = null;
        a.once('dialog', d => { asked = d.message(); d.dismiss(); });
        await a.click('#mp-start-btn');
        await sleep(500);
        ok(asked && /1 von 2 Mitspielern sind noch nicht bereit/.test(asked), 'host is asked when someone is not ready', asked);
        ok(await a.evaluate(() => !!document.getElementById('mp-start-btn') && (typeof S === 'undefined' || !S)), 'declining keeps the lobby');

        // everyone ready: no question, the game starts
        await b.click('#mp-ready-btn');
        await a.waitForFunction(() => /\(2\/2/.test(document.getElementById('mp-start-btn').textContent));
        asked = null;
        a.once('dialog', d => { asked = d.message(); d.accept(); });
        await a.click('#mp-start-btn');
        await Promise.all([a, b, c].map(p => p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 })));
        ok(asked === null, 'everyone ready: no question, the game starts', asked);
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
