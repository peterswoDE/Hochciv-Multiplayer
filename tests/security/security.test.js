/**
 * Security fixes against the local docker setup (utils/origin.js, utils/totp.js, routes/auth.js,
 * utils/detachUser.js):
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/security/security.test.js [http://localhost:3000]
 *
 *   · origin: changing API requests and socket connections from a foreign page are refused –
 *     own site, Discord Activity and requests without Origin pass;
 *   · authenticator code: five wrong codes lock the codes for 15 minutes (the right one too),
 *     a right code resets the count; the pending login ends after 10 minutes; the re-confirmation
 *     on the account page counts the same way;
 *   · second factor after Google/Discord: /?oauth=mfa opens the login dialog at the 2FA form of
 *     the pending login (the server side of the redirect needs a real provider – not tested here);
 *   · ban: the banned player's socket is closed, the live seat loses the account (texts refused
 *     as for a guest), the session is gone.
 *
 * Test accounts are deleted afterwards. Uses an installed Chrome or Edge (no browser download);
 * set HOCHCIV_BROWSER to its path if it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

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
function makeUser(extra = '') {
    const name = 'sec_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false ${extra} })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const totpCode = secret => inServer(`console.log(require('otplib').generateSync({ secret: '${secret}' })); process.exit(0);`);

async function origins() {
    const post = origin => fetch(BASE + '/api/auth/logout', { method: 'POST', headers: origin ? { Origin: origin } : {} }).then(r => r.status);
    ok(await post('https://evil.example') === 403, 'origin: a POST from a foreign page is refused');
    ok(await post('https://staging.hochciv.de') === 403, 'origin: also from a page of the same site (staging)');
    ok(await post(BASE) === 200, 'origin: the own site passes');
    ok(await post('https://123456789.discordsays.com') === 200, 'origin: the Discord Activity passes');
    ok(await post(null) === 200, 'origin: requests without Origin (apps, scripts) pass');
    const get = await fetch(BASE + '/api/leaderboard', { headers: { Origin: 'https://evil.example' } }).then(r => r.status);
    ok(get === 200, 'origin: reading (GET) is not affected');

    const polling = origin => fetch(BASE + '/socket.io/?EIO=4&transport=polling', { headers: origin ? { Origin: origin } : {} }).then(r => r.status);
    ok(await polling('https://evil.example') === 403, 'socket: polling handshake from a foreign page refused');
    ok(await polling(BASE) === 200, 'socket: polling handshake from the own site');
    const ws = origin => new Promise(res => {
        const s = new WebSocket(BASE.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { origin });
        s.on('open', () => { s.close(); res('open'); });
        s.on('error', e => res(String(e.message)));
        s.on('unexpected-response', (_req, r) => res('status ' + r.statusCode));
    });
    const bad = await ws('https://evil.example');
    ok(bad !== 'open', 'socket: WebSocket from a foreign page refused', bad);
    ok(await ws(BASE) === 'open', 'socket: WebSocket from the own site');
}

async function totp(browser) {
    const secret = inServer(`console.log(require('otplib').generateSecret()); process.exit(0);`);
    const u = makeUser(`, totpEnabled: true, totpSecret: '${secret}'`);
    try {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const login = async () => (await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } })).json();
        const code = async token => (await ctx.request.post(BASE + '/api/auth/login/totp', { data: { token } })).json();
        const first = await login();
        ok(first.mfaRequired && first.methods.totp, 'totp: the password asks for the code');
        const pending = await (await ctx.request.get(BASE + '/api/auth/mfa-pending')).json();
        ok(pending.methods && pending.methods.totp, 'mfa-pending: tells the dialog which factors are missing');

        const right = totpCode(secret);
        const wrong = String((Number(right) + 500000) % 1000000).padStart(6, '0');
        let last;
        for (let i = 0; i < 4; i++) last = await code(wrong);
        ok(last.error === 'Ungültiger Code' && sql(`SELECT "totpAttempts" FROM users WHERE id = '${u.id}'`) === '4', 'totp: wrong codes are counted per account', last.error);
        last = await code(wrong);
        ok(/Zu viele falsche Codes/.test(last.error || ''), 'totp: the fifth wrong code locks', last.error);
        last = await code(totpCode(secret));
        ok(/Zu viele falsche Codes/.test(last.error || ''), 'totp: while locked, the right code is refused too', last.error);
        ok(!(await (await ctx.request.get(BASE + '/api/auth/me')).json()).username, 'totp: not logged in');

        sql(`UPDATE users SET "totpLockedUntil" = NULL WHERE id = '${u.id}'`);      // the 15 minutes are over
        await code(wrong);
        const good = await code(totpCode(secret));
        ok(good.username === u.name && sql(`SELECT "totpAttempts" FROM users WHERE id = '${u.id}'`) === '0', 'totp: after the lock the right code logs in and resets the count', JSON.stringify(good));

        // re-confirmation on the account page counts the same way
        let re;
        for (let i = 0; i < 5; i++) re = await (await ctx.request.post(BASE + '/api/account/reauth', { data: { token: wrong } })).json();
        ok(/Zu viele falsche Codes/.test(re.error || ''), 'reauth: also locked after five wrong codes', re.error);
        sql(`UPDATE users SET "totpLockedUntil" = NULL, "totpAttempts" = 0 WHERE id = '${u.id}'`);

        // the pending login expires
        await ctx.request.post(BASE + '/api/auth/logout');
        await login();
        sql(`UPDATE "session" SET sess = jsonb_set(sess::jsonb, '{mfaPendingAt}', '0')::json WHERE sess::jsonb->>'mfaPendingUserId' = '${u.id}'`);
        const late = await code(totpCode(secret));
        ok(/abgelaufen/.test(late.error || ''), 'pending login: ends after 10 minutes', late.error);
        await ctx.close();

        // the dialog after Google/Discord: /?oauth=mfa with a pending login
        const c2 = await browser.newContext({ locale: 'de-DE' });
        await c2.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
        const page = await c2.newPage();
        await page.goto(BASE + '/?oauth=mfa');
        const frame = await until(async () => page.frames().find(f => /\/client\/index\.html\?modal=true&mfa=1/.test(f.url())), 15000);
        ok(!!frame, 'oauth=mfa: the login dialog opens for the second factor');
        if (frame) {
            await frame.waitForSelector('#form-mfa.active', { timeout: 10000 }).catch(() => null);
            const shown = await frame.evaluate(() => ({ form: document.getElementById('form-mfa').classList.contains('active'), totp: document.getElementById('mfa-totp-section').style.display }));
            ok(shown.form && shown.totp === 'block', 'oauth=mfa: the 2FA form with the authenticator field', JSON.stringify(shown));
            await frame.fill('#mfa-totp-code', totpCode(secret));
            await frame.evaluate(() => document.getElementById('form-mfa').requestSubmit());
            ok(await until(async () => page.evaluate(() => MP.user && MP.user.username), 15000) === u.name, 'oauth=mfa: the code logs in, the game page reloads');
        }
        await c2.close();
    } finally {
        sql(`DELETE FROM users WHERE id = '${u.id}'`);
    }
}

async function ban(browser) {
    const admin = makeUser(), victim = makeUser();
    sql(`UPDATE users SET role = 'admin' WHERE id = '${admin.id}'`);
    try {
        const ctxFor = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            return ctx;
        };
        const ca = await ctxFor(admin), cv = await ctxFor(victim);
        const newPage = async ctx => {
            const page = await ctx.newPage();
            await page.goto(BASE + '/');
            await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CHAT !== 'undefined');
            await page.evaluate(() => MP.fetchUser().then(() => MP.showLobby()));
            await page.waitForFunction(() => typeof MP.setMode === 'function');
            return page;
        };
        const a = await newPage(ca), v = await newPage(cv);
        await a.evaluate(() => MP.setMode('host'));
        await a.fill('#mp-hn', admin.name);
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await v.evaluate(() => MP.setMode('join'));
        await v.fill('#mp-c', cred.code);
        await v.fill('#mp-p', cred.pw);
        await v.fill('#mp-n', victim.name);
        await v.evaluate(() => MP.join());
        await v.waitForSelector('#mp-p-civ-1');
        await v.selectOption('#mp-p-civ-1', 'russland');
        await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 0, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
        await a.evaluate(() => MP.startGame());
        await v.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
        const before = await v.evaluate(() => new Promise(r => MP.socket.emit('chat:send', { kind: 'text', text: 'vor dem Bann' }, r)));
        ok(before.ok, 'ban: before, the player writes texts');
        await v.evaluate(() => { window.__closed = false; MP.socket.on('disconnect', () => { window.__closed = true; }); });

        const r = await ca.request.post(BASE + `/api/admin/users/${victim.id}/action`, { data: { action: 'ban' } });
        ok(r.status() === 200, 'ban: the admin bans the player');
        ok(await until(async () => v.evaluate(() => window.__closed)), 'ban: the open socket is closed at once');
        ok((await (await cv.request.get(BASE + '/api/auth/me')).json()).username === undefined, 'ban: the login is gone');
        // a server-side disconnect is not retried by Socket.IO: the player comes back (reload) with the same seat
        const after = await v.evaluate(async ([sessionId, password]) => {
            const sock = io({ transports: ['websocket'] });
            await new Promise(r => sock.emit('session:connect', { sessionId, password, clientId: MP.getClientId() }, r));
            const res = await new Promise(r => sock.emit('chat:send', { kind: 'text', text: 'nach dem Bann' }, r));
            sock.disconnect();
            return res;
        }, [await v.evaluate(() => MP.sessionId), cred.pw]);
        ok(after && /Gäste können nur Emojis/.test(after.error || ''), 'ban: back in the game, the seat has no account (texts refused)', JSON.stringify(after));
        await ca.close();
        await cv.close();
    } finally {
        sql(`DELETE FROM users WHERE id IN ('${admin.id}', '${victim.id}')`);
    }
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        await origins();
        await totp(browser);
        await ban(browser);
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
