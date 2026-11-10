/**
 * Single-player games in the statistics (F28: client/solo.js, routes/solo.js, utils/solo.js,
 * the *Herkunft* filter, profile and badges) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/solo/solo.test.js [http://localhost:3000]
 *
 * 1. Recorder (browser): a real single-player game (one human, two KI) is followed from its
 *    first round – the round of each new technology, a point per round; at its end it is queued.
 *    Not logged in, it waits on the device; after logging in it is sent and stored: a match
 *    marked `solo` with the account on the human seat, the facts (src 'solo', the tech rounds)
 *    and the chart. A game saved in a later round is not recorded; multiplayer games neither.
 * 2. API: login needed; refused uploads (version, no human, a tech round after the end, a
 *    winner that doesn't exist); the same game twice is stored once; hotseat (two humans): no
 *    account on any seat.
 * 3. Statistics: *Herkunft* (online / solo / all) in the overall and the personal statistics;
 *    the profile counts multiplayer games in its tiles and single-player games apart, lists the
 *    game as *Einzelspiel* and gives the single-player badge.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
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
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
function makeUser() {
    const name = 'solo_' + crypto.randomBytes(3).toString('hex');
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 250) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}
const mine = id => `"participants"::jsonb @> '[{"dbUserId": "${id}"}]'::jsonb`;

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const me = makeUser();
    const created = [];
    try {
        // ── 1. The recorder ──────────────────────────────────────────────────────
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push('page: ' + e.message));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof SOLO !== 'undefined' && typeof newGame === 'function' && typeof MP !== 'undefined');
        await page.evaluate(() => { localStorage.removeItem('hochciv.solo.cur'); localStorage.removeItem('hochciv.solo.queue'); });
        // a real game, followed from round 1; then it is moved on by hand and finished
        const rec = await page.evaluate(() => {
            S = newGame({ players: [
                { civ: 'griechenland', ability: 'basis', kind: 'human' },
                { civ: 'russland', ability: 'basis', kind: 'ki', kiLevel: 'mittel' },
                { civ: 'england', ability: 'basis', kind: 'ki', kiLevel: 'schwer' },
            ] });
            saveGame();
            const g = S.players.findIndex(p => p.civ === 'griechenland');
            const first = JSON.parse(localStorage.getItem('hochciv.solo.cur'));
            S.round = 2; S.players[g].techs = Object.assign({}, S.players[g].techs, { schrift: true }); saveGame();
            S.round = 3; S.players[g].techs.mathematik = true; saveGame();
            S.over = { winners: [g], winner: g, how: 'Forschungssieg' };
            SOLO.track();
            return { g, first, cur: JSON.parse(localStorage.getItem('hochciv.solo.cur')), queue: JSON.parse(localStorage.getItem('hochciv.solo.queue') || '[]') };
        });
        const item = rec.queue[0];
        ok(rec.first && rec.first.cid && rec.first.rounds.length === 1, 'recorder: a new game is followed from round 1', JSON.stringify(rec.first && rec.first.rounds.length));
        ok(rec.queue.length === 1 && item.t[rec.g].schrift === 2 && item.t[rec.g].mathematik === 3 && item.rounds.map(r => r.r).join() === '1,2,3' && item.state.over.winners[0] === rec.g && !item.state.cities[0].hasOwnProperty('name'),
            'recorder: finished, queued with the tech rounds, a point per round and a compact final state', JSON.stringify({ t: item && item.t[rec.g], rounds: item && item.rounds.length }));
        ok(rec.cur.done, 'recorder: the game is marked done (not queued twice)');
        // not logged in: it waits
        await sleep(500);
        ok(JSON.parse(await page.evaluate(() => localStorage.getItem('hochciv.solo.queue'))).length === 1, 'not logged in: the game waits on the device');
        // log in → sent
        await ctx.request.post(BASE + '/api/auth/login', { data: { username: me.name, password: PASSWORD } });
        await page.evaluate(() => MP.fetchUser());
        await until(() => page.evaluate(() => JSON.parse(localStorage.getItem('hochciv.solo.queue') || '[]').length === 0));
        const row = JSON.parse(sql(`SELECT json_build_object('id', id, 'parts', participants, 'facts', facts, 'stats', stats, 'rounds', "durationRounds") FROM games WHERE ${mine(me.id)}`) || 'null');
        const fp = row && row.facts.p.find(p => p.civ === 'griechenland');
        ok(row && row.rounds === 3 && row.parts.every(p => p.solo && p.soloId === item.cid) && row.parts.filter(p => p.dbUserId === me.id).length === 1
            && row.parts.find(p => p.dbUserId === me.id).civ === 'griechenland' && row.parts.find(p => p.dbUserId === me.id).isWinner,
            'after logging in it is sent: a match marked solo, the account on the human seat', JSON.stringify(row && row.parts.map(p => p.civ + (p.dbUserId ? '*' : ''))));
        ok(row && row.facts.src === 'solo' && row.facts.win === 'science' && fp && fp.won && fp.t.schrift === 2 && fp.kind === 'human' && row.facts.p.some(p => p.lvl === 'schwer'),
            'facts: src solo, victory, the tech rounds, the KI levels', JSON.stringify(fp && fp.t));
        ok(row && row.stats && row.stats.rounds.length === 3 && row.stats.players.length === 3, 'the match has the chart over the rounds');
        // a game saved in a later round is not recorded; neither is a multiplayer game
        const skip = await page.evaluate(() => {
            S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'russland', kind: 'ki', kiLevel: 'mittel' }] });
            S.round = 7; saveGame();
            const later = JSON.parse(localStorage.getItem('hochciv.solo.cur'));
            S = newGame({ players: [{ civ: 'england', kind: 'human' }, { civ: 'russland', kind: 'ki', kiLevel: 'mittel' }] });
            MP.active = true; saveGame(); MP.active = false;
            const mp = JSON.parse(localStorage.getItem('hochciv.solo.cur'));
            return { later: !!later.skip, mpUntouched: mp.sig === later.sig };
        });
        ok(skip.later && skip.mpUntouched, 'not recorded: a game first seen in a later round, a multiplayer game', JSON.stringify(skip));

        // ── 2. API ───────────────────────────────────────────────────────────────
        const post = body => ctx.request.post(BASE + '/api/solo/games', { data: body });
        const anon = await fetch(BASE + '/api/solo/games', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(item) });
        ok(anon.status === 401 || anon.status === 403, 'API: only with a login', String(anon.status));
        const again = await (await post(item)).json();
        ok(again.ok && again.duplicate && again.id === row.id, 'API: the same game twice is stored once');
        const variant = (fn) => { const b = JSON.parse(JSON.stringify(item)); b.cid = crypto.randomUUID(); fn(b); return b; };
        const refused = {
            version: variant(b => { b.ver = 'v1'; }),
            noHuman: variant(b => { b.state.players.forEach(p => { p.kind = 'ki'; }); }),
            lateTech: variant(b => { b.t[rec.g].schrift = 99; }),
            badWinner: variant(b => { b.state.over.winners = [9]; }),
        };
        const codes = {};
        for (const [k, b] of Object.entries(refused)) codes[k] = (await post(b)).status();
        ok(Object.values(codes).every(c => c === 400), 'API: refused – unknown version, no human, a tech after the end, a winner that is not there', JSON.stringify(codes));
        const hot = variant(b => { b.state.players.forEach(p => { if (p.civ === 'russland') p.kind = 'human'; }); b.hotseat = true; });
        const hr = await (await post(hot)).json();
        if (hr.id) created.push(hr.id);
        const hparts = JSON.parse(sql(`SELECT participants FROM games WHERE id = '${hr.id}'`));
        ok(hr.ok && hparts.every(p => !p.dbUserId && p.hotseat && p.solo), 'API: hotseat – stored without an account on any seat', JSON.stringify(hparts.map(p => p.name)));

        // ── 3. Statistics, profile, badges ───────────────────────────────────────
        const stats = async q => (await (await fetch(`${BASE}/api/stats?seats=all&${q}`)).json());
        const [all, solo, online] = [await stats('origin=all'), await stats('origin=solo'), await stats('origin=online')];
        ok(solo.query.origin === 'solo' && solo.games >= 2 && all.games === solo.games + online.games, 'overall statistics: Herkunft – single-player games apart, or all', `${all.games} = ${solo.games} + ${online.games}`);
        const p1 = await (await fetch(`${BASE}/api/stats/player/${me.id}?origin=solo`)).json();
        const p2 = await (await fetch(`${BASE}/api/stats/player/${me.id}?origin=online`)).json();
        ok(p1.games === 1 && p1.winners.won.seats === 1 && p2.games === 0, 'personal statistics: the single-player game counts, with the filter', `${p1.games}/${p2.games}`);
        const prof = await (await fetch(`${BASE}/api/profile/${me.id}`)).json();
        ok(prof.played === 0 && prof.wins === 0 && prof.solo.games === 1 && prof.solo.wins === 1 && prof.games.list[0].solo && prof.badges.some(b => b.k === 'solo_first_win') && !prof.badges.some(b => b.k === 'first_win'),
            'profile: tiles without it, single-player numbers apart, listed, its own badge', JSON.stringify({ played: prof.played, solo: prof.solo, badges: prof.badges.map(b => b.k) }));
        await page.evaluate(id => PROFILE.open(id), me.id);
        await page.waitForSelector('#hcp-body .hcp-solo');
        const pv = await page.evaluate(() => ({ solo: document.querySelector('.hcp-solo').textContent, meta: document.querySelector('.hcp-meta').textContent, badge: !!document.querySelector('[data-badge="solo_first_win"]') }));
        ok(/Einzelspiele: 1, davon 1 gewonnen/.test(pv.solo) && /^Einzelspiel/.test(pv.meta) && pv.badge, 'profile page: the numbers, "Einzelspiel", the badge', JSON.stringify(pv));
        await page.evaluate(() => PROFILE.close());
        await page.click('#mp-overall-btn');
        await page.waitForSelector('[data-hcg-q="origin"]');
        ok(await page.$$eval('[data-hcg-q="origin"] option', os => os.map(o => o.value).join()) === 'all,online,solo', 'statistics page: the filter Herkunft');
        await ctx.close();
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM games WHERE ${mine(me.id)}`);
        for (const id of created) sql(`DELETE FROM games WHERE id = '${id}'`);
        for (const u of users) sql(`DELETE FROM users WHERE id = '${u.id}'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
