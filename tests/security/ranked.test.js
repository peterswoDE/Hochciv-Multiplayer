/**
 * Ranked integrity (R-02, R-06, R-07 of the findings report) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/security/ranked.test.js [http://localhost:3000]
 *
 * 1. Unit (R-06): a Rundenspiel continued from a ranked live game (config.fromLive) – a missed
 *    deadline hands the seat to the KI without MMR penalty; an ordinary ranked Rundenspiel still
 *    costs −15.
 * 2. Server (R-07): a seat that resigned in a ranked live game loses its 15 MMR (and gets a played
 *    game) when the host continues the game as a Rundenspiel.
 * 3. Live (R-02): a ranked duel of A and B. After the start, a third account C connects with B's
 *    secret clientId and is refused; B (own account) can still reconnect to the seat.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
 * download); set HOCHCIV_BROWSER to its path if it is not found.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim().split('\n').pop();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [], asyncIds = [];
function makeUser() {
    const name = 'rkd_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, termsVersion: require('./utils/terms').VERSION, termsAcceptedAt: new Date() })
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
    const L = require('../../async/logic');
    const engine = require('../../engine-adapter');
    const S = engine.createGame({
        gameConfig: { mapKey: '0', playerCount: 3, seed: 5 },
        players: ['griechenland', 'england', 'russland'].map(civ => ({ civ, ability: 'basis', kind: 'human' })),
    });
    const game = fromLive => ({
        status: 'playing', hold: false, engine: engine.version(), config: { ranked: true, fromLive },
        state: JSON.parse(JSON.stringify(S)),
        seats: [0, 1, 2].map(slot => ({ slot, kind: 'human', userId: 'u' + slot, civ: S.players.find(p => p.slot === slot).civ })),
    });
    const plain = game(undefined), conv = game('ABC123');
    const rp = L.timeout(plain), rc = L.timeout(conv);
    const who = 'u' + S.players[S.cur].slot;
    ok(rp.penalized.join() === who, 'unit: ranked Rundenspiel – the missed deadline costs MMR', JSON.stringify(rp));
    ok(rc.replaced.join() === who && rc.penalized.length === 0, 'unit: converted ranked game – the KI takes the seat without MMR penalty', JSON.stringify(rc));
    ok(conv.seats.find(s => s.userId === who).penalty === 0, 'unit: converted ranked game – the seat records no penalty');
}

function serverFromLive() {
    const a = makeUser(), b = makeUser(), c = makeUser();
    sql(`UPDATE users SET mmr = 1000, "gamesPlayed" = 0 WHERE id IN ('${a.id}','${b.id}','${c.id}')`);
    const out = inServer(`
        const svc = require('./async/service'); const engine = require('./engine-adapter'); const { User } = require('./models');
        (async () => {
            const [a, b, c] = await Promise.all(${JSON.stringify([a.id, b.id, c.id])}.map(id => User.findByPk(id)));
            const civs = ['griechenland', 'england', 'russland'];
            const S = engine.createGame({ gameConfig: { mapKey: '0', playerCount: 3, seed: 5 }, players: civs.map(civ => ({ civ, ability: 'basis', kind: 'human' })) });
            const lp = (u, civ, extra) => Object.assign({ kind: 'human', dbUserId: u.id, dbUsername: u.username, name: u.username, civ, ability: 'basis' }, extra);
            const session = { gameConfig: { mapKey: '0', ranked: true, playerCount: 3, seed: 5 }, state: S, chat: [], stats: null, replay: null, joinCode: 'RKDTST',
                players: [lp(a, civs[0]), lp(b, civs[1]), lp(c, civs[2], { resigned: true })] };
            // the resigned player's empire is played by the KI already (sockets/game.js resign)
            const ci = engine.stateIndexOf(S, 2, session.players[2]); Object.assign(S.players[ci], { kind: 'ki', kiLevel: 'schwer' });
            const r = await svc.fromLive(a, session, { turnDays: 1 });
            console.log(JSON.stringify(r));
            process.exit(0);
        })().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(0); });`);
    const r = JSON.parse(out);
    if (r.id) asyncIds.push(r.id);
    ok(!!r.id, 'server: ranked live game continued as a Rundenspiel', out);
    const [mc, gc] = sql(`SELECT mmr || ':' || "gamesPlayed" FROM users WHERE id = '${c.id}'`).split(':').map(Number);
    ok(mc === 985 && gc === 1, 'server: the seat resigned in the live game loses 15 MMR and gets a played game', `${mc}:${gc}`);
    const ma = Number(sql(`SELECT mmr FROM users WHERE id = '${a.id}'`));
    ok(ma === 1000, 'server: the players who play on keep their MMR', String(ma));
}

async function liveSeat() {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const page = async (user) => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
        if (r.status() !== 200) throw new Error('login failed for ' + user.name);
        const p = await ctx.newPage();
        p.on('dialog', d => d.accept());
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await p.evaluate(() => MP.showLobby());
        await p.waitForFunction(() => typeof MP.setMode === 'function');
        return p;
    };
    const inGame = (p, timeout) => p.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout });
    // a fresh socket of the page's account sends session:connect
    const connectAs = (p, d) => p.evaluate(d => new Promise(res => {
        const s = io({ transports: ['websocket'] });
        s.emit('session:connect', d, ack => { s.disconnect(); res(ack); });
        setTimeout(() => res({ timeout: true }), 8000);
    }), d);
    try {
        const ua = makeUser(), ub = makeUser(), uc = makeUser();
        const a = await page(ua), b = await page(ub), c = await page(uc);
        await a.fill('#mp-n', ua.name);
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        const cfg = { playerCount: 2, kiCount: 0, mapKey: 'random', ranked: true, turnTime: 60 };
        await a.evaluate(c => MP.socket.emit('lobby:config', c), cfg);
        await a.waitForFunction(() => MP.gameConfig.playerCount === 2 && MP.gameConfig.ranked);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        await b.evaluate(([c, n]) => MP.joinWith(c.code, c.pw, n), [cred, ub.name]);
        await b.waitForSelector('#mp-p-civ-1');
        await b.selectOption('#mp-p-civ-1', 'russland');
        await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
        await a.evaluate(() => MP.startGame());
        await Promise.all([inGame(a, 90000), inGame(b, 90000)]);

        const seat = await b.evaluate(() => ({ sessionId: MP.sessionId, clientId: MP.getClientId(), password: MP.password }));
        const other = await connectAs(c, seat);
        ok(other && other.error && /anderen Konto/.test(other.error), 'live: another account with B\'s clientId is refused after the start', JSON.stringify(other));
        const own = await connectAs(b, seat);
        ok(own && own.ok, 'live: B with the own account can still reconnect', own && (own.error || own.status));
        const stillB = await a.evaluate(() => MP.players[1] && MP.players[1].name);
        ok(stillB === ub.name, 'live: the seat still shows B', stillB);
    } finally {
        await browser.close();
    }
}

(async () => {
    unit();
    serverFromLive();
    await liveSeat();
})().catch(e => { console.error(e); failed++; }).finally(() => {
    for (const id of asyncIds) sql(`DELETE FROM async_games WHERE id = '${id}'`);
    for (const u of users) {
        sql(`DELETE FROM games WHERE participants::text LIKE '%${u.name}%'`);
        sql(`DELETE FROM users WHERE id = '${u.id}'`);
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
});
