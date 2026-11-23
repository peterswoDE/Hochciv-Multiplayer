/**
 * The experimental civilisations of the game (v111+, EXP_CIVS) in multiplayer (utils/civdraft.js
 * expCivsOn, engine-adapter.js civsFor, sockets/game.js, async/logic.js, mp.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/civs/expcivs.test.js [http://localhost:3000]
 *
 * Live: the lobby shows the switch on the tile map, not in Marathon, it adds the six experimental nations (eight
 * with wonders), a nation that is no longer offered falls back to random, and a game with Rom starts.
 * Rundenspiel: the switch in the form, Azteken with wonders is accepted and stored, Rom without the
 * switch, in Marathon or in a ranked game is refused.
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
    const name = 'xc_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const civOptions = page => page.$$eval('#mp-p-civ-0 option', o => o.map(x => x.value).filter(v => v !== 'random'));

// the first allowed capital in the current rotation, as a tap on the map
const place = () => {
    const st = placeState, seat = st.queue[st.at];
    const opts = placeOptions(st.plan, seat, st.o);
    const [r, c] = slotRC(st.plan, seat.slot)[opts.indexOf(true)];
    plTap(r, c);
};

async function live(browser, errors) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`live: ${e.message}`));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined');
    await page.evaluate(() => MP.showLobby());
    await page.waitForFunction(() => typeof MP.setMode === 'function');
    await page.evaluate(() => MP.setMode('host'));
    await page.fill('#mp-n', 'Exp');
    await page.evaluate(() => MP.host());
    await page.waitForSelector('#mp-p-civ-0');

    await page.selectOption('#mp-set-map', 'marathon');
    await page.waitForFunction(() => MP.gameConfig.mapKey === 'marathon');
    ok(!(await page.$('#mp-set-expciv')), 'Marathon: no switch for the experimental nations');
    await page.selectOption('#mp-set-map', 'random');
    await page.waitForFunction(() => MP.gameConfig.mapKey === 'random' && document.getElementById('mp-set-expciv'));
    ok((await civOptions(page)).length === 4, 'tile map: four nations without the switch');

    await page.check('#mp-set-expciv');
    await page.waitForFunction(() => MP.gameConfig.expCivs === true);
    let civs = await civOptions(page);
    ok(civs.length === 10 && civs.includes('rom') && !civs.includes('azteken'), 'switch on: ten nations, no Azteken without wonders', civs.join());
    await page.check('#mp-set-wonders');
    await page.waitForFunction(() => MP.gameConfig.wonders === true);
    civs = await civOptions(page);
    ok(civs.length === 12 && civs.includes('azteken') && civs.includes('aegypten'), 'with wonders: twelve nations', civs.join());

    await page.selectOption('#mp-p-civ-0', 'azteken');
    await page.waitForFunction(() => MP.players[0].civ === 'azteken');
    await page.uncheck('#mp-set-wonders');
    await page.waitForFunction(() => MP.gameConfig.wonders === false);
    await page.waitForFunction(() => MP.players[0].civ === 'random', null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => MP.players[0].civ === 'random'), 'wonders off: Azteken falls back to random');

    await page.selectOption('#mp-p-civ-0', 'rom');
    await page.waitForFunction(() => MP.players[0].civ === 'rom');
    await page.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 2, difficulty: 'leicht' }));
    await page.waitForFunction(() => MP.gameConfig.playerCount === 3);
    await page.evaluate(() => MP.startGame());
    await page.waitForFunction(() => document.getElementById('screen-place').classList.contains('show') && placeState);
    await page.evaluate(place);
    await page.click('#pl-ok');
    await page.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
    const g = await page.evaluate(() => S.players.map(p => p.civ));
    ok(g[0] === 'rom' && g.length === 3, 'the game starts with Rom', g.join());
    await ctx.close();
}

async function rundenspiel(browser, errors, user, ids) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`Rundenspiel: ${e.message}`));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined' && typeof ASYNC !== 'undefined');
    await page.evaluate(() => MP.fetchUser());
    const rest = body => page.evaluate(body => fetch('/api/async', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'include' }).then(r => r.json()), body);

    // the form: the switch on the tile map, the nations follow it
    await page.evaluate(() => ASYNC.newGame());
    await page.waitForSelector('#mpa-map');
    await page.selectOption('#mpa-map', 'plaettchen');
    await page.waitForSelector('#mpa-expciv');
    await page.check('#mpa-expciv');
    await page.evaluate(() => ASYNC.readForm(true));
    await page.waitForFunction(() => document.querySelectorAll('#mpa-civ option').length === 10);
    ok(true, 'form: the switch adds the experimental nations');
    await page.selectOption('#mpa-map', 'marathon').catch(() => {});
    await page.evaluate(() => ASYNC.readForm(true));
    ok(!(await page.$('#mpa-expciv')) && (await page.$$('#mpa-civ option')).length <= 4, 'form: no switch in Marathon');
    await page.evaluate(() => closeModal());

    const ab = await page.evaluate(() => ({ az: CIV_BY_KEY.azteken.abilities[0].k, rom: CIV_BY_KEY.rom.abilities[0].k }));
    const base = { mapKey: 'plaettchen', civMode: 'fixed', playerCount: 2, kiCount: 0, difficulty: 'leicht' };
    const r = await rest({ config: { ...base, expCivs: true, wonders: true }, civ: 'azteken', ability: ab.az });
    const id = r.id || (r.game && r.game.id);
    if (id) ids.push(id);
    ok(!!id, 'Azteken with wonders and the switch: created', JSON.stringify(r).slice(0, 200));
    if (id) {
        const row = sql(`SELECT (data->'config'->>'expCivs') || ',' || (data->'seats'->0->>'civ') FROM async_games WHERE id = '${id}'`);
        ok(row === 'true,azteken', 'stored: expCivs and the nation', row);
    }
    for (const [name, config] of [['without the switch', base], ['in Marathon', { ...base, mapKey: 'marathon', playerCount: 4, kiCount: 2, expCivs: true }],
        ['in a ranked game', { ...base, ranked: true, expCivs: true }]]) {
        const x = await rest({ config, civ: 'rom', ability: ab.rom });
        const xid = x.id || (x.game && x.game.id);
        if (xid) ids.push(xid);
        ok(!xid && !!x.error, `Rom ${name}: refused`, JSON.stringify(x).slice(0, 200));
    }
    await ctx.close();
}

(async () => {
    const { chromium } = require('playwright-core');
    const user = makeUser();
    const ids = [];
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await live(browser, errors);
        await rundenspiel(browser, errors, user, ids);
        ok(!errors.length, 'no page errors', errors.join(' | '));
    } catch (e) {
        console.log('FAIL  crashed: ' + (e.stack || e));
        failed++;
    } finally {
        await browser.close();
        const rows = ids.filter(Boolean);
        if (rows.length) sql(`DELETE FROM async_games WHERE id IN (${rows.map(i => `'${i}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id = '${user.id}'`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
