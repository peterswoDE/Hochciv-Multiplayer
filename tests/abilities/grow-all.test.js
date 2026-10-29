/**
 * "Alle Städte wachsen" must not run by itself (mp.js, the action wrappers) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/abilities/grow-all.test.js [http://localhost:3000]
 *
 * Reported: opening "Fähigkeiten" made every city grow. The sheet prices "Alle Städte wachsen"
 * with growAllPlan, which runs growAll on a throwaway copy of the state – and the wrapped
 * growCity sent each of those planned growths to the server. A live game (one player, one KI)
 * through the real game page: with enough food and coins (locally), opening the sheet sends
 * nothing, the server's cities stay as they were, and tapping the button still grows them.
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
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const a = await ctx.newPage();
        a.on('pageerror', e => errors.push(e.message));
        await a.goto(BASE + '/');
        await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await a.evaluate(() => { MP.showLobby(); });
        await a.waitForFunction(() => typeof MP.setMode === 'function');
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-hn', 'GrowA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'russland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 1, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
        await a.evaluate(() => MP.startGame());
        await a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && MP.isMyTurn()
            && !(typeof ui !== 'undefined' && (ui.botLock || ui.anim))
            && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 60000 });
        await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });

        // record what goes to the server; plenty of food and coins, so every city could grow
        const before = await a.evaluate(() => {
            window.__sent = [];
            const send = MP.sendAction.bind(MP);
            MP.sendAction = (payload, cb) => { window.__sent.push(payload.type); return send(payload, cb); };
            const pi = MP.playerIndex;
            Object.assign(S.players[pi].res, { food: 99, coins: 99 });
            return { pi, pops: S.cities.filter(c => c.owner === pi).map(c => c.id + ':' + c.pop).join() };
        });
        ok(before.pops.length > 0, 'the player has a city', before.pops);

        // 1. opening "Fähigkeiten" only plans
        await a.evaluate(() => abilSheet());
        await a.waitForSelector('#sheet.open [data-act="wachsen:bezahlt"]');
        const plan = await a.evaluate(pi => {
            const b = document.querySelector('[data-act="wachsen:bezahlt"]');
            return { sent: window.__sent.slice(), enabled: !b.disabled, done: growAllPlan(S, pi, 'paid').done,
                pops: S.cities.filter(c => c.owner === pi).map(c => c.id + ':' + c.pop).join() };
        }, before.pi);
        ok(plan.done > 0 && plan.enabled, '"Alle Städte wachsen" is offered', `${plan.done} cities`);
        ok(plan.sent.length === 0, 'opening the sheet sends no action', plan.sent.join());
        ok(plan.pops === before.pops, 'opening the sheet grows no city locally', plan.pops);
        await sleep(1500);                                   // a growth on the server would come back as state:update
        const later = await a.evaluate(pi => S.cities.filter(c => c.owner === pi).map(c => c.id + ':' + c.pop).join(), before.pi);
        ok(later === before.pops, 'the server grew no city', later);

        // 2. tapping the button still grows (after the sheet's 0.4 s calm time)
        await sleep(500);
        await a.click('[data-act="wachsen:bezahlt"]');
        const sent = await a.evaluate(() => window.__sent.slice());
        ok(sent.length > 0 && sent.every(t => t === 'growCity'), 'tapping "Alle Städte wachsen" sends growCity', sent.join());

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
