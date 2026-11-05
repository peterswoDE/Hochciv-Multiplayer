/**
 * Friends list (F8: utils/friends.js, routes/friends.js, sockets/friends.js, client/friends.js)
 * against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/friends/friends.test.js [http://localhost:3000]
 *
 * Four accounts A, B, C, D and a bot. Checked: a request by name from the menu's tab, the toast
 * and the tab's count for B, accepting; the online status; crossing requests accept each other;
 * the refusals (oneself, unknown, twice, a bot, a block); suggestions from a recent game; the
 * profile's button; a live invitation from the lobby (card, invite dialog, B joins) and the
 * friend shown "In einer Lobby" with "Beitreten" for a public one; the friend names in the
 * Rundenspiel form; removing; offline after closing the page; deleting an account; English.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
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
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', 'hochciv', '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const users = [];
function makeUser(extra = '') {
    const name = 'frd_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false ${extra} })
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

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const pages = {};
    const open = async (key, u, en) => {
        const ctx = await browser.newContext({ locale: en ? 'en-US' : 'de-DE' });
        const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
        if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(`${key}: ${e.message}`));
        p.on('dialog', d => d.accept());
        if (en) await p.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await p.goto(BASE + '/');
        await p.waitForFunction(() => typeof FRIENDS !== 'undefined' && MP.user && MP.socket && MP.socket.connected, null, { timeout: 15000 });
        p.ctx = ctx;
        pages[key] = p;
        return p;
    };
    const api = (p, path, method, body) => p.evaluate(async ([path, method, body]) => {
        const r = await fetch('/api/friends' + path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, body: await r.json() };
    }, [path, method, body]);
    const hub = async p => {
        await p.evaluate(() => { MP.showLobby('friends'); });
        await p.waitForFunction(() => typeof MP.setMode === 'function' && document.getElementById('mph-friends'));
        await p.evaluate(() => MP.hubShow('friends'));
    };
    try {
        const A = makeUser(), B = makeUser(), C = makeUser(), D = makeUser();
        const bot = makeUser(`, accountType: 'bot', ownerId: '${A.id}'`);
        const a = await open('A', A), b = await open('B', B);

        // A asks B by name from the menu
        await hub(a);
        ok(await a.isVisible('.mph-tab[data-tab="friends"]'), 'menu: tab "Freunde"');
        await a.waitForFunction(() => /Noch keine Freunde/.test(document.getElementById('mph-friends').textContent), null, { timeout: 8000 })
            .then(() => ok(true, 'empty list: the hint'), () => ok(false, 'empty list: the hint'));
        const toasts = [];
        await b.exposeFunction('__t', t => toasts.push(t));
        await b.evaluate(() => { const t = window.toast; window.toast = m => { window.__t(m); return t(m); }; });
        await hub(b);
        await a.fill('#mpf-name', B.name.toUpperCase());           // the name in any case
        await a.click('.mpf-add button');
        await a.waitForFunction(n => /Gesendete Anfragen/.test(document.getElementById('mph-friends').textContent) && document.getElementById('mph-friends').textContent.includes(n), B.name, { timeout: 8000 })
            .then(() => ok(true, 'A: request sent, listed as sent'), () => ok(false, 'A: request sent, listed as sent'));
        await b.waitForFunction(() => document.getElementById('mph-count-friends').textContent === '1', null, { timeout: 8000 })
            .then(() => ok(true, 'B: the tab counts the request'), () => ok(false, 'B: the tab counts the request'));
        ok(toasts.some(t => t.includes(A.name) && /befreundet sein/.test(t)), 'B: a toast names A', toasts.join(' | '));
        await b.click(`[data-request="${A.id}"] .btn.primary`);
        await b.waitForFunction(id => !!document.querySelector(`[data-friend="${id}"]`), A.id, { timeout: 8000 });
        const rowB = await b.textContent(`[data-friend="${A.id}"]`);
        ok(/Online/.test(rowB) && await b.$(`[data-friend="${A.id}"] .mpf-dot.on`), 'B: A is a friend, online', rowB.replace(/\s+/g, ' '));
        await a.waitForFunction(id => !!document.querySelector(`[data-friend="${id}"]`), B.id, { timeout: 12000 })
            .then(() => ok(true, 'A: B is a friend too'), () => ok(false, 'A: B is a friend too'));

        // refusals
        const r1 = await api(a, '', 'POST', { username: A.name });
        const r2 = await api(a, '', 'POST', { username: 'nobody_' + Date.now() });
        const r3 = await api(a, '', 'POST', { username: B.name });
        const r4 = await api(a, '', 'POST', { username: bot.name });
        ok(r1.body.error === 'Du kannst dich nicht selbst als Freund hinzufügen.' && r2.body.error === 'Diesen Spieler gibt es nicht.'
            && r3.body.error === 'Ihr seid schon befreundet.' && r4.body.error === 'Bots können keine Freunde sein.', 'refused: oneself, unknown, twice, a bot',
            [r1, r2, r3, r4].map(r => r.body.error).join(' | '));
        const c = await open('C', C);
        const r5 = await api(c, '', 'POST', { username: A.name });
        const r6 = await api(c, '', 'POST', { username: A.name });
        ok(r5.body.ok && r6.body.error === 'Deine Anfrage läuft schon.', 'a request runs only once');
        const r7 = await api(a, '', 'POST', { username: C.name });
        ok(r7.body.ok && r7.body.status === 'accepted', 'crossing requests: accepted', JSON.stringify(r7.body));
        sql(`UPDATE users SET "blockedPlayers" = '[{"id":"${B.id}","name":"${B.name}","at":0}]'::json WHERE id = '${D.id}'`);
        const d = await open('D', D);
        const r8 = await api(b, '', 'POST', { username: D.name });
        const r9 = await api(d, '', 'POST', { username: B.name });
        ok(r8.body.error === 'Das geht bei diesem Spieler nicht.' && r9.body.error === 'Das geht bei diesem Spieler nicht.', 'a block stops requests both ways');
        sql(`UPDATE users SET "blockedPlayers" = '[]'::json WHERE id = '${D.id}'`);

        // suggestions from a recent game of A with D
        inServer(`const { Game } = require('./models'); Game.create({ version: 'test', durationRounds: 3, participants: [
            { dbUserId: '${A.id}', dbUsername: '${A.name}', name: '${A.name}', points: 1 }, { dbUserId: '${D.id}', dbUsername: '${D.name}', name: '${D.name}', points: 2, isWinner: true },
            { name: 'KI', isBot: true, points: 0 }] }).then(() => process.exit(0))`);
        const list = (await api(a, '')).body;
        ok(list.suggestions.length === 1 && list.suggestions[0].id === D.id, 'suggestions: D from the last game, not friends or the KI', JSON.stringify(list.suggestions.map(s => s.username)));
        await a.evaluate(() => FRIENDS.load());
        ok(/Zuletzt gespielt mit/.test(await a.textContent('#mph-friends')), 'the tab shows "Zuletzt gespielt mit"');

        // the profile: D sees A → "+ Als Freund hinzufügen" → A gets the request
        await d.evaluate(id => { const el = document.createElement('a'); el.setAttribute('data-profile', id); el.id = 'prof-link'; el.textContent = 'x'; document.body.appendChild(el); }, A.id);
        await d.evaluate(() => document.getElementById('prof-link').click());
        await d.waitForSelector('.mpf-profile button', { timeout: 10000 });
        ok(/Als Freund hinzufügen/.test(await d.textContent('.mpf-profile')), 'profile: "+ Als Freund hinzufügen"');
        await d.click('.mpf-profile button');
        await d.waitForFunction(() => /Anfrage gesendet/.test(document.querySelector('.mpf-profile').textContent), null, { timeout: 8000 })
            .then(() => ok(true, 'profile: request sent'), () => ok(false, 'profile: request sent'));
        ok((await api(a, '')).body.incoming.some(r => r.id === D.id), 'A has D\'s request');

        // live invitation: A hosts a public lobby and invites B
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-friends-btn', { timeout: 10000 });
        await a.evaluate(() => MP.socket.emit('lobby:config', { isPublic: true, playerCount: 3, kiCount: 1 }));
        await a.click('#mp-friends-btn');
        await a.waitForSelector(`#mp-friends-panel [data-invite="${B.id}"]`, { timeout: 10000 });
        ok(true, 'lobby: online friends listed with "Einladen"');
        await b.evaluate(() => closeModal());
        // B sees A "In einer Lobby" with "Beitreten" (public)
        await b.evaluate(() => FRIENDS.load());
        const bView = await b.evaluate(id => { const f = FRIENDS.data.friends.find(x => x.id === id); return f && { s: FRIENDS.statusText(f), join: !!(f.activity && f.activity.joinCode) }; }, A.id);
        ok(bView && bView.s === 'In einer Lobby' && bView.join, 'B: A "In einer Lobby", can join the public lobby', JSON.stringify(bView));
        await a.click(`#mp-friends-panel [data-invite="${B.id}"]`);
        await b.waitForSelector('#mp-friend-card:not([hidden])', { timeout: 8000 });
        ok(new RegExp(A.name).test(await b.textContent('#mp-friend-card')), 'B: an invitation card names A');
        await a.waitForFunction(id => /Eingeladen/.test(document.querySelector(`[data-invite="${id}"]`).textContent), B.id, { timeout: 5000 })
            .then(() => ok(true, 'A: "✓ Eingeladen"'), () => ok(false, 'A: "✓ Eingeladen"'));
        ok((await api(b, '')).body.invites.some(i => i.fromId === A.id), 'the invitation is listed for B');
        await b.click('#mp-friend-card-go');
        await b.waitForSelector('#mp-invite button.primary', { timeout: 8000 });
        await b.click('#mp-invite button.primary');
        await b.waitForSelector('#mp-p-civ-1', { timeout: 10000 });
        ok(true, 'B joined through the invitation');
        await a.waitForFunction(id => MP.players.some(p => p.userId === id) && !document.querySelector(`#mp-friends-panel [data-invite="${id}"]`), B.id, { timeout: 8000 })
            .then(() => ok(true, 'A: B is in the lobby, no longer in the invite list'), () => ok(false, 'A: B is in the lobby, no longer in the invite list'));
        const bad = await c.evaluate(([id, code]) => new Promise(r => MP.socket.emit('friends:invite', { userId: id, joinCode: code }, r)), [A.id, await a.evaluate(() => MP.joinCode)]);
        ok(bad.error === 'Du bist nicht in dieser Lobby.', 'only players of the lobby can invite into it', bad.error);

        // the Rundenspiel form: friend names to pick
        await c.evaluate(() => FRIENDS.load().then(() => ASYNC.showCreate()));
        await c.waitForSelector('.mpf-chip', { timeout: 8000 });
        await c.click(`.mpf-chip[data-name="${A.name}"]`);
        ok(await c.inputValue('#mpa-invite') === A.name, 'Rundenspiel form: a friend\'s name fills the invite field');

        // removing, offline, account deletion
        const rm = await api(a, '/' + C.id, 'DELETE');
        ok(rm.body.ok && !(await api(c, '')).body.friends.some(f => f.id === A.id), 'removing: gone for both');
        await api(c, '', 'POST', { username: B.name });
        await api(b, '/' + C.id + '/accept', 'POST');
        await c.ctx.close();
        await sleep(800);
        const cb = (await api(b, '')).body.friends.find(f => f.id === C.id);
        ok(cb && !cb.online && cb.seen, 'closed page: offline with "last seen"', JSON.stringify(cb && { online: cb.online, seen: !!cb.seen }));
        inServer(`const { User } = require('./models'); const { deleteAccount } = require('./utils/deleteAccount');
            User.findByPk('${C.id}').then(u => deleteAccount(u)).then(e => { console.log(e || 'ok'); process.exit(0); })`);
        ok(sql(`SELECT count(*) FROM friendships WHERE "userId" = '${C.id}' OR "friendId" = '${C.id}'`) === '0', 'a deleted account takes its friendships along');

        // English
        const e = await open('E', D, true);
        await hub(e);
        await e.waitForFunction(() => /Sent requests/.test(document.getElementById('mph-friends').textContent), null, { timeout: 8000 }).catch(() => { });
        const et = await e.textContent('#mph-friends');
        ok(/Friends/.test(await e.textContent('.mph-tab[data-tab="friends"]')) && /Sent requests/.test(et) && /Send request/.test(et) && !/Anfrage|Freunde/.test(et), 'English: tab and list', et.replace(/\s+/g, ' ').slice(0, 120));
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        for (const u of users) {
            try {
                sql(`DELETE FROM friendships WHERE "userId" = '${u.id}' OR "friendId" = '${u.id}'`);
                sql(`DELETE FROM games WHERE participants::text LIKE '%${u.id}%'`);
                sql(`DELETE FROM users WHERE id = '${u.id}'`);
            } catch (_) { }
        }
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
