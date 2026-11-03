/**
 * Sound and tab alerts (F18: client/alerts.js and its calls in mp.js, chat.js, matchmaking.js)
 * against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/alerts/alerts.test.js [http://localhost:3000]
 *
 * A hosts, B joins. Checked through ALERTS.log: a tone for A when B joins and when everyone is
 * ready, for both at the start, for B when B's turn begins, for B on A's chat message while B's
 * chat is closed. A tone really plays after a tap (Web Audio running). A hidden tab blinks its
 * title and gets it back when the player returns. The sound switch: the multiplayer menu's
 * checkbox and the game menu's button, kept per device, and no tone while it is off.
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
const kinds = p => p.evaluate(() => ALERTS.log.map(e => e.kind));
const hasAlert = (p, kind, ms = 10000) => p.waitForFunction(k => ALERTS.log.some(e => e.kind === k), kind, { timeout: ms }).then(() => true, () => false);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER, args: ['--autoplay-policy=user-gesture-required'] });
    const errors = [];
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof ALERTS !== 'undefined');
        await page.mouse.click(5, 300);                      // the first gesture unlocks sound
        await page.evaluate(() => MP.showLobby());
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    try {
        const a = await newPage('A'), b = await newPage('B');
        ok(await a.evaluate(() => !!document.querySelector('script[src^="/client/alerts.js"]')), 'alerts.js is on the page');
        ok(await a.evaluate(() => ALERTS.play('join')), 'a tone plays after a tap (Web Audio running)');

        // the switch in the multiplayer menu
        ok(await a.isChecked('.mph-sound input'), 'multiplayer menu: sound switch, on by default');
        await a.uncheck('.mph-sound input');
        ok(await a.evaluate(() => !ALERTS.soundOn() && localStorage.getItem('hochciv.alerts.sound') === 'off' && ALERTS.play('turn') === false), 'switched off: kept per device, no tone');
        await a.check('.mph-sound input');
        ok(await a.evaluate(() => ALERTS.soundOn()), 'switched on again');

        // lobby
        await a.fill('#mp-n', 'AlertHost');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0 }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(c => MP.joinWith(c.code, c.pw, 'AlertGuest'), cred);
        await b.waitForSelector('#mp-p-civ-1');
        ok(await hasAlert(a, 'join'), 'A: tone when B joins');
        const joinEntry = await a.evaluate(() => ALERTS.log.find(e => e.kind === 'join'));
        ok(joinEntry.sound === true && joinEntry.blink === false, 'A: the tone played; no blinking in a visible tab', JSON.stringify(joinEntry));
        await b.selectOption('#mp-p-civ-1', 'russland');
        await b.click('#mp-ready-btn');
        ok(await hasAlert(a, 'ready'), 'A (host): tone when everyone is ready');
        ok(!(await kinds(b)).includes('ready'), 'B: no "ready" tone (not the host)');

        // start and turns
        await a.evaluate(() => MP.startGame());
        ok(await hasAlert(a, 'start') && await hasAlert(b, 'start'), 'both: tone at the start');
        await a.waitForFunction(() => typeof S !== 'undefined' && S && S.players, null, { timeout: 20000 });
        const first = await a.evaluate(() => MP.isMyTurn());
        const [mover, waiter] = first ? [a, b] : [b, a];
        await mover.waitForFunction(() => MP.isMyTurn(), null, { timeout: 15000 });
        // the waiter's tab is hidden: its turn makes the title blink
        await waiter.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            window.__title0 = document.title;
        });
        await mover.evaluate(() => { if (typeof closeModal === 'function') closeModal(); MP.sendAction({ type: 'endTurn' }); });
        ok(await hasAlert(waiter, 'turn', 20000), 'the other player: tone when the turn begins');
        const t = await waiter.evaluate(() => ({ entry: ALERTS.log.find(e => e.kind === 'turn'), title: document.title, t0: window.__title0 }));
        await sleep(1100);
        const t2 = await waiter.evaluate(() => document.title);
        ok(t.entry.blink && /Du bist dran/.test(t.title + t2), 'hidden tab: the title blinks "Du bist dran"', `${t.title} / ${t2}`);
        await waiter.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await sleep(1200);
        ok(await waiter.evaluate(() => document.title === window.__title0), 'back in the tab: the title is restored');

        // chat: the receiver's panel is closed
        await waiter.evaluate(() => { if (typeof CHAT !== 'undefined' && CHAT.isOpen()) CHAT.toggle && CHAT.toggle(); });
        const before = (await kinds(waiter)).filter(k => k === 'chat').length;
        await mover.evaluate(() => new Promise(r => MP.socket.emit('chat:send', { kind: 'emote', emote: '👍' }, r)));
        await waiter.waitForFunction(n => ALERTS.log.filter(e => e.kind === 'chat').length > n, before, { timeout: 8000 })
            .then(() => ok(true, 'chat: tone for a message while the panel is closed'), () => ok(false, 'chat: tone for a message while the panel is closed'));
        ok(!(await kinds(mover)).includes('chat'), 'chat: no tone for one\'s own message');

        // the game menu's switch
        await a.click('#g-menu');
        await a.waitForSelector('#mm-sound');
        ok(/Töne: an/.test(await a.textContent('#mm-sound')), 'game menu: "Töne: an"');
        await a.click('#mm-sound');
        ok(/Töne: aus/.test(await a.textContent('#mm-sound')) && await a.evaluate(() => !ALERTS.soundOn()), 'game menu: switched off');
        await a.click('#mm-sound');
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
