/**
 * The open tech tree shows the server's next-age roll after researching (mp.js,
 * MP.refreshTechModal), against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/techs/tech-tree-refresh.test.js [http://localhost:3000]
 *
 * Reported (#180): after researching, the new techs of the next age were wrong until the tech
 * tree was closed and opened again. The first tech of a field and age rolls the next age's
 * availability. The client runs the action locally first, without the dice seed, and the tree
 * redrew from that roll. The server's state:update didn't redraw it.
 * Here the local roll is switched off (nothing becomes available locally). The server always
 * makes at least one tech available, and the open tree must show exactly the server's techs.
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
        await a.fill('#mp-n', 'TechA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 1, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
        await a.evaluate(() => MP.startGame());

        const myTurn = () => a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && MP.isMyTurn()
            && !(typeof ui !== 'undefined' && (ui.botLock || ui.anim))
            && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 60000 });

        // A tech the player can afford that is the first of its field and age (so it rolls the next age)
        const pick = () => a.evaluate(() => {
            const pi = MP.playerIndex, p = S.players[pi];
            const t = techPool(S).find(t => t.age < 3 && p.avail[t.k] && !p.techs[t.k]
                && available(S, pi, 'sci') >= techCost(S, pi, t)
                && !techPool(S).some(o => o.f === t.f && o.age === t.age && p.techs[o.k])
                && !techsIn(t.f, t.age + 1, S).some(o => p.avail[o.k] || p.techs[o.k]));
            return t ? { k: t.k, f: t.f, age: t.age } : null;
        });
        let tech = null;
        for (let round = 0; round < 8 && !tech; round++) {
            await myTurn();
            await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
            tech = await pick();
            if (!tech) {
                const r = await a.evaluate(() => S.round);
                await a.evaluate(() => new Promise(res => MP.sendAction({ type: 'endTurn' }, res)));
                await a.waitForFunction(r0 => S.round > r0 || !MP.isMyTurn(), r);
            }
        }
        ok(!!tech, 'an affordable first tech of a field and age', tech && tech.k);
        if (!tech) throw new Error('no tech to research');

        // The local optimistic run makes nothing available in the next age
        await a.evaluate(() => { window.rollAvailability = () => {}; });
        await a.evaluate(() => techModal());
        await a.waitForSelector(`#ov-body [data-tech="${tech.k}"]`);
        await a.evaluate(() => { document.getElementById('ov-body').scrollTop = 40; });
        const round = await a.evaluate(() => S.round);
        const updated = a.evaluate(() => new Promise(res => {
            const apply = MP.applyState.bind(MP);
            MP.applyState = st => { const r = apply(st); res(); return r; };
        }));
        await a.click(`#ov-body [data-tech="${tech.k}"]`);
        await updated;

        const shown = await a.evaluate(t => {
            const pi = MP.playerIndex, p = S.players[pi];
            const tiles = [...document.querySelectorAll('#ov-body .tech')];
            return {
                open: document.getElementById('overlay').classList.contains('show') && MP._techOpen,
                owned: !!p.techs[t.k],
                next: techsIn(t.f, t.age + 1, S).map(o => {
                    const b = tiles.find(x => x.querySelector('b') && x.querySelector('b').textContent === o.n);
                    return { k: o.k, server: !!p.avail[o.k], shown: !!b && !b.classList.contains('locked') };
                }),
            };
        }, tech);
        ok(shown.owned, 'the server researched it', tech.k);
        ok(shown.open, 'the tech tree is still open');
        ok(shown.next.some(n => n.server), 'the server made a next-age tech available', shown.next.filter(n => n.server).map(n => n.k).join());
        ok(shown.next.every(n => n.server === n.shown), 'the open tree shows the server\'s next age',
            shown.next.map(n => `${n.k} server ${n.server} shown ${n.shown}`).join(', '));
        ok(await a.evaluate(r => S.round === r, round), 'still the same round');

        // Another modal on top of it is left alone
        await a.evaluate(() => { modal('Test', '<p id="other-modal">x</p>'); MP.applyState(S); });
        ok(await a.evaluate(() => !!document.getElementById('other-modal')), 'another modal is not replaced by the tech tree');
        await a.evaluate(() => closeModal());

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
