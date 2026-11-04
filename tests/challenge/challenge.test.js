/**
 * Weekly challenge (F21: utils/challenge.js, routes/challenge.js, client/challenge.js) against
 * the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/challenge/challenge.test.js [http://localhost:3000]
 *
 * Unit: ISO weeks (also week 53 and the turn of the year), week bounds and the week's setup. A
 * starts this week's challenge from the multiplayer menu: a Rundenspiel alone against three KI
 * with the week's nation, ability, map and settings, A's turn, labelled in the list. Leaving,
 * cancelling and a self-made "challenge" through the
 * normal API are refused. A resigns – a loss with A's points; other results (wins) rank above it
 * (fewer rounds first, each player's best attempt once). A plays again (a new attempt) and starts
 * over (the running one is resigned); the page shows the result, the attempts, continue / start
 * over / play again. The weeks reach back to the oldest week anyone played (a result in
 * 2026-W40 is added); earlier and future weeks are refused. A past week: only attempts finished
 * within it are on its leaderboard; A plays it – practice, shown as "not ranked". One attempt at
 * a time, also across weeks: starting this week asks and resigns the past week's one. English.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    ok(JSON.stringify(a) === JSON.stringify(b) && civ && civ.abilities.some(x => x.k === a.ability) && a.mapKey === '0' && a.playerCount === 4 && a.kiCount === 3,
        'unit: the same setup for everybody, a real nation and ability', JSON.stringify(a));
    ok(JSON.stringify(a) !== JSON.stringify(c), 'unit: another week, another setup');
    const bw = id => { const x = C.boundsOf(id); return x && x.startsAt.toISOString().slice(0, 10) + '/' + x.endsAt.toISOString().slice(0, 10); };
    ok(bw('2026-W45') === '2026-11-02/2026-11-09' && bw('2026-W53') === '2026-12-28/2027-01-04' && bw('2027-W53') === null && bw('2026-W1') === null,
        'unit: the bounds of a week id');
}

(async () => {
    try { unit(); } catch (e) { ok(false, 'unit', e.stack); }
    const C_setup = w => require('../../utils/challenge').setupOf(w);
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    let week = null;
    try {
        const guest = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/challenge']).toString());
        week = guest.week.id;
        ok(guest.week.current && guest.setup && guest.me === null, 'guest: the week and its setup, no attempt', week);
        const oldest = sql(`SELECT coalesce(min("weekId"), '') FROM challenge_results`);
        const first = oldest && oldest < week ? oldest : week;
        const beforeFirst = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/challenge?week=2026-W01']).toString());
        ok(guest.weeks[guest.weeks.length - 1] === first && beforeFirst.error === 'Diese Woche gibt es nicht.', 'no weeks before the first one played', `${first} ${JSON.stringify(guest.weeks)}`);

        const A = makeUser(), B = makeUser(), C = makeUser();
        // C played 2026-W40: from now on the weeks reach back to it
        sql(`INSERT INTO challenge_results (id, "weekId", "userId", username, finished, won, rounds, points, "finishedAt", "createdAt", "updatedAt") VALUES
            (gen_random_uuid(), '2026-W40', '${C.id}', '${C.name}', true, false, 70, 5, '2026-10-01T12:00:00Z', now(), now())`);
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
        const rowOf = async id => { for (let i = 0; i < 40; i++) { const r = sql(`SELECT finished || ':' || won || ':' || coalesce(points, -1) || ':' || ("gameId" IS NOT NULL) FROM challenge_results WHERE "asyncId" = '${id}'`); if (/^true/.test(r)) return r; await sleep(500); } return null; };
        const row = await rowOf(v.id);
        ok(row && /^true:false:\d+:true$/.test(row), 'recorded: finished, no victory, points, the match', row);

        // other results: B wins in 30 rounds (and has a worse attempt), C wins in 25
        sql(`INSERT INTO challenge_results (id, "weekId", "userId", username, finished, won, rounds, points, "finishedAt", "createdAt", "updatedAt") VALUES
            (gen_random_uuid(), '${week}', '${B.id}', '${B.name}', true, true, 30, 40, now(), now(), now()),
            (gen_random_uuid(), '${week}', '${B.id}', '${B.name}', true, false, 50, 10, now(), now(), now()),
            (gen_random_uuid(), '${week}', '${C.id}', '${C.name}', true, true, 25, 20, now(), now(), now())`);
        const info = (await api('GET', '/api/challenge')).body;
        const order = info.list.filter(r => [A.id, B.id, C.id].includes(r.userId)).map(r => r.userId);
        ok(order.join() === [C.id, B.id, A.id].join() && info.list.find(r => r.userId === B.id).rounds === 30
            && info.me.ranked && info.me.ranked.rank === info.list.findIndex(r => r.userId === A.id) + 1 && info.me.attempts === 1 && !info.me.running && !info.me.best,
            'leaderboard: wins first, fewer rounds first, each player\'s best attempt once', JSON.stringify(info.list.map(r => [r.username, r.won, r.rounds, r.points])));

        // play again, then start over (one attempt at a time: the running one is resigned)
        const second = await api('POST', '/api/challenge/start', {});
        ok(second.body.asyncId && second.body.asyncId !== v.id && !second.body.running, 'play again: a new attempt', JSON.stringify(second.body));
        const third = await api('POST', '/api/challenge/start', {});
        ok(third.body.asyncId && third.body.asyncId !== second.body.asyncId, 'start over: another new attempt', JSON.stringify(third.body));
        const secondRow = await rowOf(second.body.asyncId);
        ok(secondRow && /^true:false:/.test(secondRow), 'starting over resigned the running attempt (a loss)', secondRow);
        const info2 = (await api('GET', '/api/challenge')).body;
        ok(info2.me.attempts === 2 && info2.me.running && info2.me.running.asyncId === third.body.asyncId && info2.me.running.week === week, 'A: two attempts finished, one running', JSON.stringify(info2.me));

        await p.evaluate(() => CHALLENGE.open());
        await p.waitForSelector('#ch-restart', { timeout: 10000 });
        ok(/Dein Ergebnis: Platz \d+ · \d+ Punkte, kein Sieg/.test(await p.textContent('#ch-result')) && await p.$(`.ch-table tr.rk-me[data-user="${A.id}"]`)
            && /2 Versuch\(e\) beendet/.test(await p.textContent('#ch-attempts')) && await p.$('#ch-continue') && !(await p.$('#ch-start')),
            'the page: own result, own row marked, attempts, continue and start over');
        await api('POST', `/api/async/${third.body.asyncId}/resign`);
        await rowOf(third.body.asyncId);
        await p.evaluate(() => CHALLENGE.open());
        await p.waitForSelector('#ch-start', { timeout: 10000 });
        ok(/Nochmal spielen/.test(await p.textContent('#ch-start')) && /3 Versuch\(e\) beendet/.test(await p.textContent('#ch-attempts')), 'the page: "Nochmal spielen" after a finished attempt');

        const prevWeek = info.week.previous;
        // a past week: playable, but its leaderboard is closed
        ok(prevWeek && info.weeks[0] === week && info.weeks.includes(prevWeek) && info.weeks[info.weeks.length - 1] === '2026-W40' && info.week.next === null, 'the weeks to pick, newest first', JSON.stringify(info.weeks));
        sql(`INSERT INTO challenge_results (id, "weekId", "userId", username, finished, won, rounds, points, "finishedAt", "createdAt", "updatedAt") VALUES
            (gen_random_uuid(), '${prevWeek}', '${C.id}', '${C.name}', true, false, 60, 15, now() - interval '7 days', now(), now()),
            (gen_random_uuid(), '${prevWeek}', '${B.id}', '${B.name}', true, true, 20, 50, now(), now(), now())`);
        const past = (await api('GET', '/api/challenge?week=' + prevWeek)).body;
        ok(!past.week.current && past.week.next === week && past.list.some(r => r.userId === C.id) && !past.list.some(r => r.userId === B.id),
            'a past week: only attempts finished within it count', JSON.stringify(past.list.map(r => r.username)));
        const ps = await api('POST', '/api/challenge/start', { week: prevWeek });
        const listed = (await api('GET', '/api/async')).body.mine.find(g => g.id === ps.body.asyncId);
        ok(ps.body.asyncId && listed && listed.config.challenge === prevWeek && listed.config.mapKey === C_setup(prevWeek).mapKey, 'a past week can be played, with its setup', JSON.stringify(ps.body));
        // one attempt at a time, also across weeks: this week's page shows the other one; starting asks and resigns it
        await p.evaluate(() => CHALLENGE.open());
        await p.waitForSelector('#ch-other', { timeout: 10000 });
        ok(/Dein Versuch in Woche \d+\/\d{4} läuft noch/.test(await p.textContent('#ch-other')) && await p.$('#ch-start') && !(await p.$('#ch-restart')), 'the page: the running attempt of another week');
        let asked = null;
        p.once('dialog', d => { asked = d.message(); d.accept(); });
        await p.click('#ch-start');
        await p.waitForFunction(([w, old]) => typeof ASYNC !== 'undefined' && ASYNC.view && ASYNC.view.config.challenge === w && ASYNC.view.id !== old, [week, ps.body.asyncId], { timeout: 20000 });
        const cur = await p.evaluate(() => ASYNC.view.id);
        const psRow = await rowOf(ps.body.asyncId);
        ok(asked && /wird aufgegeben und zählt als Niederlage/.test(asked) && psRow && /^true:false:/.test(psRow), 'starting this week asked and resigned the past week\'s attempt', asked);
        await api('POST', `/api/async/${cur}/resign`);
        await rowOf(cur);
        await p.evaluate(() => ASYNC.close());
        const past2 = (await api('GET', '/api/challenge?week=' + prevWeek)).body;
        ok(past2.me.attempts === 1 && !past2.me.ranked && past2.me.best && !past2.list.some(r => r.userId === A.id), 'its attempt is practice: best, not ranked', JSON.stringify(past2.me));
        await p.evaluate(() => CHALLENGE.open());
        await p.waitForSelector('#ch-week', { timeout: 10000 });
        await p.selectOption('#ch-week', prevWeek);
        await p.waitForSelector('#ch-closed', { timeout: 10000 });
        ok(/abgeschlossen/.test(await p.textContent('.ch-head')) && /Bester Versuch außer Wertung · \d+ Punkte, kein Sieg/.test(await p.textContent('#ch-best'))
            && /Nochmal spielen/.test(await p.textContent('#ch-start')) && !(await p.$('#ch-result')), 'the page: a past week, closed, own practice result, play again');
        const before = await api('GET', '/api/challenge?week=2026-W30'), future = await api('POST', '/api/challenge/start', { week: '2099-W01' });
        ok(before.body.error === 'Diese Woche gibt es nicht.' && future.body.error === 'Diese Woche hat noch nicht begonnen.', 'weeks before the first and future weeks are refused');

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
