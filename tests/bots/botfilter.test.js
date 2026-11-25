/**
 * The host's bot filter (utils/botfilter.js, playerBotFilter) in live lobbies and Rundenspiele, against
 * the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/bots/botfilter.test.js [http://localhost:3000]
 *
 * First clean() and reason() on their own. Then a host with an own bot and a bot friend (owned by
 * someone else): "every bot except the excluded ones" keeps an excluded bot out; "only chosen
 * ones" lets in the host's own bots, bot friends and bots picked from the list, nothing else; an
 * exclusion beats all of them. A bot that joined before the filter blocks the start until it is
 * kicked. The public lobby list tells each bot whether it may join (playerBotsForYou), the bot
 * list (GET /api/playerbots) marks own bots and friends, inviting a bot friend follows the filter,
 * and the host's lobby shows the filter. Rundenspiele: the same rules for joining and inviting,
 * set once at the creation (also from the form), and playerBotsForYou in GET /api/async. Test
 * accounts and games are removed afterwards.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const BotFilter = require('../../utils/botfilter');

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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const TAG = 'bf' + crypto.randomBytes(2).toString('hex');
function makeUser(role) {
    const name = `${TAG}_${role.slice(0, 4)}_${crypto.randomBytes(2).toString('hex')}`;
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

function unit() {
    const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
    ok(BotFilter.clean(null) === null && BotFilter.clean({}) === null && BotFilter.clean([A]) === null, 'clean: nothing set = no filter');
    ok(BotFilter.clean({ own: true, allow: [A] }) === null, 'clean: own/allow mean nothing without "only"');
    const f = BotFilter.clean({ only: true, own: true, allow: [A, B, A.toUpperCase(), 'x', 5], block: [B] });
    ok(f && f.allow.length === 1 && f.allow[0] === A && f.block[0] === B, 'clean: ids checked, deduplicated, blocked ones not allowed', JSON.stringify(f));
    const many = Array.from({ length: 150 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    ok(BotFilter.clean({ block: many }).block.length === BotFilter.MAX_IDS, 'clean: at most 100 ids');
    const s = cfg => ({ hostIndex: 0, players: [{ dbUserId: 'host' }], gameConfig: { playerBotFilter: BotFilter.clean(cfg) } });
    ok(BotFilter.reason(s({ block: [A] }), { id: A }) && !BotFilter.reason(s({ block: [A] }), { id: B }), 'reason: all but excluded');
    ok(BotFilter.reason(s({ only: true }), { id: A, ownerId: 'host', friend: true }), 'reason: only, nothing chosen → nobody');
    ok(!BotFilter.reason(s({ only: true, own: true }), { id: A, ownerId: 'host' }), 'reason: own bot');
    ok(!BotFilter.reason(s({ only: true, friends: true }), { id: A, friend: true }), 'reason: friend');
    ok(!BotFilter.reason(s({ only: true, allow: [A] }), { id: A }), 'reason: picked from the list');
    ok(BotFilter.reason(s({ only: true, own: true, friends: true, block: [A] }), { id: A, ownerId: 'host', friend: true }), 'reason: excluded beats own and friend');
    const botHost = { hostIndex: 0, players: [{ playerBot: true, botOwnerId: 'o1' }], gameConfig: { playerBotFilter: BotFilter.clean({ only: true, own: true }) } };
    ok(!BotFilter.reason(botHost, { id: A, ownerId: 'o1' }) && BotFilter.reason(botHost, { id: A, ownerId: 'o2' }), 'reason: for a bot host "own" = same owner');
}

(async () => {
    unit();
    const host = makeUser('botcreator');
    const other = makeUser('botcreator');
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed ' + u.name);
            return ctx;
        };
        const call = async (ctx, method, path, data) => {
            const r = await ctx.request.fetch(BASE + path, { method, data });
            let body = {};
            try { body = await r.json(); } catch (_) { }
            return { status: r.status(), body };
        };
        const H = await login(host), O = await login(other);
        const mk = async (ctx, n) => {
            const r = await call(ctx, 'POST', '/api/bots', { username: `${TAG}_${n}` });
            if (r.status !== 200) throw new Error('bot ' + n + ': ' + JSON.stringify(r.body));
            return { ...r.body.bot, token: r.body.token };
        };
        const own = await mk(H, 'own'), own2 = await mk(H, 'own2');
        const fr = await mk(O, 'fr'), pick = await mk(O, 'pick'), x = await mk(O, 'x'), y = await mk(O, 'y');
        const botCtx = async b => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/bot', { data: { token: b.token } });
            if (r.status() !== 200) throw new Error('bot login ' + b.username);
            return ctx;
        };
        const pageOf = async ctx => {
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(BASE + '/');
            await page.waitForFunction(() => typeof MP !== 'undefined');
            await page.evaluate(() => MP.connect());
            return page;
        };
        const rest = (page, path, body) => page.evaluate(([path, body]) => fetch(path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }).then(r => r.json()), [path, body]);
        const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data]);

        // the host befriends `fr`
        await call(H, 'POST', '/api/friends', { username: fr.username });
        const frCtx = await botCtx(fr);
        ok((await call(frCtx, 'POST', `/api/friends/${host.id}/accept`)).body.ok === true, 'setup: the host is friends with a bot of someone else');

        // ── The bot list ────────────────────────────────────────────────────────
        const dir = (await call(H, 'GET', '/api/playerbots')).body.bots || [];
        const row = b => dir.find(d => d.id === b.id) || {};
        ok(row(own).own === true && row(own).friend === false && row(own).owner === host.name, 'list: own bot marked as own, with owner', JSON.stringify(row(own)));
        ok(row(fr).friend === true && row(fr).own === false && row(fr).owner === other.name, 'list: bot friend marked as friend', JSON.stringify(row(fr)));
        ok(row(x).own === false && row(x).friend === false, 'list: any other bot');

        // ── All except excluded ─────────────────────────────────────────────────
        const hostPage = await pageOf(H);
        const lobby = await rest(hostPage, '/api/sessions', { config: { playerCount: 8, kiCount: 0, isPublic: true }, host: { name: 'Host', clientId: 'host-cid' } });
        await emit(hostPage, 'session:connect', { sessionId: lobby.sessionId, password: lobby.password, clientId: 'host-cid' });
        await emit(hostPage, 'lobby:config', { playerBots: true });
        const pages = {};
        const join = async (b, name) => {
            pages[name] = pages[name] || await pageOf(b === fr ? frCtx : await botCtx(b));
            return rest(pages[name], '/api/sessions/join', { joinCode: lobby.joinCode, password: lobby.password, player: { name, clientId: name + '-cid' } });
        };
        const forBot = async b => {
            const ctx = b === fr ? frCtx : await botCtx(b);
            const l = ((await call(ctx, 'GET', '/api/public-sessions')).body || []);
            return (Array.isArray(l) ? l : l.sessions || []).find(s => s.joinCode === lobby.joinCode || s.id === lobby.sessionId);
        };
        let r = await emit(hostPage, 'lobby:config', { playerBotFilter: { block: [x.id] } });
        ok(r && !r.error, 'host sets an exclusion', r && r.error);
        const seenX = await forBot(x), seenY = await forBot(y);
        ok(seenX && seenX.playerBotFilter === true && seenX.playerBotsForYou === false, 'public list: the excluded bot sees it may not join', JSON.stringify(seenX && { f: seenX.playerBotFilter, you: seenX.playerBotsForYou }));
        ok(seenY && seenY.playerBotsForYou === true, 'public list: another bot may');
        const anon = ((await call(await browser.newContext(), 'GET', '/api/public-sessions')).body);
        const seenAnon = (Array.isArray(anon) ? anon : anon.sessions || []).find(s => s.joinCode === lobby.joinCode || s.id === lobby.sessionId);
        ok(seenAnon && !('playerBotsForYou' in seenAnon) && !('allow' in seenAnon), 'public list: no per-bot field and no ids for others');
        r = await join(x, 'x');
        ok(/ausgeschlossen/.test(r.error || ''), 'all but excluded: the excluded bot is refused', r.error);
        r = await join(y, 'y');
        ok(r.playerIndex >= 1, 'all but excluded: any other bot joins', r.error);

        // ── Only chosen ones ────────────────────────────────────────────────────
        r = await emit(hostPage, 'lobby:config', { playerBotFilter: { only: true } });
        ok(r && !r.error, 'host switches to "only chosen ones"');
        const start = await emit(hostPage, 'game:start', {});
        ok(/Bot-Filter/.test(start.error || '') && start.error.includes('y'), 'start: a bot inside that the filter refuses blocks the start', start.error);
        r = await join(own, 'own');
        ok(/nicht zugelassen/.test(r.error || ''), 'only: own bot refused while "own" is off', r.error);
        r = await join(fr, 'fr');
        ok(/nicht zugelassen/.test(r.error || ''), 'only: bot friend refused while "friends" is off', r.error);
        r = await join(pick, 'pick');
        ok(/nicht zugelassen/.test(r.error || ''), 'only: an unpicked bot is refused', r.error);

        // inviting the bot friend follows the filter
        r = await emit(hostPage, 'friends:invite', { userId: fr.id, joinCode: lobby.joinCode });
        ok(/nicht zugelassen/.test(r.error || ''), 'invite: refused while the filter keeps the friend out', r.error);

        await emit(hostPage, 'lobby:config', { playerBotFilter: { only: true, own: true, friends: true, allow: [pick.id], block: [own2.id] } });
        r = await join(own, 'own');
        ok(r.playerIndex >= 1, 'only: own bot joins with "own"', r.error);
        r = await emit(hostPage, 'friends:invite', { userId: fr.id, joinCode: lobby.joinCode });
        ok(r.ok === true, 'invite: sent once "friends" is on', r.error);
        r = await join(fr, 'fr');
        ok(r.playerIndex >= 1, 'only: bot friend joins with "friends"', r.error);
        r = await join(pick, 'pick');
        ok(r.playerIndex >= 1, 'only: a picked bot joins', r.error);
        r = await join(own2, 'own2');
        ok(/ausgeschlossen/.test(r.error || ''), 'only: an excluded own bot stays out', r.error);
        r = await join(x, 'x');
        ok(/ausgeschlossen|nicht zugelassen/.test(r.error || ''), 'only: everyone else stays out', r.error);

        // kick y (refused) – the filter no longer blocks the start
        const st = await emit(hostPage, 'session:connect', { sessionId: lobby.sessionId, password: lobby.password, clientId: 'host-cid' });
        const ySeat = (st.players || []).findIndex(p => p && p.name === 'y');
        ok(ySeat > 0, 'the refused bot y has a seat');
        await emit(hostPage, 'session:kick', { playerIndex: ySeat });
        const start2 = await emit(hostPage, 'game:start', {});
        ok(!/Bot-Filter/.test(start2.error || ''), 'start: after the kick the filter no longer blocks', start2.error);

        // ── Rundenspiele: the filter is set at the creation ──────────────────────
        const asyncCreate = async filter => {
            const res = await call(H, 'POST', '/api/async', { config: { mapKey: '0', playerCount: 4, kiCount: 0, isPublic: true, playerBots: true, playerBotFilter: filter } });
            if (!res.body.id) throw new Error('Rundenspiel: ' + JSON.stringify(res.body));
            return res.body;
        };
        const ctxs = {};
        const ctxOf = async b => (b === fr ? frCtx : ctxs[b.id] = ctxs[b.id] || await botCtx(b));
        const asyncJoin = async (g, b) => (await call(await ctxOf(b), 'POST', `/api/async/${g.id}/join`, { code: g.joinCode })).body;
        const openFor = async (g, b) => ((await call(await ctxOf(b), 'GET', '/api/async')).body.open || []).find(x => x.id === g.id);

        const rs1 = await asyncCreate({ block: [x.id] });
        const rsX = await openFor(rs1, x), rsY = await openFor(rs1, y);
        ok(rsX && rsX.config.playerBotFilter === true && rsX.playerBotsForYou === false && !('hostBotOwnerId' in rsX.config),
            'Rundenspiel list: the excluded bot sees it may not join, the lists stay private', JSON.stringify(rsX && { f: rsX.config.playerBotFilter, you: rsX.playerBotsForYou }));
        ok(rsY && rsY.playerBotsForYou === true, 'Rundenspiel list: another bot may');
        r = await asyncJoin(rs1, x);
        ok(/ausgeschlossen/.test(r.error || ''), 'Rundenspiel, all but excluded: the excluded bot is refused', r.error);
        r = await asyncJoin(rs1, y);
        ok(r.ok === true, 'Rundenspiel, all but excluded: any other bot joins', r.error);

        const rs2 = await asyncCreate({ only: true, own: true, friends: true, allow: [pick.id], block: [own2.id] });
        r = await asyncJoin(rs2, x);
        ok(/nicht zugelassen/.test(r.error || ''), 'Rundenspiel, only: an unchosen bot is refused', r.error);
        r = await asyncJoin(rs2, own2);
        ok(/ausgeschlossen/.test(r.error || ''), 'Rundenspiel, only: an excluded own bot stays out', r.error);
        r = await call(H, 'POST', `/api/async/${rs2.id}/invite`, { username: x.username });
        ok(/nicht zugelassen/.test(r.body.error || ''), 'Rundenspiel invite: refused for a bot the filter keeps out', r.body.error);
        r = await call(H, 'POST', `/api/async/${rs2.id}/invite`, { username: fr.username });
        ok(r.body.ok === true, 'Rundenspiel invite: sent to a bot friend with "friends"', r.body.error);
        r = await asyncJoin(rs2, own);
        ok(r.ok === true, 'Rundenspiel, only: own bot joins with "own"', r.error);
        r = await asyncJoin(rs2, pick);
        ok(r.ok === true, 'Rundenspiel, only: a picked bot joins', r.error);
        r = await asyncJoin(rs2, fr);
        ok(r.ok === true, 'Rundenspiel, only: bot friend joins with "friends"', r.error);

        const rs3 = await asyncCreate({ only: true });
        r = await asyncJoin(rs3, fr);
        ok(/nicht zugelassen/.test(r.error || ''), 'Rundenspiel, only without choices: even a friend is refused', r.error);

        // ── The host's lobby shows the filter ───────────────────────────────────
        const ui = await (await login(host)).newPage();
        ui.on('pageerror', e => errors.push(e.message));
        await ui.goto(BASE + '/');
        await ui.waitForFunction(() => typeof MP !== 'undefined');
        await ui.evaluate(() => MP.showLobby());
        await ui.waitForFunction(() => typeof MP.setMode === 'function');
        await ui.evaluate(() => MP.setMode('host'));
        await ui.fill('#mp-n', 'Filter');
        await ui.evaluate(() => MP.host());
        await ui.waitForSelector('#mp-set-bots');
        ok(!(await ui.$('#mp-set-botwho')), 'UI: no filter while player-bots are off');
        await ui.check('#mp-set-bots');
        await ui.waitForSelector('#mp-set-botwho');
        await ui.selectOption('#mp-set-botwho', 'only');
        await ui.waitForFunction(() => MP.gameConfig.playerBotFilter && MP.gameConfig.playerBotFilter.only === true && document.getElementById('mp-set-botown'));
        await ui.check('#mp-set-botown');
        await ui.waitForFunction(() => MP.gameConfig.playerBotFilter.own === true);
        ok(true, 'UI: "only chosen ones" and "my own bots" reach the server');
        await ui.click('#mp-botfilter > summary');
        await ui.waitForSelector(`#mp-botfilter-list select[data-id="${pick.id}"]`, { timeout: 8000 });
        await ui.selectOption(`#mp-botfilter-list select[data-id="${pick.id}"]`, 'allow');
        await ui.waitForFunction(id => (MP.gameConfig.playerBotFilter.allow || []).includes(id), pick.id);
        await ui.selectOption(`#mp-botfilter-list select[data-id="${x.id}"]`, 'block');
        await ui.waitForFunction(id => (MP.gameConfig.playerBotFilter.block || []).includes(id), x.id);
        const text = await ui.textContent('#mp-botfilter');
        ok(text.includes(own.username) && /eigener/.test(text), 'UI: the list marks own bots', '');
        ok(/1 zugelassen/.test(text) && /1 ausgeschlossen/.test(text), 'UI: the summary counts picks and exclusions', text.slice(0, 80));

        // ── The Rundenspiel form has the same filter, sent with "Erstellen" ──────
        await ui.evaluate(() => { closeModal(); ASYNC.showCreate(); });
        await ui.waitForSelector('#mpa-bots');
        ok(!(await ui.$('#mpa-set-botwho')), 'Rundenspiel form: no filter while player-bots are off');
        await ui.check('#mpa-bots');
        await ui.waitForSelector('#mpa-set-botwho');
        await ui.selectOption('#mpa-set-botwho', 'only');
        await ui.waitForSelector('#mpa-set-botfriends');
        await ui.check('#mpa-set-botfriends');
        await ui.waitForSelector(`#mpa-botfilter-list select[data-id="${x.id}"]`, { state: 'attached', timeout: 8000 });
        if (!(await ui.isVisible(`#mpa-botfilter-list select[data-id="${x.id}"]`))) await ui.click('#mpa-botfilter > summary');
        await ui.selectOption(`#mpa-botfilter-list select[data-id="${x.id}"]`, 'block');
        const form = await ui.evaluate(() => ({ f: ASYNC.form.playerBotFilter, bots: document.getElementById('mpa-bots').checked }));
        ok(form.bots && form.f && form.f.only === true && form.f.friends === true && (form.f.block || []).includes(x.id),
            'Rundenspiel form: the choices stay in the form (no re-read loses them)', JSON.stringify(form));
        await ui.check('#mpa-public');
        await ui.evaluate(() => ASYNC.create());
        const made = await ui.waitForFunction(() => ASYNC.game && ASYNC.game.id, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null)
            || sql(`SELECT id FROM async_games WHERE "hostUserId" = '${host.id}' ORDER BY "createdAt" DESC LIMIT 1`);
        const madeX = await openFor({ id: made }, x), madeFr = await openFor({ id: made }, fr);
        ok(madeX && madeX.playerBotsForYou === false && madeFr && madeFr.playerBotsForYou === true,
            'Rundenspiel form: the created game has the filter (friend in, excluded out)', JSON.stringify({ x: madeX && madeX.playerBotsForYou, fr: madeFr && madeFr.playerBotsForYou }));

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        const tagged = `SELECT id FROM users WHERE username LIKE '${TAG}\\_%'`;
        sql(`DELETE FROM async_games WHERE "hostUserId" IN (${tagged})`);
        sql(`DELETE FROM friendships WHERE "userId" IN (${tagged}) OR "friendId" IN (${tagged})`);
        sql(`DELETE FROM users WHERE "ownerId" IN (${tagged})`);
        sql(`DELETE FROM users WHERE username LIKE '${TAG}\\_%'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
