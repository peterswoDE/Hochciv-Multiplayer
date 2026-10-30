/**
 * Replays (utils/replay.js, routes/games.js, client/replay.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/replay/replay.test.js [http://localhost:3000]
 *
 * 1. Live game: a logged-in test account hosts (two KI empires) and only ends its turns until the
 *    game is over. The end screen offers the replay; it is stored with the match – one frame per
 *    turn, in order, the last one the end; served Brotli-compressed to browsers that accept it.
 * 2. Viewer (a fresh browser, ?replay=<id>): timeline (next / previous / rounds / slider / play),
 *    read-only, the end screen with statistics and without rematch, and the local single-player
 *    save is neither written nor deleted. The player's profile links the replay.
 * 3. Rundenspiel (tests/stats/finish-async.js): frames kept in replay_frames while it runs, one
 *    replay at the end, the rows gone, the finished view links it.
 * 4. Account deletion: the player's name leaves the stored replay (names, states, log) and the
 *    statistics; renaming in the frames of a running Rundenspiel; old replays and orphaned
 *    frames are cleaned up.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
 * download); set HOCHCIV_BROWSER to its path if it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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
    const name = 'Repl' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
/** GET with node's http – Accept-Encoding as given (the browser decides that itself). */
function rawGet(url, enc) {
    return new Promise((resolve, reject) => {
        require('http').get(url, { headers: enc ? { 'Accept-Encoding': enc } : {} }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        }).on('error', reject);
    });
}

async function live(browser, errors, user) {
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
    await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`live: ${e.message}`));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined' && typeof REPLAY !== 'undefined');
    await page.evaluate(async name => {
        localStorage.setItem('mp-name', name);           // the lobby name = the account name here
        await MP.showLobby();
        MP.setMode('host');
        await MP.host();
    }, user.name);
    await page.waitForFunction(() => MP.active && MP.lobbyIndex === 0);
    await page.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 2, mapKey: 'gross', wonders: true }));
    await page.waitForFunction(() => MP.gameConfig.playerCount === 3);
    await page.evaluate(() => MP.startGame());
    await page.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'));
    const driver = setInterval(() => page.evaluate(() => {
        if (S && !S.over && MP.isMyTurn() && MP._e !== S.round + ':' + S.cur) { MP._e = S.round + ':' + S.cur; closeModal(); MP.sendAction({ type: 'endTurn' }); }
    }).catch(() => { }), 200);
    await page.waitForFunction(() => S && S.over && document.getElementById('mp-replay-btn'), null, { timeout: 300000 });
    clearInterval(driver);
    const record = await page.evaluate(() => MP.lastRecord);
    ok(record && record.replay && /^[0-9a-f-]{36}$/.test(record.id), 'live: the end screen offers "Wiederholung ansehen"', JSON.stringify(record));
    ok(Number(sql(`SELECT frames FROM replays WHERE "gameId" = '${record.id}'`)) > 3, 'live: the replay is stored with the match');

    // the replay as stored: br for browsers that accept it, else plain JSON
    const br = await rawGet(`${BASE}/api/games/${record.id}/replay`, 'gzip, deflate, br');
    ok(br.status === 200 && br.headers['content-encoding'] === 'br', 'API: Brotli as stored when accepted', `${br.body.length} bytes`);
    const doc = JSON.parse(zlib.brotliDecompressSync(br.body).toString('utf8'));
    // without br it is decompressed – gzipped by the server's compression when accepted
    const gz = await rawGet(`${BASE}/api/games/${record.id}/replay`, 'gzip, deflate');
    ok(gz.status === 200 && gz.headers['content-encoding'] === 'gzip' && JSON.parse(zlib.gunzipSync(gz.body)).frames.length === doc.frames.length, 'API: decompressed for others (gzip)');
    const plain = await rawGet(`${BASE}/api/games/${record.id}/replay`, 'identity');
    ok(plain.status === 200 && !plain.headers['content-encoding'] && JSON.parse(plain.body).frames.length === doc.frames.length, 'API: decompressed for others (plain)');
    ok((await rawGet(`${BASE}/api/games/${crypto.randomUUID()}/replay`)).status === 404, 'API: 404 without a replay');
    const keys = doc.frames.map(S => `${S.round}:${S.cur}`);
    const ordered = doc.frames.every((S, k) => k === 0 || S.round > doc.frames[k - 1].round || (S.round === doc.frames[k - 1].round && S.cur !== doc.frames[k - 1].cur) || S.over);
    ok(doc.frames[0].round === 1 && ordered && doc.frames[doc.frames.length - 1].over, 'replay: one frame per turn, from the start to the end', `${doc.frames.length} frames, ${keys.slice(0, 6).join(' ')} …`);
    ok(doc.version && doc.names.includes(user.name), 'replay: version and names', `${doc.version}, ${doc.names.join(', ')}`);

    // the profile links it
    await page.evaluate(id => { closeModal(); PROFILE.open(id); }, user.id);
    await page.waitForSelector('#hcp-body .hcp-game summary');
    await page.click('#hcp-body .hcp-game summary');
    const href = await page.getAttribute('#hcp-body .hcp-replay a', 'href');
    ok(href === '/?replay=' + record.id, 'profile: the match links its replay', href);
    await ctx.close();
    return { record, doc };
}

async function viewer(browser, errors, record, doc) {
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`viewer: ${e.message}`));
    await page.goto(BASE + '/');
    await page.evaluate(() => localStorage.setItem('hochciv.save', '"LOCAL-GAME"'));   // a local game that must survive
    await page.goto(BASE + '/?replay=' + record.id);
    await page.waitForSelector('#mp-replay-bar');
    const at = () => page.evaluate(() => ({ at: REPLAY.at, key: S.round + ':' + S.cur, label: document.getElementById('mpr-label').textContent }));
    const key = k => `${doc.frames[k].round}:${doc.frames[k].cur}`;
    let s = await at();
    ok(s.at === 0 && s.key === key(0) && /^Runde 1 · .+ am Zug · Zug 1 von \d+$/.test(s.label), 'viewer: opens at the start', s.label);
    ok(!/replay=/.test(page.url()), 'viewer: the address no longer carries ?replay (a reload goes to the menu)');
    await page.click('[data-act="next"]'); await page.click('[data-act="next"]');
    s = await at();
    ok(s.at === 2 && s.key === key(2), 'viewer: ▶| steps a turn', s.key);
    await page.click('[data-act="prev"]');
    ok((await at()).at === 1, 'viewer: ◀ steps back');
    await page.click('[data-act="next-round"]');
    s = await at();
    ok(doc.frames[s.at].round === 2 && doc.frames[s.at - 1].round === 1, 'viewer: ⏩ goes to the first turn of the next round', s.key);
    await page.click('[data-act="prev-round"]');
    ok((await at()).at === 0, 'viewer: ⏪ back to the start of the round before');
    await page.$eval('#mpr-slider', el => { el.value = '3'; el.dispatchEvent(new Event('input')); });
    ok((await at()).at === 3, 'viewer: the slider jumps');
    ok(await page.evaluate(() => buyPower(S, S.cur, 1)) === 'Du schaust nur zu.', 'viewer: read-only');
    ok(await page.evaluate(() => getComputedStyle(document.getElementById('mp-chat')).display === 'none'), 'viewer: no chat');
    await page.click('[data-act="play"]');
    await page.waitForFunction(() => REPLAY.at >= 5, null, { timeout: 6000 });
    ok(true, 'viewer: ▶ plays');
    await page.click('[data-act="last"]');
    await page.waitForSelector('#ov-body');
    const end = await page.evaluate(() => ({
        over: !!S.over, stats: !!document.getElementById('mp-stats-btn'), rematch: !!document.getElementById('mp-rematch-box'),
        replayBtn: !!document.getElementById('mp-replay-btn'), again: !!document.getElementById('go-again'),
    }));
    ok(end.over && end.stats && !end.rematch && !end.replayBtn && !end.again, 'viewer: the end screen with statistics, without rematch', JSON.stringify(end));
    await page.click('#go-menu');
    await page.waitForFunction(() => !location.search && document.getElementById('screen-menu').classList.contains('show'));
    ok(await page.evaluate(() => localStorage.getItem('hochciv.save')) === '"LOCAL-GAME"', 'viewer: the local game is neither overwritten nor deleted');
    await ctx.close();
}

function rundenspiel() {
    const a = makeUser(), b = makeUser();
    let out = null;
    try {
        out = JSON.parse(inServer(fs.readFileSync(path.join(__dirname, '../stats/finish-async.js'), 'utf8'),
            { USER_A: a.id, NAME_A: a.name, USER_B: b.id, NAME_B: b.name }).split('\n').pop());
        ok(out.status === 'finished', 'Rundenspiel: played to the end', `round ${out.round}`);
        ok(out.replayFrames > 3 && out.framesLeft === 0, 'Rundenspiel: one replay at the end, the frame rows gone', `${out.replayFrames} frames`);
        ok(out.record && out.record.replay && out.record.id === out.game.id, 'Rundenspiel: the finished view links the replay', JSON.stringify(out.record));
    } finally {
        if (out && out.id) sql(`DELETE FROM async_games WHERE id = '${out.id}'`);
        if (out && out.game) sql(`DELETE FROM replays WHERE "gameId" = '${out.game.id}'`);
        sql(`DELETE FROM games WHERE participants::text LIKE '%${a.name}%'`);
        sql(`DELETE FROM users WHERE id IN ('${a.id}', '${b.id}')`);
    }
}

function deletion(user, record) {
    inServer(`const { User } = require('./models'); const { deleteAccount } = require('./utils/deleteAccount');
        User.findByPk('${user.id}').then(u => deleteAccount(u)).then(r => { console.log(r || 'ok'); process.exit(0); })`);
    const doc = JSON.parse(zlib.brotliDecompressSync(Buffer.from(sql(`SELECT encode(data, 'base64') FROM replays WHERE "gameId" = '${record.id}'`).replace(/\s/g, ''), 'base64')).toString('utf8'));
    const text = JSON.stringify(doc);
    ok(!text.includes(user.name), 'deletion: the name is gone from the replay (names, states, log)');
    ok(doc.names.includes('Gelöschter Spieler'), 'deletion: the replay names "Gelöschter Spieler"');
    const stats = sql(`SELECT stats::text FROM games WHERE id = '${record.id}'`);
    ok(!stats.includes(user.name) && stats.includes('Gelöschter Spieler'), 'deletion: the name is gone from the statistics');

    // frames of a running Rundenspiel, and the cleanup
    const out = JSON.parse(inServer(`const R = require('./utils/replay'); const zlib = require('zlib');
        const { ReplayFrame, Replay, sequelize } = require('./models'); const crypto = require('crypto');
        (async () => {
            const key = crypto.randomUUID();
            const S = { round: 1, cur: 0, players: [{ name: 'Zed' }, { name: 'Ann' }], log: [{ m: 'Kampf um Zeds Stadt' }, { m: 'Zedekia zieht' }] };
            await ReplayFrame.create({ gameKey: key, seq: 0, data: zlib.brotliCompressSync(JSON.stringify(S)) });
            await R.renameInFrames(key, 'Zed', 'Gelöschter Spieler');
            const back = JSON.parse(zlib.brotliDecompressSync((await ReplayFrame.findOne({ where: { gameKey: key } })).data).toString());
            const oldId = crypto.randomUUID();
            await Replay.create({ gameId: oldId, version: 'x', frames: 1, data: Buffer.from('x') });
            await sequelize.query("UPDATE replays SET \\"createdAt\\" = now() - interval '200 days' WHERE \\"gameId\\" = '" + oldId + "'");
            await R.cleanup();
            console.log(JSON.stringify({ back, old: await Replay.count({ where: { gameId: oldId } }), orphan: await ReplayFrame.count({ where: { gameKey: key } }) }));
            process.exit(0);
        })().catch(e => { console.error(e); process.exit(1); });`).split('\n').pop());
    ok(out.back.players[0].name === 'Gelöschter Spieler' && out.back.players[1].name === 'Ann'
        && out.back.log[0].m === 'Kampf um Gelöschter Spielers Stadt' && out.back.log[1].m === 'Zedekia zieht',
    'deletion: renamed in the frames of a running Rundenspiel (whole names only)', JSON.stringify(out.back.log));
    ok(out.old === 0, 'cleanup: replays older than 180 days are deleted');
    ok(out.orphan === 0, 'cleanup: frames of games that no longer run are deleted');
}

(async () => {
    const user = makeUser();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    let record = null;
    try {
        const r = await live(browser, errors, user);
        record = r.record;
        await viewer(browser, errors, r.record, r.doc);
        rundenspiel();
        deletion(user, r.record);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        if (record) {
            sql(`DELETE FROM replays WHERE "gameId" = '${record.id}'`);
            sql(`DELETE FROM games WHERE id = '${record.id}'`);
        }
        sql(`DELETE FROM users WHERE id = '${user.id}'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
