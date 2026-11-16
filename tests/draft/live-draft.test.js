/**
 * Nation draft and turn positions in live games (F34: sockets/game.js, mp.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/draft/live-draft.test.js [http://localhost:3000]
 *
 * Two guests, A (host, German) and B (English), and two KI seats.
 * 1. Tile map, draft, positions picked: the lobby's selects (a draft offers no classic order),
 *    a taken position is refused, the start puts B on position 1 and A on 2, the KI (positions
 *    3 and 4) picks first on its own, A picks before B, B's dialog is in English, then the start
 *    tiles.
 * 2. The Originalkarte as a custom map, random draft, random order: everybody picks from the
 *    dealt pool, the game plays the seats in position order and position n starts on the map's
 *    start point n.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const fs = require('fs');
const builtin = require('../../maps/builtin');

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
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const newPage = async (name, en) => {
        const ctx = await browser.newContext({ locale: en ? 'en-US' : 'de-DE', viewport: { width: 1280, height: 860 } });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        page.on('dialog', d => d.accept());
        if (en) await page.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await page.evaluate(() => MP.showLobby());
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    /** A hosts, B joins; returns both pages. */
    const lobby = async (tag) => {
        const a = await newPage('A' + tag), b = await newPage('B' + tag, true);
        await a.fill('#mp-n', 'DraftHost' + tag);
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(c => MP.joinWith(c.code, c.pw, 'DraftGuest'), { ...cred, tag });
        await b.waitForSelector('#mp-p-civ-1');
        return { a, b };
    };
    try {
        // ── 1. Tile map, draft, positions picked ──────────────────────────────────
        {
            const { a, b } = await lobby('1');
            await emit(a, 'lobby:config', { mapKey: 'random', playerCount: 4, kiCount: 2 });
            await a.waitForFunction(() => MP.gameConfig.playerCount === 4 && document.getElementById('mp-set-civmode'));
            await a.selectOption('#mp-set-civmode', 'draft');
            await a.waitForFunction(() => MP.gameConfig.civMode === 'draft');
            const orders = await a.$$eval('#mp-set-order option', os => os.map(o => o.value));
            ok(orders.join() === 'pick,random', 'a draft offers no classic order', orders.join());
            await a.selectOption('#mp-set-order', 'pick');
            await b.waitForFunction(() => MP.gameConfig.turnOrder === 'pick' && document.getElementById('mp-p-pos-1'));
            ok(await b.$eval('#mp-p-civ-1', s => s.disabled && /Draft/.test(s.textContent)), 'the nation select shows the draft, nobody picks there');
            await b.selectOption('#mp-p-pos-1', '0');
            await a.waitForFunction(() => MP.players.find(p => p.index === 1).pos === 0);
            const taken = await emit(a, 'lobby:player:update', { pos: 0 });
            ok(taken && taken.error === 'Diese Position ist schon vergeben.', 'a taken position is refused', taken && taken.error);
            ok(await a.$eval('#mp-p-pos-0 option[value="0"]', o => o.disabled), 'the taken position is greyed out for the others');
            await a.selectOption('#mp-p-pos-0', '1');
            await a.waitForFunction(() => MP.players.find(p => p.index === 0).pos === 1);
            ok(/Position 1 zieht zuerst/.test(await a.textContent('.mp-settings')), 'the hint explains the positions');

            await a.evaluate(() => MP.startGame());
            await Promise.all([a, b].map(p => p.waitForFunction(() => MP.civDraft && MP.civDraft.cur != null, null, { timeout: 15000 })));
            const st = await a.evaluate(() => ({ me: MP.lobbyIndex, host: MP.hostIndex, d: MP.civDraft }));
            const bi = await b.evaluate(() => MP.lobbyIndex);
            ok(bi === 0 && st.me === 1 && st.host === 1, 'B moves first (position 1), A second', `B ${bi}, A ${st.me}`);
            ok(st.d.picks[3] && st.d.picks[2] && st.d.cur === 1, 'the KI on positions 3 and 4 picked first, now A', JSON.stringify(st.d.picks));
            ok(await a.$$eval('#mp-cd-pool button:not([disabled])', bs => bs.length) > 0 && await b.$$eval('#mp-cd-pool button:not([disabled])', bs => bs.length) === 0,
                'only A can pick now');
            const bText = await b.textContent('#overlay');
            ok(/Nation draft/.test(bText) && /Waiting for/.test(bText) && !/Nationen-Draft|wählt|Warte auf/.test(bText), 'B sees the draft in English', bText.slice(0, 120));
            await a.click('#mp-cd-pool button:not([disabled])');
            await b.waitForFunction(() => MP.civDraft.cur === 0);
            await b.click('#mp-cd-pool button:not([disabled])');
            await Promise.all([a, b].map(p => p.waitForFunction(() => typeof placeState !== 'undefined' && placeState, null, { timeout: 15000 })));
            const players = await a.evaluate(() => MP.players.map(p => [p.civ, p.ability]));
            ok(players.every(([c, ab]) => c && c !== 'random' && ab && ab !== 'random'), 'after the draft every seat has nation and ability, then the start tiles', JSON.stringify(players));
            await a.context().close(); await b.context().close();
        }

        // ── 2. Originalkarte, random draft, random order ──────────────────────────
        {
            const { a, b } = await lobby('2');
            const urkart = builtin.find(m => m.code === 'URKART').map;
            await emit(a, 'lobby:config', { mapKey: 'eigene', customMap: urkart, playerCount: 4, kiCount: 2, civMode: 'randomDraft', turnOrder: 'classic' });
            await a.waitForFunction(() => MP.gameConfig.civMode === 'randomDraft');
            ok(await a.$eval('#mp-set-order', s => s.value) === 'random', 'a random draft with "classic" order shows random order');
            ok(/Startpunkt n/.test(await a.textContent('.mp-settings')), 'custom map: position n starts on start point n (hint)');
            await a.evaluate(() => MP.startGame());
            for (let i = 0; i < 4; i++) {
                const turn = await Promise.race([a, b].map(async p => { await p.waitForFunction(() => (MP.civDraft && MP.civDraft.cur === MP.lobbyIndex) || (typeof S !== 'undefined' && S), null, { timeout: 15000 }); return p; }));
                if (await turn.evaluate(() => typeof S !== 'undefined' && !!S)) break;
                const pool = await turn.evaluate(() => MP.civDraft.pool.filter(e => e.left > 0).length);
                if (i === 0) ok(pool >= 2, 'the dealt pool', String(pool));
                await turn.click('#mp-cd-pool button:not([disabled])');
                await turn.waitForFunction(() => !MP.civDraft || MP.civDraft.cur !== MP.lobbyIndex);
            }
            await Promise.all([a, b].map(p => p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 })));
            const g = await a.evaluate(() => ({
                slots: S.players.map(p => p.slot), start: S.startIdx,
                caps: S.players.map((p, i) => S.cities.find(c => c.owner === i && c.cap)).map(c => [c.r, c.c]),
            }));
            ok(g.slots.join() === '0,1,2,3' && g.start === 0, 'the game plays the seats in position order', g.slots.join());
            ok(JSON.stringify(g.caps) === JSON.stringify(urkart.spawns), 'position n starts on start point n', JSON.stringify(g.caps));
            await a.context().close(); await b.context().close();
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } catch (e) {
        ok(false, 'test run', e.stack);
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
