/**
 * The turn timer of live games (sockets/game.js, mp.js) against the local docker setup, with
 * turns shortened to 3 seconds:
 *
 *   TURN_TIMER_SCALE=0.05 docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/timer/turn-timer.test.js [http://localhost:3000]
 *
 * Two browser pages play a live game through the real game page: A hosts and sets "Zeit pro
 * Zug" to 1 minute (3 s here), B joins and never moves (large map, two easy KI empires). Checked: the lobby setting (an invalid
 * value is refused), the countdown in the HUD, B's turns end when the time is up, after three
 * of them the KI keeps B's seat (banner, player list) and B's turns no longer wait, "Ich bin
 * zurück" hands the seat back and the clock runs for B again. Without a limit there is no clock.
 *
 * The session cleanup (sessions.js) is checked directly: a running game is kept for 2 hours
 * without actions, a lobby for 10 minutes.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found. Restart the container without TURN_TIMER_SCALE afterwards.
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

/** Wait until fn() (in node) returns something truthy; null after `ms`. */
async function until(fn, ms = 15000, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn();
        if (v) return v;
        await sleep(step);
    }
    return null;
}

function cleanupRules() {
    const sessions = require('../../sessions');
    const config = require('../../config');
    const r = sessions.createSession({ mapKey: '0' }, { name: 'Cleanup', clientId: 'c1' });
    const s = sessions.getSession(r.sessionId);
    s.players[0].connected = true;
    s.status = 'playing';
    s.lastActivity = Date.now() - 11 * 60 * 1000;
    sessions.cleanup();
    ok(!!sessions.getSession(r.sessionId), 'cleanup: a running game is kept after 11 minutes without actions');
    s.lastActivity = Date.now() - config.SESSION_TIMEOUT_MS - 1000;
    sessions.cleanup();
    ok(!sessions.getSession(r.sessionId), 'cleanup: a running game is removed after 2 hours without actions');
    const l = sessions.createSession({ mapKey: '0' }, { name: 'Lobby', clientId: 'c2' });
    sessions.getSession(l.sessionId).players[0].connected = true;
    sessions.getSession(l.sessionId).lastActivity = Date.now() - 11 * 60 * 1000;
    sessions.cleanup();
    ok(!sessions.getSession(l.sessionId), 'cleanup: a lobby is removed after 10 minutes');
}

(async () => {
    cleanupRules();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        return page;
    };
    try {
        // ── A hosts, B joins (through the game page's own lobby) ─────────────────────────
        const a = await newPage('A'), b = await newPage('B');
        await a.evaluate(() => { MP.showLobby(); });
        await a.waitForFunction(() => typeof MP.setMode === 'function');
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-hn', 'TimerA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-set-turntime');
        const opts = await a.$$eval('#mp-set-turntime option', os => os.map(o => o.textContent.trim()));
        ok(opts.length === 6 && opts[0] === 'Unbegrenzt' && opts[1] === '1 Min.', 'lobby: "Zeit pro Zug" with 6 choices, default no limit', opts.join(', '));

        // the server refuses values that are not offered
        const bad = await a.evaluate(() => new Promise(r => MP.socket.emit('lobby:config', { turnTime: 77 }, () => setTimeout(() => r(MP.gameConfig.turnTime), 300))));
        ok(bad === 0, 'lobby: an invalid turn time becomes "no limit"', String(bad));

        await a.selectOption('#mp-set-turntime', '60');
        await a.waitForFunction(() => MP.gameConfig.turnTime === 60);
        ok(await a.isVisible('text=Ist die Zeit um, beendet die KI den Zug.'), 'lobby: the hint explains what happens');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));

        await b.evaluate(() => { MP.showLobby(); });
        await b.waitForFunction(() => typeof MP.setMode === 'function');
        await b.evaluate(() => MP.setMode('join'));
        await b.fill('#mp-c', cred.code);
        await b.fill('#mp-p', cred.pw);
        await b.fill('#mp-n', 'TimerB');
        await b.evaluate(() => MP.join());
        await b.waitForSelector('#mp-p-civ-1');
        await b.selectOption('#mp-p-civ-1', 'russland');
        await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        // the large map with two easy KI empires: a passive A survives long enough for the checks
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 2, turnTime: 60, mapKey: 'gross', difficulty: 'leicht' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4);
        await a.evaluate(() => MP.startGame());
        await a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && document.getElementById('screen-game').classList.contains('show'));
        await b.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && document.getElementById('screen-game').classList.contains('show'));

        const info = p => p.evaluate(() => ({
            cur: S.cur, me: MP.playerIndex, round: S.round, over: !!S.over,
            clock: document.getElementById('mp-turn-clock').hidden ? null : document.getElementById('mp-turn-clock').textContent,
            afk: MP.isAfk(), banner: !document.getElementById('mp-afk-banner').hidden,
            tag: (document.getElementById('mp-players-content') || {}).textContent || '',
        }));
        const first = await until(async () => { const i = await info(a); return i.clock ? i : null; }, 10000);
        ok(first && /^⏱ 0:0[1-3]$/.test(first.clock), 'HUD: the countdown is shown', first && first.clock);

        // A moves at once whenever it is A's turn; B never moves
        let aTurns = 0;
        const driver = setInterval(() => {
            a.evaluate(() => {
                if (!S || S.over || !MP.isMyTurn() || MP._ending === S.round + ':' + S.cur) return false;
                MP._ending = S.round + ':' + S.cur;
                if (typeof closeModal === 'function') closeModal();
                MP.sendAction({ type: 'endTurn' });
                return true;
            }).then(r => { if (r) aTurns++; }).catch(() => { });
        }, 150);

        // B: three turns time out, then the KI keeps the seat
        const timeouts = [];
        await b.exposeFunction('__timeout', d => timeouts.push(d));
        await b.evaluate(() => MP.socket.on('turn:timeout', d => window.__timeout(d)));
        const t0 = Date.now();
        await until(() => timeouts.length >= 3, 30000);
        ok(timeouts.length >= 3, 'B: three turns ended by the timer', `${timeouts.length} in ${Math.round((Date.now() - t0) / 1000)} s`);
        ok(timeouts[0] && timeouts[0].afk === false && timeouts[2] && timeouts[2].afk === true, 'B: the third one hands the seat to the KI', JSON.stringify(timeouts.slice(0, 3)));
        const bAfk = await until(async () => { const i = await info(b); return i.banner && i.afk ? i : null; }, 5000);
        ok(!!bAfk, 'B: banner "Die KI spielt für dich" is shown');
        const aView = await until(async () => { const i = await info(a); return /KI \(abwesend\)/.test(i.tag) ? i : null; }, 5000);
        ok(!!aView, 'A: the player list shows B as "KI (abwesend)"');

        // the KI plays B's turns at once now – A gets turn after turn without waiting
        const before = aTurns, t1 = Date.now();
        await until(() => aTurns >= before + 2, 8000);
        const per = (Date.now() - t1) / Math.max(1, aTurns - before);
        ok(aTurns >= before + 2 && per < 2500, 'B absent: the game no longer waits for B', `${aTurns - before} turns of A, ${Math.round(per)} ms each`);
        ok(timeouts.length === 3, 'B absent: no further timeouts', String(timeouts.length));

        // B is back (A keeps moving at once) – B's turns wait for B and run the clock again
        await b.click('#mp-afk-btn');
        const back = await until(async () => { const i = await info(b); return !i.afk && !i.banner ? i : null; }, 5000);
        ok(!!back, 'B: "Ich bin zurück" hands the seat back');
        const bTurn = await until(async () => { const i = await info(b); return i.cur === i.me && i.clock ? i : null; }, 8000);
        ok(!!bTurn, 'B: it is B\'s own turn again, with the clock running', bTurn && bTurn.clock);
        await until(() => timeouts.length >= 4, 8000);
        ok(timeouts.length === 4 && timeouts[3].afk === false, 'B: the timer ends B\'s turn again (counted from zero)', JSON.stringify(timeouts[3]));
        clearInterval(driver);

        // ── no limit: no clock ────────────────────────────────────────────────────────────
        const c = await newPage('C');
        const noLimit = await c.evaluate(async () => {
            const clientId = 'timer-nolimit-' + Math.random().toString(36).slice(2);
            const res = await fetch('/api/sessions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: { mapKey: '0', playerCount: 2 }, host: { name: 'NoLimit', clientId, civ: 'griechenland' } }),
            });
            const s = await res.json();
            const sock = io({ transports: ['websocket'] });
            const emit = (ev, data) => new Promise(r => sock.emit(ev, data, r));
            const started = new Promise(r => sock.on('game:start', r));
            await emit('session:connect', { sessionId: s.sessionId, password: s.password, clientId });
            await emit('game:start', {});
            const g = await started;
            sock.disconnect();
            return { turn: g.turn };
        });
        ok(noLimit.turn === null, 'no limit: the server sends no clock', JSON.stringify(noLimit.turn));

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
