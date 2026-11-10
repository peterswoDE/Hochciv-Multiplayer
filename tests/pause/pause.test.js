/**
 * Live games: pause, and continue as a Rundenspiel (F27: sockets/game.js 'game:pause' /
 * 'game:toAsync', async/service.js fromLive, client/pause.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/pause/pause.test.js [http://localhost:3000]
 *
 * A live game of four empires with a turn timer: host A and B with accounts, C a guest, one KI.
 * 1. Pause: only the host; the game menu has *Pause*; everyone sees the banner; moves are
 *    refused; the turn clock stands still; *Fortsetzen* lets the game go on.
 * 2. Continue as a Rundenspiel: the host picks the time per turn; A and B land in the
 *    Rundenspiel, C (guest) is told that the KI plays the empire. The Rundenspiel has the same
 *    round, the seats (A, B human, C and the KI as KI), the statistics and the replay frames so
 *    far; the live game is gone.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').pop();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
function makeUser() {
    const name = 'pse_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() })
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
async function until(fn, ms = 20000, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    let asyncId = null;
    const page = async (name, user) => {
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 860 } });
        if (user) {
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + user.name);
        }
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        p.on('dialog', d => d.accept());
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function' && typeof PAUSE !== 'undefined');
        await p.evaluate(() => MP.showLobby());
        await p.waitForFunction(() => typeof MP.setMode === 'function');
        return p;
    };
    const inGame = p => p.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
    try {
        const ua = makeUser(), ub = makeUser();
        const a = await page('A', ua), b = await page('B', ub), c = await page('C');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { mapKey: '0', playerCount: 4, kiCount: 1, turnTime: 300 }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4 && MP.gameConfig.turnTime === 300);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(([c, n]) => MP.joinWith(c.code, c.pw, n), [cred, ub.name]);
        await b.waitForSelector('#mp-p-civ-1');
        await b.selectOption('#mp-p-civ-1', 'russland');
        await c.fill('#mp-n', 'PauseGast').catch(() => {});
        await c.evaluate(c => MP.joinWith(c.code, c.pw, 'PauseGast'), cred);
        await c.waitForSelector('#mp-p-civ-2');
        await c.selectOption('#mp-p-civ-2', 'england');
        await a.waitForFunction(() => MP.players.length === 3 && MP.players[1].civ === 'russland' && MP.players[2].civ === 'england');
        await a.evaluate(() => MP.startGame());
        await Promise.all([inGame(a), inGame(b), inGame(c)]);
        const pages = [a, b, c];
        // the page whose turn it is, once it is a human's
        const human = async () => {
            const cur = await until(() => a.evaluate(() => S.players[S.cur].kind === 'human' && S.cur));
            for (const p of pages) if (await p.evaluate(i => MP.playerIndex === i, cur)) return p;
            return null;
        };

        // ── 1. Pause ──────────────────────────────────────────────────────────────
        const notHost = await emit(b, 'game:pause', { pause: true });
        ok(notHost && notHost.error === 'Nur der Host kann das Spiel anhalten.', 'pause: only the host', JSON.stringify(notHost));
        let turn = await human();
        await a.click('#g-menu');
        await a.waitForSelector('#mm-pause');
        ok(await a.isVisible('#mm-to-async'), 'game menu (host): "Pause" and "Als Rundenspiel fortsetzen"');
        const bMenu = await b.click('#g-menu').then(() => b.waitForSelector('#mm-async-menu')).then(() => b.$('#mm-pause'));
        ok(!bMenu, 'game menu (not the host): no pause');
        await b.evaluate(() => closeModal());
        await a.click('#mm-pause');
        await Promise.all(pages.map(p => p.waitForSelector('#mp-pause-banner:not([hidden])')));
        const banners = await Promise.all(pages.map(p => p.$eval('#mp-pause-banner', el => el.textContent.replace(/\s+/g, ' ').trim())));
        ok(/du hast das Spiel angehalten/.test(banners[0]) && banners[1].includes(`${ua.name} hat das Spiel angehalten`) && banners[2].includes(ua.name)
            && await a.isVisible('#mp-pause-resume') && !(await b.$('#mp-pause-resume')), 'pause: everyone sees the banner, the host can resume', banners.join(' | '));
        const refused = await emit(turn, 'action', { type: 'endTurn', params: {} });
        ok(refused && refused.error === 'Das Spiel ist pausiert.', 'pause: moves are refused', JSON.stringify(refused));
        ok(!(await turn.evaluate(() => MP.isMyTurn())), 'pause: the player whose turn it is can\'t act on the page either');
        const clock1 = await a.$eval('#mp-turn-clock', el => el.textContent);
        await sleep(2500);
        const clock2 = await a.$eval('#mp-turn-clock', el => el.textContent);
        ok(clock1.startsWith('⏸') && clock1 === clock2, 'pause: the turn clock stands still', `${clock1} → ${clock2}`);
        await a.click('#mp-pause-resume');
        await Promise.all(pages.map(p => p.waitForFunction(() => !MP.paused && (!document.getElementById('mp-pause-banner') || document.getElementById('mp-pause-banner').hidden))));
        const going = await a.$eval('#mp-turn-clock', el => el.textContent);
        ok(going.startsWith('⏱'), 'resume: the clock runs again', going);
        const moved = await emit(turn, 'action', { type: 'endTurn', params: {} });
        ok(moved && moved.ok, 'resume: moves are accepted again', JSON.stringify(moved));

        // ── 2. Continue as a Rundenspiel ─────────────────────────────────────────
        await a.evaluate(() => MP.socket.emit('chat:send', { text: 'Bis morgen!' }, () => {}));
        turn = await human();
        const round = await a.evaluate(() => S.round);
        await a.click('#g-menu');
        await a.waitForSelector('#mm-to-async');
        await a.click('#mm-to-async');
        await a.waitForSelector('#mp-to-async-go');
        const warn = await a.$eval('#overlay', el => el.textContent);
        ok(warn.includes('PauseGast'), 'dialog: names the guest whose empire the KI takes', '');
        await a.selectOption('#mp-to-async-days', '1');
        await a.click('#mp-to-async-go');
        await Promise.all([a, b].map(p => p.waitForFunction(() => /[?&]async=/.test(location.search) || (MP.asyncId && ASYNC.view), null, { timeout: 20000 })));
        await Promise.all([a, b].map(p => p.waitForFunction(() => MP.asyncId && ASYNC.view && ASYNC.view.state, null, { timeout: 20000 })));
        asyncId = await a.evaluate(() => MP.asyncId);
        ok(!!asyncId && asyncId === await b.evaluate(() => MP.asyncId), 'A and B land in the same Rundenspiel', asyncId);
        await c.waitForSelector('#mp-moved-text');
        ok(/dein Reich spielt jetzt die KI/.test(await c.$eval('#mp-moved-text', el => el.textContent)), 'the guest is told that the KI plays the empire');
        const g = JSON.parse(sql(`SELECT json_build_object('status', status, 'round', round, 'cfg', data->'config', 'seats', data->'seats', 'stats', data->'stats' IS NOT NULL, 'chat', data->'chat', 'waiting', "waitingIds", 'frames', (SELECT count(*) FROM replay_frames WHERE "gameKey" = async_games.id)) FROM async_games WHERE id = '${asyncId}'`));
        const kinds = g.seats.map(s => `${s.civ}:${s.kind}${s.userId ? ':acc' : ''}`).join(' ');
        ok(g.status === 'playing' && g.round >= round && g.cfg.turnDays === 1 && g.cfg.fromLive && g.cfg.playerCount === 4 && g.cfg.humanCount === 2,
            'the Rundenspiel: playing, the same game on, 1 day per turn', JSON.stringify({ status: g.status, round: g.round, from: round, days: g.cfg.turnDays }));
        ok(g.seats.length === 4 && g.seats[0].kind === 'human' && g.seats[0].userId === ua.id && g.seats[1].userId === ub.id && g.seats[2].kind === 'ki' && !g.seats[2].userId && g.seats[3].kind === 'ki',
            'seats: A and B play on, the guest and the KI are KI', kinds);
        ok(g.stats && g.frames > 0 && g.chat.some(m => /Bis morgen/.test(JSON.stringify(m))), 'statistics, replay frames and chat came along', `${g.frames} frames`);
        ok(g.waiting.length === 1 && [ua.id, ub.id].includes(g.waiting[0]), 'it waits for A or B', JSON.stringify(g.waiting));
        // the one whose turn it is plays on in the Rundenspiel
        const next = g.waiting[0] === ua.id ? a : b;
        const key = await next.evaluate(() => S.round + ':' + S.cur);
        const r = await next.evaluate(id => new Promise(res => MP.socket.emit('async:action', { id, type: 'endTurn', params: {} }, res)), asyncId);
        const after = await until(() => next.evaluate(k => ASYNC.view && ASYNC.view.state && (ASYNC.view.state.round + ':' + ASYNC.view.state.cur) !== k && ASYNC.view.state.round + ':' + ASYNC.view.state.cur, key));
        ok(r && !r.error && !!after, 'the Rundenspiel goes on: the turn is ended there', `${key} → ${after}`);
        const live = await c.evaluate(c => new Promise(r => MP.socket.emit('session:connect', { joinCode: c.code, password: c.pw, playerName: 'X', clientId: 'x' }, r)), cred);
        ok(live && live.error, 'the live game is gone', JSON.stringify(live));
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        if (asyncId) {
            sql(`DELETE FROM replay_frames WHERE "gameKey" = '${asyncId}'`);
            sql(`DELETE FROM async_games WHERE id = '${asyncId}'`);
        }
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
