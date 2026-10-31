/**
 * Bot accounts (utils/bots.js, routes/bots.js) and player-bots in lobbies, Rundenspiele and
 * matchmaking, against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/bots/bots.test.js [http://localhost:3000]
 *
 * A bot creator makes bots (limit 4, an admin raises it), the token logs them in, renewing it
 * ends the old one, account settings stay closed to bots, the leaderboards are separate. Taking
 * the role away or banning the owner stops the bots, giving it back starts them again; handing
 * a bot over and deleting the owner (the bots go along). Live lobby: player-bots only when the
 * host allows them, up to the limit, first come first served next to humans, a seat bound to its
 * bot; a bot as host always allows them. Rundenspiel: the same rules. Matchmaking: who may be
 * grouped with whom. Test accounts and games are removed afterwards.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();

const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const TAG = 'bt' + crypto.randomBytes(2).toString('hex');
function makeUser(role) {
    const name = `${TAG}_${role.slice(0, 4)}_${crypto.randomBytes(2).toString('hex')}`;
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, role: '${role}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

function matchRule() {
    const { fitsBots, matchConfig } = require('../../sockets/match');
    const human = { isBot: false, allowBots: false }, open = { isBot: false, allowBots: true }, bot = { isBot: true };
    ok(!fitsBots([human], bot) && !fitsBots([bot], human), 'match: a player who did not allow bots never meets one');
    ok(fitsBots([open], bot) && fitsBots([bot], open) && fitsBots([bot], bot), 'match: bots meet players who allow them, and each other');
    ok(!fitsBots([open, human], bot) && fitsBots([open, open], bot), 'match: one player without the opt-in keeps bots out');
    ok(matchConfig(true).playerBots === true && matchConfig().playerBots === false, 'match: the lobby allows player-bots when a bot is in it');
}

(async () => {
    matchRule();
    const creator = makeUser('botcreator');
    const admin = makeUser('admin');
    const plain = makeUser('user');
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const asyncIds = [];
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
        const C = await login(creator), A = await login(admin), P = await login(plain);

        // ── Creating, the limit, the token ──────────────────────────────────────
        const me = (await call(C, 'GET', '/api/auth/me')).body;
        ok(me.canCreateBots === true && me.accountType === 'human', 'a bot creator may create bots', JSON.stringify(me));
        ok((await call(P, 'POST', '/api/bots', { username: TAG + '_nope' })).status === 403, 'a normal user may not');
        const bots = [];
        for (let i = 1; i <= 4; i++) {
            const r = await call(C, 'POST', '/api/bots', { username: `${TAG}_bot${i}` });
            if (r.status === 200) bots.push({ ...r.body.bot, token: r.body.token });
        }
        ok(bots.length === 4 && bots.every(b => /^hcbot_/.test(b.token)), 'four bots, each with a token shown once');
        const fifth = await call(C, 'POST', '/api/bots', { username: `${TAG}_bot5` });
        ok(fifth.status === 400, 'the fifth is over the limit of 4', fifth.body.error);
        ok((await call(C, 'POST', '/api/bots', { username: creator.name })).status === 400, 'a bot name must be free like any user name');
        ok((await call(A, 'POST', `/api/admin/users/${creator.id}/action`, { action: 'set_bot_limit', botLimit: 5 })).status === 200, 'an admin raises the limit to 5');
        const fifth2 = await call(C, 'POST', '/api/bots', { username: `${TAG}_bot5` });
        ok(fifth2.status === 200, 'now the fifth works');
        if (fifth2.status === 200) bots.push({ ...fifth2.body.bot, token: fifth2.body.token });
        const list = (await call(C, 'GET', '/api/bots')).body;
        ok(list.bots.length === 5 && list.limit === 5 && list.bots.every(b => b.owner && b.owner.id === creator.id && !b.disabled), 'the owner sees their five bots', JSON.stringify({ n: list.bots.length, limit: list.limit }));
        const stored = sql(`SELECT count(*) FROM users WHERE "ownerId" = '${creator.id}' AND "botTokenHash" LIKE 'hcbot_%'`);
        ok(stored === '0', 'only the hash of the token is stored');

        const botCtx = async token => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/bot', { data: { token } });
            return { ctx, status: r.status(), body: await r.json().catch(() => ({})) };
        };
        const B1 = await botCtx(bots[0].token);
        ok(B1.status === 200 && B1.body.accountType === 'bot' && B1.body.username === bots[0].username, 'the token logs the bot in', JSON.stringify(B1.body));
        ok((await botCtx('hcbot_wrong')).status === 401, 'a wrong token is refused');
        const bearer = await (await browser.newContext()).request.post(BASE + '/api/auth/bot', { headers: { Authorization: 'Bearer ' + bots[1].token } });
        ok(bearer.status() === 200, 'the token also works as a Bearer header');
        ok((await call(B1.ctx, 'GET', '/api/account/history')).status === 403 && (await call(B1.ctx, 'GET', '/api/mfa/tokens')).status === 403,
            'a bot has no account settings or 2FA');
        ok((await call(B1.ctx, 'POST', '/api/bots', { username: TAG + '_sub' })).status === 403, 'a bot cannot create bots');
        ok((await call(B1.ctx, 'POST', '/api/auth/login', { username: bots[0].username, password: 'x' })).status === 401, 'a bot has no password login');

        // renewing the token: the old one and its sessions end
        const renewed = await call(C, 'POST', `/api/bots/${bots[2].id}/token`);
        const B3old = await botCtx(bots[2].token);
        ok(renewed.status === 200 && B3old.status === 401, 'a renewed token replaces the old one');
        bots[2].token = renewed.body.token;
        ok((await botCtx(bots[2].token)).status === 200, 'the new token works');
        ok((await call(P, 'POST', `/api/bots/${bots[2].id}/token`)).status === 404, 'nobody else can renew it');

        // profile and leaderboards
        const prof = (await call(P, 'GET', `/api/profile/${bots[0].id}`)).body;
        ok(prof.isBotAccount === true && prof.owner && prof.owner.username === creator.name, 'the profile shows bot and owner');
        const lbHumans = (await call(P, 'GET', '/api/leaderboard')).body, lbBots = (await call(P, 'GET', '/api/leaderboard?type=bot')).body;
        ok(!lbHumans.some(u => u.id === bots[0].id) && lbBots.some(u => u.id === bots[0].id) && !lbBots.some(u => u.id === creator.id), 'separate leaderboards for players and bots');

        // ── The owner loses the role / is banned ────────────────────────────────
        await call(A, 'POST', `/api/admin/users/${creator.id}/action`, { action: 'set_role', role: 'user' });
        ok((await call(B1.ctx, 'GET', '/api/auth/me')).status === 401, 'role taken away: the bot is logged out');
        ok((await botCtx(bots[0].token)).status === 403, '… and cannot log in');
        const disabled = (await call(A, 'GET', '/api/bots?all=1')).body.bots.find(b => b.id === bots[0].id);
        ok(disabled && !!disabled.disabled, 'admins see the bot as stopped', disabled && disabled.disabled);
        await call(A, 'POST', `/api/admin/users/${creator.id}/action`, { action: 'set_role', role: 'botcreator' });
        ok((await botCtx(bots[0].token)).status === 200, 'role given back: the bot works again');
        await call(A, 'POST', `/api/admin/users/${creator.id}/action`, { action: 'ban' });
        ok((await botCtx(bots[0].token)).status === 403, 'owner banned: the bot cannot log in');
        await call(A, 'POST', `/api/admin/users/${creator.id}/action`, { action: 'unban' });
        ok((await call(A, 'POST', `/api/admin/users/${bots[0].id}/action`, { action: 'set_role', role: 'admin' })).status === 400, 'a bot gets no role');

        // ── Handing over ────────────────────────────────────────────────────────
        const C2 = await login(creator);         // the ban ended the old sessions
        ok((await call(C2, 'POST', `/api/bots/${bots[4].id}/transfer`, { username: plain.name })).status === 400, 'not to someone without bot rights');
        ok((await call(C2, 'POST', `/api/bots/${bots[4].id}/transfer`, { username: admin.name })).status === 200, 'to an admin');
        ok((await call(A, 'GET', '/api/bots')).body.bots.some(b => b.id === bots[4].id), 'the admin owns it now');

        // ── Live lobby ─────────────────────────────────────────────────────────
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
        const join = (page, code, pw, name) => rest(page, '/api/sessions/join', { joinCode: code, password: pw, player: { name, clientId: name + '-cid' } });
        const connect = (page, sessionId, pw, name) => emit(page, 'session:connect', { sessionId, password: pw, clientId: name + '-cid' });

        const hostPage = await pageOf(C2);
        const bp = [];
        for (const b of bots.slice(0, 4)) bp.push(await pageOf((await botCtx(b.token)).ctx));
        const lobby = await rest(hostPage, '/api/sessions', { config: { playerCount: 4, kiCount: 1 }, host: { name: 'Host', clientId: 'host-cid' } });
        await connect(hostPage, lobby.sessionId, lobby.password, 'host');
        let r = await join(bp[0], lobby.joinCode, lobby.password, 'b1');
        ok(/keine Spieler-Bots/.test(r.error || ''), 'lobby: player-bots off by default', r.error);
        await emit(hostPage, 'lobby:config', { playerBots: true, playerBotLimit: 1 });
        r = await join(bp[0], lobby.joinCode, lobby.password, 'b1');
        ok(r.playerIndex === 1, 'lobby: allowed → the bot takes a human seat');
        r = await join(bp[1], lobby.joinCode, lobby.password, 'b2');
        ok(/kein Platz mehr für Spieler-Bots/.test(r.error || ''), 'lobby: the limit of 1 is full', r.error);
        const c1 = await connect(bp[0], lobby.sessionId, lobby.password, 'b1');
        const seat = c1.players && c1.players[1];
        ok(c1.ok && seat.botAccount === true && seat.userId === bots[0].id && seat.kind === 'human', 'lobby: the bot connects, marked as bot account', JSON.stringify(seat));
        // a human who knows the bot seat's secret can't play it, and a bot can't take a guest's seat
        const guestPage = await pageOf(P);
        const hijack = await connect(guestPage, lobby.sessionId, lobby.password, 'b1');
        ok(/Spieler-Bot/.test(hijack.error || ''), 'lobby: the bot seat is bound to its bot', hijack.error);
        const g = await join(guestPage, lobby.joinCode, lobby.password, 'human');
        ok(g.playerIndex === 2, 'lobby: a human takes the next free seat');
        const swap = await connect(bp[1], lobby.sessionId, lobby.password, 'human');
        ok(/nur als Spieler-Bot/.test(swap.error || ''), 'lobby: a bot cannot play a human seat', swap.error);
        // 3 human seats (4 empires, 1 KI): host, bot, human – full for everyone now
        await emit(hostPage, 'lobby:config', { playerBotLimit: null });
        r = await join(bp[1], lobby.joinCode, lobby.password, 'b2');
        ok(r.error === 'Sitzung ist voll.', 'lobby: whoever comes first takes the seats – now it is full', r.error);
        await emit(hostPage, 'lobby:config', { playerBots: false });
        const start = await emit(hostPage, 'game:start', {});
        ok(/nicht erlaubt/.test(start.error || ''), 'lobby: turned off with a bot inside → no start until it is kicked', start.error);

        // a bot as host: other bots may always come, the host itself doesn't count
        const botLobby = await rest(bp[1], '/api/sessions', { config: { playerCount: 3, kiCount: 0 }, host: { name: 'BotHost', clientId: 'bothost-cid' } });
        await connect(bp[1], botLobby.sessionId, botLobby.password, 'bothost');
        r = await join(bp[2], botLobby.joinCode, botLobby.password, 'b3');
        ok(r.playerIndex === 1, 'bot as host: player-bots allowed without a setting');
        await emit(bp[1], 'lobby:config', { playerBotLimit: 1 });
        r = await join(bp[3], botLobby.joinCode, botLobby.password, 'b4');
        ok(/kein Platz mehr/.test(r.error || ''), 'bot as host: its limit of 1 counts the guest bot, not itself', r.error);

        // ── Rundenspiel ─────────────────────────────────────────────────────────
        const asyncCreate = async (ctx, config) => {
            const res = await call(ctx, 'POST', '/api/async', { config: { mapKey: '0', playerCount: 4, kiCount: 0, ...config } });
            if (res.body.id) asyncIds.push(res.body.id);
            return res.body;
        };
        const ctxB = [];
        for (const b of bots.slice(0, 3)) ctxB.push((await botCtx(b.token)).ctx);
        const off = await asyncCreate(C2, {});
        r = await call(ctxB[0], 'POST', `/api/async/${off.id}/join`, { code: off.joinCode });
        ok(/keine Spieler-Bots/.test(r.body.error || ''), 'Rundenspiel: no player-bots unless allowed', r.body.error);
        const on = await asyncCreate(C2, { playerBots: true, playerBotLimit: 1 });
        r = await call(ctxB[0], 'POST', `/api/async/${on.id}/join`, { code: on.joinCode });
        ok(r.body.ok === true, 'Rundenspiel: allowed → the bot joins', r.body.error);
        r = await call(ctxB[1], 'POST', `/api/async/${on.id}/join`, { code: on.joinCode });
        ok(/kein Platz mehr für Spieler-Bots/.test(r.body.error || ''), 'Rundenspiel: the limit counts', r.body.error);
        const info = (await call(C2, 'GET', `/api/async/${on.id}`)).body;
        ok(info.config.playerBots === true && info.seats.some(s => s.userId === bots[0].id && s.botAccount), 'Rundenspiel: the seat shows the bot account');
        const botHosted = await asyncCreate(ctxB[1], {});
        r = await call(ctxB[2], 'POST', `/api/async/${botHosted.id}/join`, { code: botHosted.joinCode });
        ok(r.body.ok === true, 'Rundenspiel: a bot as host always allows player-bots', r.body.error);

        // ── Account page: the tab "Meine Bots" ──────────────────────────────────
        const acc = await C2.newPage();
        acc.on('pageerror', e => errors.push(e.message));
        acc.on('dialog', d => d.accept());
        await acc.goto(BASE + '/client/account.html');
        await acc.locator('[data-target="tab-bots"]').waitFor({ state: 'visible' });
        await acc.click('[data-target="tab-bots"]');
        await acc.waitForFunction(() => document.querySelectorAll('#table-bots tbody tr').length >= 4, null, { timeout: 8000 }).catch(() => null);
        ok(/Du hast 4 von 5 Bots/.test(await acc.textContent('#bots-count')), 'account page: count and limit', await acc.textContent('#bots-count'));
        await acc.fill('#input-bot-name', TAG + '_ui');
        await acc.click('#form-bot-create button[type="submit"]');
        await acc.waitForFunction(() => /^hcbot_/.test(document.getElementById('bot-token-value').textContent), null, { timeout: 8000 }).catch(() => null);
        ok(await acc.isVisible('#bot-token-box'), 'account page: a new bot shows its token once');
        ok(!(await (await login(plain)).newPage().then(async pg => { await pg.goto(BASE + '/client/account.html'); await pg.waitForTimeout(1000); return pg.isVisible('[data-target="tab-bots"]'); })),
            'account page: no bot tab without bot rights');

        // ── Deleting the owner deletes the bots ─────────────────────────────────
        const doomed = makeUser('botcreator');
        const D = await login(doomed);
        const db = (await call(D, 'POST', '/api/bots', { username: TAG + '_doom' })).body.bot;
        ok((await call(A, 'DELETE', `/api/admin/users/${doomed.id}`)).status === 200, 'admin deletes a bot owner');
        ok(sql(`SELECT count(*) FROM users WHERE id = '${db.id}'`) === '0', '… and the bot is gone with them');

        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        if (asyncIds.length) sql(`DELETE FROM async_games WHERE id IN (${asyncIds.map(id => `'${id}'`).join(',')})`);
        sql(`DELETE FROM users WHERE username LIKE '${TAG}\\_%'`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
