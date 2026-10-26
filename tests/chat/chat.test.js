/**
 * In-game chat (client/chat.js, utils/chat.js, sockets/game.js, async/service.js) against the
 * local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/chat/chat.test.js [http://localhost:3000]
 *
 * Live game (two browser pages, A hosts, B joins): the panel in the game, a text message with
 * HTML in it (shown as text), the unread badge, an emote, a map ping (pulses on the other
 * screen and does not open the tapped hex), muting, the server's checks (empty text, unknown
 * emoji, rate limit) and the history after a reconnect.
 *
 * Rundenspiel (two test accounts, opened with ?async=<id>): a message arrives live, is stored
 * with the game, the unread count stays when the game is opened again until the panel is opened, and somebody
 * who doesn't play may not write. Test accounts and games are deleted afterwards.
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
    const name = 'chat_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);
const chatRows = page => page.$$eval('#mp-chat-list .mp-chat-msg', rows => rows.map(r => r.textContent.replace(/\s+/g, ' ').replace('🔇', '').trim()));
const badge = page => page.$eval('#mp-chat', el => el.dataset.unread);

async function live(browser, errors) {
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CHAT !== 'undefined');
        await page.evaluate(() => { MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage('A'), b = await newPage('B');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', 'ChatA');
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.selectOption('#mp-p-civ-0', 'griechenland');
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password, sessionId: MP.sessionId }));
    await b.evaluate(() => MP.setMode('join'));
    await b.fill('#mp-c', cred.code);
    await b.fill('#mp-p', cred.pw);
    await b.fill('#mp-n', 'ChatB');
    await b.evaluate(() => MP.join());
    await b.waitForSelector('#mp-p-civ-1');
    await b.selectOption('#mp-p-civ-1', 'russland');
    await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0, mapKey: '0' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
    await a.evaluate(() => MP.startGame());
    for (const p of [a, b]) await p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'));
    await a.evaluate(() => closeModal());
    await b.evaluate(() => closeModal());

    ok(await a.isVisible('#mp-chat') && await a.$eval('#mp-chat', el => el.classList.contains('mp-log-minimized')), 'live: the chat bubble is shown in the game, closed');
    ok(!(await a.isVisible('#mp-chat-input')), 'live: closed – no input field');

    // A writes – with HTML in it
    await a.click('#mp-chat');
    await a.fill('#mp-chat-input', 'Hallo <b>B</b>!');
    await a.press('#mp-chat-input', 'Enter');
    const bBadge = await until(async () => (await badge(b)) === '1');
    ok(!!bBadge, 'live: B gets an unread badge "1"');
    await b.click('#mp-chat');
    const rowsB = await chatRows(b);
    ok(rowsB.length === 1 && rowsB[0] === 'ChatA Hallo <b>B</b>!', 'live: B reads the message, HTML shown as text', rowsB.join(' | '));
    ok(!(await b.$('#mp-chat-list b b')), 'live: no HTML from the message in the page');
    ok((await badge(b)) === '', 'live: opening the panel clears the badge');
    ok((await a.$$eval('#mp-chat-list .mp-chat-msg.me', r => r.length)) === 1, 'live: A sees its own message as its own');

    // emote
    await a.click('#mp-chat-emote-btn');
    await a.click('#mp-chat-emotes [data-emote="👍"]');
    ok(!!(await until(async () => (await chatRows(b)).some(r => r === 'ChatA 👍'))), 'live: an emote arrives');

    // map ping: the tapped hex is not opened on A, it pulses on B
    const selBefore = await a.evaluate(() => JSON.stringify(ui.sel));
    await a.click('#mp-chat-ping-btn');
    ok(await a.evaluate(() => document.documentElement.classList.contains('mp-ping-mode')), 'ping: 📍 switches to ping mode');
    const hex = await a.$('#map polygon[data-r="5"][data-c="5"]');
    await hex.click({ force: true });
    const ping = await until(() => b.evaluate(() => document.querySelectorAll('#map .mp-ping').length));
    ok(ping === 1, 'ping: B sees the marker on the map');
    ok(await until(() => a.evaluate(() => document.querySelectorAll('#map .mp-ping').length === 1)), 'ping: A sees it too');
    ok(await a.evaluate(() => !document.documentElement.classList.contains('mp-ping-mode')), 'ping: ping mode ends after the tap');
    ok(await a.evaluate(() => JSON.stringify(ui.sel)) === selBefore, 'ping: the hex was not opened', await a.evaluate(() => JSON.stringify(ui.sel)));
    await b.evaluate(() => redraw());
    ok(await b.evaluate(() => document.querySelectorAll('#map .mp-ping').length) === 1, 'ping: stays after the map is redrawn');
    const gone = await until(() => b.evaluate(() => document.querySelectorAll('#map .mp-ping').length === 0), 9000);
    ok(!!gone, 'ping: disappears after a few seconds');
    ok(!(await chatRows(b)).some(r => /📍/.test(r)), 'ping: not kept in the chat history');

    // server checks
    const empty = await emit(a, 'chat:send', { kind: 'text', text: '   ' });
    ok(empty.error === 'Leere Nachricht.', 'server: empty text refused', empty.error);
    const bad = await emit(a, 'chat:send', { kind: 'emote', emote: '<script>' });
    ok(bad.error === 'Unbekanntes Emoji.', 'server: unknown emoji refused', bad.error);
    const badPing = await emit(a, 'chat:send', { kind: 'ping', r: -1, c: 'x' });
    ok(badPing.error === 'Ungültiges Feld.', 'server: invalid ping refused', badPing.error);
    await sleep(10500);                    // the rate window of the messages above
    const long = await emit(b, 'chat:send', { kind: 'text', text: 'x'.repeat(400) });
    ok(long.ok && (await until(async () => (await chatRows(a)).some(r => r === 'ChatB ' + 'x'.repeat(300)))), 'server: long text cut to 300 characters', JSON.stringify(long));
    let limited = null;
    for (let i = 0; i < 6 && !limited; i++) {
        const r = await emit(b, 'chat:send', { kind: 'text', text: 'spam ' + i });
        if (r.error) limited = { i, error: r.error };
    }
    ok(limited && limited.i === 4 && limited.error === 'Zu viele Nachrichten – warte einen Moment.', 'server: rate limit (5 per 10 s)', JSON.stringify(limited));

    // muting on A's device
    await a.hover('#mp-chat-list .mp-chat-msg:not(.me)');
    await a.click('#mp-chat-list .mp-chat-msg:not(.me) .mp-chat-mute');
    ok((await chatRows(a)).every(r => !r.startsWith('ChatB')), 'mute: B\'s messages are hidden on A');
    ok(/Stumm: ChatB/.test(await a.textContent('#mp-chat-muted')), 'mute: listed under the messages');
    await a.click('#mp-chat-muted [data-unmute]');
    ok((await chatRows(a)).some(r => r.startsWith('ChatB')), 'mute: undone');

    // English (the game's language buttons)
    const en = await a.evaluate(() => {
        switchLang('en');
        closeModal();
        return {
            title: document.getElementById('mp-chat-title').textContent,
            placeholder: document.getElementById('mp-chat-input').placeholder,
            ping: document.getElementById('mp-chat-ping-btn').title,
            missing: HC_I18N.missing(),
        };
    });
    ok(en.title === 'Chat' && en.placeholder === 'Message …' && en.ping === 'Point at a hex' && !en.missing.length,
        'English: the panel follows the game language', JSON.stringify(en));
    await a.evaluate(() => { switchLang('de'); closeModal(); });

    // reconnect: the history comes back (texts and emotes, no pings)
    const clientId = await b.evaluate(() => MP.getClientId());
    const hist = await b.evaluate(async ([sessionId, password, clientId]) => {
        const sock = io({ transports: ['websocket'] });
        const got = new Promise(r => sock.on('chat:history', r));
        await new Promise(r => sock.emit('session:connect', { sessionId, password, clientId }, r));
        const h = await got;
        sock.disconnect();
        return h.list.map(m => m.kind);
    }, [cred.sessionId, cred.pw, clientId]);
    ok(hist.length === 7 && hist[0] === 'text' && hist[1] === 'emote' && !hist.includes('ping'), 'reconnect: the history is sent again', hist.join(','));
    await a.context().close();
    await b.context().close();
}

async function rundenspiel(browser, errors) {
    const ua = makeUser(), ub = makeUser(), uc = makeUser();
    let gameId = null;
    try {
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub), cc = await login(uc);
        const created = await (await ca.request.post(BASE + '/api/async', {
            data: { config: { mapKey: '0', civMode: 'random', playerCount: 2, kiCount: 0 }, invite: [] },
        })).json();
        gameId = created.id;
        const joined = await cb.request.post(BASE + `/api/async/${gameId}/join`, { data: { code: created.joinCode } });
        ok(joined.status() === 200, 'Rundenspiel: B joins, the game starts');

        const open = async (ctx, name) => {
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
            await page.goto(BASE + '/?async=' + gameId);
            await page.waitForFunction(id => typeof MP !== 'undefined' && MP.asyncId === id && document.getElementById('screen-game').classList.contains('show'), gameId, { timeout: 20000 });
            await page.evaluate(() => closeModal());
            return page;
        };
        const a = await open(ca, 'RA'), b = await open(cb, 'RB');
        ok(await a.isVisible('#mp-chat'), 'Rundenspiel: the chat is there');
        await a.click('#mp-chat');
        await a.fill('#mp-chat-input', 'Gut gespielt, bis morgen');
        await a.press('#mp-chat-input', 'Enter');
        ok(!!(await until(async () => (await badge(b)) === '1')), 'Rundenspiel: the message arrives live (badge on B)');
        const stored = await until(async () => sql(`SELECT data->'chat'->0->>'text' FROM async_games WHERE id = '${gameId}'`) || null);
        ok(stored === 'Gut gespielt, bis morgen', 'Rundenspiel: stored with the game', stored);

        await b.goto(BASE + '/?async=' + gameId);           // opened again (mp.js drops ?async= from the address)
        await b.waitForFunction(id => MP.asyncId === id && document.getElementById('screen-game').classList.contains('show'), gameId, { timeout: 20000 });
        ok(!!(await until(async () => (await badge(b)) === '1')), 'Rundenspiel: still unread when opened again');
        await b.evaluate(() => closeModal());
        await b.click('#mp-chat');
        ok((await chatRows(b))[0] === `${ua.name} Gut gespielt, bis morgen`, 'Rundenspiel: B reads it', (await chatRows(b))[0]);
        await b.click('#mp-chat-header');
        await b.goto(BASE + '/?async=' + gameId);           // opened again (mp.js drops ?async= from the address)
        await b.waitForFunction(id => MP.asyncId === id && document.getElementById('screen-game').classList.contains('show'), gameId, { timeout: 20000 });
        await sleep(800);
        ok((await badge(b)) === '', 'Rundenspiel: read stays read when opened again');

        // somebody who doesn't play may not write
        const c = await cc.newPage();
        await c.goto(BASE + '/');
        await c.waitForFunction(() => typeof MP !== 'undefined');
        const other = await c.evaluate(id => MP.fetchUser().then(() => MP.connect()).then(() =>
            new Promise(r => MP.socket.emit('async:chat', { id, kind: 'text', text: 'hi' }, r))), gameId);
        ok(other.error === 'Nur Mitspieler können schreiben.', 'Rundenspiel: non-players may not write', other.error);
        for (const ctx of [ca, cb, cc]) await ctx.close();
    } finally {
        if (gameId) sql(`DELETE FROM async_games WHERE id = '${gameId}'`);
        sql(`DELETE FROM users WHERE id IN ('${ua.id}', '${ub.id}', '${uc.id}')`);
    }
}

(async () => {
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
