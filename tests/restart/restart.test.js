/**
 * Server restart: running live games go on as Rundenspiele (server.js shutdown,
 * sockets/game.js convertAllOnShutdown, async/service.js fromLive, client/pause.js) against the
 * local docker setup – the test restarts the server container:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/restart/restart.test.js [http://localhost:3000]
 *
 * Game 1: hosted by a guest, with A (account) and one KI. Game 2: two guests only.
 * After `docker restart`: game 1 is a Rundenspiel with A as its host (the host had no account),
 * the same round and the guest's empire played by the KI; A's page waits for the server and
 * opens it; the guest is told. Game 2 can't be one (no account) and is gone.
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
    const name = 'rst_' + crypto.randomBytes(3).toString('hex');
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

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    let asyncIds = [];
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
    const game = async (host, hostName, other, otherName, civs, kiCount) => {
        await host.fill('#mp-n', hostName).catch(() => {});
        await host.evaluate(() => MP.host());
        await host.waitForSelector('#mp-p-civ-0');
        await host.selectOption('#mp-p-civ-0', civs[0]);
        await host.evaluate(k => MP.socket.emit('lobby:config', { mapKey: '0', playerCount: 2 + k, kiCount: k }), kiCount);
        await host.waitForFunction(n => MP.gameConfig.playerCount === n, 2 + kiCount);
        const cred = await host.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await other.evaluate(([c, n]) => MP.joinWith(c.code, c.pw, n), [cred, otherName]);
        await other.waitForSelector('#mp-p-civ-1');
        await other.selectOption('#mp-p-civ-1', civs[1]);
        await host.waitForFunction(c => MP.players.length === 2 && MP.players[1].civ === c, civs[1]);
        await host.evaluate(() => MP.startGame());
        await Promise.all([inGame(host), inGame(other)]);
        return cred;
    };
    try {
        const ua = makeUser();
        const g = await page('G'), a = await page('A', ua);
        const cred1 = await game(g, 'RestartGast', a, ua.name, ['griechenland', 'russland'], 1);
        const g2 = await page('G2'), g3 = await page('G3');
        const cred2 = await game(g2, 'NurGast1', g3, 'NurGast2', ['england', 'wikinger'], 0);
        // let the game go on a little: the host (a guest) ends its turns until A has had one
        for (let n = 0; n < 6; n++) {
            for (const p of [g, a]) await p.evaluate(() => MP.isMyTurn() && new Promise(r => MP.socket.emit('action', { type: 'endTurn', params: {} }, r))).catch(() => {});
            await sleep(400);
        }
        const round = await a.evaluate(() => S.round);

        // ── restart the server ──────────────────────────────────────────────────
        const t0 = Date.now();
        execFileSync('docker', ['restart', '-t', '60', CONTAINER]);
        const stopMs = Date.now() - t0;
        const logs = execFileSync('docker', ['logs', '--since', '3m', CONTAINER]).toString();
        ok(/\[Shutdown\] SIGTERM/.test(logs) && /\[Shutdown\] 1 of 2 live games converted/.test(logs),
            'shutdown: live games converted, the one without an account not', (logs.match(/\[Shutdown\][^\n]*/g) || []).join(' | '));
        ok(stopMs < 30000, 'shutdown: quick', `${stopMs} ms`);
        const rows = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('id', id, 'host', "hostUserId", 'round', round, 'live', data->'config'->>'fromLive', 'seats', data->'seats')), '[]') FROM async_games WHERE data->'config'->>'fromLive' IN ('${cred1.code}', '${cred2.code}')`));
        asyncIds = rows.map(r => r.id);
        const r1 = rows[0];
        ok(rows.length === 1 && r1.live === cred1.code, 'game 1 is a Rundenspiel, game 2 (guests only) is not', JSON.stringify(rows.map(r => r.live)));
        ok(r1 && r1.host === ua.id, 'its host is A (the live host was a guest)', r1 && r1.host);
        ok(r1 && r1.round >= round && r1.round <= round + 1, 'same round (the KI may move on)', `${r1 && r1.round} / ${round}`);
        const seats = r1 ? r1.seats.map(s => `${s.civ}:${s.kind}${s.userId ? ':' + (s.userId === ua.id ? 'A' : '?') : ''}`) : [];
        ok(seats.join() === 'griechenland:ki,russland:human:A,' + seats[2] && /:ki$/.test(seats[2]), 'seats: the guest\'s empire to the KI, A plays on', seats.join());

        // ── the pages ───────────────────────────────────────────────────────────
        const landed = await until(() => a.evaluate(() => MP.asyncId && ASYNC.view && ASYNC.view.state && MP.asyncId), 60000, 500);
        ok(landed && landed === (r1 && r1.id), 'A\'s page waits for the server and opens the Rundenspiel', landed);
        const told = await until(() => g.evaluate(() => { const el = document.getElementById('mp-moved-text'); return el && el.textContent; }), 5000);
        ok(told && /Server startet neu/.test(told) && /KI/.test(told), 'the guest is told: the KI plays the empire', told);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        for (const id of asyncIds) {
            sql(`DELETE FROM replay_frames WHERE "gameKey" = '${id}'`);
            sql(`DELETE FROM async_games WHERE id = '${id}'`);
        }
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
