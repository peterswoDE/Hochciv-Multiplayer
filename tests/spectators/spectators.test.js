/**
 * Spectator mode (sessions.js addSpectator, sockets/game.js, mp.js, async/service.js) against the
 * local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/spectators/spectators.test.js [http://localhost:3000]
 *
 * Live game: A hosts a public lobby with one KI seat, V1 watches the lobby with code and password,
 * then the game starts. Checked: V1 sees the game from the start without a seat (actions, end
 * of turn and chat refused, the chat form hidden), the player list shows the spectator count,
 * the public list offers the running game with "Zuschauen", V2 watches from there mid-game,
 * a rematch keeps the spectators watching. The limit of 20 spectators and the hand-over to a
 * free seat are checked on the session store directly.
 *
 * Rundenspiel: a public game of two test accounts is listed for a third account under
 * "Laufende öffentliche Spiele", opens read-only (no seat, actions and chat refused), a private
 * one is refused. Test accounts and games are deleted afterwards.
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
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 200) {
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
function makeUser() {
    const name = 'spec_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);
const inGame = p => p.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
    && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 });

async function live(browser, errors) {
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined');
        await page.evaluate(() => { MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage('A'), v1 = await newPage('V1');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', 'SpecHost');
    await a.check('#mp-is-public');
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 1, mapKey: 'gross' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password, sessionId: MP.sessionId }));

    // V1 watches the lobby (join form → "Zuschauen")
    await v1.evaluate(() => MP.setMode('join'));
    await v1.fill('#mp-c', cred.code);
    await v1.fill('#mp-p', cred.pw);
    await v1.fill('#mp-n', 'Watcher1');
    await v1.click('text=Zuschauen');
    await v1.waitForSelector('text=Du schaust zu');
    ok(await v1.evaluate(() => MP.spectator && MP.lobbyIndex === null), 'lobby: V1 watches without a seat');
    ok((await a.evaluate(() => MP.players.length)) === 1, 'lobby: V1 takes no seat');

    await a.evaluate(() => MP.startGame());
    await Promise.all([inGame(a), inGame(v1)]);
    const v = await v1.evaluate(() => ({ me: MP.playerIndex, waiting: document.body.classList.contains('mp-waiting'), toast: document.querySelector('.mp-waiting-toast').textContent, cred: document.getElementById('mp-cred-box').textContent }));
    ok(v.me === -1 && v.waiting && v.toast === 'Du schaust zu', 'game: V1 sees the game from the start, as a spectator', JSON.stringify(v));
    ok(/Zuschauer/.test(v.cred), 'game: the HUD says "Zuschauer"', v.cred);
    const title = await until(() => a.evaluate(() => /👁 1/.test(document.getElementById('mp-players-title').textContent) && document.getElementById('mp-players-title').textContent));
    ok(!!title, 'game: the players see "👁 1"', title);

    // nothing works for a spectator
    const act = await emit(v1, 'action', { type: 'endTurn' });
    ok(act.error === 'Nicht verbunden.', 'server: a spectator\'s action is refused', act.error);
    const msg = await emit(v1, 'chat:send', { kind: 'text', text: 'hi' });
    ok(msg.error === 'Zuschauer können nicht schreiben.', 'server: a spectator can\'t write', msg.error);
    const local = await v1.evaluate(() => buyPower(S, S.cur, 1));
    ok(local === 'Du schaust nur zu.', 'client: game actions say "Du schaust nur zu."', local);
    await v1.evaluate(() => closeModal());
    await v1.click('#mp-chat');
    ok(await v1.isHidden('#mp-chat-form'), 'client: the chat can be read, not written');

    // V2 finds the running game in the public list and watches mid-game
    const v2 = await newPage('V2');
    await v2.evaluate(() => MP.setMode('public-list'));
    const row = await until(() => v2.evaluate(code => {
        const btn = document.querySelector(`#mp-pl-container button[data-code="${code}"]`);
        return btn && btn.textContent.trim() === 'Zuschauen' && btn.closest('tr').textContent.replace(/\s+/g, ' ').trim();
    }, cred.code));
    ok(!!row && /Läuft · Runde \d+ · 👁 1/.test(row), 'public list: the running game with "Zuschauen"', row);
    await v2.click(`#mp-pl-container button[data-code="${cred.code}"]`);
    await inGame(v2);
    ok(await v2.evaluate(() => MP.spectator && MP.playerIndex === -1 && S.round >= 1), 'public list: V2 watches mid-game');
    ok(!!(await until(() => a.evaluate(() => /👁 2/.test(document.getElementById('mp-players-title').textContent)))), 'game: "👁 2"');

    // V1 follows the turns: A ends its turn, V1's state moves on
    await until(() => a.evaluate(() => MP.isMyTurn()));
    const before = await v1.evaluate(() => S.logSeq);
    const ended = await a.evaluate(() => new Promise(r => { closeModal(); MP.sendAction({ type: 'endTurn' }, r); }));
    const moved = await until(() => v1.evaluate(b => S.logSeq > b && S.logSeq, before));
    ok(!!moved && ended.ok, 'game: spectators get every move (game log of V1 moves on)', `${before} → ${moved}`);

    // the game ends (A only ends turns), the rematch keeps the spectators
    const driver = setInterval(() => a.evaluate(() => {
        if (S && !S.over && MP.isMyTurn() && MP._e !== S.round + ':' + S.cur) { MP._e = S.round + ':' + S.cur; closeModal(); MP.sendAction({ type: 'endTurn' }); }
    }).catch(() => { }), 200);
    const over = await until(() => v1.evaluate(() => !!(S && S.over && document.getElementById('mp-rematch-box'))), 300000, 500);
    clearInterval(driver);
    ok(!!over, 'end: spectators see the end screen');
    await a.waitForSelector('#mp-rematch');
    await a.click('#mp-rematch');
    await v1.waitForSelector('text=Das Spiel beginnt, sobald der Host es startet', { timeout: 10000 });
    ok(await v1.evaluate(() => MP.spectator && MP.lobbyIndex === null) && (await a.evaluate(() => MP.players.length)) === 1, 'rematch: spectators keep watching, no seat');
    await a.evaluate(() => MP.startGame());
    await inGame(v1);
    ok(await v1.evaluate(() => S.round === 1 && MP.playerIndex === -1), 'rematch: spectators see the next game');

    for (const p of [a, v1, v2]) await p.context().close();
}

/** The session store directly (the API's rate limit allows only 20 calls a minute). */
function limits() {
    const sessions = require('../../sessions');
    const r = sessions.createSession({ mapKey: '0' }, { name: 'Limit', clientId: 'host' });
    const s = sessions.getSession(r.sessionId);
    for (let i = 0; i < 20; i++) {
        const w = sessions.addSpectator(r.joinCode, r.password, { name: 'W' + i, clientId: 'w' + i });
        s.spectators.find(x => x.clientId === 'w' + i).connected = w.spectator;
    }
    ok(sessions.addSpectator(r.joinCode, r.password, { name: 'W20', clientId: 'w20' }) === 'Es schauen schon zu viele zu.', 'limit: the 21st spectator is refused');
    ok(sessions.addSpectator(r.joinCode, r.password, { name: 'W3', clientId: 'w3' }).spectator === true, 'limit: a spectator who comes back still gets in');
    s.spectators[0].connected = false;
    ok(sessions.addSpectator(r.joinCode, r.password, { name: 'W21', clientId: 'w21' }).spectator === true && s.spectators.length === 20, 'limit: one who left makes room');
    ok(sessions.addSpectator(r.joinCode, r.password, { name: 'Host', clientId: 'host' }).spectator === false, 'a player of the session stays a player');
    ok(sessions.addSpectator(r.joinCode, '000000', { name: 'X', clientId: 'x' }) === 'Falsches Passwort.', 'wrong password refused');
    sessions.joinSession(r.joinCode, r.password, { name: 'Seat', clientId: 'w5' });
    ok(!s.spectators.some(w => w.clientId === 'w5') && s.players.some(p => p.clientId === 'w5'), 'a spectator who takes a free seat stops watching');
    sessions.removeSession(r.sessionId);
}

async function rundenspiel(browser, errors) {
    const ua = makeUser(), ub = makeUser(), uc = makeUser();
    const ids = [];
    try {
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub), cc = await login(uc);
        const make = async isPublic => {
            const g = await (await ca.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'random', playerCount: 2, kiCount: 0, isPublic } } })).json();
            ids.push(g.id);
            await cb.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode } });
            return g.id;
        };
        const pub = await make(true), priv = await make(false);

        const list = await (await cc.request.get(BASE + '/api/async')).json();
        ok((list.watch || []).some(g => g.id === pub) && !(list.watch || []).some(g => g.id === priv), 'Rundenspiel: the public game is listed to watch, the private one not');

        const c = await cc.newPage();
        c.on('pageerror', e => errors.push(`C: ${e.message}`));
        await c.goto(BASE + '/');
        await c.waitForFunction(() => typeof ASYNC !== 'undefined' && typeof MP !== 'undefined');
        await c.evaluate(() => ASYNC.showList());
        await c.waitForSelector('text=Laufende öffentliche Spiele – zuschauen');
        await c.click(`.mpa-row:has-text("Zuschauen") button:has-text("Zuschauen")`);
        await c.waitForFunction(id => MP.asyncId === id && document.getElementById('screen-game').classList.contains('show'), pub, { timeout: 20000 });
        const st = await c.evaluate(() => ({ spectator: MP.spectator, me: MP.playerIndex, waiting: document.body.classList.contains('mp-waiting'), toast: document.querySelector('.mp-waiting-toast').textContent }));
        ok(st.spectator && st.me === -1 && st.waiting && st.toast === 'Du schaust zu', 'Rundenspiel: opened read-only', JSON.stringify(st));
        const act = await c.evaluate(id => new Promise(r => MP.socket.emit('async:action', { id, type: 'endTurn' }, r)), pub);
        ok(act.error === 'Du bist nicht in diesem Spiel.', 'Rundenspiel: a spectator\'s action is refused', act.error);
        const chat = await c.evaluate(id => new Promise(r => MP.socket.emit('async:chat', { id, kind: 'text', text: 'hi' }, r)), pub);
        ok(chat.error === 'Nur Mitspieler können schreiben.', 'Rundenspiel: a spectator can\'t write', chat.error);
        const closed = await c.evaluate(id => new Promise(r => MP.socket.emit('async:open', { id }, r)), priv);
        ok(closed.error === 'Du spielst in diesem Spiel nicht mit.', 'Rundenspiel: a private game can\'t be watched', closed.error);
        for (const ctx of [ca, cb, cc]) await ctx.close();
    } finally {
        if (ids.length) sql(`DELETE FROM async_games WHERE id IN (${ids.map(i => `'${i}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id IN ('${ua.id}', '${ub.id}', '${uc.id}')`);
    }
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        limits();
        await live(browser, errors);
        await rundenspiel(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
