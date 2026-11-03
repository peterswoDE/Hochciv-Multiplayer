/**
 * Seasons, leaderboard and badges (F10: utils/seasons.js, utils/badges.js, routes/seasons.js,
 * client/ranking.js, client/profile.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/seasons/seasons.test.js [http://localhost:3000]
 *
 * Unit: quarters and tiers. Two accounts get ranked matches of this quarter (A: five wins with
 * all four kinds of victory and ten wonders; B: two games). Checked: the running season's
 * leaderboard (rank, tier after five games, "unplaced" before), the profile (tier, badges, the
 * nations), the leaderboard page from the main menu (own row marked, the profile opens), closing
 * the season (the server's own check with a date in the next quarter): final standings, the
 * soft reset of the MMR, the closed season in the leaderboard and the profile, the badge for a
 * Gold season. Afterwards the seasons, results and every account's MMR are put back.
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
const users = [];
function makeUser(mmr) {
    const name = 'sea_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, mmr: ${mmr}, gamesPlayed: 5 })
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

function unit() {
    const S = require('../../utils/seasons');
    const q = S.quarterOf(new Date('2026-11-03T10:00:00Z')), q1 = S.quarterOf(new Date('2027-01-01T00:00:00Z'));
    ok(q.id === '2026-Q4' && q.startsAt.toISOString() === '2026-10-01T00:00:00.000Z' && q.endsAt.toISOString() === '2027-01-01T00:00:00.000Z' && q1.id === '2027-Q1',
        'unit: quarters', `${q.id} ${q.startsAt.toISOString()} → ${q.endsAt.toISOString()}, ${q1.id}`);
    ok(S.tierOf(1400, 5) === 'diamant' && S.tierOf(1399, 9) === 'platin' && S.tierOf(1100, 5) === 'gold' && S.tierOf(950, 5) === 'silber'
        && S.tierOf(949, 5) === 'bronze' && S.tierOf(2000, 4) === null, 'unit: tiers, unplaced below five games');
}

(async () => {
    try { unit(); } catch (e) { ok(false, 'unit', e.stack); }
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const mmrBefore = sql(`SELECT string_agg(id || ':' || mmr, ',') FROM users`);
    const seasonsBefore = sql(`SELECT string_agg(id, ',') FROM seasons`);
    let nextId = null;
    try {
        // the server made the current season at startup
        const cur = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/seasons/leaderboard']).toString());
        const now = require('../../utils/seasons').quarterOf(new Date());
        ok(cur.season && cur.season.id === now.id && !cur.season.closed, 'the running season is this quarter', cur.season && cur.season.id);

        const A = makeUser(1150), B = makeUser(990);
        const win = ['military', 'science', 'economy', 'culture', 'military'];
        const civs = ['griechenland', 'england', 'russland', 'griechenland', 'england'];
        inServer(`const { Game } = require('./models');
            const games = ${JSON.stringify(win)}.map((w, i) => ({ version: 'test', durationRounds: 20, matchDate: new Date(Date.now() - i * 60000),
                participants: [
                    { dbUserId: '${A.id}', dbUsername: '${A.name}', name: '${A.name}', civ: ${JSON.stringify(civs)}[i], isWinner: true, oldMmr: 1100, newMmr: 1110, mmrShift: 10, points: 30 },
                    ...(i < 2 ? [{ dbUserId: '${B.id}', dbUsername: '${B.name}', name: '${B.name}', civ: 'aegypten', isWinner: false, oldMmr: 1000, newMmr: 990, mmrShift: -10, points: 10 }] : [{ name: 'KI', isBot: true, civ: 'aegypten', points: 5 }]),
                ],
                facts: { v: 1, win: w, n: 2, p: [{ civ: ${JSON.stringify(civs)}[i], won: true, w: ['a', 'b'] }, { civ: 'aegypten', won: false, w: [] }] } }));
            Promise.all(games.map(g => Game.create(g))).then(() => process.exit(0));`);

        const lb = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/seasons/leaderboard']).toString());
        const ra = lb.list.find(r => r.id === A.id), rb = lb.list.find(r => r.id === B.id);
        ok(ra && ra.games === 5 && ra.wins === 5 && ra.tier === 'gold' && rb && rb.games === 2 && rb.tier === null && ra.rank < rb.rank,
            'running season: games, wins, Gold after five games, B unplaced, ranked by MMR', JSON.stringify({ ra, rb }));

        const prof = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/profile/' + A.id]).toString());
        const keys = (prof.badges || []).map(b => b.k);
        ok(prof.season && prof.season.tier === 'gold' && prof.season.games === 5, 'profile: the season\'s tier', JSON.stringify(prof.season));
        ok(['first_win', 'victory_military', 'victory_science', 'victory_economy', 'victory_culture', 'all_victories', 'wonders_10', 'duels_5'].every(k => keys.includes(k))
            && !keys.includes('wins_10') && !keys.includes('nations_all'), 'profile: badges earned, not the ones still missing', keys.join(','));
        ok(prof.progress && prof.progress.nations.n === 3 && prof.progress.nations.of >= 4, 'profile: wins with 3 nations', JSON.stringify(prof.progress && prof.progress.nations));

        // the page: main menu → Rangliste, logged in as A
        const ctx = await browser.newContext({ locale: 'de-DE' });
        await ctx.request.post(BASE + '/api/auth/login', { data: { username: A.name, password: PASSWORD } });
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`A: ${e.message}`));
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof RANKING !== 'undefined' && MP.user);
        ok(await p.isVisible('#mp-ranking-btn'), 'main menu: "🏆 Rangliste"');
        await p.click('#mp-ranking-btn');
        await p.waitForSelector(`.rk-table tr[data-user="${A.id}"]`, { timeout: 10000 });
        const rowA = await p.textContent(`.rk-table tr[data-user="${A.id}"]`);
        ok(await p.$(`.rk-table tr.rk-me[data-user="${A.id}"]`) && /Gold/.test(rowA) && /1150/.test(rowA), 'leaderboard: own row marked, Gold, MMR', rowA.replace(/\s+/g, ' '));
        ok(/Unplatziert \(2\/5\)/.test(await p.textContent(`.rk-table tr[data-user="${B.id}"]`)), 'leaderboard: B "Unplatziert (2/5)"');
        await p.click(`.rk-table tr[data-user="${A.id}"] [data-profile]`);
        await p.waitForSelector('.hcp-badge', { timeout: 10000 });
        ok(/Eroberer/.test(await p.textContent('.hcp-badges')) && /Saison Q\d \d{4}/.test(await p.textContent('.hcp-season')), 'profile dialog: season line and badges');

        // close the season: the server's check with a date in the next quarter
        const next = require('../../utils/seasons').quarterOf(new Date(new Date(cur.season.endsAt).getTime() + 86400000));
        nextId = next.id;
        inServer(`require('./utils/seasons').ensure(new Date('${next.startsAt.toISOString()}')).then(s => { console.log(s && s.id); process.exit(0); })`);
        const res = sql(`SELECT rank || ':' || tier || ':' || mmr || ':' || games FROM season_results WHERE "seasonId" = '${cur.season.id}' AND "userId" = '${A.id}'`);
        ok(/^\d+:gold:1150:5$/.test(res), 'closed: A\'s final standing (rank, Gold, 1150, 5 games)', res);
        const mm = sql(`SELECT mmr FROM users WHERE id = '${A.id}'`) + ',' + sql(`SELECT mmr FROM users WHERE id = '${B.id}'`);
        ok(mm === '1075,995', 'soft reset: 1150 → 1075, 990 → 995', mm);
        ok(sql(`SELECT "closedAt" IS NOT NULL FROM seasons WHERE id = '${cur.season.id}'`) === 't' && sql(`SELECT count(*) FROM seasons WHERE id = '${next.id}'`) === '1', 'the old season is closed, the next one runs');
        const again = inServer(`require('./utils/seasons').ensure(new Date()).then(s => { console.log(s && s.id); process.exit(0); })`);
        ok(again === next.id && sql(`SELECT mmr FROM users WHERE id = '${A.id}'`) === '1075', 'an earlier date changes nothing (no double reset)', again);

        const closed = JSON.parse(execFileSync('curl', ['-s', `${BASE}/api/seasons/leaderboard?season=${cur.season.id}`]).toString());
        const ca = closed.list.find(r => r.id === A.id);
        ok(closed.season.closed && ca && ca.tier === 'gold' && ca.mmr === 1150, 'leaderboard of the closed season', JSON.stringify(ca));
        const prof2 = JSON.parse(execFileSync('curl', ['-s', BASE + '/api/profile/' + A.id]).toString());
        ok(prof2.season.id === next.id && prof2.season.games === 0 && prof2.seasons.some(r => r.id === cur.season.id && r.tier === 'gold')
            && prof2.badges.some(b => b.k === 'season_gold'), 'profile: new season, the closed one listed, badge "Gold-Saison"', JSON.stringify(prof2.seasons));

        // the page: pick the closed season
        await p.evaluate(() => { document.querySelector('#hcp-overlay, .hcp-overlay') && document.querySelector('#hcp-overlay, .hcp-overlay').remove(); });
        await p.evaluate(s => RANKING.open(s), cur.season.id);
        await p.waitForFunction(() => /Abgeschlossen am/.test((document.getElementById('rk-box') || {}).textContent || ''), null, { timeout: 10000 })
            .then(() => ok(true, 'page: the closed season'), () => ok(false, 'page: the closed season'));
        await p.evaluate(() => RANKING.open(undefined, 'bot'));
        await p.waitForFunction(() => document.querySelector('.rk-types .mph-tab.on') && /Bots/.test(document.querySelector('.rk-types .mph-tab.on').textContent), null, { timeout: 10000 })
            .then(() => ok(true, 'page: the bots'), () => ok(false, 'page: the bots'));
        await ctx.close();
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        // seasons, results and every MMR as before
        if (nextId) {
            sql(`DELETE FROM season_results WHERE "seasonId" IN (SELECT id FROM seasons WHERE id NOT IN ('${(seasonsBefore || '').split(',').join("','")}')) OR "seasonId" IN ('${(seasonsBefore || '').split(',').join("','")}')`);
            sql(`DELETE FROM seasons WHERE id NOT IN ('${(seasonsBefore || '').split(',').join("','")}')`);
            sql(`UPDATE seasons SET "closedAt" = NULL`);
        }
        const pairs = (mmrBefore || '').split(',').filter(Boolean).map(x => x.split(':'));
        if (pairs.length) sql(`UPDATE users u SET mmr = v.mmr FROM (VALUES ${pairs.map(([id, m]) => `('${id}'::uuid, ${Number(m)})`).join(',')}) v(id, mmr) WHERE u.id = v.id`);
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
