/**
 * "Since your last turn" (utils/summary.js, mp.js, sockets/game.js, async/*) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/summary/summary.test.js [http://localhost:3000]
 *
 * 1. The summary itself, with the engine: marks at the end of a human's turn, the next turn's
 *    summary (log since then, score changes), a city taken / gone, the e-mail and push texts.
 * 2. Live game (A and B through the game page, one KI): A's second turn opens with the popup
 *    before the game's own turn-start dialogs, which follow when it closes; the HUD button opens
 *    it again; "automatisch zeigen" off keeps it closed; a reconnect brings the summary back;
 *    the other player and spectators get none.
 * 3. Rundenspiel (two test accounts): after B's turn, A's "your turn" e-mail (written to the log
 *    locally) carries the summary; opening the game shows the popup.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
 * download); set HOCHCIV_BROWSER to its path if it is not found.
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
function makeUser(notifyEmail) {
    const name = 'sum_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: ${!!notifyEmail} })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

function unit() {
    const engine = require('../../engine-adapter');
    const Summary = require('../../utils/summary');
    const S = engine.createGame({
        gameConfig: { mapKey: 'gross', playerCount: 3, seed: 3, wonders: true },
        players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'ki', kiLevel: 'mittel' }, { civ: 'russland', kind: 'ki', kiLevel: 'mittel' }]
            .map(p => ({ ability: 'basis', ...p })),
    });
    const E = engine.getEngine();
    const human = S.players.findIndex(p => p.kind === 'human');
    let marks = Summary.track(null, E, S);
    // the human's first turn: no summary yet
    ok(Summary.summarize(E, S, marks, human) === null, 'unit: no summary before a first turn ended');
    // play until the human's turn comes back once (the KI plays the human seat too)
    const kind = S.players[human].kind;
    S.players[human].kind = 'ki';
    let guard = 0, seenHumanEnd = false, sum = null;
    while (guard++ < 40 && !S.over) {
        const wasHuman = S.cur === human;
        engine.autoTurn(S);
        if (!E.finishTurn(S)) E.advanceTurn(S);
        S.players[human].kind = kind;          // humans are marked by kind
        marks = Summary.track(marks, E, S);
        if (wasHuman) seenHumanEnd = true;
        if (seenHumanEnd && S.cur === human) { sum = Summary.summarize(E, S, marks, human); break; }
        S.players[human].kind = 'ki';
    }
    S.players[human].kind = kind;
    ok(!!marks[human] && sum, 'unit: the human\'s turn ended → mark; next turn → summary');
    ok(sum && sum.me === human && sum.key === `${S.round}:${S.cur}` && sum.since <= sum.round, 'unit: summary of this turn', sum && `${sum.since}→${sum.round}`);
    ok(sum && sum.log.length > 0 && sum.log.every(e => e.seq > marks[human].seq), 'unit: the log since the mark', sum && String(sum.log.length));
    const snap = require('../../utils/stats').snapshot(E, S);
    ok(sum && sum.players.every(p => p.ds === snap.p[p.pi].s - marks[human].snap.p[p.pi].s), 'unit: score changes against the mark');

    // a city taken by player 1, another one gone
    const other = (human + 1) % 3;
    const mine = S.cities.filter(c => c.owner === human);
    mine[0].owner = other;
    const gone = { id: 99999, owner: human, r: 0, c: 0, pop: 1 };
    marks[human].owners[gone.id] = human;
    const s2 = Summary.summarize(E, S, marks, human);
    ok(s2.lost.some(l => l.by === other && l.n === 1) && s2.lost.some(l => l.by === -1 && l.n === 1), 'unit: a city taken and one gone', JSON.stringify(s2.lost));
    const t = Summary.text(s2, i => 'Reich' + i, k => k);
    ok(/Reich\d hat dir eine Stadt abgenommen\./.test(t.summary) && /Du hast eine Stadt verloren\./.test(t.summary) && /Punkte: .*du [+-]\d+/.test(t.summary), 'unit: e-mail text', t.summary.split('\n').join(' | '));
    ok(t.short.length < 300 && /Punkte seit deinem Zug/.test(t.short), 'unit: push text, one line', t.short);
    mine[0].owner = human;
}

async function live(browser, errors) {
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined');
        await page.evaluate(() => { localStorage.removeItem('hochciv.summary.auto'); MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage('A'), b = await newPage('B');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', 'SumA');
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.selectOption('#mp-p-civ-0', 'griechenland');
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password, sessionId: MP.sessionId }));
    await b.evaluate(() => MP.setMode('join'));
    await b.fill('#mp-c', cred.code); await b.fill('#mp-p', cred.pw); await b.fill('#mp-n', 'SumB');
    await b.evaluate(() => MP.join());
    await b.waitForSelector('#mp-p-civ-1');
    await b.selectOption('#mp-p-civ-1', 'russland');
    await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 1, mapKey: 'gross', difficulty: 'leicht' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
    // a spectator
    const v = await newPage('V');
    await v.evaluate(([c, p]) => MP.watch(c, p, 'SumV'), [cred.code, cred.pw]);
    await v.waitForFunction(() => MP.spectator);
    await a.evaluate(() => MP.startGame());
    for (const p of [a, b, v]) await p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'));

    const title = p => p.evaluate(() => document.getElementById('overlay').classList.contains('show') ? document.getElementById('ov-title').textContent : null);
    // every human ends their turn; A watches for its popup
    const endTurn = p => p.evaluate(() => {
        if (!S || S.over || !MP.isMyTurn() || MP._e === S.round + ':' + S.cur) return false;
        if (document.getElementById('ov-title').textContent === 'Seit deinem letzten Zug' && document.getElementById('overlay').classList.contains('show')) return false;
        MP._e = S.round + ':' + S.cur; closeModal(); MP.sendAction({ type: 'endTurn' }); return true;
    });
    const firstA = await until(() => a.evaluate(() => MP.isMyTurn() && S.round + ':' + S.cur));
    ok(!!firstA && (await a.evaluate(() => !MP.summary)), 'live: A\'s first turn has no summary', firstA);
    await endTurn(a);
    const bDriver = setInterval(() => endTurn(b).catch(() => { }), 200);
    const popup = await until(async () => (await title(a)) === 'Seit deinem letzten Zug', 30000);
    clearInterval(bDriver);
    ok(!!popup, 'live: A\'s next turn opens with "Seit deinem letzten Zug"');
    const body = await a.evaluate(() => ({
        rows: document.querySelectorAll('.mp-sum-table tr').length - 1,
        log: document.querySelectorAll('.mp-sum-log .logline').length,
        span: document.querySelector('#ov-body .sub').textContent,
        btn: !document.getElementById('mp-summary-btn').hidden,
        pending: typeof MP._afterSummary === 'function',
    }));
    ok(body.rows === 3 && body.log > 0, 'live: a row per empire, the events since', JSON.stringify(body));
    ok(body.btn && body.pending, 'live: HUD button shown; the turn-start dialogs wait for the popup');
    await a.click('#mp-sum-go');
    await sleep(300);
    ok(await a.evaluate(() => MP._afterSummary === null), 'live: closing it lets the turn begin');
    ok(await b.evaluate(() => !MP.summary || MP.summary.me === MP.playerIndex), 'live: B has no summary of A\'s turn');
    ok(await v.evaluate(() => document.getElementById('mp-summary-btn').hidden), 'live: spectators get no summary');

    // the HUD button opens it again
    await a.evaluate(() => closeModal());
    await a.click('#mp-summary-btn');
    ok((await title(a)) === 'Seit deinem letzten Zug', 'live: 📋 opens it again');

    // a reconnect in the middle of the turn brings it back
    const clientId = await a.evaluate(() => MP.getClientId());
    const again = await a.evaluate(async ([sessionId, password, clientId]) => {
        const sock = io({ transports: ['websocket'] });
        const got = new Promise(r => sock.on('game:start', r));
        await new Promise(r => sock.emit('session:connect', { sessionId, password, clientId }, r));
        const g = await got;
        sock.disconnect();
        return g.summary && g.summary.me === g.yourIndex;
    }, [cred.sessionId, cred.pw, clientId]);
    ok(again, 'live: a reconnect during the turn gets the summary again');
    // the reconnect took A's seat over – A's page reconnects
    await a.reload();
    await a.waitForFunction(() => typeof MP !== 'undefined');
    await b.context().close(); await v.context().close(); await a.context().close();

    // automatic popup off
    const c = await newPage('C');
    await c.evaluate(() => localStorage.setItem('hochciv.summary.auto', '0'));
    await c.evaluate(() => MP.setMode('host'));
    await c.fill('#mp-hn', 'SumC');
    await c.evaluate(() => MP.host());
    await c.waitForSelector('#mp-p-civ-0');
    await c.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 1, mapKey: 'gross', difficulty: 'leicht' }));
    await c.waitForFunction(() => MP.gameConfig.playerCount === 2);
    await c.evaluate(() => MP.startGame());
    await c.waitForFunction(() => typeof S !== 'undefined' && S && MP.isMyTurn());
    await c.evaluate(() => { closeModal(); MP.sendAction({ type: 'endTurn' }); });
    const next = await until(() => c.evaluate(() => MP.isMyTurn() && MP.summary && MP.summary.key === S.round + ':' + S.cur), 20000);
    await sleep(500);
    ok(next && (await title(c)) !== 'Seit deinem letzten Zug' && await c.evaluate(() => !document.getElementById('mp-summary-btn').hidden),
        'live: "automatisch zeigen" off – no popup, the button stays');
    await c.context().close();
}

async function rundenspiel(browser, errors) {
    const ua = makeUser(true), ub = makeUser(false);
    let gameId = null;
    try {
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub);
        const g = await (await ca.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0 }, civ: 'griechenland', ability: 'basis' } })).json();
        gameId = g.id;
        await cb.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
        // both move without having the game open (so the e-mail goes out)
        const act = async ctx => {
            const page = await ctx.newPage();
            await page.goto(BASE + '/');
            await page.waitForFunction(() => typeof MP !== 'undefined');
            const r = await page.evaluate(id => MP.fetchUser().then(() => MP.connect()).then(() =>
                new Promise(res => MP.socket.emit('async:action', { id, type: 'endTurn' }, res))), g.id);
            await page.close();
            return r;
        };
        const since = new Date().toISOString();
        const r1 = await act(ca);
        const r2 = await act(cb);
        ok(r1.ok && r2.ok, 'Rundenspiel: A and B end their turns', JSON.stringify([r1, r2]));
        await sleep(1500);
        const log = execFileSync('docker', ['logs', '--since', since, CONTAINER]).toString();
        const mail = log.split('--- SIMULATED EMAIL ---').find(m => m.includes(`To: ${ua.name}@example.com`) && m.includes('Du bist am Zug'));
        ok(!!mail && /Seit deinem letzten Zug:/.test(mail) && /Punkte: .*du [+-]\d+/.test(mail), 'Rundenspiel: A\'s "your turn" e-mail carries the summary',
            mail ? mail.split('\n').filter(l => /Seit|•/.test(l)).join(' | ') : 'no mail');

        const page = await ca.newPage();
        page.on('pageerror', e => errors.push(`RA: ${e.message}`));
        await page.goto(BASE + '/?async=' + g.id);
        const pop = await until(() => page.evaluate(() => document.getElementById('overlay').classList.contains('show') && document.getElementById('ov-title').textContent), 20000);
        ok(pop === 'Seit deinem letzten Zug', 'Rundenspiel: opening the game shows the popup', String(pop));
        await ca.close(); await cb.close();
    } finally {
        if (gameId) sql(`DELETE FROM async_games WHERE id = '${gameId}'`);
        sql(`DELETE FROM replay_frames WHERE "gameKey" NOT IN (SELECT id FROM async_games)`);
        sql(`DELETE FROM users WHERE id IN ('${ua.id}', '${ub.id}')`);
    }
}

(async () => {
    unit();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await live(browser, errors);
        await rundenspiel(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
