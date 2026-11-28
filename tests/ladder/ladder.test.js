/**
 * The bot ladder of the Rundenspiele (async/ladder.js).
 *
 * Part 1 runs without the docker setup (and in CI, .github/workflows/checks.yml):
 *
 *   node tests/ladder/ladder.test.js
 *
 * Covered: a ladder game needs two different bot accounts and starts with both placing their
 * start tiles; it can't be left or cancelled; who is paired with whom (fewest games first, the
 * opponent met least often, no immediate rematch); the standings (a win, a draw, a KI takeover
 * counts as a loss, games that are not finished count for nothing).
 *
 * Part 2 needs a running server with a short pairing interval and its address as argument:
 *
 *   LADDER_TICK_MS=500 docker compose -f docker-compose.local.yml up -d --build
 *   node tests/ladder/ladder.test.js http://localhost:3000
 *
 * (docker-compose.local.yml passes LADDER_TICK_MS on.) Covered: the owner's opt-in (owner and
 * admin only), the admin's settings (admins only, checked values, the review admin only reads),
 * no pairing while the ladder is off or a bot is not opted in, the pairing of two bots that ask
 * for their games – rated between different owners, unrated between bots of one owner –, one
 * ladder game per bot at a time, that a request can't mark its own game as a ladder game, and the
 * standings page of the API; the standings table (a booked game counted once per bot, a win, a
 * draw, a KI takeover; another game version kept apart). Test accounts, their games and their
 * standings rows are removed again.
 *
 * Without docker: set HOCHCIV_SERVER_DIR to the server's folder (and DATABASE_URL as the server
 * has it) – the accounts are then created from there.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const BASE = process.argv[2] ? process.argv[2].replace(/\/$/, '') : null;
const CONTAINER = process.env.HOCHCIV_CONTAINER || 'hochciv-multiplayer-local';
const LOCAL = process.env.HOCHCIV_SERVER_DIR;

let failed = 0;
const ok = (cond, name, info) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`);
    if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 250) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}

// ── Part 1: without a server ─────────────────────────────────────────────────────
function unit() {
    const L = require('../../async/logic');
    const ladder = require('../../async/ladder');
    const bot = n => ({ id: 'b' + n, username: 'Bot' + n, isBot: true });
    const human = { id: 'h1', username: 'Human', isBot: false };

    ok(!!L.createLadderGame(bot(1), human).error && !!L.createLadderGame(human, bot(1)).error
        && !!L.createLadderGame(bot(1), bot(1)).error, 'a ladder game needs two different bot accounts');
    const { g } = L.createLadderGame(bot(1), bot(2), { ranked: true, turnDays: 3 });
    ok(g.status === 'placement' && g.seats.length === 2 && g.seats.every(s => s.kind === 'human' && s.botAccount && s.userId),
        'both bots are seated and place their start tiles', g.status);
    ok(g.config.arena === true && g.config.arenaLadder === true && g.config.mapKey === 'plaettchen' && g.config.isPublic
        && g.config.ranked === true && g.config.turnDays === 3 && g.config.noKi, 'public, on the tile map, without KI, rated as asked');
    ok(L.createLadderGame(bot(1), bot(2)).g.config.ranked === false, 'unrated unless asked');
    ok(typeof L.leave(g, 'b2') === 'string' && typeof L.cancel(g, 'b1') === 'string' && g.status === 'placement',
        'a ladder game can be neither left nor cancelled');
    const own = L.create({ id: 'h1', username: 'Human' }, { arena: 'yes', config: { mapKey: 'plaettchen', playerCount: 2, arena: true, arenaLadder: true } }).g;
    ok(!own.config.arena && !own.config.arenaLadder, 'a game is a ladder game only through createLadderGame');

    // Pairing
    const B = (id, mmr = 1000) => ({ id, mmr });
    const done = (a, b) => ({ status: 'finished', result: { gameId: 'x', winners: [a] }, participantIds: [a, b] });
    const ids = m => m.map(([a, b]) => [a.id, b.id].sort().join('-')).sort().join(' ');
    ok(ladder.selectMatchups([B('a')], [], true).length === 0, 'one bot alone is not paired');
    ok(ids(ladder.selectMatchups([B('a'), B('b'), B('c')], [], true)).split(' ').length === 1, 'three bots: one game, one waits');
    ok(ids(ladder.selectMatchups([B('a'), B('b'), B('c'), B('d')], [done('a', 'b'), done('c', 'd')], true)) !== 'a-b c-d',
        'with a choice nobody meets the same opponent again');
    ok(ladder.selectMatchups([B('a'), B('b')], [done('a', 'b')], true).length === 0, 'no immediate rematch …');
    ok(ids(ladder.selectMatchups([B('a'), B('b')], [done('a', 'b')], false)) === 'a-b', '… unless the admin allows it');
    ok(ids(ladder.selectMatchups([B('a'), B('b'), B('c')], [done('a', 'b'), done('a', 'b'), done('b', 'a')], true)).includes('c'),
        'the bot with the fewest games plays first');
    ok(ids(ladder.selectMatchups([B('a', 1000), B('b', 1500), B('c', 1010)], [], true)) === 'a-c', 'otherwise the closest MMR');
    ok(ladder.selectMatchups([B('a'), B('b')], [{ status: 'cancelled', result: null, participantIds: ['a', 'b'] }], true).length === 1,
        'a cancelled game is no rematch');

    // Standings
    const seats = (a, b, replaced) => [{ userId: a, name: a.toUpperCase() }, { userId: b, name: b.toUpperCase(), replaced: !!replaced }];
    const game = (a, b, winners, extra) => Object.assign({ status: 'finished', result: { gameId: 'x', winners }, seats: seats(a, b) }, extra);
    const table = ladder.standingsOf([
        game('a', 'b', ['A']), game('b', 'a', ['A']), game('a', 'c', ['A', 'C']),
        game('c', 'b', ['B'], { seats: seats('c', 'b', true) }),            // the KI won it for b: no win
        { status: 'playing', result: null, seats: seats('a', 'd') },
        { status: 'cancelled', result: null, seats: seats('b', 'c') },
        { status: 'finished', result: null, seats: seats('b', 'c') },        // not booked yet
    ]);
    const row = n => table.find(r => r.name === n);
    ok(table.map(r => r.name).join() === 'A,C,B,D', 'standings by score rate', table.map(r => r.name + ' ' + r.score).join(', '));
    ok(row('A').games === 3 && row('A').wins === 2 && row('A').draws === 1 && Math.abs(row('A').score - 2.5 / 3) < 1e-9, 'wins and draws counted');
    ok(row('B').games === 3 && row('B').wins === 0 && row('B').score === 0, 'a KI takeover is a loss, also when the KI wins');
    ok(row('C').games === 2 && row('C').draws === 1 && row('C').wins === 0, 'the opponent of a replaced bot does not win by the takeover alone');
    ok(row('D').games === 0 && row('D').score === null, 'a bot whose games are still running is listed without a score');
}

// ── Part 2: against a running server ─────────────────────────────────────────────
const inServer = code => (LOCAL
    ? execFileSync(process.execPath, ['-'], { input: code, cwd: path.resolve(LOCAL) })
    : execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }))
    .toString().trim().split('\n').filter(l => !/^\[Engine Adapter\]/.test(l)).join('\n');

/** A session: fetch with its cookies kept. */
function client() {
    const jar = new Map();
    return async (method, url, body) => {
        const res = await fetch(BASE + url, {
            method, redirect: 'manual',
            headers: Object.assign({ Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined,
        });
        for (const c of res.headers.getSetCookie()) {
            const [pair] = c.split(';'), i = pair.indexOf('=');
            jar.set(pair.slice(0, i), pair.slice(i + 1));
        }
        return { status: res.status, data: await res.json().catch(() => ({})) };
    };
}

async function server() {
    const TAG = 'ld' + crypto.randomBytes(3).toString('hex');
    const PASSWORD = 'Test-' + crypto.randomBytes(8).toString('hex');
    const names = { o1: 'botcreator', o2: 'botcreator', o3: 'botcreator', admin: 'admin', review: 'reviewadmin' };
    const prevSetting = JSON.parse(inServer(`const { Setting, sequelize } = require('./models');
        Setting.findByPk('arena-correspondence-ladder', { raw: true })
            .then(row => { console.log(JSON.stringify(row ? { value: row.value, updatedBy: row.updatedBy } : null)); return sequelize.close(); })
            .catch(err => { console.error(err); process.exit(1); });`));
    const restoreSetting = prevSetting
        ? `await Setting.upsert({ key: 'arena-correspondence-ladder', value: ${JSON.stringify(prevSetting.value)}, updatedBy: ${JSON.stringify(prevSetting.updatedBy)} });`
        : `await Setting.destroy({ where: { key: 'arena-correspondence-ladder' } });`;
    const cleanup = () => inServer(`const { User, AsyncGame, Setting, sequelize } = require('./models'); const { Op } = require('sequelize');
        (async () => {
            const users = await User.findAll({ where: { username: { [Op.startsWith]: '${TAG}_' } }, attributes: ['id'] });
            const ids = users.map(u => u.id);
            if (ids.length) await AsyncGame.destroy({ where: { participantIds: { [Op.overlap]: ids } } });
            if (ids.length) await sequelize.query('DELETE FROM arena_standings WHERE "userId" IN (:ids)', { replacements: { ids } });
            await User.destroy({ where: { id: ids } });
            ${restoreSetting}
            await sequelize.close();
        })().catch(err => { console.error(err); process.exit(1); });`);
    inServer(`const { User, Setting, sequelize } = require('./models');
        const password_hash = require('bcryptjs').hashSync('${PASSWORD}', 10);
        (async () => {
            await User.bulkCreate(${JSON.stringify(Object.entries(names))}.map(([n, role]) => ({ username: '${TAG}_' + n, role, password_hash,
                email: '${TAG}_' + n + '@example.com', isActive: true, emailOtpEnabled: false, notifyEmail: false })));
            await Setting.destroy({ where: { key: 'arena-correspondence-ladder' } });
            await sequelize.close();
        })().catch(err => { console.error(err); process.exit(1); });`);
    try {
        const S = {};
        for (const n of Object.keys(names)) {
            S[n] = client();
            const r = await S[n]('POST', '/api/auth/login', { username: `${TAG}_${n}`, password: PASSWORD });
            if (r.status !== 200) throw new Error(`login ${n}: ${r.status} ${JSON.stringify(r.data)}`);
        }
        const guest = client();
        const makeBot = async (owner, n) => {
            const r = await S[owner]('POST', '/api/bots', { username: `${TAG}_${n}` });
            if (r.status !== 200) throw new Error(`bot ${n}: ${r.status} ${JSON.stringify(r.data)}`);
            const session = client();
            const login = await session('POST', '/api/auth/bot', { token: r.data.token });
            if (login.status !== 200) throw new Error(`bot login ${n}: ${login.status}`);
            return { id: r.data.bot.id, name: r.data.bot.username, json: r.data.bot, session };
        };
        const A = await makeBot('o1', 'A'), Bb = await makeBot('o2', 'B'), C = await makeBot('o3', 'C'), C2 = await makeBot('o3', 'C2');
        const optIn = (who, bot, on) => who('POST', `/api/bots/${bot.id}/ladder-opt-in`, { arenaLadderOptIn: on });
        // the test asks every 250 ms – far above a bot's 6 lists a minute (utils/account-limits.js): the test
        // hook (TEST_HOOKS=on, as for every test of tests/run-all.js) resets the limits before each list
        const ladderGamesOf = async bot => {
            await fetch(BASE + '/api/test/reset', { method: 'POST' }).catch(() => {});
            return (await bot.session('GET', '/api/async')).data.mine.filter(g => g.config.arenaLadder);
        };

        // The owner's switch
        ok(A.json.arenaLadderOptIn === false, 'a new bot is not in the ladder');
        ok((await optIn(guest, A, true)).status === 401 && (await optIn(S.o2, A, true)).status === 404
            && (await optIn(A.session, A, true)).status === 403, 'only the owner opts a bot in: not a guest, another owner or the bot');
        ok((await optIn(S.o1, A, 'yes')).status === 400 && (await S.o1('POST', `/api/bots/${A.id}/ladder-opt-in`, {})).status === 400, 'the opt-in is true or false');
        const in1 = await optIn(S.o1, A, true);
        ok(in1.status === 200 && in1.data.arenaLadderOptIn === true
            && (await S.o1('GET', '/api/bots')).data.bots.find(b => b.id === A.id).arenaLadderOptIn === true, 'the owner opts the bot in');
        ok((await optIn(S.admin, Bb, true)).status === 200, 'an admin may opt a bot in too');

        // The admin's settings
        const first = await S.admin('GET', '/api/admin/ladder');
        ok(first.status === 200 && first.data.enabled === false && first.data.turnDays === 3 && first.data.avoidRematches === true
            && first.data.sameOwnerRanked === false && first.data.pairingIntervalSeconds === 15 && first.data.placement === 'leaderboard'
            && first.data.recentGamesLimit === 30 && first.data.canManage === true,
            'the ladder is off by default with a 15-second pairing interval and a 30-game list', JSON.stringify(first.data));
        ok((await guest('GET', '/api/settings')).data.ladderPlacement === 'leaderboard', 'the ladder is in the leaderboard by default');
        ok((await S.o1('GET', '/api/admin/ladder')).status === 403 && (await S.o1('POST', '/api/admin/ladder', {})).status === 403
            && (await S.o1('GET', '/api/admin/ladder/status')).status === 403 && (await guest('GET', '/api/admin/ladder/status')).status === 403,
            'settings and activity require ladder permissions');
        const on = { enabled: true, turnDays: 1, avoidRematches: true, sameOwnerRanked: false, pairingIntervalSeconds: 5,
            placement: 'leaderboard' };
        const review = await S.review('GET', '/api/admin/ladder');
        ok(review.status === 200 && review.data.canManage === false && (await S.review('GET', '/api/admin/ladder/status')).status === 200
            && (await S.review('POST', '/api/admin/ladder', on)).status === 403, 'the review admin can read the ladder and cannot save');
        ok((await S.admin('POST', '/api/admin/ladder', { ...on, turnDays: 2 })).status === 400
            && (await S.admin('POST', '/api/admin/ladder', { ...on, enabled: 'yes' })).status === 400
            && (await S.admin('POST', '/api/admin/ladder', {})).status === 400, 'settings: checked values');
        const invalidIntervals = await Promise.all([4, 301, 5.5, '15', null].map(pairingIntervalSeconds =>
            S.admin('POST', '/api/admin/ladder', { ...on, pairingIntervalSeconds })));
        ok(invalidIntervals.every(res => res.status === 400), 'pairing interval must be an integer from 5 to 300');
        const invalidGameLimits = await Promise.all([0, -1, 1.5, '30', null].map(recentGamesLimit =>
            S.admin('POST', '/api/admin/ladder', { ...on, recentGamesLimit })));
        ok(invalidGameLimits.every(res => res.status === 400), 'the recent games limit must be a positive integer');
        ok((await S.admin('POST', '/api/admin/ladder', { ...on, placement: 'other' })).status === 400, 'invalid placement is refused');
        const slower = await S.admin('POST', '/api/admin/ladder', { ...on, enabled: false, pairingIntervalSeconds: 60,
            placement: 'main-menu', recentGamesLimit: 2 });
        const { pairingIntervalSeconds, placement, ...legacy } = on;
        const legacySave = await S.admin('POST', '/api/admin/ladder', { ...legacy, enabled: false });
        ok(slower.data.pairingIntervalSeconds === 60 && legacySave.data.pairingIntervalSeconds === 60
            && legacySave.data.placement === 'main-menu' && legacySave.data.recentGamesLimit === 2,
            'an older settings client preserves the saved pairing interval, placement and recent games limit');
        ok((await guest('GET', '/api/settings')).data.ladderPlacement === 'main-menu', 'the main-menu selection is public');

        // Off: nobody is paired
        await ladderGamesOf(A); await ladderGamesOf(Bb);
        await sleep(2500);
        ok((await ladderGamesOf(A)).length === 0 && (await ladderGamesOf(Bb)).length === 0, 'ladder off: two opted-in bots are not paired');
        const idle = await S.admin('GET', '/api/admin/ladder/status');
        ok(idle.status === 200 && idle.data.optedIn === 2 && idle.data.available === 2 && idle.data.activeGames === 0
            && idle.data.lastCheckAt === null, 'paused status shows ready bots and no pairing checks yet');

        // On: A and B (different owners) get a rated game; C (not opted in) none
        const saved = await S.admin('POST', '/api/admin/ladder', on);
        const savedSettings = (await S.admin('GET', '/api/admin/ladder')).data;
        ok(saved.status === 200 && savedSettings.enabled === true && savedSettings.turnDays === 1
            && savedSettings.pairingIntervalSeconds === 5, 'an admin switches the ladder on and sets its interval');
        await ladderGamesOf(C);
        const mine = await until(async () => { await ladderGamesOf(Bb); const g = await ladderGamesOf(A); return g.length ? g : null; });
        const game = mine && mine[0];
        ok(!!game, 'two opted-in bots are paired within the new 5-second interval plus allowance');
        if (!game) return;
        const activity = await S.admin('GET', '/api/admin/ladder/status');
        ok(activity.status === 200 && activity.data.optedIn === 2 && activity.data.available === 0 && activity.data.activeGames === 1
            && Number.isFinite(Date.parse(activity.data.lastCheckAt)), 'active status shows the game and excludes both busy bots');
        const seen = (await ladderGamesOf(Bb))[0];
        ok(seen && seen.id === game.id && game.status === 'placement' && game.seats.every(s => s.botAccount)
            && game.seats.map(s => s.name).sort().join() === [A.name, Bb.name].sort().join(), 'both sit in the same game and place their start tiles', game.status);
        ok(game.config.ranked === true && game.config.mapKey === 'plaettchen' && game.config.turnDays === 1 && game.freeSeats.length === 0,
            'rated between bots of different owners, on the tile map, with the admin\'s days per turn');
        ok(game.yourTurn && seen.yourTurn, 'both are asked for their start tile');
        await sleep(2500);
        ok((await ladderGamesOf(A)).length === 1 && (await ladderGamesOf(Bb)).length === 1, 'one ladder game per bot at a time');
        ok((await ladderGamesOf(C)).length === 0, 'a bot that is not opted in is left alone');

        // Bots of one owner: unrated
        await optIn(S.o3, C, true); await optIn(S.o3, C2, true);
        const same = await until(async () => { await ladderGamesOf(C2); const g = await ladderGamesOf(C); return g.length ? g[0] : null; });
        ok(same && same.config.ranked === false && same.seats.map(s => s.name).sort().join() === [C.name, C2.name].sort().join(),
            'bots of one owner play unrated');

        // It stays a ladder game, and nobody else makes one
        const host = game.isHost ? A : Bb, other = game.isHost ? Bb : A;
        ok((await host.session('POST', `/api/async/${game.id}/cancel`)).status === 400
            && (await other.session('POST', `/api/async/${game.id}/leave`)).status === 400
            && (await ladderGamesOf(A)).length === 1, 'a ladder game can be neither cancelled nor left');
        const fake = await S.o1('POST', '/api/async', { arena: true, config: { mapKey: 'plaettchen', playerCount: 2, isPublic: false, arena: true, arenaLadder: true } });
        const info = fake.status === 200 ? (await S.o1('GET', `/api/async/${fake.data.id}`)).data : null;
        ok(info && !info.config.arena && !info.config.arenaLadder, 'a request cannot mark its game as a ladder game', String(fake.status));
        if (info) await S.o1('POST', `/api/async/${fake.data.id}/cancel`);

        // The standings
        ok((await guest('GET', '/api/async/ladder')).status === 401, 'standings: login required, like all Rundenspiele');
        const rep = await S.o2('GET', '/api/async/ladder');
        const rows = rep.data.standings || [], listed = (rep.data.games || []).find(g => g.id === game.id);
        ok(rep.status === 200 && rep.data.version === game.engine && rep.data.editions.includes(game.engine), 'standings of the current game version', rep.data.version);
        ok([A, Bb, C, C2].every(b => rows.some(r => r.name === b.name && r.games === 0 && r.score === null)), 'the bots of running games are listed without a score');
        ok(listed && listed.status === 'placement' && listed.ranked === true && listed.names.length === 2 && listed.winners.length === 0 && !listed.replay,
            'the running game is listed');
        ok((await S.o2('GET', '/api/async/ladder?version=v1')).data.version === game.engine, 'an unknown game version shows the current one');
        const limitSave = await S.admin('POST', '/api/admin/ladder', { ...on, recentGamesLimit: 1 });
        const limited = await S.o2('GET', '/api/async/ladder');
        ok(limitSave.status === 200 && limitSave.data.recentGamesLimit === 1 && limited.status === 200
            && limited.data.games.length === 1 && limited.data.games[0].id === same?.id
            && JSON.stringify(limited.data.standings) === JSON.stringify(rows),
            'a smaller recent games limit keeps the newest game and the full standings');

        // The standings table (arena_standings): what processResult books, in another game version
        inServer(`const ladder = require('./async/ladder'); const { sequelize } = require('./models');
            (async () => {
                const a = { userId: '${A.id}', name: '${A.name}' }, b = { userId: '${Bb.id}', name: '${Bb.name}' };
                const g = { engine: 'v0', seats: [a, b] };
                await ladder.enter(g);
                await ladder.enter(g);                                                     // a second game: no second row
                await sequelize.transaction(t => ladder.book(g, ['${A.name}'], t));         // A wins
                await sequelize.transaction(t => ladder.book(g, ['${A.name}', '${Bb.name}'], t));   // a draw
                await sequelize.transaction(t => ladder.book({ engine: 'v0', seats: [a, { ...b, replaced: true }] }, ['${Bb.name}'], t));   // the KI won for B
                await sequelize.close();
            })().catch(err => { console.error(err); process.exit(1); });`);
        await fetch(BASE + '/api/test/reset', { method: 'POST' });               // drops the report cache of the server
        const v0 = await S.o2('GET', '/api/async/ladder?version=v0');
        const [r0, r1] = v0.data.standings || [];
        ok(v0.status === 200 && v0.data.version === 'v0' && v0.data.editions.includes('v0') && v0.data.editions[0] === game.engine
            && v0.data.standings.length === 2 && v0.data.games.length === 0, 'another game version has its own standings', JSON.stringify(v0.data).slice(0, 200));
        ok(r0 && r0.name === A.name && r0.games === 3 && r0.wins === 1 && r0.draws === 1 && Math.abs(r0.score - 0.5) < 1e-9
            && r1 && r1.name === Bb.name && r1.games === 3 && r1.wins === 0 && r1.draws === 1 && Math.abs(r1.score - 1 / 6) < 1e-9,
            'booked games counted: a win, a draw, a KI takeover is a loss', JSON.stringify(v0.data.standings));
        ok(JSON.stringify((await S.o2('GET', '/api/async/ladder')).data.standings) === JSON.stringify(rows), 'the current version is not touched');

        // Opting out: no new games
        const out = await optIn(S.o1, A, false);
        ok(out.status === 200 && out.data.arenaLadderOptIn === false, 'the owner opts the bot out again');
    } finally {
        cleanup();
    }
}

(async () => {
    unit();
    if (BASE) await server();
    else console.log('(part 2 skipped: pass the server\'s address to run it)');
    console.log(failed ? `\n${failed} check(s) failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
