/**
 * The admin tab "Laufende Spiele" (GET /api/admin/running, client/account.js) against the local
 * docker setup.
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/admin/running-games.test.js [http://localhost:3000]
 *
 * Starts a live game (lobby → game:start over Socket.IO, as the game page does), stores
 * Rundenspiele on v83 (no version recorded), v87, v88 and the current version plus a finished
 * one, then logs in as a test admin and reads the tab: the counts per version, the live game
 * and the Rundenspiele with their versions. A normal user gets 403. Test accounts, games and
 * the lobby are removed afterwards.
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

const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser(role) {
    const name = 'run_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

/* Rundenspiele in every version. "playing" games wait on the host, so the server's sweep for
   automatic turns (waitingIds empty) leaves them alone. */
function makeRundenspiele(host) {
    const out = inServer(`const { AsyncGame } = require('./models'); const engine = require('./engine-adapter');
        const mk = (code, eng, status) => AsyncGame.create({
            joinCode: code, hostUserId: '${host.id}', status, participantIds: ['${host.id}'],
            waitingIds: ['${host.id}'], round: 3, waitSince: new Date(Date.now() - 2 * 86400000),
            data: { engine: eng, config: {}, seats: [{ slot: 0, userId: '${host.id}', name: '${host.name}', civ: 'england', kind: 'human' },
                { slot: 1, name: 'KI', civ: 'wikinger', kind: 'ki' }], meta: { waitingFor: '${host.name}' } },
        });
        Promise.all([mk('TV83', null, 'playing'), mk('TV87', 'v87', 'playing'), mk('TV88', 'v88', 'draft'),
            mk('TCUR', engine.version(), 'setup'), mk('TFIN', engine.version(), 'finished')])
            .then(gs => { console.log(JSON.stringify({ current: engine.version(), ids: gs.map(g => g.id) })); process.exit(0); })`);
    return JSON.parse(out.split('\n').pop());
}

(async () => {
    const { chromium } = require('playwright-core');
    const admin = makeUser('admin'), user = makeUser('user');
    const rs = makeRundenspiele(admin);
    const before = rs.current;
    const browser = await chromium.launch({ executablePath: BROWSER });
    let live = null;
    try {
        // ── a live game, started the way the game page does it ───────────────────────────
        const player = await browser.newPage();
        await player.goto(BASE + '/');
        live = await player.evaluate(async () => {
            const clientId = 'running-test-' + Math.random().toString(36).slice(2);
            const res = await fetch('/api/sessions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: { mapKey: '0', playerCount: 2 }, host: { name: 'LiveTester', clientId, civ: 'griechenland' } }),
            });
            const s = await res.json();
            const sock = io({ transports: ['websocket'] });
            const emit = (ev, data) => new Promise(r => sock.emit(ev, data, r));
            const c = await emit('session:connect', { sessionId: s.sessionId, password: s.password, clientId });
            const st = await emit('game:start', {});
            window.__sock = sock;     // stays connected while the admin looks
            return { joinCode: s.joinCode, sessionId: s.sessionId, password: s.password, connect: c.error || 'ok', start: st.error || 'ok' };
        });
        ok(live.connect === 'ok' && live.start === 'ok', 'live game started', `${live.joinCode}: ${live.connect} / ${live.start}`);

        // ── a normal user may not see it ─────────────────────────────────────────────────
        // the context's request API shares the cookies with its pages
        const login = async (ctx, u) => (await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } })).status();
        const other = await browser.newContext();
        ok(await login(other, user) === 200, 'user logs in');
        ok((await other.request.get(BASE + '/api/admin/running')).status() === 403, 'normal user: /api/admin/running is 403');

        // ── the admin tab ────────────────────────────────────────────────────────────────
        const ctx = await browser.newContext({ locale: 'de-DE' });
        ok(await login(ctx, admin) === 200, 'admin logs in');
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(BASE + '/client/account.html');
        const tab = page.locator('[data-target="tab-admin-running"]');
        await tab.waitFor({ state: 'visible' });
        ok(await tab.isVisible(), 'tab "Laufende Spiele" is shown to admins');
        await tab.click();
        await page.waitForFunction(() => !/Lade|^$/.test(document.querySelector('#table-admin-running tbody').textContent.trim()));

        const rows = sel => page.$$eval(sel + ' tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
        const versions = await rows('#table-admin-versions');
        const count = v => { const r = versions.find(r => r[0].startsWith(v)); return r ? [+r[1], +r[2]] : null; };
        ok(versions.length && versions[0][0].startsWith(before) && /aktuell/.test(versions[0][0]), 'current version listed first', versions[0] && versions[0][0]);
        ok(count(before)[0] >= 1, 'current version: the live game counts', JSON.stringify(count(before)));
        ok(count(before)[1] >= 1, 'current version: the Rundenspiel in setup counts, the finished one not');
        for (const v of ['v83', 'v87', 'v88']) ok(count(v) && count(v)[1] >= 1, `${v}: its Rundenspiel counts`, JSON.stringify(count(v)));

        const liveRows = await rows('#table-admin-live');
        const lr = liveRows.find(r => r[0] === live.joinCode);
        ok(!!lr, 'live game listed', lr && lr.join(' | '));
        ok(lr && lr[1] === before, 'live game shows the current version', lr && lr[1]);
        ok(lr && /LiveTester/.test(lr[5]), 'live game lists its players', lr && lr[5]);
        ok(lr && lr[4] !== '', 'live game: whose turn is shown', lr && lr[4]);

        const asyncRows = await rows('#table-admin-running');
        const ar = code => asyncRows.find(r => r[0].startsWith(code));
        ok(ar('TV83') && ar('TV83')[1] === 'v83', 'Rundenspiel without version shows v83');
        ok(ar('TV87') && ar('TV87')[1] === 'v87', 'Rundenspiel v87 shows v87');
        ok(ar('TV88') && ar('TV88')[1] === 'v88' && ar('TV88')[2] === 'Draft', 'Rundenspiel v88 shows v88 and its status');
        ok(ar('TCUR') && ar('TCUR')[1] === before, 'new Rundenspiel shows the current version');
        ok(!ar('TFIN'), 'finished Rundenspiel is not listed');
        ok(ar('TV87') && ar('TV87')[4] === admin.name && /vor 2 T\./.test(ar('TV87')[6]), 'waiting for / since shown', ar('TV87') && ar('TV87').slice(4).join(' | '));

        // the finished-games tab no longer has the running table, and still loads
        await page.click('[data-target="tab-admin-games"]');
        await page.waitForFunction(() => !/Lade/.test(document.querySelector('#table-admin-games tbody').textContent));
        ok(await page.$$eval('#tab-admin-games table', t => t.length) === 1, 'tab "Spiele": only the finished games table');
        ok(errors.length === 0, 'no page errors', errors.join(' | '));

        await page.setViewportSize({ width: 412, height: 915 });
        await page.click('[data-target="tab-admin-running"]');
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(overflow <= 0, 'phone width: no horizontal page scroll', overflow + ' px');
        if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
    } finally {
        await browser.close();       // the live game is dropped by the server once nobody is connected
        sql(`DELETE FROM async_games WHERE id IN (${rs.ids.map(i => `'${i}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id IN ('${admin.id}', '${user.id}')`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
