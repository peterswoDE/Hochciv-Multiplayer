/**
 * Rematch of a live game (sockets/game.js, sessions.js resetForRematch, mp.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/rematch/rematch.test.js [http://localhost:3000]
 *
 * Three browser pages play a live game through the real game page (A hosts with a random
 * nation, B and C join, one KI seat). A and B only end their turns, C leaves after the end, so
 * the KI wins quickly. Checked: no rematch while the game runs, only the host may start it, the
 * end screen (host button, note for the others, no "Nochmal spielen"), and after the rematch:
 * both are back in the lobby with the same code, the player who left and the KI seat are gone,
 * A's lobby choice "Zufall" is back, the seed is new, and the second game starts.
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
async function until(fn, ms = 15000, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await page.evaluate(() => { MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const join = async (page, cred, name, idx, civ) => {
        await page.evaluate(() => MP.setMode('join'));
        await page.fill('#mp-c', cred.code);
        await page.fill('#mp-p', cred.pw);
        await page.fill('#mp-n', name);
        await page.evaluate(() => MP.join());
        await page.waitForSelector(`#mp-p-civ-${idx}`);
        await page.selectOption(`#mp-p-civ-${idx}`, civ);
    };
    const inGame = p => p.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 });
    const drivers = [];
    try {
        const a = await newPage('A'), b = await newPage('B'), c = await newPage('C');
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-hn', 'RematchA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'random');
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await join(b, cred, 'RematchB', 1, 'russland');
        await join(c, cred, 'RematchC', 2, 'england');
        await a.waitForFunction(() => MP.players.length === 3 && MP.players[2].civ === 'england');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 1, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4);
        const seed1 = await a.evaluate(() => MP.gameConfig.seed);
        await a.evaluate(() => MP.startGame());
        await Promise.all([inGame(a), inGame(b), inGame(c)]);

        const early = await emit(a, 'session:rematch');
        ok(early && early.error === 'Die Partie ist noch nicht vorbei.', 'no rematch while the game runs', early && early.error);

        // A, B and C end every turn at once – the KI wins
        for (const p of [a, b, c]) {
            drivers.push(setInterval(() => p.evaluate(() => {
                if (!S || S.over || !MP.isMyTurn() || MP._ending === S.round + ':' + S.cur) return;
                MP._ending = S.round + ':' + S.cur;
                if (typeof closeModal === 'function') closeModal();
                MP.sendAction({ type: 'endTurn' });
            }).catch(() => { }), 150));
        }
        const over = await until(() => a.evaluate(() => !!(S && S.over && document.getElementById('ov-body'))), 180000, 500);
        drivers.forEach(clearInterval);
        ok(!!over, 'the game ends');
        await b.waitForFunction(() => !!(S && S.over && document.getElementById('mp-rematch-box')), null, { timeout: 10000 });
        await a.waitForSelector('#mp-rematch', { timeout: 10000 });

        ok(await a.isVisible('#mp-rematch'), 'end screen: the host gets "Revanche"');
        ok(!(await b.$('#mp-rematch')) && /Der Host kann eine Revanche starten/.test(await b.textContent('#mp-rematch-box')), 'end screen: the others get the note, no button');
        ok(!(await a.$('#go-again')) && !(await b.$('#go-again')), 'end screen: no "Nochmal spielen" (local game)');

        const notHost = await emit(b, 'session:rematch');
        ok(notHost && notHost.error === 'Nur der Host kann eine Revanche starten.', 'only the host may start the rematch', notHost && notHost.error);

        // C leaves, then A starts the rematch
        await c.close();
        await a.waitForFunction(() => MP.players.some(p => p.name === 'RematchC' && !p.connected), null, { timeout: 10000 });
        await a.click('#mp-rematch');
        const lobby = p => p.waitForFunction(() => !!document.getElementById('mp-p-civ-0') && document.getElementById('screen-menu').classList.contains('show'), null, { timeout: 10000 });
        await Promise.all([lobby(a), lobby(b)]);
        const la = await a.evaluate(() => ({ code: MP.joinCode, players: MP.players.map(p => p.name + ':' + p.civ), me: MP.lobbyIndex, host: MP.hostIndex, seed: MP.gameConfig.seed, map: MP.gameConfig.map, state: S, log: getComputedStyle(document.getElementById('mp-persistent-log-container')).display }));
        const lb = await b.evaluate(() => ({ players: MP.players.length, me: MP.lobbyIndex, waiting: document.body.classList.contains('mp-waiting') }));
        ok(la.code === cred.code, 'rematch: same lobby code', la.code);
        ok(la.players.length === 2 && la.players[0] === 'RematchA:random' && la.players[1] === 'RematchB:russland', 'rematch: A and B only, with their lobby choices (A: Zufall)', la.players.join(', '));
        ok(la.me === 0 && la.host === 0 && lb.me === 1 && lb.players === 2, 'rematch: seats and host', `A ${la.me}, host ${la.host}, B ${lb.me}`);
        ok(la.seed !== seed1, 'rematch: a new seed', `${seed1} → ${la.seed}`);
        ok(la.state === null && la.log === 'none' && !lb.waiting, 'rematch: the old game is cleared from the screen');
        ok(await a.isVisible('text=Spiel starten'), 'rematch: the host can start again');

        // the second game starts for both
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0 }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
        await a.evaluate(() => MP.startGame());
        await Promise.all([inGame(a), inGame(b)]);
        const g2 = await a.evaluate(() => ({ round: S.round, players: S.players.length, over: !!S.over }));
        ok(g2.round === 1 && g2.players === 2 && !g2.over, 'the second game starts', JSON.stringify(g2));

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        drivers.forEach(clearInterval);
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
