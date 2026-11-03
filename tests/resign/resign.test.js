/**
 * Resign (F16: utils/resign.js, sockets/game.js 'game:resign', async 'resign', mp.js) against the
 * local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/resign/resign.test.js [http://localhost:3000]
 *
 * Unit: when a resign ends the game (one human left in a game without KI, nobody human left).
 * Live, ranked duel of two accounts: B resigns from the game menu → A wins at once, B is out
 * of the rating with −15 MMR and a played game, the match record says so. Live, two guests and
 * one KI: B resigns on B's turn → the KI plays it, B's actions are refused, A sees "Aufgegeben";
 * then A resigns → the game ends on points. Rundenspiele: a duel ends with the other's win; a
 * game with KI goes on, the resigned player watches and can't act.
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
const users = [], asyncIds = [];
function makeUser() {
    const name = 'rsg_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false })
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
async function until(fn, ms = 15000, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

function unit() {
    const engine = require('../../engine-adapter');
    const { endAfterResign } = require('../../utils/resign');
    const E = engine.getEngine();
    const S = engine.createGame({
        gameConfig: { mapKey: '0', playerCount: 3, seed: 5 },
        players: ['griechenland', 'england', 'russland'].map(civ => ({ civ, ability: 'basis', kind: 'human' })),
    });
    ok(endAfterResign(E, S, [0, 1], false) === null, 'unit: two humans left – the game goes on');
    const one = endAfterResign(E, S, [2], false);
    ok(one && one.winners.join() === '2' && one.resign && one.how === 'Alle anderen haben aufgegeben', 'unit: one human left, no KI at the start – they win', JSON.stringify(one));
    ok(endAfterResign(E, S, [2], true) === null, 'unit: one human left against the KI – the game goes on');
    const none = endAfterResign(E, S, [], true);
    const best = Math.max(...S.players.map((_, i) => E.victoryScore(S, i).total));
    ok(none && none.winners.length >= 1 && none.winners.every(i => E.victoryScore(S, i).total === best), 'unit: nobody human left – the most points win', JSON.stringify(none));
    S.over = { winners: [0] };
    ok(endAfterResign(E, S, [], false) === null, 'unit: a game that is over stays as it is');
}

(async () => {
    unit();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const page = async (name, user) => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        if (user) {
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + user.name);
        }
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        p.on('dialog', d => d.accept());
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await p.evaluate(() => MP.showLobby());
        await p.waitForFunction(() => typeof MP.setMode === 'function');
        p.ctx = ctx;
        return p;
    };
    const host = async (p, name, cfg) => {
        await p.fill('#mp-n', name);
        await p.evaluate(() => MP.host());
        await p.waitForSelector('#mp-p-civ-0');
        await p.selectOption('#mp-p-civ-0', 'griechenland');
        await p.evaluate(c => MP.socket.emit('lobby:config', c), cfg);
        await p.waitForFunction(c => MP.gameConfig.playerCount === c.playerCount && !!MP.gameConfig.ranked === !!c.ranked, cfg);
        return p.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
    };
    const join = async (p, cred, name, idx, civ) => {
        await p.evaluate(([c, n]) => MP.joinWith(c.code, c.pw, n), [cred, name]);
        await p.waitForSelector(`#mp-p-civ-${idx}`);
        await p.selectOption(`#mp-p-civ-${idx}`, civ);
    };
    const inGame = p => p.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 });
    try {
        // ── Live, ranked duel of two accounts ──────────────────────────────────────
        const ua = makeUser(), ub = makeUser();
        const a = await page('A', ua), b = await page('B', ub);
        const cred = await host(a, ua.name, { playerCount: 2, kiCount: 0, mapKey: '0', ranked: true });
        await join(b, cred, ub.name, 1, 'russland');
        await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        await a.evaluate(() => MP.startGame());
        await Promise.all([inGame(a), inGame(b)]);
        const aIdx = await a.evaluate(() => MP.playerIndex);

        // B resigns from the game menu
        await b.click('#g-menu');
        await b.waitForSelector('#mm-resign', { timeout: 5000 });
        ok(await b.isVisible('#mm-resign'), 'game menu: "Aufgeben"');
        await b.click('#mm-resign');
        const over = await until(() => a.evaluate(() => S && S.over ? S.over : null), 15000);
        ok(over && over.resign && over.winners.join() === String(aIdx) && over.how === 'Alle anderen haben aufgegeben', 'duel: B resigns → A wins at once', JSON.stringify(over));
        await b.waitForFunction(() => S && S.over, null, { timeout: 10000 });
        ok(true, 'B sees the end too');
        const rec = await until(async () => {
            const r = sql(`SELECT participants FROM games WHERE participants::text LIKE '%${ub.name}%' ORDER BY "createdAt" DESC LIMIT 1`);
            return r ? JSON.parse(r) : null;
        }, 15000, 500);
        const pb = rec && rec.find(p => p.name === ub.name), pa = rec && rec.find(p => p.name === ua.name);
        ok(pb && pb.resigned && pb.replaced && pb.dbUserId === null && pb.replacedUserId === ub.id && pb.penalty === -15, 'match record: B resigned, out of the rating, −15', JSON.stringify(pb));
        ok(pa && pa.isWinner && pa.dbUserId === ua.id && pa.mmrShift > 0, 'match record: A won and gained MMR', pa && String(pa.mmrShift));
        const mb = sql(`SELECT mmr || ':' || "gamesPlayed" FROM users WHERE id = '${ub.id}'`);
        ok(mb === '985:1', 'B: 1000 − 15 MMR, one game played', mb);
        await a.ctx.close(); await b.ctx.close();

        // ── Live, two guests and one KI ────────────────────────────────────────────
        const c = await page('C'), d = await page('D');
        const cred2 = await host(c, 'ResignC', { playerCount: 3, kiCount: 1, mapKey: '0' });
        await join(d, cred2, 'ResignD', 1, 'russland');
        await c.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        await c.evaluate(() => MP.startGame());
        await Promise.all([inGame(c), inGame(d)]);
        const dIdx = await d.evaluate(() => MP.playerIndex);
        // C ends its turns until it is D's turn
        const driver = setInterval(() => c.evaluate(() => {
            if (!S || S.over || !MP.isMyTurn() || MP._ending === S.round + ':' + S.cur) return;
            MP._ending = S.round + ':' + S.cur;
            if (typeof closeModal === 'function') closeModal();
            MP.sendAction({ type: 'endTurn' });
        }).catch(() => { }), 200);
        const dTurn = await until(() => d.evaluate(() => MP.isMyTurn() ? { round: S.round } : null), 30000);
        clearInterval(driver);
        ok(!!dTurn, 'D has the turn');
        const r1 = await emit(d, 'game:resign');
        ok(r1 && r1.ok, 'D resigns on D\'s turn');
        const moved = await until(() => d.evaluate(i => S.cur !== i, dIdx), 15000);
        ok(!!moved, 'the KI plays D\'s turn, the game goes on');
        const dState = await d.evaluate(() => ({ my: MP.isMyTurn(), resigned: MP.hasResigned(), banner: !document.getElementById('mp-afk-banner').hidden, text: document.getElementById('mp-afk-text').textContent }));
        ok(!dState.my && dState.resigned && dState.banner && /Du hast aufgegeben/.test(dState.text), 'D: watches, with the banner', JSON.stringify(dState));
        const act = await emit(d, 'action', { type: 'endTurn' });
        ok(act && act.error === 'Du hast aufgegeben.', 'D\'s actions are refused', act && act.error);
        await c.waitForFunction(() => /Aufgegeben/.test(document.getElementById('mp-players-content').textContent), null, { timeout: 10000 })
            .then(() => ok(true, 'C\'s player list: D "Aufgegeben"'), () => ok(false, 'C\'s player list: D "Aufgegeben"'));
        // the new state shows once the KI's turn was played on the map (client/scenes.js)
        ok(!!(await until(() => c.evaluate(() => S.log.some(e => /ResignD gibt auf/.test(e.m))), 20000)), 'the game log says who resigned');
        // the last human resigns: the game ends on points
        await until(() => c.evaluate(() => MP.isMyTurn() || MP.canResign()), 30000);
        const r2 = await emit(c, 'game:resign');
        ok(r2 && r2.ok, 'C resigns as well');
        const over2 = await until(() => c.evaluate(() => S && S.over ? S.over : null), 15000);
        ok(over2 && over2.resign && /Punktvergleich/.test(over2.how), 'nobody human left: the game ends on points', JSON.stringify(over2));
        await c.ctx.close(); await d.ctx.close();

        // ── Rundenspiele ──────────────────────────────────────────────────────────
        const uc = makeUser(), ud = makeUser();
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            return ctx;
        };
        const cc = await login(uc), cd = await login(ud);
        const create = async cfg => {
            const g = await (await cc.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', ...cfg }, civ: 'griechenland', ability: 'basis' } })).json();
            asyncIds.push(g.id);
            await cd.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
            return g;
        };
        // a duel: D resigns → C wins
        const g1 = await create({ playerCount: 2, kiCount: 0 });
        const before = await (await cd.request.post(BASE + `/api/async/${g1.id}/resign`)).json();
        ok(before.ok, 'Rundenspiel duel: D resigns', JSON.stringify(before));
        const v1 = await until(async () => { const v = await (await cc.request.get(BASE + '/api/async/' + g1.id)).json(); return v.status === 'finished' ? v : null; }, 15000, 300);
        ok(v1 && v1.winners.join() === uc.name, 'Rundenspiel duel: C wins at once', v1 && JSON.stringify(v1.winners));
        const gp = sql(`SELECT "gamesPlayed" FROM users WHERE id = '${ud.id}'`);
        ok(gp === '1', 'Rundenspiel duel: D has one game played', gp);
        // with KI: the game goes on, D watches
        const g2 = await create({ playerCount: 3, kiCount: 1 });
        await until(async () => (await (await cc.request.get(BASE + '/api/async/' + g2.id)).json()).status === 'playing', 10000, 300);
        const pd = await cd.newPage();
        pd.on('pageerror', e => errors.push(`RD: ${e.message}`));
        pd.on('dialog', dl => dl.accept());
        await pd.goto(BASE + '/?async=' + g2.id);
        await pd.waitForFunction(() => typeof ASYNC !== 'undefined' && ASYNC.view && ASYNC.view.status === 'playing' && MP.canResign(), null, { timeout: 20000 });
        await pd.evaluate(() => MP.resign());
        await pd.waitForFunction(() => ASYNC.view && ASYNC.view.resigned, null, { timeout: 15000 });
        const v2 = await pd.evaluate(() => ({ status: ASYNC.view.status, my: ASYNC.view.myIndex, can: MP.canResign(), seat: ASYNC.view.seats.find(s => s.resigned) }));
        ok(v2.status === 'playing' && v2.my === -1 && !v2.can && v2.seat && v2.seat.kind === 'ki', 'Rundenspiel with KI: goes on, D watches', JSON.stringify(v2));
        const act2 = await pd.evaluate(id => new Promise(r => MP.socket.emit('async:action', { id, type: 'endTurn' }, r)), g2.id);
        ok(act2 && act2.error, 'Rundenspiel: D\'s actions are refused', act2 && act2.error);
        const again = await (await cd.request.post(BASE + `/api/async/${g2.id}/resign`)).json();
        ok(again.error === 'Du bist nicht in diesem Spiel.', 'Rundenspiel: no second resign', again.error);
        await cc.close(); await cd.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) {
            sql(`DELETE FROM games WHERE participants::text LIKE '%${u.name}%'`);
            sql(`DELETE FROM users WHERE id = '${u.id}'`);
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
