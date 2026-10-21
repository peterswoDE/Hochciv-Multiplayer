/**
 * The winner's bonus points (utils/score.js, WIN_BONUS = 10) in live games, Rundenspiele and on
 * the end screen (mp.js), against the local docker setup.
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core            (for the end screen check)
 *   node tests/score/win-bonus.test.js [http://localhost:3000]
 *
 * Server side: two test accounts play a ranked game to its end (the KI moves for both, see
 * finish-game.js) and the real result code stores it; then the match history and the MMR are
 * checked. The accounts and their games are deleted afterwards.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WIN_BONUS, finalPoints } = require('../../utils/score');
const { calculateMMR } = require('../../utils/mmr');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = 'hochciv-multiplayer-local';
let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};

const inServer = (code, env = {}) => execFileSync('docker', ['exec', '-i', '-w', '/app',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

function makeUser() {
    const name = 'score_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: 'x', isActive: true })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const mmrOf = u => Number(sql(`SELECT mmr FROM users WHERE id = '${u.id}'`));
/** The stored match of these two accounts: participants as the history shows them. */
const lastGame = (a, b) => {
    const row = sql(`SELECT participants FROM games WHERE participants::text LIKE '%${a.name}%'
        AND participants::text LIKE '%${b.name}%' ORDER BY "createdAt" DESC LIMIT 1`);
    return row ? JSON.parse(row) : null;
};

async function serverSide(mode) {
    const a = makeUser(), b = makeUser();
    const before = { a: mmrOf(a), b: mmrOf(b) };
    const out = inServer(fs.readFileSync(path.join(__dirname, 'finish-game.js'), 'utf8'),
        { USER_A: a.id, NAME_A: a.name, USER_B: b.id, NAME_B: b.name, MODE: mode });
    const game = JSON.parse(out.split('\n').pop());
    const parts = lastGame(a, b);
    ok(!!parts, `${mode}: match stored`, game.how);
    if (!parts) return [a, b];

    const winners = game.scores.filter(s => s.winner);
    ok(winners.length >= 1, `${mode}: the game has a winner`, winners.map(w => w.name).join(', '));
    for (const s of game.scores) {
        const p = parts.find(x => x.name === s.name);
        const want = s.total + (s.winner ? WIN_BONUS : 0);
        ok(p && p.points === want && p.isWinner === s.winner,
            `${mode}: ${s.winner ? 'winner' : 'loser'} has ${s.winner ? 'victory score + ' + WIN_BONUS : 'victory score'}`,
            `${p && p.points} = ${s.total}${s.winner ? ' + ' + WIN_BONUS : ''}`);
        ok(p && p.scoreDetails && p.scoreDetails.total === s.total, `${mode}: ${s.winner ? 'winner' : 'loser'}: details keep the engine's score`);
    }

    // MMR: computed from the points with the bonus (one stored number everywhere)
    const expect = calculateMMR(parts.map(p => ({ dbUserId: p.dbUserId, mmr: p.oldMmr, points: p.points, isWinner: p.isWinner })));
    const after = { a: mmrOf(a), b: mmrOf(b) };
    const ea = expect.find(r => r.dbUserId === a.id), eb = expect.find(r => r.dbUserId === b.id);
    ok(after.a === ea.newMmr && after.b === eb.newMmr, `${mode}: MMR follows the points incl. bonus`,
        `${before.a}→${after.a}, ${before.b}→${after.b}`);
    const w = parts.find(p => p.isWinner);
    ok(w && w.mmrShift > 0, `${mode}: winner gains MMR`, w && w.mmrShift);
    return [a, b];
}

async function endScreen() {
    let chromium;
    try { ({ chromium } = require('playwright-core')); } catch (e) {
        console.log('SKIP  end screen (playwright-core not installed)');
        return;
    }
    const exe = process.env.HOCHCIV_BROWSER || [
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    ].find(p => fs.existsSync(p));
    const browser = await chromium.launch({ executablePath: exe });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('hochciv.save'));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });

    // a local game played to the end by the KI, shown as if it were a multiplayer game
    const r = await page.evaluate(() => {
        setupScreen();
        document.getElementById('setup-go').click();
        const kinds = S.players.map(p => p.kind);
        S.players.forEach(p => { p.kind = 'ki'; p.kiLevel = p.kiLevel || 'mittel'; });
        for (let n = 0; n < 400 && !S.over; n++) { kiTurn(S, S.cur); finishTurn(S); if (!S.over) advanceTurn(S); }
        S.players.forEach((p, i) => { p.kind = kinds[i]; });
        MP.active = true;
        gameOver();
        const rows = [...document.querySelectorAll('#mp-go-players tr')].slice(1).map(tr => tr.innerText);
        const expect = S.players.map((p, i) => ({ civ: civOf(p).n, total: victoryScore(S, i).total, won: S.over.winners.includes(i) }));
        MP.active = false;
        return { rows, expect, bonus: MP.WIN_BONUS };
    });
    ok(r.bonus === WIN_BONUS, 'mp.js and utils/score.js use the same bonus', `${r.bonus} / ${WIN_BONUS}`);
    for (const e of r.expect) {
        const row = r.rows.find(t => t.includes(e.civ)) || '';
        const want = e.won ? `${e.total + WIN_BONUS} (inkl. +${WIN_BONUS} Sieg)` : String(e.total);
        ok(row.includes(want), `end screen: ${e.won ? 'winner' : 'other empire'} shows ${e.won ? 'points incl. bonus' : 'its points'}`, row.replace(/\s+/g, ' '));
    }
    ok(!errors.length, 'no page errors', errors.join(' | '));
    await browser.close();
}

(async () => {
    ok(finalPoints({ total: 40 }, true) === 40 + WIN_BONUS && finalPoints({ total: 40 }, false) === 40
        && finalPoints(null, true) === WIN_BONUS, 'finalPoints adds the bonus only for the winner');

    const users = [];
    try {
        users.push(...await serverSide('live'));
        users.push(...await serverSide('async'));
        await endScreen();
    } finally {
        const names = users.map(u => `'${u.name}'`).join(',');
        if (users.length) {
            for (const u of users) sql(`DELETE FROM games WHERE participants::text LIKE '%${u.name}%'`);
            sql(`DELETE FROM users WHERE username IN (${names})`);
        }
    }
    console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
