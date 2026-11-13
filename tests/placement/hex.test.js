/**
 * The experimental tile mode (hexTiles) in multiplayer (sockets/game.js, async/logic.js, mp.js)
 * against the local docker setup. Since game v107 it is the tile map of 14 triangles with four
 * empires and the usual tile map with any other number (v99–v106: hexagons for every number):
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/placement/hex.test.js [http://localhost:3000]
 *
 * Live: the option shows on the tile map only, and a game of 2, 3, 4, 6 and 8 empires (one human,
 * the rest KI) places a triangle in three rotations and starts on its map – 14 triangles with four.
 * Rundenspiel: four empires through the form's config get the 14-triangle plan, and a fixed map
 * ignores the option.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
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
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'hx_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const FORM = { 2: 'hex6', 3: 'tri9', 4: 'tri14', 6: 'strip14', 8: 'strip18' };

// the first allowed capital in the current rotation, as a tap on the map
const place = () => {
    const st = placeState, seat = st.queue[st.at];
    const opts = placeOptions(st.plan, seat, st.o);
    const [r, c] = slotRC(st.plan, seat.slot)[opts.indexOf(true)];
    plTap(r, c);
};

async function live(browser, errors, n) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${n} empires: ${e.message}`));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined');
    await page.evaluate(() => MP.showLobby());
    await page.waitForFunction(() => typeof MP.setMode === 'function');
    await page.evaluate(() => MP.setMode('host'));
    await page.fill('#mp-n', 'Hex' + n);
    await page.evaluate(() => MP.host());
    await page.waitForSelector('#mp-p-civ-0');
    if (n === 2) ok(await page.$('#mp-set-hex') === null, 'no option on a fixed map');
    await page.selectOption('#mp-set-map', 'random');
    await page.waitForSelector('#mp-set-hex');
    await page.check('#mp-set-hex');
    await page.waitForFunction(() => MP.gameConfig.hexTiles === true);
    await page.evaluate(n => MP.socket.emit('lobby:config', { playerCount: n, kiCount: n - 1, difficulty: 'leicht' }), n);
    await page.waitForFunction(n => MP.gameConfig.playerCount === n, n);
    await page.evaluate(() => MP.startGame());
    await page.waitForFunction(() => document.getElementById('screen-place').classList.contains('show') && placeState);
    const st = await page.evaluate(() => ({
        shape: placeState.plan.shapeKey, hex: !!placeState.plan.hex, note: document.getElementById('pl-note').textContent,
    }));
    ok(st.shape === FORM[n] && !st.hex && /von 3/.test(st.note), `${n} empires: placing a triangle of ${FORM[n]}, three rotations`, JSON.stringify(st));
    await page.evaluate(place);
    await page.click('#pl-ok');
    await page.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
    const g = await page.evaluate(() => ({ tiles: S.map.tiles, cities: S.cities.length, players: S.players.length }));
    ok(g.tiles === FORM[n] && g.cities === n, `${n} empires: the game runs on ${FORM[n]}`, JSON.stringify(g));
    ok(await page.evaluate(() => placeState === null), `${n} empires: nothing of the placement stays behind`);
    await ctx.close();
}

async function rundenspiel(browser, errors, user, second, ids) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`Rundenspiel: ${e.message}`));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined' && typeof ASYNC !== 'undefined');
    await page.evaluate(() => MP.fetchUser());
    const rest = body => page.evaluate(body => fetch('/api/async', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'include' }).then(r => r.json()), body);

    // the form: the option comes with the tile map
    await page.evaluate(() => ASYNC.newGame());
    await page.waitForSelector('#mpa-map');
    ok(await page.$('#mpa-hex') === null, 'form: no option on a fixed map');
    await page.selectOption('#mpa-map', 'plaettchen');
    await page.waitForSelector('#mpa-hex');
    await page.evaluate(() => closeModal());

    const r = await rest({ config: { mapKey: 'plaettchen', hexTiles: true, civMode: 'random', playerCount: 4, kiCount: 2, difficulty: 'leicht', isPublic: true } });
    const id = r.id || (r.game && r.game.id);
    ok(!!id, 'Rundenspiel in the experimental tile mode created', JSON.stringify(r).slice(0, 200));
    ids.push(id);
    ok(sql(`SELECT data->'config'->>'hexTiles' FROM async_games WHERE id = '${id}'`) === 'true', 'Rundenspiel: the option is stored');
    const ctx2 = await browser.newContext({ locale: 'de-DE' });
    await ctx2.request.post(BASE + '/api/auth/login', { data: { username: second.name, password: PASSWORD } });
    const joined = await ctx2.request.post(`${BASE}/api/async/${id}/join`, { data: {} });
    ok(joined.ok(), 'Rundenspiel: the second player joins', await joined.text());
    const plan = sql(`SELECT data->'pre'->'plan'->>'shapeKey' FROM async_games WHERE id = '${id}'`);
    ok(plan === 'tri14', 'Rundenspiel: the 14-triangle plan for four empires', plan);

    const fixed = await rest({ config: { mapKey: '0', hexTiles: true, civMode: 'random', playerCount: 2, kiCount: 0, difficulty: 'leicht' } });
    const fid = fixed.id || (fixed.game && fixed.game.id);
    if (fid) ids.push(fid);
    ok(sql(`SELECT data->'config'->>'hexTiles' FROM async_games WHERE id = '${fid}'`) === 'false', 'Rundenspiel: a fixed map ignores the option');
    await ctx.close();
}

(async () => {
    const { chromium } = require('playwright-core');
    const user = makeUser(), second = makeUser();
    const ids = [];
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        for (const n of [2, 3, 4, 6, 8]) await live(browser, errors, n);
        await rundenspiel(browser, errors, user, second, ids);
        ok(!errors.length, 'no page errors', errors.join(' | '));
    } catch (e) {
        console.log('FAIL  crashed: ' + (e.stack || e));
        failed++;
    } finally {
        await browser.close();
        const rows = ids.filter(Boolean);
        if (rows.length) sql(`DELETE FROM async_games WHERE id IN (${rows.map(i => `'${i}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id IN ('${user.id}', '${second.id}')`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
