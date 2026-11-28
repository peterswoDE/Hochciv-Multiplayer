/**
 * Limits per account (utils/account-limits.js, scalability P1.11).
 *
 * Part 1 runs without a server:
 *
 *   node tests/limits/limits.test.js
 *
 * Covered: a full bucket lets calls through, an empty one first delays a call (one at a time) and
 * then refuses with rate_limited and retryAfter; a refunded token (a 304 of the game list) is
 * there again; a bot whose engine time is spent gets engine_budget for its moves; people have no
 * limit on other calls and chat.
 *
 * Part 2 needs the local docker setup with the default limits (ACCOUNT_LIMITS_SCALE empty or 1)
 * and its address:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   node tests/limits/limits.test.js http://localhost:3000
 *
 * Covered: the game list of a bot (6 at once, then 429 with Retry-After; a 304 is not counted),
 * a person's list (30), a bot's other calls (30); the sockets of an account (3 for a bot, a
 * fourth is refused with too_many_sockets, a closed one frees its place); moves per account and
 * per game over sockets; a bot's open Rundenspiele (5 per owner, then too_many_games); a bot that
 * keeps running into the limits is suspended (403 suspended, its session is gone, its token login
 * refused with code 'suspended') and the admins get a report of kind 'limit'. Test accounts,
 * their games and reports are removed afterwards.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const BASE = process.argv[2] ? process.argv[2].replace(/\/$/, '') : null;
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Part 1: without a server ─────────────────────────────────────────────────────
async function unit() {
    delete process.env.ACCOUNT_LIMITS_SCALE;
    const Limits = require('../../utils/account-limits');
    const bot = { id: 'bot-1', username: 'Bot', accountType: 'bot' };
    const human = { id: 'human-1', username: 'Human', accountType: 'human' };

    const list = [];
    for (let i = 0; i < 6; i++) list.push(await Limits.take(bot, 'list'));
    ok(list.every(r => r === null), 'a bot lists its games 6 times at once');
    const r7 = await Limits.take(bot, 'list');
    ok(r7 && r7.code === 'rate_limited' && r7.retryAfter >= 8 && r7.retryAfter <= 10 && /Zu viele/.test(r7.error),
        'the 7th is refused: rate_limited, retry after about 10 s', JSON.stringify(r7));
    Limits.refund(bot, 'list');
    ok(await Limits.take(bot, 'list') === null, 'a refunded token (a 304) can be used again');

    // moves: 30 at once, then one delayed, the next one at the same time refused
    for (let i = 0; i < 30; i++) await Limits.take(human, 'move', { gameId: 'g1' });
    const t0 = Date.now();
    const [a, b] = await Promise.all([Limits.take(human, 'move', { gameId: 'g1' }), Limits.take(human, 'move', { gameId: 'g1' })]);
    const waited = Date.now() - t0;
    ok(a === null && waited >= 150 && b && b.code === 'rate_limited', 'an empty bucket first delays a move, a second one waiting at the same time is refused',
        `${waited} ms, ${JSON.stringify(b)}`);

    // the per-game bucket: two accounts together
    Limits.resetAll();
    const h2 = { id: 'human-2', accountType: 'human' };
    for (let i = 0; i < 20; i++) await Limits.take(human, 'move', { gameId: 'g2' });
    const second = [];
    for (let i = 0; i < 20; i++) second.push(Limits.take(h2, 'move', { gameId: 'g2' }));
    const refused = (await Promise.all(second)).filter(r => r && r.code === 'rate_limited').length;
    ok(refused >= 8, 'one game takes at most 30 moves at once from all its players', `${refused} of 20 refused`);

    // engine time
    Limits.resetAll();
    ok(await Limits.take(bot, 'move', { gameId: 'g3' }) === null, 'a bot with engine time may move');
    Limits.spend(bot, 31);
    const e = await Limits.take(bot, 'move', { gameId: 'g3' });
    ok(e && e.code === 'engine_budget' && e.retryAfter > 1, 'a bot whose engine time is spent gets engine_budget', JSON.stringify(e));
    Limits.spend(human, 1000);
    ok(await Limits.take(human, 'move') === null, 'people have no engine budget');

    // people: no limit on other calls and chat
    Limits.resetAll();
    let all = true;
    for (let i = 0; i < 100; i++) all = all && (await Limits.take(human, 'call')) === null && (await Limits.take(human, 'chat')) === null;
    ok(all, 'people have no limit per account on other calls and chat');
    for (let i = 0; i < 30; i++) await Limits.take(bot, 'call');
    const c = await Promise.all([Limits.take(bot, 'call'), Limits.take(bot, 'call')]);
    ok(c.some(r => r && r.code === 'rate_limited'), 'a bot makes 30 other calls at once');
    ok(await Limits.take(bot, 'chat') === null && (await Limits.take(bot, 'chat')).code === 'rate_limited', 'a bot writes once per 10 s');
    Limits.resetAll();
}

// ── Part 2: against a running server ─────────────────────────────────────────────
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code })
    .toString().trim().split('\n').filter(l => !/^\[Engine Adapter\]/.test(l)).join('\n');

/** A session: fetch with its cookies kept. */
function client() {
    const jar = new Map();
    const call = async (method, url, body, headers) => {
        const res = await fetch(BASE + url, {
            method, redirect: 'manual',
            headers: Object.assign({ Cookie: call.cookie() }, body ? { 'Content-Type': 'application/json' } : {}, headers || {}),
            body: body ? JSON.stringify(body) : undefined,
        });
        for (const c of res.headers.getSetCookie()) {
            const [pair] = c.split(';'), i = pair.indexOf('=');
            jar.set(pair.slice(0, i), pair.slice(i + 1));
        }
        return { status: res.status, headers: res.headers, data: await res.json().catch(() => ({})) };
    };
    call.cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    return call;
}

/**
 * A minimal Socket.IO client (engine.io v4 over a WebSocket, `ws` from the server's packages):
 * resolves once connected, or with `refused` when the server sends 'limit' and closes.
 */
function socket(session) {
    const WebSocket = require('ws');
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket',
        { headers: { Cookie: session.cookie(), Origin: BASE } });
    let ackId = 0;
    const acks = new Map();
    const s = { ws, limit: null, closed: false };
    s.emit = (event, data) => new Promise(resolve => {
        const id = ackId++;
        acks.set(id, resolve);
        ws.send(`42${id}${JSON.stringify([event, data])}`);
    });
    s.close = () => new Promise(resolve => { if (s.closed) return resolve(); ws.once('close', resolve); ws.close(); });
    return new Promise(resolve => {
        let connected = false;
        ws.on('message', buf => {
            const m = buf.toString();
            if (m[0] === '0') ws.send('40');
            else if (m === '2') ws.send('3');
            else if (m.startsWith('40')) { connected = true; setTimeout(() => resolve(s), 100); }
            else if (m.startsWith('43')) {
                const k = m.slice(2).match(/^\d+/)[0];
                const r = acks.get(Number(k)); acks.delete(Number(k));
                if (r) r(JSON.parse(m.slice(2 + k.length))[0]);
            } else if (m.startsWith('42')) {
                const [event, data] = JSON.parse(m.slice(2));
                if (event === 'limit') s.limit = data;
            }
        });
        ws.on('close', () => { s.closed = true; resolve(s); });
        ws.on('error', () => { s.closed = true; resolve(s); });
        setTimeout(() => { if (!connected) resolve(s); }, 5000);
    });
}

async function server() {
    const TAG = 'lm' + crypto.randomBytes(3).toString('hex');
    const PASSWORD = 'Test-' + crypto.randomBytes(8).toString('hex');
    const names = ['owner', 'p1', 'p2'];
    const reset = () => fetch(BASE + '/api/test/reset', { method: 'POST' });
    const cleanup = () => inServer(`const { User, AsyncGame, Report, sequelize } = require('./models'); const { Op } = require('sequelize');
        (async () => {
            const users = await User.findAll({ where: { username: { [Op.startsWith]: '${TAG}_' } }, attributes: ['id'] });
            const ids = users.map(u => u.id);
            if (ids.length) {
                await AsyncGame.destroy({ where: { participantIds: { [Op.overlap]: ids } } });
                await Report.destroy({ where: { reportedId: ids } });
            }
            await User.destroy({ where: { id: ids } });
            await sequelize.close();
        })().catch(err => { console.error(err); process.exit(1); });`);
    inServer(`const { User, sequelize } = require('./models');
        const password_hash = require('bcryptjs').hashSync('${PASSWORD}', 10);
        User.bulkCreate(${JSON.stringify(names)}.map(n => ({ username: '${TAG}_' + n, role: n === 'owner' ? 'botcreator' : 'user', password_hash,
            email: '${TAG}_' + n + '@example.com', isActive: true, emailOtpEnabled: false, notifyEmail: false })))
            .then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });`);
    const sockets = [];
    try {
        await reset();
        const S = {};
        for (const n of names) {
            S[n] = client();
            const r = await S[n]('POST', '/api/auth/login', { username: `${TAG}_${n}`, password: PASSWORD });
            if (r.status !== 200) throw new Error(`login ${n}: ${r.status} ${JSON.stringify(r.data)}`);
        }
        const makeBot = async n => {
            const r = await S.owner('POST', '/api/bots', { username: `${TAG}_${n}` });
            if (r.status !== 200) throw new Error(`bot ${n}: ${r.status} ${JSON.stringify(r.data)}`);
            const session = client();
            const login = await session('POST', '/api/auth/bot', { token: r.data.token });
            if (login.status !== 200) throw new Error(`bot login ${n}: ${login.status}`);
            return { id: r.data.bot.id, token: r.data.token, session };
        };
        const A = await makeBot('A'), B = await makeBot('B');

        // the game list of a bot
        const first = await A.session('GET', '/api/async');
        const etag = first.headers.get('etag');
        // fetch adds Cache-Control: no-cache to a conditional request (Express then never answers 304);
        // a browser revalidating with cache: 'no-cache' sends max-age=0
        const revalidate = { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' };
        let same = 0;
        for (let i = 0; i < 10; i++) if ((await A.session('GET', '/api/async', null, revalidate)).status === 304) same++;
        ok(first.status === 200 && etag && same === 10, 'a bot asks 10 times without a change: 304, not counted', `${same} × 304`);
        const codes = [];
        for (let i = 0; i < 6; i++) codes.push((await A.session('GET', '/api/async')).status);
        const r429 = await A.session('GET', '/api/async');
        ok(codes.filter(c => c === 200).length >= 5 && r429.status === 429 && r429.data.code === 'rate_limited'
            && Number(r429.headers.get('retry-after')) >= 1 && r429.data.retryAfter >= 1,
            'a bot gets its list 6 times a minute, then 429 with Retry-After', `${codes} → ${r429.status} ${JSON.stringify(r429.data)}`);
        let human = 0;
        for (let i = 0; i < 25; i++) if ((await S.p1('GET', '/api/async')).status === 200) human++;
        ok(human === 25, 'a person gets the list 30 times a minute');

        // a bot's other calls
        await reset();
        const calls = [];
        for (let i = 0; i < 30; i++) calls.push((await B.session('GET', '/api/async/code/ZZZZZZ')).status);
        const more = await Promise.all([1, 2, 3].map(() => B.session('GET', '/api/async/code/ZZZZZZ')));
        ok(calls.every(c => c !== 429) && more.some(r => r.status === 429 && r.data.code === 'rate_limited'),
            'a bot makes 30 other calls at once, then 429', `${more.map(r => r.status)}`);

        // sockets
        await reset();
        const three = await Promise.all([1, 2, 3].map(() => socket(A.session)));
        sockets.push(...three);
        const fourth = await socket(A.session);
        sockets.push(fourth);
        ok(three.every(s => !s.closed && !s.limit) && fourth.closed && fourth.limit && fourth.limit.code === 'too_many_sockets',
            'a bot keeps 3 sockets open, a fourth is refused with too_many_sockets', JSON.stringify(fourth.limit));
        await three[0].close();
        await sleep(300);
        const again = await socket(A.session);
        sockets.push(again);
        ok(!again.closed && !again.limit, 'a closed socket frees its place');

        // moves per account and per game
        await reset();
        const game = crypto.randomUUID();
        const s1 = await socket(S.p1), s2 = await socket(S.p2);
        sockets.push(s1, s2);
        const moves = (s, n, id) => Array.from({ length: n }, () => s.emit('async:action', { id: id || crypto.randomUUID(), type: 'endTurn' }));
        const limited = r => r.filter(x => x && x.code === 'rate_limited').length;
        const both = await Promise.all([...moves(s1, 20, game), ...moves(s2, 20, game)]);
        ok(limited(both) >= 5 && both.find(x => x.code).retryAfter >= 1,
            'one game takes 30 moves at once from all players together (20 each is within each account\'s limit)', `${limited(both)} of 40 refused`);
        await reset();
        const s3 = await socket(S.p1);          // a fresh socket: each socket also has its own limit (40 events at once)
        sockets.push(s3);
        const r3 = await Promise.all(moves(s3, 40));
        ok(limited(r3) >= 8, 'an account makes at most 30 moves at once', `${limited(r3)} of 40 refused ${JSON.stringify([...new Set(r3.map(x => JSON.stringify(x)))])}`);

        // a bot owner's open Rundenspiele
        await reset();
        const made = [];
        for (let i = 0; i < 6; i++) {
            const bot = i % 2 ? B : A;
            made.push(await bot.session('POST', '/api/async', { config: { mapKey: '0', playerCount: 4, kiCount: 0 } }));
        }
        ok(made.slice(0, 5).every(r => r.status === 200) && made[5].status === 400 && made[5].data.code === 'too_many_games',
            'the bots of one owner keep 5 open Rundenspiele, the sixth is refused', `${made.map(r => r.status)} ${JSON.stringify(made[5].data)}`);

        // suspension
        await reset();
        for (const s of sockets) await s.close();
        const seen = [];
        for (let i = 0; i < 50; i++) {
            const r = await A.session('GET', '/api/async');
            seen.push(r.data.code === 'suspended' ? 'S' : r.status);
        }
        await sleep(1000);
        const after = await A.session('GET', '/api/async');
        // the suspension first comes from memory (403 suspended), then the session is gone (401)
        ok(seen.includes('S') && seen.indexOf('S') >= 30 && after.status === 401,
            'a bot that keeps going is suspended and its session ends', `${seen.join(',')} → ${after.status}`);
        const login = await client()('POST', '/api/auth/bot', { token: A.token });
        ok(login.status === 403 && login.data.code === 'suspended' && login.data.retryAfter > 3000,
            'its token login is refused for an hour', JSON.stringify(login.data));
        const report = JSON.parse(inServer(`const { Report, sequelize } = require('./models');
            Report.findOne({ where: { kind: 'limit', reportedId: '${A.id}' }, raw: true })
                .then(r => { console.log(JSON.stringify(r)); return sequelize.close(); })`));
        ok(report && report.status === 'open' && report.source === 'limits' && report.message.until
            && report.context.some(c => c.what === 'list' && c.n > 0), 'the admins get a report', JSON.stringify(report && report.context));
        ok((await B.session('GET', '/api/async')).status === 200, 'the owner\'s other bot goes on');
    } finally {
        for (const s of sockets) await s.close().catch(() => {});
        cleanup();
    }
}

(async () => {
    await unit();
    if (BASE) await server();
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
