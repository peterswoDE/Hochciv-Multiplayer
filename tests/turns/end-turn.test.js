/**
 * Ending a turn with something left (game v109, mp.js turn button) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/turns/end-turn.test.js [http://localhost:3000]
 *
 * Since v109 the game asks once per turn when resources or free actions would be left
 * ("Zug beenden?", endTurnAsk). mp.js has its own turn button: it shows the same dialog, sends
 * nothing until "Zug beenden" is tapped there, and then ends the turn on the server. "Zurück"
 * keeps playing; after that the button ends without asking again in that turn.
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
    try {
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
        const a = await ctx.newPage();
        a.on('pageerror', e => errors.push(e.message));
        await a.goto(BASE + '/');
        await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await a.evaluate(() => MP.showLobby());
        await a.waitForFunction(() => typeof MP.setMode === 'function');
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-n', 'EndTurn');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 2, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
        await a.evaluate(() => MP.startGame());
        const myTurn = () => a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && MP.isMyTurn()
            && !(typeof ui !== 'undefined' && (ui.botLock || ui.anim))
            && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 60000 });
        await myTurn();
        await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); if (typeof closeSheet === 'function') closeSheet(); });
        ok(await a.evaluate(() => typeof endTurnAsk === 'function' && +APP_VERSION.slice(1) >= 109), 'game v109 or newer with the end-turn dialog');

        // something is left: plenty of science and coins (locally – the dialog only reads them)
        const before = await a.evaluate(() => {
            window.__sent = [];
            const send = MP.sendAction.bind(MP);
            MP.sendAction = (payload, cb) => { window.__sent.push(payload.type); return send(payload, cb); };
            Object.assign(S.players[MP.playerIndex].res, { sci: 50, coins: 50 });
            return { round: S.round, rest: unspent(S, S.cur) };
        });
        ok(before.rest.kaufbar.length > 0, 'something could still be bought', before.rest.kaufbar.join());

        // 1. the button asks, sends nothing
        await a.click('#a-end');
        await a.waitForSelector('#end-ok');
        const ask = await a.evaluate(() => ({
            title: document.getElementById('ov-title').textContent,
            text: document.getElementById('ov-body').innerText,
            sent: window.__sent.slice(),
        }));
        ok(ask.title === 'Zug beenden?', 'dialog "Zug beenden?"', ask.title);
        ok(/genug für|Noch offen/.test(ask.text), 'it says what is left', ask.text.split('\n')[0]);
        ok(ask.sent.length === 0, 'nothing sent yet', ask.sent.join());

        // 2. "Zurück" keeps playing
        await a.click('#end-back');
        ok(await a.evaluate(() => !document.getElementById('overlay').classList.contains('show') && window.__sent.length === 0 && MP.isMyTurn()),
            '"Zurück" keeps the turn');

        // 3. asked once: the button now ends via the server; and again from the dialog's button
        await a.evaluate(() => { ui.confirmedEnd = false; });                 // ask again for the dialog's own button
        await a.click('#a-end');
        await a.waitForSelector('#end-ok');
        await a.click('#end-ok');
        await sleep(300);
        const sent = await a.evaluate(() => window.__sent.slice());
        ok(sent.length === 1 && sent[0] === 'endTurn', '"Zug beenden" in the dialog ends the turn on the server', sent.join());
        ok(await a.evaluate(() => !document.getElementById('overlay').classList.contains('show')), 'the dialog closes');
        await a.waitForFunction(r => S.round > r || !MP.isMyTurn(), before.round, { timeout: 30000 });
        ok(true, 'the turn moved on');

        // 4. next turn: asks again (once per turn)
        await myTurn();
        await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); Object.assign(S.players[MP.playerIndex].res, { sci: 50, coins: 50 }); window.__sent = []; });
        await a.click('#a-end');
        await a.waitForSelector('#end-ok');
        ok(await a.evaluate(() => window.__sent.length === 0), 'next turn asks again');
        await a.evaluate(() => closeModal());

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
