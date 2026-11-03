/**
 * "Next game" in Rundenspiele (F20: mp.js refreshNext / drawNextGame / openNextGame) against the
 * local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/nextgame/nextgame.test.js [http://localhost:3000]
 *
 * A has three Rundenspiele against B, all on A's turn. In the first one the button is hidden
 * while A plays; after A's turn it shows "Nächstes Spiel (2)" and opens another game on A's
 * turn, then "(1)", and after the last game nothing is left. Leaving the game hides it.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [], asyncIds = [];
function makeUser() {
    const name = 'nxt_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    users.push({ name, id });
    return { name, id };
}
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
        const ua = makeUser(), ub = makeUser();
        const login = async (u, en) => {
            const ctx = await browser.newContext({ locale: en ? 'en-US' : 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub);
        const ids = [];
        for (let i = 0; i < 3; i++) {
            const g = await (await ca.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0 }, civ: 'griechenland', ability: 'basis' } })).json();
            await cb.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
            asyncIds.push(g.id); ids.push(g.id);
        }
        const mine = (await (await ca.request.get(BASE + '/api/async')).json()).mine;
        ok(ids.every(id => (mine.find(g => g.id === id) || {}).yourTurn), 'A is on turn in all three games');

        const page = await ca.newPage();
        page.on('pageerror', e => errors.push(`A: ${e.message}`));
        await page.goto(BASE + '/?async=' + ids[0]);
        const myTurnIn = id => page.waitForFunction(id => MP.asyncId === id && typeof S !== 'undefined' && S && MP.isMyTurn(), id, { timeout: 20000 });
        const endTurn = () => page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); MP.sendAction({ type: 'endTurn' }); });
        const button = () => page.evaluate(() => { const b = document.getElementById('mp-next-game'); return b && !b.hidden ? b.textContent : null; });

        await myTurnIn(ids[0]);
        await page.waitForTimeout(800);
        ok(await button() === null, 'own turn: no "next game" button');
        await endTurn();
        await page.waitForFunction(() => /Nächstes Spiel \(2\)/.test((document.getElementById('mp-next-game') || {}).textContent || '') && !document.getElementById('mp-next-game').hidden, null, { timeout: 15000 })
            .then(() => ok(true, 'after the turn: "Nächstes Spiel (2)"'), () => ok(false, 'after the turn: "Nächstes Spiel (2)"'));
        await page.click('#mp-next-game');
        const second = await page.waitForFunction(ids => MP.asyncId && MP.asyncId !== ids[0] && ids.includes(MP.asyncId) ? MP.asyncId : null, ids, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
        ok(!!second, 'it opens another of the games', second);
        await myTurnIn(second);
        ok(await button() === null, 'the next game is on A\'s turn, the button is gone');
        await endTurn();
        await page.waitForFunction(() => /Nächstes Spiel \(1\)/.test((document.getElementById('mp-next-game') || {}).textContent || '') && !document.getElementById('mp-next-game').hidden, null, { timeout: 15000 })
            .then(() => ok(true, 'then "Nächstes Spiel (1)"'), () => ok(false, 'then "Nächstes Spiel (1)"'));
        await page.click('#mp-next-game');
        const third = ids.find(id => id !== ids[0] && id !== second);
        await myTurnIn(third);
        ok(true, 'the third game opens');
        await endTurn();
        await page.waitForFunction(() => typeof S !== 'undefined' && S && !MP.isMyTurn(), null, { timeout: 15000 });
        await page.waitForTimeout(2500);
        ok(await button() === null, 'no other game waits: no button');

        // B's games: B is on turn in all three now; English; leaving hides it
        const pb = await (await login(ub, true)).newPage();
        pb.on('pageerror', e => errors.push(`B: ${e.message}`));
        await pb.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await pb.goto(BASE + '/?async=' + ids[0]);
        await pb.waitForFunction(id => MP.asyncId === id && typeof S !== 'undefined' && S && MP.isMyTurn(), ids[0], { timeout: 20000 });
        await pb.evaluate(() => { if (typeof closeModal === 'function') closeModal(); MP.sendAction({ type: 'endTurn' }); });
        await pb.waitForFunction(() => /Next game \(2\)/.test((document.getElementById('mp-next-game') || {}).textContent || '') && !document.getElementById('mp-next-game').hidden, null, { timeout: 15000 })
            .then(() => ok(true, 'English: "Next game (2)"'), () => ok(false, 'English: "Next game (2)"'));
        await pb.evaluate(() => ASYNC.close());
        ok(await pb.evaluate(() => document.getElementById('mp-next-game').hidden), 'leaving the game hides the button');
        await ca.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
