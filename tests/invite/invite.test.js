/**
 * Invite links (mp.js openInvite / shareInvite, POST /api/sessions/preview) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/invite/invite.test.js [http://localhost:3000]
 *
 * A hosts a private lobby and copies the invite link from the lobby. B opens it: the invite
 * dialog names the host, the map and the players, B joins and lands in the lobby, and the
 * address no longer carries code and password. A wrong password shows an error; the preview
 * never returns the password. Once the game runs, C opening the same link is offered to watch
 * and becomes a spectator. A Rundenspiel link (no password) asks a guest to log in. English.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'inv_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [], users = [], asyncIds = [];
    const newPage = async (name, url, locale = 'de-DE') => {
        const ctx = await browser.newContext({ locale });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        if (locale.startsWith('en')) await page.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await page.goto(url || BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        return page;
    };
    try {
        // A hosts a private lobby
        const a = await newPage('A');
        await a.evaluate(() => MP.showLobby());
        await a.waitForFunction(() => typeof MP.setMode === 'function');
        await a.fill('#mp-n', 'InviteHost');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.evaluate(() => MP.socket.emit('lobby:config', { isPublic: false, playerCount: 3, kiCount: 1 }));
        await a.waitForFunction(() => MP.gameConfig.isPublic === false && MP.gameConfig.playerCount === 3);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        ok(await a.isVisible('#mp-invite-btn'), 'lobby: "Einladungslink teilen" button');
        await a.click('#mp-invite-btn');
        const link = await a.evaluate(() => navigator.clipboard.readText());
        ok(link === `${BASE}/?join=${cred.code}&pw=${cred.pw}`, 'the button copies the invite link', link);

        // the preview: needs the password, never returns it
        const prev = await a.evaluate(async c => {
            const r = await fetch('/api/sessions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ joinCode: c.code.toLowerCase(), password: c.pw }) });
            return { status: r.status, body: await r.json() };
        }, cred);
        ok(prev.status === 200 && prev.body.hostName === 'InviteHost' && prev.body.status === 'lobby' && prev.body.playersCount === 1
            && prev.body.maxPlayers === 2 && !('password' in prev.body) && !('id' in prev.body) && prev.body.players.join() === 'InviteHost',
            'preview: host, status, seats, players, no password or session id', JSON.stringify(prev.body).slice(0, 160));
        const bad = await a.evaluate(async c => {
            const r = await fetch('/api/sessions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ joinCode: c.code, password: '000000' }) });
            return { status: r.status, body: await r.json() };
        }, cred);
        ok(bad.status === 400 && bad.body.error === 'Falsches Passwort.', 'preview: wrong password refused');

        // B opens the link
        const b = await newPage('B', link);
        await b.waitForSelector('#mp-invite', { timeout: 10000 });
        const text = await b.textContent('#mp-invite');
        ok(/InviteHost lädt dich zu einem Live-Spiel ein/.test(text) && /Originalkarte|Original/.test(text) && /1\/2 Spieler/.test(text),
            'invite dialog: host, map, players', text.replace(/\s+/g, ' ').slice(0, 160));
        ok(await b.evaluate(() => location.search === ''), 'the address no longer shows code and password');
        await b.fill('#mp-inv-n', 'InviteGuest');
        await b.click('#mp-invite button.primary');
        await b.waitForSelector('#mp-p-civ-1', { timeout: 10000 });
        ok(await b.evaluate(() => MP.lobbyIndex === 1 && MP.joinCode === MP.joinCode.toUpperCase()), 'B joined the private lobby through the link');
        await a.waitForFunction(() => MP.players.length === 2, null, { timeout: 10000 });
        ok(true, 'A sees B in the lobby');

        // a wrong password in the link
        const w = await newPage('W', `${BASE}/?join=${cred.code}&pw=111111`);
        await w.waitForSelector('#mp-invite', { timeout: 10000 });
        ok(/Falsches Passwort/.test(await w.textContent('#mp-invite')), 'a link with a wrong password says so');
        await w.close();

        // the game runs: C opening the link may only watch
        await b.selectOption('#mp-p-civ-1', 'russland');
        await a.evaluate(() => MP.startGame());
        await a.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 });
        const c = await newPage('C', link);
        await c.waitForSelector('#mp-invite', { timeout: 10000 });
        const ctext = await c.textContent('#mp-invite');
        ok(/Das Spiel läuft schon/.test(ctext) && !(await c.$('#mp-inv-n')), 'running game: no join, offered to watch', ctext.replace(/\s+/g, ' ').slice(0, 120));
        await c.click('#mp-invite button.primary');
        await c.waitForFunction(() => MP.spectator === true && typeof S !== 'undefined' && S, null, { timeout: 20000 });
        ok(true, 'C watches the game');
        await a.waitForFunction(() => MP.spectatorCount === 1, null, { timeout: 10000 }).then(() => ok(true, 'A sees one spectator'), () => ok(false, 'A sees one spectator'));

        // Rundenspiel link without a password: guests are asked to log in
        const g = await newPage('G', `${BASE}/?join=ABCDEF`);
        await g.waitForSelector('#overlay iframe[src*="/client/index.html?modal=true"]', { timeout: 10000 })
            .then(() => ok(true, 'Rundenspiel link: a guest is asked to log in'), () => ok(false, 'Rundenspiel link: a guest is asked to log in'));
        await g.close();

        // a private Rundenspiel: the logged-in player gets its join dialog from the link
        const ua = makeUser(), ub = makeUser();
        users.push(ua, ub);
        const ctxA = await browser.newContext({ locale: 'de-DE' });
        await ctxA.request.post(BASE + '/api/auth/login', { data: { username: ua.name, password: PASSWORD } });
        const rg = await (await ctxA.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 2, kiCount: 0, isPublic: false }, civ: 'griechenland', ability: 'basis' } })).json();
        asyncIds.push(rg.id);
        const ctxB = await browser.newContext({ locale: 'de-DE' });
        await ctxB.request.post(BASE + '/api/auth/login', { data: { username: ub.name, password: PASSWORD } });
        const pb = await ctxB.newPage();
        pb.on('pageerror', e => errors.push(`RB: ${e.message}`));
        await pb.goto(`${BASE}/?join=${rg.joinCode}`);
        await pb.waitForFunction(() => /Rundenspiel beitreten/.test((document.getElementById('overlay') || {}).innerText || ''), null, { timeout: 10000 })
            .then(() => ok(true, 'Rundenspiel link: the join dialog opens'), () => ok(false, 'Rundenspiel link: the join dialog opens'));
        await pb.click('#overlay button.primary');
        const joined = await (await ctxB.request.get(BASE + '/api/async/' + rg.id)).json();
        ok(joined.mySlot != null, 'Rundenspiel link: B joined', JSON.stringify(joined.mySlot));
        await ctxA.close(); await ctxB.close();

        // English
        const e = await newPage('E', link, 'en-US');
        await e.waitForSelector('#mp-invite', { timeout: 10000 });
        const etext = await e.textContent('#mp-invite');
        ok(/The game has already started/.test(etext) && !/läuft|lädt/.test(etext), 'invite dialog in English', etext.replace(/\s+/g, ' ').slice(0, 120));
        await e.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
