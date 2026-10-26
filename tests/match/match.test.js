/**
 * Ranked matchmaking (sockets/match.js, client/matchmaking.js) against the local docker setup,
 * with short waits:
 *
 *   MATCH_GROUP_WAIT_MS=3000 MATCH_CONFIRM_MS=5000 docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/match/match.test.js [http://localhost:3000]
 *
 * Four test accounts in browser pages, through the game page's own menu: A (1000 MMR) and
 * B (1050) find each other, C (1600) does not; B declines – A goes back to the queue, B leaves
 * it; both search again and accept – the server's lobby fills and the ranked game starts by
 * itself (original map, random nations, 3 minutes per turn, four empires). C and D (1620) let
 * the confirmation run out – both leave the queue. Without login there is no queue. The MMR
 * window is checked directly. Test accounts are deleted afterwards.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found. Restart the container without the MATCH_* variables afterwards.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser(mmr) {
    const name = 'mm_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, mmr: ${mmr} })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id, mmr };
}

function windowRule() {
    const { windowOf, matchConfig } = require('../../sockets/match');
    const now = Date.now();
    ok(windowOf({ since: now }, now) === 100 && windowOf({ since: now - 15000 }, now) === 150 && windowOf({ since: now - 3600000 }, now) === 1000,
        'window: ±100, +50 every 15 s, at most ±1000');
    const c = matchConfig();
    ok(c.mapKey === '0' && c.randomCivs && c.ranked && c.turnTime === 180 && c.playerCount === 4 && c.difficulty === 'schwer', 'settings of a matched game', JSON.stringify(c));
}

(async () => {
    windowRule();
    const users = { A: makeUser(1000), B: makeUser(1050), C: makeUser(1600), D: makeUser(1620) };
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const pages = {};
        for (const [k, u] of Object.entries(users)) {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed ' + u.name);
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(`${k}: ${e.message}`));
            await page.goto(BASE + '/');
            await page.waitForFunction(() => typeof MATCH !== 'undefined' && typeof MP !== 'undefined');
            await page.evaluate(() => MP.showLobby());
            await page.waitForSelector('text=Gewertetes Spiel suchen');
            pages[k] = page;
        }
        const { A, B, C, D } = pages;
        const state = p => p.evaluate(() => MATCH.state);
        const search = p => p.click('text=Gewertetes Spiel suchen');

        // A, B and C search: A and B fit, C is too far away
        await search(A); await search(B); await search(C);
        ok(await until(async () => (await state(A)) === 'queue' && (await state(C)) === 'queue'), 'queue: searching shows the waiting screen');
        ok(!!(await until(() => A.evaluate(() => /MMR-Spanne ±100 · 3 in der Warteschlange/.test(document.getElementById('mpm-info').textContent)), 5000)), 'queue: window and queue size shown');
        const found = await until(async () => (await state(A)) === 'found' && (await state(B)) === 'found', 10000);
        ok(!!found, 'A (1000) and B (1050) are matched after the group wait');
        const names = await A.evaluate(() => MATCH.found.players.map(p => p.name));
        ok(names.length === 2 && names.includes(users.A.name) && names.includes(users.B.name), 'the match lists both', names.join(', '));
        ok((await state(C)) === 'queue', 'C (1600) stays in the queue');

        // B declines: A back in the queue, B out
        await A.click('text=Annehmen');
        await B.click('text=Ablehnen');
        ok(!!(await until(async () => (await state(A)) === 'queue' && (await state(B)) === null)), 'B declines: A back in the queue, B out of it');

        // both search again and accept → the ranked game starts by itself
        await B.evaluate(() => MP.showLobby());
        await B.waitForSelector('text=Gewertetes Spiel suchen');
        await search(B);
        ok(!!(await until(async () => (await state(A)) === 'found' && (await state(B)) === 'found', 10000)), 'matched again');
        await A.click('text=Annehmen');
        ok(!!(await until(() => A.evaluate(() => /1 von 2 haben bestätigt/.test(document.getElementById('mpm-progress').textContent)))), 'progress: 1 of 2 confirmed');
        await B.click('text=Annehmen');
        const inGame = p => until(() => p.evaluate(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show') && MP.playerIndex != null), 20000);
        ok(!!(await inGame(A)) && !!(await inGame(B)), 'both confirmed: the game starts by itself');
        const g = await A.evaluate(() => ({ ranked: MP.gameConfig.ranked, turnTime: MP.gameConfig.turnTime, map: MP.gameConfig.mapKey, random: MP.gameConfig.randomCivs, empires: S.players.length, humans: S.players.filter(p => p.kind === 'human').length, clock: !!MP.turnClock }));
        ok(g.ranked && g.turnTime === 180 && g.map === '0' && g.random && g.empires === 4 && g.humans === 2 && g.clock, 'ranked, original map, random nations, 3 min per turn, 2 humans + 2 KI', JSON.stringify(g));

        // closing the dialog keeps searching; the menu button brings it back
        await C.evaluate(() => closeModal());
        await sleep(2500);
        ok(await C.evaluate(() => MATCH.state === 'queue' && !document.getElementById('overlay').classList.contains('show')), 'queue: a closed dialog stays closed, the search goes on');
        await C.evaluate(() => MP.showLobby());
        await C.waitForSelector('text=Gewertetes Spiel suchen');
        await C.click('text=Gewertetes Spiel suchen');
        ok(!!(await until(() => C.evaluate(() => !!document.getElementById('mpm-wait')), 3000)), 'queue: the menu button shows the running search again');

        // C and D (1600 / 1620) match, nobody confirms → both leave the queue
        await search(D);
        ok(!!(await until(async () => (await state(C)) === 'found' && (await state(D)) === 'found', 10000)), 'C and D are matched');
        ok(!!(await until(async () => (await state(C)) === null && (await state(D)) === null, 9000)), 'the confirmation runs out: both leave the queue');

        // no login, no queue
        const anon = await (await browser.newContext()).newPage();
        await anon.goto(BASE + '/');
        await anon.waitForFunction(() => typeof MP !== 'undefined');
        const res = await anon.evaluate(() => MP.connect().then(() => new Promise(r => MP.socket.emit('match:join', {}, r))));
        ok(res.error === 'Für gewertete Spiele musst du angemeldet sein.', 'without login: no queue', res.error);
        await anon.evaluate(() => MP.showLobby());
        ok(await anon.isDisabled('text=Gewertetes Spiel suchen'), 'without login: the button is disabled');

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id IN (${Object.values(users).map(u => `'${u.id}'`).join(',')})`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
