/**
 * Refused moves in live games (F30: sockets/game.js 'action', mp.js sendAction) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/security/refused-move.test.js [http://localhost:3000]
 *
 * A live game of one account against three KI.
 * 1. Socket: a forged `research` of the Singularity is answered with `{ error, state }`; the
 *    state is the player's, unchanged.
 * 2. Page: the client plays a move on its own copy first. A copy that was tampered with (a tech
 *    made available locally) lets the move through there; the server refuses it, the page shows
 *    the reason and puts the board back to the server's state.
 *
 * The test account is deleted afterwards. Uses an installed Chrome or Edge (no browser
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
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
function makeUser() {
    const name = 'rfm_' + crypto.randomBytes(3).toString('hex');
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
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const ua = makeUser();
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 860 } });
        const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: ua.name, password: PASSWORD } });
        if (r.status() !== 200) throw new Error('login failed');
        const a = await ctx.newPage();
        a.on('pageerror', e => errors.push(e.message));
        a.on('dialog', d => d.accept());
        await a.goto(BASE + '/');
        await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await a.evaluate(() => MP.showLobby());
        await a.waitForFunction(() => typeof MP.setMode === 'function');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { mapKey: '0', playerCount: 4, kiCount: 3 }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4 && MP.gameConfig.kiCount === 3);
        await a.evaluate(() => MP.startGame());
        await a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
            && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
        await a.waitForFunction(() => MP.isMyTurn() && !S.over, null, { timeout: 60000 });

        // ── 1. Socket ─────────────────────────────────────────────────────────────
        const sing = await emit(a, 'action', { type: 'research', params: { tech: 'singularitaet' } });
        ok(sing && sing.error === 'Diese Technologie ist nicht erforschbar.', 'socket: the Singularity without prerequisites is refused', sing && sing.error);
        ok(sing && sing.state && Array.isArray(sing.state.players) && !sing.state.over
            && !sing.state.players[sing.state.cur].techs.singularitaet, 'socket: the answer carries the unchanged state');

        // ── 2. Page ───────────────────────────────────────────────────────────────
        const res = await a.evaluate(() => new Promise(done => {
            const me = MP.playerIndex, p = S.players[me];
            const tk = Object.keys(TECH_BY_KEY).find(k => !p.avail[k] && !p.techs[k] && TECH_BY_KEY[k].age === 0);
            const toasts = [];
            const origToast = window.toast;
            window.toast = m => { toasts.push(m); return origToast(m); };
            p.avail[tk] = true;                 // tampered copy: the tech looks available here
            p.res.sci = 1000;
            const local = doResearch(S, me, tk);
            const afterLocal = !!S.players[me].techs[tk];
            const t0 = Date.now();
            (function wait() {
                if (toasts.length || Date.now() - t0 > 8000) {
                    setTimeout(() => {          // applyState after the toast
                        window.toast = origToast;
                        done({ tk, local, afterLocal, toasts, now: !!S.players[MP.playerIndex].techs[tk], avail: !!S.players[MP.playerIndex].avail[tk] });
                    }, 300);
                } else setTimeout(wait, 50);
            })();
        }));
        ok(res.local === null && res.afterLocal, 'page: the tampered copy plays the move locally', `${res.tk}`);
        ok(res.toasts.includes('Diese Technologie ist nicht erforschbar.'), 'page: the reason is shown', JSON.stringify(res.toasts));
        ok(!res.now && !res.avail, 'page: the board is back to the server\'s state', JSON.stringify(res));
        ok(!errors.length, 'no page errors', errors.join(' | '));
    } catch (e) {
        console.error(e);
        failed++;
    } finally {
        await browser.close();
        for (const u of users) inServer(`require('./models').User.destroy({ where: { id: '${u.id}' } }).then(() => process.exit(0))`);
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
