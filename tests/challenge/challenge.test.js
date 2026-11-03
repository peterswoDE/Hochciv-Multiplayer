/**
 * Weekly challenge (F21: utils/challenge.js, routes/challenge.js, client/challenge.js) against
 * the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/challenge/challenge.test.js [http://localhost:3000]
 *
 * Unit: ISO weeks (also week 53 and the turn of the year) and the week's setup. A starts this
 * week's challenge from the multiplayer menu: a Rundenspiel alone against three KI with the
 * week's nation, ability, map and settings, A's turn, labelled in the list. One attempt: a second
 * start returns the running game; leaving, cancelling and a self-made "challenge" through the
 * normal API are refused. A resigns – a loss with A's points; two other results (wins) rank
 * above it (fewer rounds first). After that A can't start again; the page shows A's result, the
 * leaderboard and the previous week. English.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').filter(l => !/Engine Adapter/.test(l)).join('\n');
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
function makeUser() {
    const name = 'chl_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false })
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

function unit() {
    const C = require('../../utils/challenge');
    const w = d => C.weekOf(new Date(d + 'T12:00:00Z'));
    ok(w('2026-11-03').id === '2026-W45' && w('2026-11-03').startsAt.toISOString() === '2026-11-02T00:00:00.000Z' && w('2026-11-08').id === '2026-W45' && w('2026-11-09').id === '2026-W46',
        'unit: ISO week, Monday to Sunday');
    ok(w('2027-01-01').id === '2026-W53' && w('2026-01-01').id === '2026-W01' && w('2021-01-03').id === '2020-W53', 'unit: week 53 and the turn of the year');
    const a = C.setupOf('2026-W45'), b = C.setupOf('2026-W45'), c = C.setupOf('2026-W46');
    const civs = require('../../engine-adapter').engineConst('CIVS');
    const civ = civs.find(x => x.k === a.civ);
    ok(JSON.stringify(a) === JSON.stringify(b) && civ && civ.abilities.some(x => x.k === a.ability) && ['0', 'gross'].includes(a.mapKey) && a.playerCount === 4 && a.kiCount === 3,
        'unit: the same setup for everybody, a real nation and ability', JSON.stringify(a));
    ok(JSON.stringify(a) !== JSON.stringify(c), 'unit: another week, another setup');
}

(async () => {
    try { unit(); } catch (e) { ok(false, 'unit', e.stack); }
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    let week = null;
    try {
        const guest = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/challenge']).toString());
        week = guest.week.id;
        ok(guest.week.current && guest.setup && guest.me === null, 'guest: the week and its setup, no attempt', week);

        const A = makeUser(), B = makeUser(), C = makeUser();
        const ctx = await browser.newContext({ locale: 'de-DE' });
        await ctx.request.post(BASE + '/api/auth/login', { data: { username: A.name, password: PASSWORD } });
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`A: ${e.message}`));
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof CHALLENGE !== 'undefined' && MP.user);
        await p.evaluate(() => MP.showLobby());
        await p.waitForSelector('.mph-challenge');
        await p.click('.mph-challenge');
        await p.waitForSelector('#ch-start', { timeout: 10000 });
        const text = await p.textContent('#ch-box');
        ok(/Deine Nation/.test(text) && /3 KI/.test(text) && /Woche \d+\/\d{4}/.test(text), 'the page: setup, opponents, week', text.replace(/\s+/g, ' ').slice(0, 160));
        await p.click('#ch-start');
        await p.waitForFunction(() => typeof ASYNC !== 'undefined' && ASYNC.view && ASYNC.view.config && ASYNC.view.config.challenge && typeof S !== 'undefined' && S, null, { timeout: 20000 });
        const v = await p.evaluate(() => ({ cfg: ASYNC.view.config, seats: ASYNC.view.seats.map(s => s.kind + ':' + s.civ + ':' + s.ability), my: MP.isMyTurn(), id: ASYNC.view.id, status: ASYNC.view.status }));
        const mine = v.seats.find(s => s.startsWith('human:'));
        ok(v.status === 'playing' && v.my && v.cfg.challenge === week && !v.cfg.isPublic && !v.cfg.ranked && v.seats.filter(s => s.startsWith('ki:')).length === 3
            && mine === `human:${guest.setup.civ}:${guest.setup.ability}` && v.cfg.mapKey === guest.setup.mapKey && v.cfg.difficulty === guest.setup.difficulty,
            'started: alone against three KI with the week\'s setup, A\'s turn', JSON.stringify({ seats: v.seats, map: v.cfg.mapKey }));
        const api = (method, path, body) => p.evaluate(async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() }; }, [method, path, body]);
        const again = await api('POST', '/api/challenge/start');
        ok(again.body.asyncId === v.id && again.body.running, 'a second start returns the running attempt');
        const leave = await api('POST', `/api/async/${v.id}/leave`), cancel = await api('POST', `/api/async/${v.id}/cancel`);
        ok(leave.body.error === 'Die Wochen-Challenge kann man nur aufgeben.' && cancel.body.error === 'Die Wochen-Challenge kann man nur aufgeben.', 'leaving and cancelling are refused');
        const fake = await api('POST', '/api/async', { config: { mapKey: '0', civMode: 'fixed', playerCount: 4, kiCount: 3, challenge: week }, civ: 'griechenland', ability: 'basis', challenge: week });
        ok(fake.body.error === 'Ein Rundenspiel braucht mindestens zwei Menschen.', 'no self-made challenge through the normal API', fake.body.error);
        const list = await api('GET', '/api/async');
        ok(list.body.mine.some(g => g.id === v.id && g.config.challenge === week), 'listed with the Rundenspiele');
        await p.evaluate(() => { ASYNC.close(); MP.showLobby('running'); });
        await p.waitForFunction(() => /📅 Wochen-Challenge/.test((document.getElementById('mph-running') || {}).textContent || ''), null, { timeout: 10000 })
            .then(() => ok(true, 'the list labels it "📅 Wochen-Challenge"'), () => ok(false, 'the list labels it "📅 Wochen-Challenge"'));

        // A resigns: a loss with A's points
        const res = await api('POST', `/api/async/${v.id}/resign`);
        ok(res.body.ok, 'A resigns');
        const row = await (async () => { for (let i = 0; i < 40; i++) { const r = sql(`SELECT finished || ':' || won || ':' || coalesce(points, -1) || ':' || ("gameId" IS NOT NULL) FROM challenge_results WHERE "weekId" = '${week}' AND "userId" = '${A.id}'`); if (/^true/.test(r)) return r; await new Promise(x => setTimeout(x, 500)); } return null; })();
        ok(row && /^true:false:\d+:true$/.test(row), 'recorded: finished, no victory, points, the match', row);

        // two other results: wins in 30 and 25 rounds
        sql(`INSERT INTO challenge_results (id, "weekId", "userId", username, finished, won, rounds, points, "finishedAt", "createdAt", "updatedAt") VALUES
            (gen_random_uuid(), '${week}', '${B.id}', '${B.name}', true, true, 30, 40, now(), now(), now()),
            (gen_random_uuid(), '${week}', '${C.id}', '${C.name}', true, true, 25, 20, now(), now(), now())`);
        const info = (await api('GET', '/api/challenge')).body;
        const order = info.list.filter(r => [A.id, B.id, C.id].includes(r.userId)).map(r => r.userId);
        ok(order.join() === [C.id, B.id, A.id].join() && info.me.status === 'finished' && info.me.rank === info.list.findIndex(r => r.userId === A.id) + 1,
            'leaderboard: wins first, fewer rounds first, then the loss', JSON.stringify(info.list.map(r => [r.username, r.won, r.rounds, r.points])));
        const third = await api('POST', '/api/challenge/start');
        ok(third.body.error === 'Du hast die Challenge dieser Woche schon gespielt.', 'one attempt per week', third.body.error);

        await p.evaluate(() => CHALLENGE.open());
        await p.waitForSelector('#ch-result', { timeout: 10000 });
        ok(/Dein Ergebnis: Platz \d+ · \d+ Punkte, kein Sieg/.test(await p.textContent('#ch-result')) && await p.$(`.ch-table tr.rk-me[data-user="${A.id}"]`), 'the page: own result, own row marked');
        await p.click('.ch-nav a');
        await p.waitForFunction(() => /abgeschlossen/.test(document.getElementById('ch-box').textContent), null, { timeout: 10000 })
            .then(() => ok(true, 'the previous week'), () => ok(false, 'the previous week'));

        // English
        const pe = await (await browser.newContext({ locale: 'en-US' })).newPage();
        pe.on('pageerror', e => errors.push(`E: ${e.message}`));
        await pe.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await pe.goto(BASE + '/');
        await pe.waitForFunction(() => typeof CHALLENGE !== 'undefined');
        await pe.evaluate(() => CHALLENGE.open());
        await pe.waitForFunction(() => /Your nation/.test((document.getElementById('ch-box') || {}).textContent || ''), null, { timeout: 10000 });
        const et = await pe.textContent('#ch-box');
        ok(/Opponents/.test(et) && /needs an account/.test(et) && !/Deine|Gegner|Woche/.test(et), 'English', et.replace(/\s+/g, ' ').slice(0, 140));
        await ctx.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const u of users) {
            sql(`DELETE FROM challenge_results WHERE "userId" = '${u.id}'`);
            sql(`DELETE FROM async_games WHERE "hostUserId" = '${u.id}'`);
            sql(`DELETE FROM games WHERE participants::text LIKE '%${u.id}%'`);
            sql(`DELETE FROM users WHERE id = '${u.id}'`);
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
