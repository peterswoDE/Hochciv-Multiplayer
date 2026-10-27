/**
 * Chat moderation (utils/reports.js, client/chat.js, account page) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/reports/reports.test.js [http://localhost:3000]
 *
 * Live game with two accounts (A, B) and a guest (C, emotes only):
 *   · tapping another player's message opens the menu (report and block for an account, report
 *     and mute for a guest), own messages have none;
 *   · a report stores the message, the reason and the server's chat history; twice, an own
 *     message or an unknown one are refused; a guest can report too;
 *   · blocking B hides the messages (also new ones and pings) and is kept with A's account; the
 *     list is under the chat and on the account page, where it can be undone. Guests can't be
 *     blocked, only muted for this game (this tab) – also undone under the chat.
 * Admin tab "Meldungen": the open count, the history with the reported message marked, closing
 * with a note, the closed list, reopening, banning the account; non-admins get 403.
 * Rundenspiel: reporting through async:report, and no reports from outside a private game.
 * Account deletion: the reported account's name leaves the report, nobody blocks it any more.
 *
 * Test accounts, games and reports are deleted afterwards. Uses an installed Chrome or Edge (no
 * browser download); set HOCHCIV_BROWSER to its path if it is not found.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(step);
    }
    return null;
}
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
function makeUser() {
    const name = 'rep_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);
const chatRows = page => page.$$eval('#mp-chat-list .mp-chat-msg', rows => rows.map(r => r.textContent.replace(/\s+/g, ' ').replace('⋯', '').trim()));
const reportRows = where => sql(`SELECT count(*) FROM reports WHERE ${where}`);

async function run(browser, users, sources) {
    const [ua, ub] = users;
    const errors = [];
    const login = async u => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        if (u) {
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        }
        return ctx;
    };
    const ca = await login(ua), cb = await login(ub), cc = await login(null);
    const newPage = async (ctx, name) => {
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CHAT !== 'undefined');
        await page.evaluate(() => { try { localStorage.clear(); } catch (_) { } return MP.fetchUser().then(() => MP.showLobby()); });
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };

    // ── Live game: A and B with accounts, C a guest ──
    const a = await newPage(ca, 'A'), b = await newPage(cb, 'B'), c = await newPage(cc, 'C');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', ua.name);
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.selectOption('#mp-p-civ-0', 'griechenland');
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password, sessionId: MP.sessionId }));
    sources.push(cred.sessionId);
    const join = async (page, name, civ, seat) => {
        await page.evaluate(() => MP.setMode('join'));
        await page.fill('#mp-c', cred.code);
        await page.fill('#mp-p', cred.pw);
        await page.fill('#mp-n', name);
        await page.evaluate(() => MP.join());
        await page.waitForSelector(`#mp-p-civ-${seat}`);
        await page.selectOption(`#mp-p-civ-${seat}`, civ);
    };
    await join(b, ub.name, 'russland', 1);
    await join(c, 'Cleo', 'england', 2);
    await a.waitForFunction(() => MP.players.length === 3 && MP.players.every(p => p.civ));
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 0, mapKey: '0' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
    await a.evaluate(() => MP.startGame());
    for (const p of [a, b, c]) {
        await p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
        await p.evaluate(() => closeModal());
    }

    await emit(a, 'chat:send', { kind: 'text', text: 'Hallo zusammen' });
    await emit(b, 'chat:send', { kind: 'text', text: 'Du bist ein Depp' });
    await emit(c, 'chat:send', { kind: 'emote', emote: '👋' });
    await a.click('#mp-chat');
    await until(async () => (await chatRows(a)).length === 3);
    const msgs = await a.evaluate(() => CHAT.list.map(m => ({ id: m.id, name: m.name, uid: m.uid || null })));
    ok(msgs[1].uid === ub.id && msgs[2].uid === null, 'messages carry the sender\'s account (none for a guest)', JSON.stringify(msgs.map(m => m.uid)));

    // the menu
    ok(!(await a.$('#mp-chat-list .mp-chat-msg.me[data-msg]')), 'menu: none on an own message');
    await a.click('#mp-chat-list .mp-chat-msg:nth-child(2)');
    const menu = await a.evaluate(() => ({
        shown: !document.getElementById('mp-chat-menu').hidden,
        head: document.querySelector('.mp-chat-menu-head').textContent.replace(/\s+/g, ' ').trim(),
        items: [...document.querySelectorAll('#mp-chat-menu [data-item]')].map(b => b.textContent.trim()),
    }));
    ok(menu.shown && menu.head.startsWith(ub.name) && menu.head.endsWith('Du bist ein Depp'), 'menu: opens on B\'s message, names it', menu.head);
    ok(menu.items.join('|') === '🚩 Nachricht melden|🚫 Spieler blockieren', 'menu: report and block', menu.items.join('|'));
    await a.keyboard.press('Escape');
    ok(await a.$eval('#mp-chat-menu', el => el.hidden), 'menu: Escape closes it');
    await a.click('#mp-chat-list .mp-chat-msg:nth-child(3)');
    const guestItems = await a.$$eval('#mp-chat-menu [data-item]', bs => bs.map(b => b.textContent.trim()));
    ok(guestItems.join('|') === '🚩 Nachricht melden|🔇 Für dieses Spiel stummschalten', 'menu: a guest can be muted for this game, not blocked', guestItems.join('|'));
    await a.keyboard.press('Escape');

    // report through the menu, with a reason
    await a.click('#mp-chat-list .mp-chat-msg:nth-child(2)');
    await a.click('#mp-chat-menu [data-item="report"]');
    await a.fill('#mp-chat-reason', 'Beleidigung');
    await a.click('#mp-chat-menu [data-step="send"]');
    const stored = await until(async () => {
        const r = sql(`SELECT "reporterId", "reportedId", "reportedName", reason, message->>'text', jsonb_array_length(context), status, source FROM reports WHERE "sourceId" = '${cred.sessionId}'`);
        return r || null;
    });
    ok(stored === `${ua.id}|${ub.id}|${ub.name}|Beleidigung|Du bist ein Depp|3|open|live`, 'report: stored with message, reason and the chat history', stored);
    ok(await until(async () => /Danke/.test(await a.textContent('#toast'))), 'report: A is thanked');
    ok(await a.$eval('#mp-chat-menu', el => el.hidden), 'report: the menu closes');

    // refused: twice, own message, unknown message, a ping
    const twice = await emit(a, 'chat:report', { id: msgs[1].id });
    ok(twice.error === 'Du hast diese Nachricht schon gemeldet.', 'report: not twice', twice.error);
    const own = await emit(a, 'chat:report', { id: msgs[0].id });
    ok(own.error === 'Eigene Nachrichten kannst du nicht melden.', 'report: not an own message', own.error);
    const unknown = await emit(a, 'chat:report', { id: 'nope' });
    ok(unknown.error === 'Nachricht nicht gefunden.', 'report: unknown message refused', unknown.error);

    // a guest reports too
    const byGuest = await emit(c, 'chat:report', { id: msgs[1].id, reason: 'x'.repeat(400) });
    ok(byGuest.ok && reportRows(`"sourceId" = '${cred.sessionId}' AND "reporterId" IS NULL AND "reporterName" = 'Cleo' AND length(reason) = 300`) === '1',
        'report: a guest can report (reason cut to 300)', JSON.stringify(byGuest));

    // block B (an account, kept with A's account), mute C (a guest, this game only)
    await a.click('#mp-chat-list .mp-chat-msg:nth-child(2)');
    await a.click('#mp-chat-menu [data-item="block"]');
    await until(async () => (await chatRows(a)).every(r => !r.includes('Depp')));
    ok((await chatRows(a)).every(r => !r.includes('Depp')), 'block: B\'s messages are hidden');
    await a.click('#mp-chat-list .mp-chat-msg:not(.me)');
    await a.click('#mp-chat-menu [data-item="mute"]');
    await until(async () => (await chatRows(a)).length === 1);
    ok((await chatRows(a)).join() === `${ua.name} Hallo zusammen`, 'mute: the guest\'s emote is hidden', (await chatRows(a)).join(' | '));
    const blockedDb = sql(`SELECT "blockedPlayers" FROM users WHERE id = '${ua.id}'`);
    const bl = JSON.parse(blockedDb);
    ok(bl.length === 1 && bl[0].id === ub.id && bl[0].name === ub.name, 'block: kept with A\'s account (the guest is not in it)', blockedDb);
    ok(await a.evaluate(() => localStorage.getItem('hochciv.chat.blocked') === null), 'block: nothing on the device for an account');
    ok(await a.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('hochciv.chat.gamemute.'))), 'mute: kept in this tab for this game');
    const foot = (await a.textContent('#mp-chat-blocked')).replace(/\s+/g, ' ');
    ok(foot.includes(`Blockiert: ${ub.name}`) && foot.includes('Stumm in diesem Spiel: Cleo'), 'block and mute: both listed under the chat', foot);
    const guestBlock = await ca.request.post(BASE + '/api/account/blocks', { data: { name: 'Cleo' } });
    ok(guestBlock.status() === 400 && (await guestBlock.json()).error === 'Gäste kannst du nicht blockieren.', 'block: the server refuses blocking a guest');

    // new messages and pings of a blocked player don't show
    await b.evaluate(() => { const m = document.getElementById('mp-chat'); if (m.classList.contains('mp-log-minimized')) m.click(); });
    await a.click('#mp-chat-header');
    await emit(b, 'chat:send', { kind: 'text', text: 'Noch eine' });
    await emit(b, 'chat:send', { kind: 'ping', r: 3, c: 3 });
    await sleep(800);
    ok(await a.evaluate(() => CHAT.unread === 0 && !CHAT.list.some(m => m.text === 'Noch eine') && CHAT.pings.length === 0), 'block: no new message, badge or ping from B');
    ok((await chatRows(b)).some(r => r.includes('Noch eine')), 'block: only A is affected (B sees its message)');

    // the list on the account page, undo there
    const acc = await ca.newPage();
    acc.on('pageerror', e => errors.push(`account: ${e.message}`));
    acc.on('dialog', d => d.accept());           // the ban asks first
    await acc.goto(BASE + '/client/account.html');
    await acc.waitForSelector('#blocked-list [data-unblock]');
    const listed = await acc.$$eval('#blocked-list li', lis => lis.map(li => li.textContent.replace(/\s+/g, ' ').trim()));
    ok(listed.length === 1 && listed[0].startsWith(ub.name), 'account page: lists the blocked player', listed.join(' | '));
    await acc.click('#blocked-list li:nth-child(1) [data-unblock]');
    await until(async () => /niemanden/.test(await acc.textContent('#blocked-list')));
    ok(sql(`SELECT "blockedPlayers" FROM users WHERE id = '${ua.id}'`) === '[]', 'account page: unblock removes it from the account');

    // non-admins don't see reports
    ok((await ca.request.get(BASE + '/api/admin/reports')).status() === 403, 'admin: reports are 403 for a normal user');

    // ── Admin tab ──
    sql(`UPDATE users SET role = 'admin' WHERE id = '${ua.id}'`);
    await acc.reload();
    await acc.waitForFunction(() => document.querySelector('[data-target="tab-admin-reports"]').style.display === 'block');
    await until(async () => (await acc.textContent('#admin-reports-badge')) === '2');
    ok((await acc.textContent('#admin-reports-badge')) === '2', 'admin: the tab shows 2 open reports', await acc.textContent('#admin-reports-badge'));
    await acc.click('[data-target="tab-admin-reports"]');
    await acc.waitForSelector('.report-card');
    const cards = await acc.$$eval('.report-card', cs => cs.map(c => ({
        head: c.querySelector('.report-head').textContent.replace(/\s+/g, ' ').trim(),
        marked: (c.querySelector('.report-chat .reported') || {}).textContent,
        lines: c.querySelectorAll('.report-chat div').length,
        ban: !!c.querySelector('button[onclick*="ban"]'),
    })));
    ok(cards.length === 2 && cards[0].head.includes(ub.name) && cards[0].head.includes(`gemeldet von ${ua.name}`) && cards[1].head.includes('gemeldet von Cleo'),
        'admin: both reports, oldest first, with reporter', cards.map(c => c.head).join(' | '));
    ok(cards[0].lines === 3 && /Du bist ein Depp/.test(cards[0].marked || ''), 'admin: the chat history with the reported message marked', `${cards[0].lines} ${cards[0].marked}`);
    ok(cards[0].ban, 'admin: the account can be banned from the report');

    await acc.fill('#report-note-0', 'Verwarnt');
    await acc.click('.report-card:nth-child(1) .btn-primary');
    await until(async () => (await acc.$$('.report-card')).length === 1);
    ok(sql(`SELECT status || '|' || note || '|' || "handledBy" FROM reports WHERE "sourceId" = '${cred.sessionId}' AND "reporterId" = '${ua.id}'`) === `resolved|Verwarnt|${ua.name}`,
        'admin: resolved with note and admin');
    await acc.click('.report-card:nth-child(1) button[onclick*="dismissed"]');
    await until(async () => /Keine offenen Meldungen/.test(await acc.textContent('#admin-reports-list')));
    ok((await acc.textContent('#admin-reports-badge')) === '', 'admin: no open reports left');
    await acc.selectOption('#admin-reports-status', 'closed');
    await acc.waitForSelector('.report-card');
    const closed = await acc.$$eval('.report-card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' ')));
    ok(closed.length === 2 && closed.some(t => t.includes('Erledigt von') && t.includes('Verwarnt')) && closed.some(t => t.includes('Verworfen von')),
        'admin: the closed list shows status, admin and note');
    await acc.click('.report-card:nth-child(1) button[onclick*="ban"]');
    await until(async () => sql(`SELECT "isBanned" FROM users WHERE id = '${ub.id}'`) === 't');
    ok(sql(`SELECT "isBanned" FROM users WHERE id = '${ub.id}'`) === 't', 'admin: banning the reported account works');
    sql(`UPDATE users SET "isBanned" = false WHERE id = '${ub.id}'`);
    await acc.click('.report-card button[onclick*="\'open\'"]');
    await until(async () => (await acc.$$('.report-card')).length === 1);
    ok(reportRows(`"sourceId" = '${cred.sessionId}' AND status = 'open'`) === '1', 'admin: a report can be reopened');

    // unblock in the chat footer: B's messages are back
    // under the chat: unmute the guest; B (unblocked on the account page) after a new load of the list
    await a.click('#mp-chat');
    await a.click('#mp-chat-blocked [data-unmute]');
    await until(async () => (await chatRows(a)).some(r => r === 'Cleo 👋'));
    ok((await chatRows(a)).some(r => r === 'Cleo 👋'), 'unmute in the chat: the guest\'s emote is back');
    await a.click('#mp-chat-blocked [data-unblock]');
    await until(async () => (await chatRows(a)).some(r => r.includes('Depp')));
    ok((await chatRows(a)).some(r => r.includes('Depp')), 'unblock in the chat: B\'s earlier messages are back');
    ok(await a.$eval('#mp-chat-blocked', el => el.hidden), 'nothing blocked or muted any more');

    for (const ctx of [ca, cb, cc]) await ctx.close();
    return errors;
}

async function rundenspiel(browser, users, sources) {
    const [ua, ub, uc] = users;
    const login = async u => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
        if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        return ctx;
    };
    const ca = await login(ua), cb = await login(ub), cc = await login(uc);
    const created = await (await ca.request.post(BASE + '/api/async', {
        data: { config: { mapKey: '0', civMode: 'random', playerCount: 2, kiCount: 0 }, invite: [] },
    })).json();
    sources.push(created.id);
    await cb.request.post(BASE + `/api/async/${created.id}/join`, { data: { code: created.joinCode } });
    const socketPage = async ctx => {
        const page = await ctx.newPage();
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined');
        await page.evaluate(() => MP.fetchUser().then(() => MP.connect()));
        return page;
    };
    const pb = await socketPage(cb), pa = await socketPage(ca), pc = await socketPage(cc);
    const sent = await emit(pb, 'async:chat', { id: created.id, kind: 'text', text: 'Rundenspiel-Beleidigung' });
    ok(sent.ok, 'Rundenspiel: B writes');
    const msgId = sql(`SELECT data->'chat'->0->>'id' FROM async_games WHERE id = '${created.id}'`);
    const r = await emit(pa, 'async:report', { id: created.id, msgId, reason: 'gemein' });
    ok(r.ok && sql(`SELECT source || '|' || "reportedId" || '|' || reason FROM reports WHERE "sourceId" = '${created.id}'`) === `async|${ub.id}|gemein`,
        'Rundenspiel: a player reports through async:report', JSON.stringify(r));
    const outsider = await emit(pc, 'async:report', { id: created.id, msgId });
    ok(outsider.error === 'Du spielst in diesem Spiel nicht mit.', 'Rundenspiel: no reports from outside a private game', outsider.error);
    for (const ctx of [ca, cb, cc]) await ctx.close();
}

function deletion(users, sources) {
    const [ua, ub] = users;
    // A blocks B again, then B's account is deleted
    sql(`UPDATE users SET "blockedPlayers" = '[{"id":"${ub.id}","name":"${ub.name}","at":"2026-01-01"}]' WHERE id = '${ua.id}'`);
    inServer(`const { User } = require('./models'); const { deleteAccount } = require('./utils/deleteAccount');
        User.findByPk('${ub.id}').then(u => deleteAccount(u)).then(e => { console.log(e || 'ok'); process.exit(0); })`);
    const list = sources.map(s => `'${s}'`).join(',');
    const left = sql(`SELECT count(*) FROM reports WHERE "sourceId" IN (${list}) AND ("reportedId" IS NOT NULL OR "reportedName" <> 'Gelöschter Spieler' OR context::text LIKE '%${ub.name}%')`);
    ok(left === '0' && reportRows(`"sourceId" IN (${list})`) === '3', 'deletion: the reports stay, without the deleted account\'s name', left);
    ok(sql(`SELECT "blockedPlayers" FROM users WHERE id = '${ua.id}'`) === '[]', 'deletion: nobody blocks the deleted account any more');
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const users = [makeUser(), makeUser(), makeUser()];
    const sources = [];
    let errors = [];
    try {
        errors = await run(browser, users, sources);
        await rundenspiel(browser, users, sources);
        deletion(users, sources);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        if (sources.length) {
            const list = sources.map(s => `'${s}'`).join(',');
            sql(`DELETE FROM reports WHERE "sourceId" IN (${list})`);
            sql(`DELETE FROM async_games WHERE id::text IN (${list})`);
        }
        sql(`DELETE FROM users WHERE id IN (${users.map(u => `'${u.id}'`).join(',')})`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
