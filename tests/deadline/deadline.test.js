/**
 * Turn deadline per Rundenspiel (F19: config.turnDays, async/service.js timeoutOf / reminderOf)
 * against the local docker setup, with the timeouts scaled down (7 "days" = 70 s):
 *
 *   ASYNC_TIMEOUT_MS=70000 ASYNC_REMINDER_MS=50000 ASYNC_SWEEP_MS=1000 \
 *     docker compose -f docker-compose.local.yml up -d
 *   npm i --no-save playwright-core
 *   ASYNC_TIMEOUT_MS=70000 node tests/deadline/deadline.test.js [http://localhost:3000]
 *
 * The host picks "1 Tag" in the form (the select, sent as turnDays); invalid values become 7.
 * Two games of the same two accounts wait for the host: the 1-day game's deadline in the list
 * is 1/7 of the 7-day one's, its seat goes to the KI after its 10 s while the 7-day game still
 * waits. The open games show "1 Tag pro Zug" and the filter "Mit Zeitlimit" finds it.
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
const TIMEOUT = Number(process.env.ASYNC_TIMEOUT_MS) || 70000;
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [], asyncIds = [];
function makeUser() {
    const name = 'ddl_' + crypto.randomBytes(3).toString('hex');
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const ua = makeUser(), ub = makeUser();
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub);

        // the form: "Zeit pro Zug" with 1, 3 and 7 days, sent as turnDays
        const pa = await ca.newPage();
        pa.on('pageerror', e => errors.push(`A: ${e.message}`));
        await pa.goto(BASE + '/');
        await pa.waitForFunction(() => typeof ASYNC !== 'undefined' && MP.user);
        await pa.evaluate(() => ASYNC.showCreate());
        await pa.waitForSelector('#mpa-days');
        const opts = await pa.$$eval('#mpa-days option', o => o.map(x => x.value + ':' + x.textContent).join(','));
        ok(opts === '1:1 Tag,3:3 Tage,7:7 Tage' && await pa.inputValue('#mpa-days') === '7', 'form: 1 / 3 / 7 days, 7 preselected', opts);
        await pa.selectOption('#mpa-days', '1');
        await pa.evaluate(() => { $('mpa-public').checked = true; ASYNC.readForm(); });
        ok(await pa.evaluate(() => ASYNC.form.turnDays) === 1, 'form: the choice is read');

        const create = async cfg => {
            const g = await (await ca.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0, isPublic: true, ...cfg }, civ: 'griechenland', ability: 'basis' } })).json();
            asyncIds.push(g.id);
            return g;
        };
        const bad = await create({ turnDays: 5 });
        const badInfo = await (await ca.request.get(BASE + '/api/async/' + bad.id)).json();
        ok(badInfo.config.turnDays === 7, 'an invalid value becomes 7 days', String(badInfo.config.turnDays));

        // the open games list of B shows the trait, the filter finds it
        const g1 = await create({ turnDays: 1 });
        const pb = await cb.newPage();
        pb.on('pageerror', e => errors.push(`B: ${e.message}`));
        await pb.goto(BASE + '/');
        await pb.waitForFunction(() => typeof ASYNC !== 'undefined' && MP.user);
        await pb.evaluate(() => { try { localStorage.removeItem('mp-open-filter'); } catch (_) { } MP.showLobby('open'); });
        await pb.waitForFunction(() => /1 Tag pro Zug/.test((document.getElementById('mph-open') || {}).textContent || ''), null, { timeout: 15000 })
            .then(() => ok(true, 'open games: "1 Tag pro Zug"'), () => ok(false, 'open games: "1 Tag pro Zug"'));
        const t = await pb.evaluate(() => {
            const list = MP._hubLast && MP._hubLast[1] ? MP._hubLast[1].open : [];
            const g = list.find(x => x.config && x.config.turnDays === 1);
            const tr = g && MP.lobbyTraits(g, false);
            return tr && { turn: tr.turn, match: MP.filterMatch(tr, { turn: 'timed' }), free: MP.filterMatch(tr, { turn: 'free' }) };
        });
        ok(t && t.turn === 'timed' && t.match && !t.free, 'filter "Mit Zeitlimit" matches a 1-day game', JSON.stringify(t));

        // both games start (B joins), A is on turn in both
        const g7 = await create({ turnDays: 7 });
        for (const g of [g1, g7]) await cb.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
        const mine = async () => (await (await ca.request.get(BASE + '/api/async')).json()).mine;
        const list = await mine();
        const l1 = list.find(g => g.id === g1.id), l7 = list.find(g => g.id === g7.id);
        const now = Date.now();
        const left1 = l1.deadline - now, left7 = l7.deadline - now;
        ok(l1.status === 'playing' && l1.yourTurn && Math.abs(left1 - TIMEOUT / 7) < 3000 && Math.abs(left7 - TIMEOUT) < 3000,
            'deadline: 1/7 of the 7-day game', `${Math.round(left1 / 1000)} s / ${Math.round(left7 / 1000)} s`);

        // after the 1-day time (10 s): the KI has A's seat there, the 7-day game still waits
        await sleep(TIMEOUT / 7 + 4000);
        const s1 = await (await cb.request.get(BASE + '/api/async/' + g1.id)).json();
        const s7 = await (await cb.request.get(BASE + '/api/async/' + g7.id)).json();
        const seatA = g => g.seats.find(s => s.civ === 'griechenland');
        ok(seatA(s1).replaced && seatA(s1).kind === 'ki', '1-day game: the KI took over A\'s seat', JSON.stringify(seatA(s1)));
        ok(!seatA(s7).replaced && seatA(s7).kind === 'human', '7-day game: still waits for A', JSON.stringify(seatA(s7)));
        const mail = execFileSync('docker', ['logs', '--since', '60s', CONTAINER]).toString();
        ok(/Du hast \d+ Stunden? lang nicht gespielt/.test(mail) || /Die KI hat deinen Platz übernommen/.test(mail), 'the takeover message names the short time',
            (mail.match(/Du hast [^.]* lang nicht gespielt/) || [''])[0]);
        await ca.close(); await cb.close();
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
