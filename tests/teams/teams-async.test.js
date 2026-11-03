/**
 * Team mode in Rundenspiele (F22: async/logic.js, async/service.js, mp.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/teams/teams-async.test.js [http://localhost:3000]
 *
 * The form's team rows; a team game is humans only (a KI count is ignored); joiners pick a team,
 * a full team is refused and the join dialog only offers teams with room; the game starts with
 * the teams on the state and the seats tagged; a team message is only in the team's history;
 * when team B resigns, team A wins together.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').filter(l => !/Engine Adapter/.test(l)).join('\n');
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [], games = [];
function makeUser() {
    const name = 'tma_' + crypto.randomBytes(3).toString('hex');
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

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const [A, B, C, D] = [makeUser(), makeUser(), makeUser(), makeUser()];
        const page = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            const p = await ctx.newPage();
            p.on('pageerror', e => errors.push(`${u.name}: ${e.message}`));
            p.on('dialog', d => d.accept());
            await p.goto(BASE + '/');
            await p.waitForFunction(() => typeof ASYNC !== 'undefined' && MP.user);
            return p;
        };
        const api = (p, method, path, body) => p.evaluate(async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() }; }, [method, path, body]);
        const [pa, pb, pc, pd] = [await page(A), await page(B), await page(C), await page(D)];

        // the form
        await pa.evaluate(() => ASYNC.showCreate());
        await pa.waitForSelector('#mpa-teams');
        await pa.check('#mpa-teams');
        await pa.waitForSelector('#mpa-team', { timeout: 5000 });
        ok(await pa.evaluate(() => ASYNC.form.teams && ASYNC.form.kiCount === 0), 'form: teams, KI 0, own team');

        // create: a KI count is ignored
        const g = (await api(pa, 'POST', '/api/async', { config: { mapKey: '0', civMode: 'fixed', playerCount: 4, kiCount: 2, teams: true }, civ: 'griechenland', ability: 'basis', team: 0 })).body;
        games.push(g.id);
        const info = (await api(pa, 'GET', '/api/async/' + g.id)).body;
        ok(info.config.teams && info.config.humanCount === 4 && info.config.noKi, 'created: teams, four humans, no KI', JSON.stringify({ t: info.config.teams, h: info.config.humanCount }));
        const join = (p, civ, team) => api(p, 'POST', `/api/async/${g.id}/join`, { code: g.joinCode, civ, ability: 'basis', team });
        ok((await join(pb, 'england', 1)).body.ok && (await join(pc, 'russland', 0)).body.ok, 'B joins team B, C team A');
        // D's join dialog offers only team B
        await pd.evaluate(([id, code]) => ASYNC.showJoin(id, code), [g.id, g.joinCode]);
        await pd.waitForSelector('#mpa-jteam', { timeout: 8000 });
        const offered = await pd.$$eval('#mpa-jteam option', o => o.map(x => x.value).join());
        ok(offered === '1', 'join dialog: only the team with room', offered);
        const full = await join(pd, 'wikinger', 0);
        ok(full.body.error === 'Dieses Team ist schon voll.', 'a full team is refused', full.body.error);
        ok((await join(pd, 'wikinger', 1)).body.ok, 'D joins team B');

        const v = (await api(pa, 'GET', '/api/async/' + g.id)).body;
        ok(v.status === 'playing', 'four players: the game starts', v.status);
        const st = inServer(`const s = require('./async/service'); const L = require('./async/logic');
            require('./models').AsyncGame.findByPk('${g.id}').then(r => { const S = r.state; const d = r.data;
              console.log(JSON.stringify(S.players.map((p, i) => d.seats[p.slot].name + ':' + S.mpTeams[i]))); process.exit(0); })`);
        const pairs = JSON.parse(st).sort().join();
        const expect = [A.name + ':0', B.name + ':1', C.name + ':0', D.name + ':1'].sort().join();
        ok(pairs === expect, 'the teams are on the state', pairs);
        ok(v.seats.every(s => s.team === 0 || s.team === 1), 'seats carry their team');

        // team chat: B to team B
        await pb.goto(BASE + '/?async=' + g.id);
        await pb.waitForFunction(id => MP.asyncId === id && typeof S !== 'undefined' && S, g.id, { timeout: 20000 });
        ok(await pb.evaluate(() => CHAT.canTeam()), 'chat: the team button in a team Rundenspiel');
        const sent = await pb.evaluate(id => new Promise(r => MP.socket.emit('async:chat', { id, kind: 'emote', emote: CHAT.EMOTES[0], team: true }, r)), g.id);
        ok(sent && sent.ok, 'B sends to team B');
        const historyOf = u => inServer(`const s = require('./async/service'); s.open({ id: '${u.id}' }, '${g.id}').then(r => { console.log(JSON.stringify((r.chat || []).map(m => m.team))); process.exit(0); })`);
        ok(historyOf(D) === '[1]' && historyOf(A) === '[]', 'history: the teammate has it, the other team not', `${historyOf(D)} / ${historyOf(A)}`);

        // team B resigns → team A wins
        ok((await api(pb, 'POST', `/api/async/${g.id}/resign`)).body.ok, 'B resigns');
        ok((await api(pd, 'POST', `/api/async/${g.id}/resign`)).body.ok, 'D resigns');
        let fin = null;
        for (let i = 0; i < 40 && !fin; i++) { const r = (await api(pa, 'GET', '/api/async/' + g.id)).body; if (r.status === 'finished') fin = r; else await new Promise(x => setTimeout(x, 500)); }
        ok(fin && [...fin.winners].sort().join() === [A.name, C.name].sort().join(), 'team A wins together', fin && JSON.stringify(fin.winners));
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const id of games) sql(`DELETE FROM async_games WHERE id = '${id}'`);
        for (const u of users) {
            sql(`DELETE FROM games WHERE participants::text LIKE '%${u.id}%'`);
            sql(`DELETE FROM users WHERE id = '${u.id}'`);
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
