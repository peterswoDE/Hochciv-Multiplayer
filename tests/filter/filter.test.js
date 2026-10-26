/**
 * Chat word filter and guest rules (utils/profanity.js, utils/reports.js, client/chat.js) against
 * the local docker setup, with a short first timeout for the server and the test:
 *
 *   CHAT_MUTE_MS=4000 docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   CHAT_MUTE_MS=4000 node tests/filter/filter.test.js [http://localhost:3000]
 *
 *   · the filter: German and English swear words, l33t speak, no false hits on game words;
 *   · live game, account A, account B, guest G: G can only send emotes and pings (server and
 *     the chat's note); A's text with bad language is not sent, auto-reported (words, penalty,
 *     the history with the message) and A can't write texts for CHAT_MUTE_MS – emotes still
 *     work, the input says until when; after it a clean text goes through, a second bad one
 *     stops texts for the rest of the game, also after a reconnect;
 *   · admin word list: a banned word counts at once, an allowed word never, entries go again,
 *     the check field, 403 for non-admins; the tab shows the auto-report;
 *   · Rundenspiel: the same with async:chat, the timeout stored with the game;
 *   · retention: reports without an account go after 3 years, with one they stay.
 *
 * Test accounts, games, reports and words are deleted afterwards. Uses an installed Chrome or
 * Edge (no browser download); set HOCHCIV_BROWSER to its path if it is not found.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = 'hochciv-multiplayer-local';
const MUTE_MS = Number(process.env.CHAT_MUTE_MS) || 0;
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
    const name = 'flt_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);
const chatRows = page => page.$$eval('#mp-chat-list .mp-chat-msg', rows => rows.map(r => r.textContent.replace(/\s+/g, ' ').replace('⋯', '').trim()));

function filterWords() {
    const out = JSON.parse(inServer(`const p = require('./utils/profanity');
        const t = ${JSON.stringify([
        'Du Arschloch', 'du arsch', 'sh1t', 'Scheißspiel', 'Hurensohn!!', 'Wiiichser', 'fuck off', 'F*ck', 'fick dich',
        'Der Marsch nach Rom', 'Klasse Zug!', 'assassin', 'Dicke Mauer', 'Fagott', 'Analphabet', 'Kassel', 'Bassist', 'Rosette', 'nackt', 'Gut gespielt',
    ])};
        console.log(JSON.stringify(t.map(x => p.check(x).length > 0))); process.exit(0);`));
    const bad = out.slice(0, 9), clean = out.slice(9);
    ok(bad.every(Boolean), 'filter: German and English swear words, also disguised', JSON.stringify(bad));
    ok(clean.every(x => !x), 'filter: no false hits (Marsch, Klasse, assassin, dick = thick, Fagott, …)', JSON.stringify(clean));
}

async function live(browser, users, sources, errors) {
    const [ua, ub] = users;
    const ctxFor = async u => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        if (u) {
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        }
        return ctx;
    };
    const ca = await ctxFor(ua), cb = await ctxFor(ub), cg = await ctxFor(null);
    const newPage = async (ctx, name) => {
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CHAT !== 'undefined');
        await page.evaluate(() => MP.fetchUser().then(() => MP.showLobby()));
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage(ca, 'A'), b = await newPage(cb, 'B'), g = await newPage(cg, 'G');
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
    await join(g, 'Gustav', 'england', 2);
    await a.waitForFunction(() => MP.players.length === 3 && MP.players.every(p => p.civ));
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 0, mapKey: '0' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
    await a.evaluate(() => MP.startGame());
    for (const p of [a, b, g]) {
        await p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 30000 });
        await p.evaluate(() => closeModal());
    }
    await b.click('#mp-chat');

    // ── guests: emotes and pings only ──
    const gText = await emit(g, 'chat:send', { kind: 'text', text: 'Hallo' });
    ok(gText.error === 'Gäste können nur Emojis senden. Melde dich an, um zu schreiben.', 'guest: a text is refused', gText.error);
    ok((await emit(g, 'chat:send', { kind: 'emote', emote: '👋' })).ok, 'guest: an emote is fine');
    ok((await emit(g, 'chat:send', { kind: 'ping', r: 2, c: 2 })).ok, 'guest: a ping is fine');
    await g.click('#mp-chat');
    const gUi = await g.evaluate(() => ({ input: document.getElementById('mp-chat-input').hidden, note: document.getElementById('mp-chat-note').textContent, emote: !document.getElementById('mp-chat-emote-btn').hidden }));
    ok(gUi.input && /Als Gast kannst du nur Emojis senden/.test(gUi.note) && gUi.emote, 'guest: the chat shows a note instead of the text field, emotes stay', JSON.stringify(gUi));

    // ── first bad message: not sent, reported, 5-minute timeout ──
    await emit(a, 'chat:send', { kind: 'text', text: 'Viel Glück euch' });
    // typed like a player: the chat gets the server's answer
    await a.click('#mp-chat');
    await a.fill('#mp-chat-input', 'Du Arschloch!');
    await a.press('#mp-chat-input', 'Enter');
    const bad1 = await until(async () => a.evaluate(() => CHAT.mute));
    ok(bad1 && bad1.strikes === 1 && !bad1.game && bad1.until > Date.now(), 'first bad text: refused, 5-minute timeout', JSON.stringify(bad1));
    ok(await until(async () => /nicht gesendet\. Du kannst 5 Minuten lang/.test(await a.textContent('#toast'))), 'first bad text: the sender is told why');
    await sleep(600);
    ok((await chatRows(b)).every(r => !r.includes('Arschloch')) && (await chatRows(b)).some(r => r.includes('Viel Glück')), 'first bad text: nobody sees it');
    const rep = sql(`SELECT auto, "reporterName", "reportedId", matches::text, penalty, message->>'text', context->-1->>'text', jsonb_array_length(context) FROM reports WHERE "sourceId" = '${cred.sessionId}'`);
    ok(rep === `t|Wortfilter|${ua.id}|["arschloch"]|timeout|Du Arschloch!|Du Arschloch!|3`, 'first bad text: auto-reported with words, penalty and history', rep);
    const aUi = await a.evaluate(() => ({ input: document.getElementById('mp-chat-input').hidden, note: document.getElementById('mp-chat-note').textContent }));
    ok(aUi.input && /bis \d\d:\d\d Uhr keine Texte/.test(aUi.note), 'timeout: the chat says until when', aUi.note);
    const during = await emit(a, 'chat:send', { kind: 'text', text: 'Entschuldigung' });
    ok(during.error === 'Du kannst gerade keine Texte schreiben.', 'timeout: clean texts are refused too', during.error);
    ok((await emit(a, 'chat:send', { kind: 'emote', emote: '🙏' })).ok, 'timeout: emotes still work');

    if (MUTE_MS && MUTE_MS < 15000) {
        await sleep(MUTE_MS + 300);
        ok(await until(async () => a.evaluate(() => !document.getElementById('mp-chat-input').hidden), 3000), 'timeout over: the text field is back by itself');
        const clean = await emit(a, 'chat:send', { kind: 'text', text: 'Entschuldigung' });
        ok(clean.ok, 'timeout over: a clean text goes through', JSON.stringify(clean));
        await a.fill('#mp-chat-input', 'sh1t');
        await a.press('#mp-chat-input', 'Enter');
        const bad2 = await until(async () => a.evaluate(() => (CHAT.mute && CHAT.mute.game ? CHAT.mute : null)));
        ok(bad2 && bad2.strikes === 2 && await until(async () => /keine Texte mehr schreiben/.test(await a.textContent('#toast'))),
            'second bad text: no texts for the rest of the game', JSON.stringify(bad2));
        ok(sql(`SELECT penalty FROM reports WHERE "sourceId" = '${cred.sessionId}' AND message->>'text' = 'sh1t'`) === 'game', 'second bad text: reported with the game penalty');
        await sleep(MUTE_MS + 300);
        const later = await emit(a, 'chat:send', { kind: 'text', text: 'Hallo?' });
        ok(later.error === 'Du kannst gerade keine Texte schreiben.', 'rest of the game: still no texts later', later.error);
        // a reconnect (new socket, same seat): the history tells the client
        const clientId = await a.evaluate(() => MP.getClientId());
        const hist = await a.evaluate(async ([sessionId, password, clientId]) => {
            const sock = io({ transports: ['websocket'] });
            const got = new Promise(r => sock.on('chat:history', r));
            await new Promise(r => sock.emit('session:connect', { sessionId, password, clientId }, r));
            const h = await got;
            sock.disconnect();
            return h;
        }, [cred.sessionId, cred.pw, clientId]);
        ok(hist.mute && hist.mute.game && hist.guest === false, 'rest of the game: also after a reconnect', JSON.stringify(hist.mute));
        const note = await a.evaluate(() => document.getElementById('mp-chat-note').textContent);
        ok(/in diesem Spiel keine Texte mehr/.test(note || ''), 'rest of the game: the chat says so', note);
    } else {
        console.log(`(skipped the timeout end: run server and test with CHAT_MUTE_MS=4000)`);
    }

    // ── admin: word list ──
    ok((await ca.request.get(BASE + '/api/admin/words')).status() === 403, 'admin: the word list is 403 for a normal user');
    sql(`UPDATE users SET role = 'admin' WHERE id = '${ua.id}'`);
    const check = async text => (await (await ca.request.post(BASE + '/api/admin/words/check', { data: { text } })).json()).words;
    ok((await check('Du Pfeife')).length === 0, 'admin: "Pfeife" passes before');
    const added = await ca.request.post(BASE + '/api/admin/words', { data: { word: 'Pfeife', kind: 'ban', match: 'word' } });
    ok(added.status() === 200 && (await check('Du Pfeife!')).join() === 'pfeife' && (await check('Pfeifenkopf')).length === 0, 'admin: a banned whole word counts at once, not inside other words');
    const twice = await ca.request.post(BASE + '/api/admin/words', { data: { word: 'pfeife', kind: 'ban', match: 'word' } });
    ok(twice.status() === 400 && (await twice.json()).error === 'Das Wort steht schon in der Liste.', 'admin: no duplicates');
    await ca.request.post(BASE + '/api/admin/words', { data: { word: 'Knall', kind: 'ban', match: 'part' } });
    ok((await check('Knallkopf')).join() === 'knall', 'admin: a banned word part counts inside words');
    await ca.request.post(BASE + '/api/admin/words', { data: { word: 'Arsch', kind: 'allow', match: 'word' } });
    ok((await check('du arsch')).length === 0, 'admin: an allowed word never counts');
    const live2 = await emit(b, 'chat:send', { kind: 'text', text: 'Du Pfeife' });
    ok(/nicht gesendet/.test(live2.error || ''), 'admin: the new word applies in the running game', live2.error);

    const acc = await ca.newPage();
    acc.on('pageerror', e => errors.push(`account: ${e.message}`));
    await acc.goto(BASE + '/client/account.html');
    await acc.waitForFunction(() => document.querySelector('[data-target="tab-admin-reports"]').style.display === 'block');
    await acc.click('[data-target="tab-admin-reports"]');
    await acc.waitForSelector('.report-card');
    await acc.waitForSelector('#table-admin-words tbody tr td strong');
    const words = await acc.$$eval('#table-admin-words tbody tr', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    ok(words.length === 3 && words.some(w => w.startsWith('arsch Erlauben')) && words.some(w => w.startsWith('pfeife Sperren nur als ganzes Wort')) && words.some(w => w.startsWith('knall Sperren auch als Wortteil')),
        'admin tab: the word list', words.join(' | '));
    const auto = await acc.$$eval('.report-card', cs => cs.map(c => c.textContent.replace(/\s+/g, ' ')).find(t => t.includes('Arschloch')));
    ok(!!auto && auto.includes('gemeldet von Wortfilter') && auto.includes('Gefunden: arschloch') && auto.includes('Folge: 5 Minuten keine Texte'), 'admin tab: the auto-report with words and penalty', auto && auto.slice(0, 160));
    await acc.fill('#admin-wordcheck', 'Was für eine Pfeife');
    await acc.click('#form-admin-wordcheck button');
    ok(await until(async () => /Würde gesperrt: pfeife/.test(await acc.textContent('#msg-admin-wordcheck'))), 'admin tab: the check field');
    await acc.fill('#admin-word', 'Trottel');
    await acc.click('#form-admin-word button[type=submit]');
    ok(await until(async () => (await acc.$$('#table-admin-words tbody tr')).length === 4), 'admin tab: a word is added from the form');
    for (let i = 0; i < 4; i++) {
        await acc.click('#table-admin-words tbody tr:first-child [data-word]');
        await until(async () => (await acc.$$('#table-admin-words [data-word]')).length === 3 - i);
    }
    ok(sql(`SELECT count(*) FROM banned_words WHERE "addedBy" = '${ua.name}'`) === '0' && (await check('du arsch')).length === 1, 'admin tab: entries are removed again, the built-in list counts again');

    for (const ctx of [ca, cb, cg]) await ctx.close();
}

async function rundenspiel(browser, users, sources) {
    const [ua, ub] = users;
    const login = async u => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
        if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        return ctx;
    };
    const ca = await login(ua), cb = await login(ub);
    const created = await (await ca.request.post(BASE + '/api/async', {
        data: { config: { mapKey: '0', civMode: 'random', playerCount: 2, kiCount: 0 }, invite: [] },
    })).json();
    sources.push(created.id);
    await cb.request.post(BASE + `/api/async/${created.id}/join`, { data: { code: created.joinCode } });
    const pb = await cb.newPage();
    await pb.goto(BASE + '/');
    await pb.waitForFunction(() => typeof MP !== 'undefined');
    await pb.evaluate(() => MP.fetchUser().then(() => MP.connect()));
    const bad = await emit(pb, 'async:chat', { id: created.id, kind: 'text', text: 'Hurensohn' });
    ok(/nicht gesendet/.test(bad.error || '') && bad.mute.strikes === 1, 'Rundenspiel: a bad text is refused', JSON.stringify(bad));
    await sleep(300);
    const stored = sql(`SELECT (data->'chatMutes'->'${ub.id}'->>'strikes') || '|' || jsonb_array_length(data->'chat') FROM async_games WHERE id = '${created.id}'`);
    ok(stored === '1|0', 'Rundenspiel: the timeout is kept with the game, the message is not', stored);
    ok(sql(`SELECT source || '|' || penalty FROM reports WHERE "sourceId" = '${created.id}'`) === 'async|timeout', 'Rundenspiel: auto-reported');
    const opened = await pb.evaluate(id => new Promise(res => {
        MP.socket.once('chat:history', h => res(h));
        MP.socket.emit('async:open', { id }, () => { });
    }), created.id);
    ok(opened.mute && opened.mute.strikes === 1 && opened.guest === false, 'Rundenspiel: opening the game tells the client about the timeout', JSON.stringify(opened.mute));
    const during = await emit(pb, 'async:chat', { id: created.id, kind: 'text', text: 'sorry' });
    ok(during.error === 'Du kannst gerade keine Texte schreiben.', 'Rundenspiel: no texts during the timeout', during.error);
    for (const ctx of [ca, cb]) await ctx.close();
}

function retention(users) {
    const [ua] = users;
    const old = "now() - interval '4 years'";
    const mk = (id, reported, created) => sql(`INSERT INTO reports (id, kind, status, source, "sourceId", "reporterName", "reportedId", "reportedName", message, context, auto, "createdAt", "updatedAt")
        VALUES ('${id}', 'chat', 'open', 'live', 'retention-test', 'x', ${reported ? `'${reported}'` : 'NULL'}, 'x', '{}', '[]', false, ${created}, now())`);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    mk(ids[0], null, old);                              // no account, 4 years: goes
    mk(ids[1], ua.id, old);                             // account still there, 4 years: stays
    mk(ids[2], null, "now() - interval '2 years'");     // no account, 2 years: stays
    inServer(`require('./utils/reports').cleanup().then(() => process.exit(0));`);
    const left = sql(`SELECT id FROM reports WHERE "sourceId" = 'retention-test' ORDER BY "createdAt"`).split('\n').filter(Boolean);
    ok(!left.includes(ids[0]) && left.includes(ids[1]) && left.includes(ids[2]), 'retention: kept while the account exists, else 3 years', left.length + ' left');
    sql(`DELETE FROM reports WHERE "sourceId" = 'retention-test'`);
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const users = [makeUser(), makeUser()];
    const sources = [];
    const errors = [];
    try {
        filterWords();
        await live(browser, users, sources, errors);
        await rundenspiel(browser, users, sources);
        retention(users);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        if (sources.length) {
            const list = sources.map(s => `'${s}'`).join(',');
            sql(`DELETE FROM reports WHERE "sourceId" IN (${list})`);
            sql(`DELETE FROM async_games WHERE id::text IN (${list})`);
        }
        sql(`DELETE FROM banned_words WHERE "addedBy" IN (${users.map(u => `'${u.name}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id IN (${users.map(u => `'${u.id}'`).join(',')})`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
