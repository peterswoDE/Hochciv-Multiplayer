/**
 * Turn positions and the nation draft in a Rundenspiel, in the browser (F34: mp.js ASYNC,
 * sockets/async.js 'async:civdraft') against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/draft/async-draft-browser.test.js [http://localhost:3000]
 *
 * A creates a game in the form (draft, positions picked, A on position 2) on the Originalkarte
 * with one KI; B joins in the dialog on position 1. The game is full: the KI (position 3)
 * picks first on its own, then A, then B, each in the draft dialog of the game; then the game
 * starts with B and plays the positions in order. Test accounts and the game are deleted
 * afterwards. Uses an installed Chrome or Edge; set HOCHCIV_BROWSER to its path if not found.
 */
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const builtin = require('../../maps/builtin');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').pop();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [], asyncIds = [];
function makeUser() {
    const name = 'adr_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() })
            .then(u => { console.log(u.id); process.exit(0); })`);
    users.push({ name, id });
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
    const errors = [];
    try {
        const ua = makeUser(), ub = makeUser();
        const page = async (u, tag) => {
            const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 860 } });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
            p.on('dialog', d => d.accept());
            await p.goto(BASE + '/');
            await p.waitForFunction(() => typeof ASYNC !== 'undefined' && MP.user);
            return p;
        };
        const a = await page(ua, 'A'), b = await page(ub, 'B');
        const urkart = builtin.find(m => m.code === 'URKART').map;

        // ── the form ──────────────────────────────────────────────────────────────
        await a.evaluate(() => { ASYNC.form = null; ASYNC.showCreate(); });
        await a.waitForSelector('#mpa-civmode');
        await a.selectOption('#mpa-civmode', 'draft');
        await a.waitForFunction(() => ASYNC.form.civMode === 'draft' && !$('mpa-civ'));
        const orders = await a.$$eval('#mpa-order option', os => os.map(o => o.value).join());
        ok(orders === 'pick,random', 'form: a draft offers no classic order', orders);
        await a.selectOption('#mpa-order', 'pick');
        await a.waitForSelector('#mpa-pos');
        await a.selectOption('#mpa-pos', '1');
        const f = await a.evaluate(() => { ASYNC.readForm(false); return ASYNC.form; });
        ok(f.civMode === 'draft' && f.turnOrder === 'pick' && f.pos === 1, 'form: draft, positions picked, the host on position 2', JSON.stringify([f.civMode, f.turnOrder, f.pos]));
        ok(/beim Beitreten eine freie Position/.test(await a.textContent('#ov-body')), 'form: the hint explains the positions');

        // created with the form's settings, on the Originalkarte (the form's map list comes from "Meine Karten")
        const g = await a.evaluate(async m => {
            const f = ASYNC.form;
            return ASYNC.api('', { config: { mapKey: 'eigene', customMap: m, civMode: f.civMode, turnOrder: f.turnOrder, playerCount: 3, kiCount: 1, isPublic: false }, pos: f.pos });
        }, urkart);
        asyncIds.push(g.id);
        const info = await a.evaluate(id => ASYNC.api('/' + id), g.id);

        // ── the join dialog ───────────────────────────────────────────────────────
        await b.evaluate(([id, code]) => ASYNC.showJoin(id, code), [g.id, info.joinCode]);
        await b.waitForSelector('#mpa-jpos');
        const pos = await b.$$eval('#mpa-jpos option', os => os.map(o => o.value + ':' + o.textContent).join());
        ok(pos === '0:Position 1,2:Position 3', 'join dialog: the free positions', pos);
        ok(!(await b.$('#mpa-jciv')), 'join dialog: no nation to pick (drafted)');
        await b.selectOption('#mpa-jpos', '0');
        await b.evaluate(() => ASYNC.join());

        // ── the draft ─────────────────────────────────────────────────────────────
        await b.waitForFunction(() => MP.civDraft && MP.civDraft.cur != null, null, { timeout: 15000 });
        const d = await b.evaluate(() => MP.civDraft);
        ok(d.picks[2] && d.cur === 1, 'the KI (position 3) picked first, now the host', JSON.stringify(d.picks));
        ok(await b.$$eval('#mp-cd-pool button:not([disabled])', bs => bs.length) === 0, 'B waits');
        await a.evaluate(id => ASYNC.open(id), g.id);
        await a.waitForFunction(() => MP.civDraft && MP.civDraft.cur === 1 && document.querySelector('#mp-cd-pool button:not([disabled])'), null, { timeout: 15000 });
        await a.click('#mp-cd-pool button:not([disabled])');
        await b.waitForFunction(() => MP.civDraft && MP.civDraft.cur === 0 && document.querySelector('#mp-cd-pool button:not([disabled])'), null, { timeout: 15000 });
        await b.click('#mp-cd-pool button:not([disabled])');
        await b.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
        const st = await b.evaluate(() => ({ slots: S.players.map(p => p.slot).join(), cur: S.cur, me: MP.playerIndex, civs: S.players.map(p => p.civ) }));
        ok(st.slots === '0,1,2' && st.cur === 0 && st.me === 0, 'the game starts with B (position 1) and plays the positions in order', JSON.stringify(st));
        ok(new Set(st.civs).size === 3, 'the Originalkarte as a custom map: three different nations (each at most once with three empires)', st.civs.join());
        const row = sql(`SELECT status FROM async_games WHERE id = '${g.id}'`);
        ok(row === 'playing', 'stored as playing', row);
    } catch (e) {
        ok(false, 'test run', e.stack);
    } finally {
        for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
