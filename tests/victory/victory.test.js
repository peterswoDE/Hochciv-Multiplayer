/**
 * The end of a game (client/victory.js, the gameOver() patch in mp.js) and the last click on an
 * ended Rundenspiel (async/service.js: list().ended, open() marks endSeen) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/victory/victory.test.js [http://localhost:3000]
 *
 * A Rundenspiel duel of two accounts ends when D resigns. Both still find it in their game list
 * ("Beendet – wer hat gewonnen?"), C as won, D as lost. C opens it: full screen "<C> gewinnt das
 * Spiel" with "Sieg!", gone after about three seconds, then the end screen. From then on it is
 * no longer in C's list, and opening it again does not play the animation again; D still has it.
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
    const name = 'vic_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, termsAcceptedAt: new Date() })
            .then(u => { console.log(u.id); process.exit(0); })`);
    const u = { name, id };
    users.push(u);
    return u;
}
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

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const uc = makeUser(), ud = makeUser();
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            return ctx;
        };
        const cc = await login(uc), cd = await login(ud);
        const g = await (await cc.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0 }, civ: 'griechenland', ability: 'basis' } })).json();
        asyncIds.push(g.id);
        await cd.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
        await until(async () => (await (await cc.request.get(BASE + '/api/async/' + g.id)).json()).status === 'playing', 10000, 300);
        const r = await (await cd.request.post(BASE + `/api/async/${g.id}/resign`)).json();
        ok(r.ok, 'D resigns the duel', JSON.stringify(r));
        await until(async () => (await (await cc.request.get(BASE + '/api/async/' + g.id)).json()).status === 'finished', 15000, 300);

        const list = async ctx => (await (await ctx.request.get(BASE + '/api/async')).json());
        const lc = await list(cc), ld = await list(cd);
        const ec = (lc.ended || []).find(x => x.id === g.id), ed = (ld.ended || []).find(x => x.id === g.id);
        ok(ec && ec.won === true, 'C\'s list: the ended game, won', JSON.stringify(ec && { won: ec.won, status: ec.status }));
        ok(ed && ed.won === false, 'D\'s list: the ended game, lost', JSON.stringify(ed && { won: ed.won }));
        ok(!lc.mine.some(x => x.id === g.id), 'not among the running games');

        // D's menu: the row with "Ergebnis ansehen"
        const pd = await cd.newPage();
        pd.on('pageerror', e => errors.push(`D: ${e.message}`));
        await pd.goto(BASE + '/');
        await pd.waitForFunction(() => typeof MP !== 'undefined' && MP.user);
        await pd.evaluate(() => MP.showLobby());
        const row = await pd.waitForSelector('.mph-ended .mpa-row.ended.lost', { timeout: 15000 }).catch(() => null);
        ok(!!row, 'D\'s menu: "Beendet" with the lost game');
        const btn = row && await row.$eval('button.primary', b => b.textContent).catch(() => '');
        ok(/Ergebnis ansehen/.test(btn || ''), 'the button says "Ergebnis ansehen"', btn);
        const badge = await pd.evaluate(() => ASYNC.badgeCount);
        ok(badge >= 1, 'the Multiplayer badge counts it', String(badge));

        // C opens it: the animation, then the end screen
        const pc = await cc.newPage();
        pc.on('pageerror', e => errors.push(`C: ${e.message}`));
        await pc.goto(BASE + '/?async=' + g.id);
        await pc.waitForSelector('#victory', { timeout: 20000 });
        const shown = await pc.evaluate(() => ({
            name: document.querySelector('#victory .v-name').textContent,
            line: document.querySelector('#victory .v-line').textContent,
            me: (document.querySelector('#victory .v-me') || {}).className || '',
            full: (() => { const r = document.getElementById('victory').getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; })(),
        }));
        ok(shown.name === uc.name && shown.line === 'gewinnt das Spiel', 'full screen: "<C> gewinnt das Spiel"', JSON.stringify(shown));
        ok(/won/.test(shown.me), 'with "Sieg!" for the winner', shown.me);
        ok(shown.full, 'covers the whole screen');
        const t0 = Date.now();
        await pc.waitForSelector('#victory', { state: 'detached', timeout: 8000 });
        const took = Date.now() - t0;
        ok(took > 2000 && took < 5000, 'gone after about three seconds', took + ' ms');
        ok(await pc.isVisible('#ov-body'), 'then the end screen');

        const lc2 = await list(cc);
        ok(!(lc2.ended || []).some(x => x.id === g.id), 'after the last click: no longer in C\'s list');
        ok(((await list(cd)).ended || []).some(x => x.id === g.id), 'D still has it');

        await pc.goto(BASE + '/?async=' + g.id);          // the page drops ?async= from its address
        await pc.waitForFunction(() => typeof S !== 'undefined' && S && S.over, null, { timeout: 20000 });
        await sleep(800);
        ok(!(await pc.$('#victory')), 'opened again: no second animation');
        await cc.close(); await cd.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) {
            sql(`DELETE FROM games WHERE participants::text LIKE '%${u.name}%'`);
            sql(`DELETE FROM users WHERE id = '${u.id}'`);
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
