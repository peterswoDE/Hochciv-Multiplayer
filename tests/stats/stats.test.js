/**
 * Post-game statistics (utils/stats.js, client/stats.js, routes/games.js) against the local docker
 * setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/stats/stats.test.js [http://localhost:3000]
 *
 * 1. Recording, directly with the engine: four KI empires play a game, record() is called after
 *    every turn – one point per round, the scores are victoryScore, events point at empires.
 * 2. Live game in the browser (a logged-in test account hosts, three KI empires, the host only
 *    ends turns): the end screen's "Statistik" with chart, legend, tooltip, key moments and
 *    table; the match record and GET /api/games/:id carry the same statistics; the player's
 *    profile draws the chart when the match is opened.
 * 3. Rundenspiel (finish-async.js in the container): the KI plays a real game to its end through
 *    the service – statistics stored with the game, in the finished view and the match record.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
 * download); set HOCHCIV_BROWSER to its path if it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
const inServer = (code, env = {}) => execFileSync('docker', ['exec', '-i', '-w', '/app',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'stat_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

function recording() {
    const engine = require('../../engine-adapter');
    const Stats = require('../../utils/stats');
    const session = {
        gameConfig: { mapKey: 'gross', playerCount: 4, seed: 7, wonders: true },
        players: ['griechenland', 'england', 'russland', 'wikinger'].map(civ => ({ civ, ability: 'basis', kind: 'ki', kiLevel: 'mittel' })),
    };
    const S = engine.createGame(session);
    const E = engine.getEngine();
    const names = S.players.map((p, i) => 'P' + i);
    let st = Stats.record(null, E, S, names);
    st = Stats.record(st, E, S, names);
    ok(st.rounds.length === 1 && st.rounds[0].r === 1, 'record: the start is the first point, twice in a round adds nothing');
    for (let n = 0; n < 400 && !S.over; n++) {
        engine.autoTurn(S);
        if (!E.finishTurn(S)) E.advanceTurn(S);
        st = Stats.record(st, E, S, names, !!S.over);
    }
    const rs = st.rounds.map(r => r.r);
    ok(S.over && st.final, 'record: the game ends, the last point is final', `round ${S.round}`);
    ok(rs.every((r, k) => k === 0 || r === rs[k - 1] + 1) && rs[rs.length - 1] === S.round, 'record: one point per round, up to the last', rs.join(','));
    const last = st.rounds[st.rounds.length - 1];
    ok(last.p.every((x, i) => x.s === E.victoryScore(S, i).total && x.c === S.cities.filter(c => c.owner === i).length),
        'record: the last point has the final scores and cities', last.p.map(x => x.s).join(','));
    ok(st.events.length > 0 && st.events.every(e => e.r >= 1 && e.r <= S.round && st.players[e.pi]), 'record: events with rounds and empires', st.events.map(e => e.k).join(','));
    ok(st.players.every((p, i) => p.name === 'P' + i && p.civ === S.players[i].civ), 'record: players with names and nations');
    const pub = Stats.publicStats(st);
    ok(!pub.owners && !pub.wonders && pub.rounds.length === st.rounds.length, 'publicStats: without the bookkeeping');
}

async function live(browser, errors) {
    const user = makeUser();
    try {
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
        const login = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
        ok(login.status() === 200, 'live: the test account logs in');
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`live: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof STATS !== 'undefined');
        await page.evaluate(async name => {
            localStorage.setItem('mp-name', name);           // the lobby name (the legend shows it)
            await MP.showLobby();
            MP.setMode('host');
            await MP.host();
        }, 'Gastgeber');
        await page.waitForFunction(() => MP.active && MP.lobbyIndex === 0);
        await page.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 3, mapKey: 'gross', wonders: true }));
        await page.waitForFunction(() => MP.gameConfig.playerCount === 4);
        await page.evaluate(() => MP.startGame());
        await page.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'));
        const driver = setInterval(() => page.evaluate(() => {
            if (S && !S.over && MP.isMyTurn() && MP._e !== S.round + ':' + S.cur) { MP._e = S.round + ':' + S.cur; closeModal(); MP.sendAction({ type: 'endTurn' }); }
        }).catch(() => { }), 200);
        await page.waitForFunction(() => S && S.over && document.getElementById('mp-stats-btn'), null, { timeout: 300000 });
        clearInterval(driver);
        ok(true, 'live: the end screen has "📊 Statistik"');
        await page.click('#mp-stats-btn');
        const view = await page.evaluate(() => ({
            lines: document.querySelectorAll('#mp-stats-box svg path[stroke-width="2"]').length,
            legend: [...document.querySelectorAll('#mp-stats-box .hcs-legend > span')].map(s => s.textContent.trim()),
            moments: document.querySelectorAll('#mp-stats-box .hcs-moments li').length,
            rounds: MP.lastStats.rounds.length, final: MP.lastStats.final, owners: 'owners' in MP.lastStats,
        }));
        ok(view.lines === 4 && view.legend.length === 4, 'live: four lines, four legend entries', view.legend.join(' | '));
        ok(view.legend.some(l => l.startsWith('Gastgeber (')), 'live: the host is named in the legend (lobby name and nation)');
        ok(view.moments >= 1, 'live: key moments listed', String(view.moments));
        ok(view.final && !view.owners && view.rounds >= 2, 'live: final statistics without bookkeeping', `${view.rounds} rounds`);
        const hit = await page.$('#mp-stats-box .hcs-hit');
        const bb = await hit.boundingBox();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        const tip = await page.evaluate(() => { const t = document.querySelector('#mp-stats-box .hcs-tip'); return { hidden: t.hidden, rows: t.querySelectorAll('div:not(.hcs-tip-head)').length }; });
        ok(!tip.hidden && tip.rows === 4, 'live: the tooltip lists every empire', JSON.stringify(tip));
        await page.click('#mp-stats-box .hcs-table-btn');
        const rows = await page.evaluate(() => document.querySelectorAll('#mp-stats-box .hcs-tables table')[0].rows.length);
        ok(rows === view.rounds + 1, 'live: the table has a row per round', String(rows));

        // the match record and the API
        await page.waitForTimeout(1500);
        const gameId = sql(`SELECT id FROM games WHERE participants::text LIKE '%${user.name}%' ORDER BY "createdAt" DESC LIMIT 1`);
        const stored = Number(sql(`SELECT jsonb_array_length(stats->'rounds') FROM games WHERE id = '${gameId}'`));
        ok(stored === view.rounds, 'live: stored with the match', `${stored} rounds`);
        const api = await (await ctx.request.get(BASE + '/api/games/' + gameId)).json();
        ok(api.stats && api.stats.rounds.length === view.rounds && api.players.length === 4, 'GET /api/games/:id: the match with its statistics');
        ok((await ctx.request.get(BASE + '/api/games/not-a-uuid')).status() === 404, 'GET /api/games/:id: 404 for a bad id');

        // the profile draws the chart when the match is opened
        await page.evaluate(id => { closeModal(); PROFILE.open(id); }, user.id);
        await page.waitForSelector('#hcp-body .hcp-game summary');
        await page.click('#hcp-body .hcp-game summary');
        await page.waitForSelector('#hcp-body .hcp-chart svg', { timeout: 10000 });
        ok(await page.evaluate(() => document.querySelectorAll('#hcp-body .hcp-chart svg path[stroke-width="2"]').length) === 4, 'profile: the opened match shows the chart');
        await ctx.close();
    } finally {
        sql(`DELETE FROM games WHERE participants::text LIKE '%${user.name}%'`);
        sql(`DELETE FROM users WHERE id = '${user.id}'`);
    }
}

function rundenspiel() {
    const a = makeUser(), b = makeUser();
    let out = null;
    try {
        const res = inServer(fs.readFileSync(path.join(__dirname, 'finish-async.js'), 'utf8'),
            { USER_A: a.id, NAME_A: a.name, USER_B: b.id, NAME_B: b.name });
        out = JSON.parse(res.split('\n').pop());
        ok(out.status === 'finished', 'Rundenspiel: the KI played it to the end', `round ${out.round}`);
        const rs = out.stats ? out.stats.rounds : [];
        ok(out.stats && out.stats.final && rs[0] === 1 && rs[rs.length - 1] === out.round, 'Rundenspiel: statistics stored with the game, start to end', rs.join(','));
        ok(out.stats && out.stats.players.includes(a.name) && out.stats.players.includes(b.name), 'Rundenspiel: the players are named', out.stats && out.stats.players.join(', '));
        ok(out.viewStats === rs.length, 'Rundenspiel: the finished view has them (without bookkeeping)');
        ok(out.game && out.game.rounds === rs.length && !out.game.owners, 'Rundenspiel: the match record has them', JSON.stringify(out.game));
    } finally {
        if (out && out.id) sql(`DELETE FROM async_games WHERE id = '${out.id}'`);
        sql(`DELETE FROM games WHERE participants::text LIKE '%${a.name}%'`);
        sql(`DELETE FROM users WHERE id IN ('${a.id}', '${b.id}')`);
    }
}

(async () => {
    recording();
    rundenspiel();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await live(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
