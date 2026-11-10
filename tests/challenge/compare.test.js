/**
 * Weekly challenge: compare an attempt with the week's best (F26: utils/challenge.js compare,
 * GET /api/challenge/compare, client/challenge.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/challenge/compare.test.js [http://localhost:3000]
 *
 * Two finished attempts of this week are stored (a win in one round – surely the best – and a
 * loss of another player), each with its match statistics. Checked: the API (one's best without
 * `game`, a given attempt, the best one compared with itself, an unknown attempt), the dialog
 * ("Mit der Bestleistung vergleichen" with the notes where the gap grew and the chart with both
 * lines), the button of a leaderboard row, and the end screen of an attempt.
 *
 * Test accounts, attempts and matches are deleted afterwards. Uses an installed Chrome or Edge
 * (no browser download); set HOCHCIV_BROWSER to its path if it is not found.
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
const inServer = (code, env = {}) => execFileSync('docker', ['exec', '-i', '-w', '/app',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'cmp_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

/** A finished attempt of this week with its match: `scores` = the challenger's points per round. */
function attempt(user, won, rounds, points, scores) {
    const stats = {
        players: [{ civ: 'england', slot: 0, name: user.name, kind: 'human' }, { civ: 'russland', slot: 1, kind: 'ki' }],
        rounds: scores.map((s, k) => ({ r: k + 1, p: [{ s, c: 2 + k, t: 3 + k }, { s: 10, c: 2, t: 3 }] })),
        events: [],
    };
    return JSON.parse(inServer(`const { Game, ChallengeResult } = require('./models'); const C = require('./utils/challenge');
        (async () => {
            const g = await Game.create({ version: 'v106', durationRounds: ${rounds}, participants: [{ name: '${user.name}', dbUserId: '${user.id}', civ: 'england', isWinner: ${won} }], stats: ${JSON.stringify(stats)} });
            const week = C.weekOf(new Date()).id;
            const r = await ChallengeResult.create({ weekId: week, userId: '${user.id}', username: '${user.name}', finished: true, won: ${won}, rounds: ${rounds}, points: ${points}, gameId: g.id, finishedAt: new Date() });
            console.log(JSON.stringify({ game: g.id, result: r.id, week }));
            process.exit(0);
        })()`).split('\n').pop());
}

(async () => {
    const lead = makeUser(), me = makeUser();
    const best = attempt(lead, true, 1, 999, [6, 12, 20, 30, 45]);
    const mine = attempt(me, false, 5, 25, [6, 13, 14, 20, 25]);
    const week = best.week;
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        // API
        const get = async (ctx, q) => { const r = await ctx.request.get(`${BASE}/api/challenge/compare?${q}`); return { status: r.status(), d: await r.json() }; };
        const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1100, height: 900 } });
        await ctx.request.post(BASE + '/api/auth/login', { data: { username: me.name, password: PASSWORD } });
        let r = await get(ctx, `week=${week}`);
        ok(r.status === 200 && r.d.best && r.d.best.userId === lead.id && r.d.best.rank === 1 && r.d.attempt && r.d.attempt.userId === me.id && !r.d.same
            && r.d.attempt.series.length === 5 && r.d.attempt.series[2].s === 14 && r.d.attempt.series[2].t === 5 && r.d.best.series[4].s === 45 && r.d.attempt.rounds === 5,
            'API: one\'s best attempt next to the week\'s best, the challenger\'s values per round', JSON.stringify({ best: r.d.best && r.d.best.username, rank: r.d.attempt && r.d.attempt.rank }));
        r = await get(ctx, `week=${week}&game=${best.game}`);
        ok(r.status === 200 && r.d.same, 'API: the best attempt compared with itself is marked "same"');
        r = await get(ctx, `week=${week}&game=${crypto.randomUUID()}`);
        ok(r.status === 400 && r.d.error === 'Diesen Versuch gibt es nicht.', 'API: an attempt that is not this week\'s is refused', String(r.status));
        const anon = await fetch(`${BASE}/api/challenge/compare?week=${week}&game=${mine.game}`);
        ok(anon.status === 200 && (await anon.json()).attempt.userId === me.id, 'API: public, like the leaderboard');

        // the dialog: one's own result → compare
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push('dialog: ' + e.message));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof CHALLENGE !== 'undefined' && MP.user);
        await page.evaluate(w => CHALLENGE.open(w), week);
        await page.waitForSelector('#ch-compare');
        await page.click('#ch-compare');
        await page.waitForSelector('#ch-cmp-box .hcs-plot svg');
        const v = await page.evaluate(() => ({
            sum: document.querySelector('.ch-cmp-sum').textContent.replace(/\s+/g, ' ').trim(),
            notes: [...document.querySelectorAll('#ch-cmp-notes li')].map(li => li.textContent),
            lines: document.querySelectorAll('#ch-cmp-box .hcs-plot svg path').length,
            legend: document.querySelector('#ch-cmp-box .hcs-legend').textContent,
            moments: !!document.querySelector('#ch-cmp-box .hcs-moments'),
        }));
        ok(/Bestleistung: cmp_\w+ – Sieg in 1 Runden · Platz 1/.test(v.sum) && /Dein Versuch: 25 Punkte, kein Sieg/.test(v.sum), 'dialog: both results', v.sum);
        ok(v.notes.includes('Bis Runde 2 lagst du gleichauf oder vorn.') && v.notes.includes('Am meisten Boden verloren in Runde 4: 10 Punkte in einer Runde.')
            && v.notes.includes('Größter Rückstand: 20 Punkte in Runde 5 (25 gegen 45).'), 'dialog: where the gap grew', v.notes.join(' | '));
        ok(v.lines === 2 && /Dein Versuch/.test(v.legend) && /Bestleistung/.test(v.legend) && !v.moments, 'dialog: one chart, two lines, no key moments', v.legend);
        await page.selectOption('#ch-cmp-box .hcs-metric select', 't');
        ok(await page.$eval('#ch-cmp-box .hcs-title', h => h.textContent) === 'Technologien', 'dialog: other values (techs) can be picked');
        await page.click('#overlay button:has-text("Zurück")');
        await page.waitForSelector('#ch-box .ch-table');

        // a leaderboard row
        const row = page.locator(`#ch-box tr[data-user="${me.id}"] .ch-cmp`);
        ok(await page.locator(`#ch-box tr[data-user="${lead.id}"] .ch-cmp`).count() === 0 && await row.count() === 1, 'leaderboard: 📈 on every row but the first');
        await row.click();
        await page.waitForSelector('#ch-cmp-box .hcs-plot svg');
        ok(true, 'leaderboard: 📈 opens the comparison');

        // the end screen of an attempt (simulated: the view of a finished challenge game)
        await page.evaluate(w => {
            closeModal();
            ASYNC.view = { config: { challenge: w } };
            modal('Ende', '<button class="btn wide" id="go-menu">Menü</button>');
        }, week);
        await page.evaluate(g => CHALLENGE.addToEndScreen({ id: g }), mine.game);
        await page.click('#ch-end-cmp-btn');
        await page.waitForSelector('#ch-end-cmp .hcs-plot svg');
        ok(await page.$eval('#ch-end-cmp', el => !el.hidden && /Dein Versuch/.test(el.textContent)), 'end screen: "Mit der Bestleistung vergleichen" shows the comparison below the result');
        await page.evaluate(() => { ASYNC.view = null; closeModal(); });
        await ctx.close();
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        sql(`DELETE FROM challenge_results WHERE id IN ('${best.result}', '${mine.result}')`);
        sql(`DELETE FROM games WHERE id IN ('${best.game}', '${mine.game}')`);
        sql(`DELETE FROM users WHERE id IN ('${lead.id}', '${me.id}')`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
