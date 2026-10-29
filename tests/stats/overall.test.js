/**
 * Overall statistics (F13: utils/facts.js, utils/gamestats.js, routes/stats.js, client/gamestats.js)
 * against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/stats/overall.test.js [http://localhost:3000]
 *
 * 1. Facts with the engine: a KI game of three is played to its end, each turn's state kept like a
 *    replay. Checked: turn positions from the start player, winners, the round of each tech,
 *    victory type, barbarians left out; the fallback from a match record.
 * 2. Aggregation over made-up matches: win rates per nation, ability (also drafted ones) and turn
 *    position, humans only vs. all seats, the filters, techs and wonders, winners vs. the others.
 * 3. A real Rundenspiel played to the end by the KI (finish-async.js in the container): its facts
 *    are computed from the replay and GET /api/stats counts it; filters are sanitised; the admin
 *    variant needs a login.
 * 4. The game page: menu button "Statistiken", the overlay with its tables, a filter, English.
 * 5. The account page: the admin tab "Statistiken" with the admin detail and the export.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const inServer = (code, env = {}) => execFileSync('docker', ['exec', '-i', '-w', '/app',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser(role = 'user') {
    const name = 'ovr_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

function facts() {
    const engine = require('../../engine-adapter');
    const Facts = require('../../utils/facts');
    const session = {
        gameConfig: { mapKey: 'gross', playerCount: 3, seed: 11, wonders: true, startPlayer: 1 },
        players: ['griechenland', 'england', 'russland'].map(civ => ({ civ, ability: 'basis', kind: 'ki', kiLevel: 'schwer' })),
    };
    const S = engine.createGame(session);
    const E = engine.getEngine();
    const states = [JSON.parse(JSON.stringify(S))];
    for (let n = 0; n < 400 && !S.over; n++) {
        engine.autoTurn(S);
        if (!E.finishTurn(S)) E.advanceTurn(S);
        states.push(JSON.parse(JSON.stringify(S)));
    }
    ok(!!S.over, 'engine: the KI game ends', `round ${S.round}`);
    const f = Facts.fromStates(states, null);
    ok(f.src === 'replay' && f.n === 3 && f.r === S.round && f.mode === 'normal' && f.wo === true, 'facts: the match', JSON.stringify({ n: f.n, r: f.r, mode: f.mode }));
    const start = S.startIdx;
    ok(f.p[start].pos === 1 && f.p.map(p => p.pos).sort().join() === '1,2,3', 'facts: turn positions count from the start player', `start ${start}: ${f.p.map(p => p.pos).join(',')}`);
    ok(f.p.every((p, i) => p.won === S.over.winners.includes(i)) && f.p.some(p => p.won), 'facts: the winners', S.over.how);
    ok(f.p.every((p, i) => Object.keys(p.t).sort().join() === Object.keys(S.players[i].techs).filter(k => S.players[i].techs[k]).sort().join()),
        'facts: every tech of the end state, with its round');
    ok(f.p.every(p => Object.values(p.t).every(r => r >= 1 && r <= S.round)) && f.p.some(p => Object.values(p.t).some(r => r > 1)),
        'facts: tech rounds lie within the game');
    // a tech that is new in frame j was researched in the turn of frame j-1, i.e. in its round
    const firstSeen = (i, k) => states.findIndex(st => st.players[i].techs[k]);
    const sample = f.p.flatMap((p, i) => Object.keys(p.t).map(k => [i, k])).slice(0, 20);
    ok(sample.every(([i, k]) => { const j = firstSeen(i, k); return f.p[i].t[k] === (j ? states[j - 1].round : states[0].round); }), 'facts: the round is the one of the turn that researched it');
    ok(['military', 'science', 'economy', 'culture', 'other'].includes(f.win), 'facts: victory type', f.win);
    ok(f.p.every((p, i) => p.c === S.cities.filter(c => c.owner === i).length && p.s === E.victoryScore(S, i).total && p.kind === 'ki' && p.lvl === 'schwer'),
        'facts: cities, score and KI level at the end');
    ok(Facts.victoryOf({ military: true }) === 'military' && Facts.victoryOf({ how: 'Forschungssieg (Singularität)' }) === 'science'
        && Facts.victoryOf({ how: 'Wirtschaftssieg (12 von 20 …) · Punktvergleich' }) === 'economy' && Facts.victoryOf({ how: 'Kultursieg (…)' }) === 'culture'
        && Facts.victoryOf({ how: 'x' }) === 'other' && Facts.victoryOf(null) === null, 'victoryOf: every victory type');
    // barbarians take no seat
    const withBarb = JSON.parse(JSON.stringify(states[states.length - 1]));
    withBarb.players.push({ civ: 'barbaren', kind: 'barbar', techs: {} });
    ok(Facts.fromStates([withBarb], null).n === 3, 'facts: barbarians are left out');
    const rec = Facts.fromRecord({ version: 'v88', durationRounds: 9, participants: [
        { civ: 'england', ability: 'basis', isBot: false, isWinner: true, scoreDetails: { total: 30, pop: 12 } },
        { civ: 'russland', ability: 'taiga', isBot: true, isWinner: false, scoreDetails: { total: 10, pop: 5 } }],
        stats: { players: [{ civ: 'england', slot: 0 }, { civ: 'russland', slot: 1 }], rounds: [{ r: 9, p: [{ c: 5, pop: 12, a: 1, d: 0 }, { c: 2, pop: 5, a: 0, d: 0 }] }] } });
    ok(rec.src === 'record' && rec.n === 2 && rec.p[0].won && rec.p[0].c === 5 && rec.p[0].s === 30 && rec.p[1].kind === 'ki' && rec.p[0].t === null && rec.p[0].pos === null,
        'facts: fallback from a match record (no techs, no positions)');
}

function aggregate() {
    const { aggregate } = require('../../utils/gamestats');
    const P = (civ, kind, pos, won, extra) => Object.assign({ civ, ab: 'basis', kind, lvl: null, pos, won, dead: false, s: won ? 30 : 10, c: won ? 6 : 2, pop: won ? 12 : 4, a: 1, w: won ? ['mauer'] : [], t: won ? { schrift: 2, mathematik: 3 } : { schrift: 4 } }, extra || {});
    const g = (n, mode, ver, players) => ({ id: crypto.randomUUID(), ver, f: { v: 1, src: 'replay', ver, r: 8, n, mode, win: 'economy', p: players } });
    const rows = [
        g(2, 'duel', 'v96', [P('england', 'human', 1, true), P('russland', 'human', 2, false)]),
        g(2, 'duel', 'v96', [P('england', 'human', 2, false), P('russland', 'human', 1, true)]),
        g(4, 'normal', 'v93', [P('england', 'human', 1, true, { ab: 'kolonisten' }), P('russland', 'ki', 2, false), P('wikinger', 'ki', 3, false), P('griechenland', 'human', 4, false)]),
        g(4, 'marathon', 'v96', [P('wikinger', 'human', 1, false, { ab: ['wikinger:basis', 'england:seemacht'] }), P('england', 'ki', 2, true), P('russland', 'ki', 3, false), P('griechenland', 'ki', 4, false)]),
    ];
    const h = aggregate(rows, { seats: 'humans' });
    const civ = (d, k) => d.civs.find(c => c.k === k) || { games: 0, wins: 0 };
    ok(h.games === 4 && h.seats === 7, 'aggregate: humans only – 4 matches, 7 human seats', `${h.games}/${h.seats}`);
    ok(civ(h, 'england').games === 3 && civ(h, 'england').wins === 2 && civ(h, 'russland').wins === 1, 'aggregate: win rate per nation', JSON.stringify(h.civs));
    const a = aggregate(rows, { seats: 'all' });
    ok(a.seats === 12 && civ(a, 'england').games === 4 && civ(a, 'england').wins === 3, 'aggregate: all seats count the KI too', `${a.seats}`);
    const ab = (d, c, k) => d.abilities.find(x => x.civ === c && x.k === k) || {};
    ok(ab(h, 'england', 'kolonisten').wins === 1 && ab(h, 'england', 'basis').games === 2 && ab(h, 'england', 'seemacht').games === 1 && ab(h, 'wikinger', 'basis').games === 1,
        'aggregate: abilities, drafted ones counted for each');
    ok(h.positions['2'].find(p => p.pos === 1).wins === 2 && h.positions['2'].find(p => p.pos === 2).wins === 0 && h.positions['4'].find(p => p.pos === 1).games === 2,
        'aggregate: win rate per turn position, by number of empires', JSON.stringify(h.positions));
    ok(h.winners.won.cities === 6 && h.winners.lost.cities === 2 && h.winners.won.techs === 2 && h.winners.cities['6'] === 3, 'aggregate: winners vs. the others, cities of winners');
    const schrift = h.techs.list.find(t => t.k === 'schrift'), mathe = h.techs.list.find(t => t.k === 'mathematik');
    ok(h.techs.seats === 7 && h.techs.won === 3 && schrift.had === 7 && schrift.hadWon === 3 && schrift.round === 2 && mathe.had === 3, 'aggregate: technologies of winners and the others');
    ok(h.wonders.find(w => w.k === 'mauer').built === 3, 'aggregate: wonders and their builders');
    ok(aggregate(rows, { n: '2' }).games === 2 && aggregate(rows, { mode: 'marathon' }).games === 1 && aggregate(rows, { ver: 'v93' }).games === 1,
        'aggregate: filters by number of empires, mode and version');
    ok(h.filters.versions.join() === 'v96,v93' && h.names.civ.england[0] === 'England' && h.names.tech.some(t => t[0] === 'singularitaet' && t[2] === 'Singularity'),
        'aggregate: versions and names (German, English, the Singularity)');
    const d = aggregate(rows, {}, true);
    ok(d.detail && d.detail.levels.length && d.detail.sources.replay === 4, 'aggregate: admin detail', JSON.stringify(d.detail && d.detail.sources));
}

async function rundenspiel() {
    const a = makeUser(), b = makeUser();
    let out = null;
    try {
        const res = inServer(fs.readFileSync(path.join(__dirname, 'finish-async.js'), 'utf8'),
            { USER_A: a.id, NAME_A: a.name, USER_B: b.id, NAME_B: b.name });
        out = JSON.parse(res.split('\n').pop());
        ok(out.status === 'finished' && out.game, 'Rundenspiel: the KI played it to the end', `round ${out.round}`);
        let src = '';
        for (let n = 0; n < 40 && src !== 'replay'; n++) { await sleep(250); src = sql(`SELECT facts->>'src' FROM games WHERE id = '${out.game.id}'`); }
        ok(src === 'replay', 'Rundenspiel: its facts come from the replay', src);
        const f = JSON.parse(sql(`SELECT facts FROM games WHERE id = '${out.game.id}'`));
        ok(f.n === 2 && f.p.every(p => p.pos && p.t) && f.p.filter(p => p.won).length >= 1 && f.r === out.round, 'Rundenspiel: positions, techs, winner', JSON.stringify({ n: f.n, r: f.r, win: f.win }));
        // facts changed → the cache is dropped; the API counts the match (its seats were taken over by the KI)
        const all = await (await fetch(`${BASE}/api/stats?seats=all`)).json();
        ok(all.games >= 1 && all.seats >= 2 && all.names && all.civs.length, 'GET /api/stats: counts the matches', `${all.games} matches`);
        const ver = await (await fetch(`${BASE}/api/stats?seats=all&ver=${f.ver}&n=2`)).json();
        ok(ver.query.ver === f.ver && ver.query.n === '2' && ver.games >= 1, 'GET /api/stats: filters', JSON.stringify(ver.query));
        const bad = await (await fetch(`${BASE}/api/stats?seats=x&n=9&mode=<b>&ver=1;drop`)).json();
        ok(bad.query.seats === 'humans' && bad.query.n === 'all' && bad.query.mode === 'all' && bad.query.ver === 'all', 'GET /api/stats: unknown filter values fall back to all');
        const adm = await fetch(`${BASE}/api/admin/stats`);
        ok(adm.status === 401 || adm.status === 403, 'GET /api/admin/stats needs an admin', String(adm.status));
        ok(!JSON.stringify(all).includes(a.name) && !JSON.stringify(f).includes(a.id), 'the statistics carry no names or accounts');
    } finally {
        if (out && out.id) sql(`DELETE FROM async_games WHERE id = '${out.id}'`);
        sql(`DELETE FROM games WHERE participants::text LIKE '%${a.name}%'`);
        sql(`DELETE FROM users WHERE id IN ('${a.id}', '${b.id}')`);
    }
}

async function page(browser, errors) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/');
    await p.waitForSelector('#mp-overall-btn');
    ok(await p.textContent('#mp-overall-btn') === 'Statistiken', 'menu: button "Statistiken"');
    await p.click('#mp-overall-btn');
    await p.waitForSelector('#hcg-overlay.show #hcg-body .hcg-filters');
    await p.selectOption('[data-hcg-q="seats"]', 'all');
    await p.waitForSelector('[data-hcg-techs] table');
    const v = await p.evaluate(() => ({
        h3: [...document.querySelectorAll('#hcg-body h3')].map(h => h.textContent),
        civs: document.querySelectorAll('#hcg-body .hcg-table')[1].querySelectorAll('tbody tr').length,
        tiles: document.querySelector('.hcg-tile b').textContent,
    }));
    ok(v.h3.includes('Siegquote je Nation') && v.h3.includes('Siegquote je Startplatz') && v.h3.includes('Technologien') && v.civs >= 1,
        'overlay: sections with tables', v.h3.join(' · '));
    await p.selectOption('[data-hcg-sort]', 'tree');
    ok(await p.$eval('[data-hcg-techs] tbody tr td', td => td.textContent.length > 0), 'overlay: the tech table re-sorts');
    await p.keyboard.press('Escape');
    ok(!(await p.isVisible('#hcg-overlay')), 'overlay: Escape closes it');
    // English
    await p.evaluate(() => { if (typeof switchLang === 'function') switchLang('en'); });
    await p.click('#mp-overall-btn');
    await p.waitForSelector('[data-hcg-techs] table');
    const en = await p.evaluate(() => ({ title: document.getElementById('hcg-title').textContent, h3: [...document.querySelectorAll('#hcg-body h3')].map(h => h.textContent) }));
    ok(en.title === 'Statistics' && en.h3.includes('Win rate by nation'), 'overlay: English', en.h3.join(' · '));
    await ctx.close();
}

async function adminTab(browser, errors) {
    const admin = makeUser('admin');
    try {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const login = await ctx.request.post(BASE + '/api/auth/login', { data: { username: admin.name, password: PASSWORD } });
        ok(login.status() === 200, 'admin logs in');
        const api = await ctx.request.get(BASE + '/api/admin/stats?seats=all');
        const d = await api.json();
        ok(api.status() === 200 && d.detail && d.detail.byVersion.length && d.detail.sources, 'GET /api/admin/stats: with the admin detail', JSON.stringify(d.detail && d.detail.sources));
        const exp = await ctx.request.get(BASE + '/api/admin/stats/export');
        const rows = await exp.json();
        ok(exp.status() === 200 && /attachment/.test(exp.headers()['content-disposition'] || '') && rows.length >= 1 && rows[0].facts && rows[0].facts.p,
            'GET /api/admin/stats/export: the raw facts as a download', `${rows.length} matches`);
        const re = await ctx.request.post(BASE + '/api/admin/stats/recompute');
        ok(re.status() === 403, 'recompute is for superadmins only', String(re.status()));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push('account: ' + e.message));
        await page.goto(BASE + '/client/account.html');
        const tab = page.locator('[data-target="tab-admin-stats"]');
        await tab.waitFor({ state: 'visible' });
        await tab.click();
        await page.waitForSelector('#admin-stats-body [data-hcg-recompute]');
        const h3 = await page.$$eval('#admin-stats-body h3', hs => hs.map(h => h.textContent));
        ok(h3.includes('Siegquote je Nation') && h3.includes('Admin') && await page.isVisible('#admin-stats-body a[href="/api/admin/stats/export"]'),
            'account page: admin tab "Statistiken" with the public tables and the admin part', h3.join(' · '));
        await ctx.close();
    } finally {
        sql(`DELETE FROM users WHERE id = '${admin.id}'`);
    }
}

(async () => {
    facts();
    aggregate();
    await rundenspiel();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await page(browser, errors);
        await adminTab(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
