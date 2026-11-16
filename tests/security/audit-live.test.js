/**
 * Fixes from the security audit of 16.11.2026 over real sockets, against the local docker setup
 * (the same checks without docker: tests/security/audit.test.js):
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/security/audit-live.test.js [http://localhost:3000]
 *
 *   · POST /api/sessions and lobby:config: a chosen seed, fixedDice or startPlayer is not taken;
 *   · lobby:player:update: another nation's ability and a made-up nation are refused;
 *   · a ranked live game with one human does not start;
 *   · the started game's state reaches the client without S.seed; a road with target "2" is
 *     refused;
 *   · the admin page's broadcast (sys:message) shows up in the game page as a dialog, as text.
 *
 * An admin account is created and deleted afterwards. Uses an installed Chrome or Edge (no
 * browser download); set HOCHCIV_BROWSER to its path if it is not found.
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
    const name = 'aud_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id: id.split('\n').pop() };
}

(async () => {
    const { chromium } = require('playwright-core');
    const admin = makeUser('admin');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');

        // ── a raw client: lobby over REST and its own socket ────────────────────
        const r = await page.evaluate(async () => {
            const clientId = 'audit-' + Math.random().toString(36).slice(2);
            const res = await fetch('/api/sessions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: { mapKey: '0', playerCount: 2, kiCount: 1, seed: 4242, fixedDice: 99, startPlayer: 1 },
                    host: { name: 'Audit', clientId, civ: 'england' } }),
            });
            const s = await res.json();
            const sock = io({ transports: ['websocket'] });
            window.__sock = sock;
            window.__emit = (ev, data) => new Promise(done => sock.emit(ev, data, done));
            const c = await window.__emit('session:connect', { sessionId: s.sessionId, password: s.password, clientId });
            return { s, c };
        });
        const cfg = r.c.gameConfig || {};
        ok(!r.c.error && cfg.seed !== 4242 && Number.isInteger(cfg.seed) && cfg.fixedDice === undefined && cfg.startPlayer === undefined,
            'create: the server rolls the seed, fixedDice/startPlayer are dropped', JSON.stringify({ seed: cfg.seed, fixedDice: cfg.fixedDice, startPlayer: cfg.startPlayer }));
        const emit = (ev, data) => page.evaluate(([ev, data]) => window.__emit(ev, data), [ev, data]);

        const upd = await page.evaluate(() => new Promise(done => {
            window.__sock.once('lobby:config:update', c => done(c));
            window.__emit('lobby:config', { seed: 5, fixedDice: 99, startPlayer: 1, wonders: true });
        }));
        ok(upd.seed === cfg.seed && upd.fixedDice === undefined && upd.startPlayer === undefined && upd.wonders === true,
            'lobby:config: seed, fixedDice and startPlayer stay the server\'s, wonders is taken', JSON.stringify({ seed: upd.seed, fixedDice: upd.fixedDice, startPlayer: upd.startPlayer, wonders: upd.wonders }));
        let a;

        // ── nation and ability ──────────────────────────────────────────────────
        a = await emit('lobby:player:update', { ability: 'siedler' });
        ok(/gehört nicht/.test(a.error || ''), 'England with Siedlertrecks is refused', a.error);
        a = await emit('lobby:player:update', { civ: 'atlantis' });
        ok(/Unbekannte Nation/.test(a.error || ''), 'a made-up nation is refused', a.error);
        a = await emit('lobby:player:update', { civ: 'russland' });
        ok(!a.error, 'Russland is taken', a.error);
        a = await emit('lobby:player:update', { ability: 'siedler' });
        ok(!a.error, 'Russland with Siedlertrecks is taken', a.error);

        // ── ranked alone against the KI ─────────────────────────────────────────
        await emit('lobby:config', { mapKey: 'random', playerCount: 2, kiCount: 1, ranked: true });
        a = await emit('game:start', {});
        ok(/mindestens 2 Spieler/.test(a.error || ''), 'ranked with one human does not start', a.error);

        // ── the game: no seed, no "2" railway ───────────────────────────────────
        await emit('lobby:config', { mapKey: '0', playerCount: 2, kiCount: 1, ranked: false });
        const started = await page.evaluate(() => new Promise(done => {
            window.__sock.once('game:start', d => done(d));
            window.__emit('game:start', {}).then(x => { if (x && x.error) done({ error: x.error }); });
        }));
        ok(started.state && !('seed' in started.state), 'game:start: the state has no seed', started.error || (started.state && started.state.seed));
        const me = started.yourIndex;
        if (started.state && started.state.cur === me) {
            const cap = started.state.cities.find(c => c.owner === me && c.cap);
            a = await emit('action', { type: 'buildRoad', params: { r: cap.r, c: cap.c, target: '2' } });
            ok(a.error && a.state && !(`${cap.r},${cap.c}` in (a.state.roads || {})), 'a road with target "2" is refused', a.error);
            ok(a.state && !('seed' in a.state), 'the refused move\'s state has no seed');
        } else ok(false, 'the human moves first in this game', `cur ${started.state && started.state.cur}, me ${me}`);
        await page.evaluate(() => window.__sock.disconnect());

        // ── the admin broadcast in the real game page ───────────────────────────
        await page.evaluate(() => { MP.showLobby(); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        await page.fill('#mp-n', 'AuditHost');
        await page.evaluate(() => MP.host());
        await page.waitForSelector('#mp-p-civ-0');
        const sid = await page.evaluate(() => MP.sessionId);
        const ctx = await browser.newContext();
        ok((await ctx.request.post(BASE + '/api/auth/login', { data: { username: admin.name, password: PASSWORD } })).status() === 200, 'admin logs in');
        const msg = 'Wartung um 22 Uhr <b>bitte</b> speichern';
        const res = await ctx.request.post(`${BASE}/api/admin/lobbies/${sid}/action`, { data: { action: 'broadcast', message: msg } });
        ok(res.status() === 200, 'admin broadcast sent', res.status());
        await page.waitForFunction(() => /Nachricht vom Admin/.test(document.getElementById('ov-title').textContent)
            && document.getElementById('overlay').classList.contains('show'), null, { timeout: 5000 }).catch(() => null);
        const shown = await page.evaluate(() => ({ title: document.getElementById('ov-title').textContent, body: document.getElementById('ov-body').textContent,
            bold: !!document.querySelector('#ov-body b') }));
        ok(/Nachricht vom Admin/.test(shown.title) && shown.body.includes(msg) && !shown.bold, 'the broadcast shows as a dialog, as plain text', JSON.stringify(shown));
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        await browser.close();
        sql(`DELETE FROM users WHERE id = '${admin.id}'`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
