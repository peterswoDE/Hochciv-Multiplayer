/**
 * Filters of the open games in the multiplayer menu (mp.js filterDefs, sessions.js
 * getPublicSessions) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/lobbies/lobby-filter.test.js [http://localhost:3000]
 *
 * Three public live lobbies with different settings and one public Rundenspiel, a logged-in
 * player looks at "Offene Spiele":
 *   · /api/public-sessions carries every lobby setting;
 *   · each filter (kind, map, empires, KI seats, KI level, nations, events, wonders, ranked,
 *     turn time, player-bots, free seat, search) shows exactly the matching games, also combined;
 *   · the rows show the settings; the filter count, "x von y", the empty hint and "Zurücksetzen";
 *   · the filters stay after reopening the menu; the panel fits a phone.
 *
 * Test accounts and the Rundenspiel are deleted afterwards; the lobbies go with the browser.
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if it is
 * not found.
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
const TAG = crypto.randomBytes(3).toString('hex');
function makeUser() {
    const name = 'lf_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

// the three lobbies: host name and settings
const LOBBIES = {
    a: { mapKey: '0', playerCount: 3, kiCount: 1, difficulty: 'schwer', randomCivs: true, events: true, eventMode: 'hard', wonders: true, turnTime: 120, playerBots: true },
    b: { mapKey: 'gross', playerCount: 2, kiCount: 0, ranked: true },
    c: { mapKey: 'random', playerCount: 4, kiCount: 2, difficulty: 'leicht', events: true, eventMode: 'easy' },
};

async function run(browser, [host, viewer], rsIds) {
    const errors = [];
    const pageOf = async (ctx, name) => {
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined');
        return page;
    };
    const rest = (page, path, body) => page.evaluate(([path, body]) => fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include',
    }).then(r => r.json()), [path, body]);
    const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data]);

    // ── three live lobbies, each from its own browser ────────────────────────────────────
    const lobby = {};
    for (const [k, cfg] of Object.entries(LOBBIES)) {
        const page = await pageOf(await browser.newContext(), 'host ' + k);
        await page.evaluate(() => MP.connect());
        const name = `LF${TAG}${k}`;
        const l = await rest(page, '/api/sessions', { config: { isPublic: true, mapKey: '0' }, host: { name, clientId: name + '-cid' } });
        const c = await emit(page, 'session:connect', { sessionId: l.sessionId, password: l.password, clientId: name + '-cid' });
        ok(c && !c.error, `lobby ${k} open`, c && c.error);
        await emit(page, 'lobby:config', cfg);
        lobby[k] = Object.assign(l, { page, name });
    }
    // b gets full: a second player takes its only other seat
    const guest = await pageOf(await browser.newContext(), 'guest');
    await guest.evaluate(() => MP.connect());
    const gj = await rest(guest, '/api/sessions/join', { joinCode: lobby.b.joinCode, password: lobby.b.password, player: { name: 'Gast' + TAG, clientId: 'gast-cid' } });
    await emit(guest, 'session:connect', { sessionId: lobby.b.sessionId, password: lobby.b.password, clientId: 'gast-cid' });
    ok(gj.playerIndex === 1, 'lobby b: a guest takes the second seat');

    // ── the API carries the settings ───────────────────────────────────────────────────────
    const list = await guest.evaluate(() => fetch('/api/public-sessions').then(r => r.json()));
    const la = list.find(l => l.hostName === lobby.a.name), lb = list.find(l => l.hostName === lobby.b.name), lc = list.find(l => l.hostName === lobby.c.name);
    ok(la && la.empires === 3 && la.kiCount === 1 && la.difficulty === 'schwer' && la.randomCivs && la.events && la.eventMode === 'hard'
        && la.wonders && la.turnTime === 120 && la.playerBots && !la.ranked && la.maxPlayers === 2, 'API: lobby a with all its settings', JSON.stringify(la));
    ok(lb && lb.empires === 2 && lb.kiCount === 0 && lb.ranked && lb.mapKey === 'gross' && lb.playersCount === 2 && lb.maxPlayers === 2, 'API: lobby b, full', JSON.stringify(lb));
    ok(lc && lc.mapKey === 'random' && lc.eventMode === 'easy' && lc.kiCount === 2 && !lc.wonders && lc.turnTime === 0, 'API: lobby c', JSON.stringify(lc));

    // ── one public Rundenspiel ─────────────────────────────────────────────────────────────
    const hctx = await browser.newContext();
    await hctx.request.post(BASE + '/api/auth/login', { data: { username: host.name, password: PASSWORD } });
    const hpage = await pageOf(hctx, 'rs host');
    const rs = await rest(hpage, '/api/async', { config: { mapKey: 'gross', civMode: 'random', playerCount: 3, kiCount: 1, wonders: true, difficulty: 'mittel', isPublic: true } });
    const rsId = rs.id || (rs.game && rs.game.id);
    if (rsId) rsIds.push(rsId);
    ok(!!rsId, 'Rundenspiel created', JSON.stringify(rs).slice(0, 200));

    // ── the viewer's menu ──────────────────────────────────────────────────────────────────
    const vctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1100, height: 900 } });
    await vctx.request.post(BASE + '/api/auth/login', { data: { username: viewer.name, password: PASSWORD } });
    const page = await pageOf(vctx, 'viewer');
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) { } return MP.fetchUser(); });
    await page.evaluate(() => MP.showLobby('open'));
    await page.waitForFunction(names => names.every(n => document.getElementById('mph-open').textContent.includes(n)), Object.values(lobby).map(l => l.name), { timeout: 15000 });
    await page.waitForFunction(h => document.getElementById('mph-open').textContent.includes(h), host.name, { timeout: 15000 });
    // which of the test games show right now (other lobbies on the server don't count)
    const shown = () => page.evaluate(([lobbyNames, hostName]) => {
        const rows = [...document.querySelectorAll('#mph-open .mpa-row')].map(r => r.textContent);
        const out = Object.entries(lobbyNames).filter(([, n]) => rows.some(t => t.includes(n))).map(([k]) => k);
        if (rows.some(t => t.includes(hostName))) out.push('rs');
        return out.sort().join(',');
    }, [Object.fromEntries(Object.entries(lobby).map(([k, l]) => [k, l.name])), host.name]);
    ok(await shown() === 'a,b,c,rs', 'no filter: all four', await shown());

    const rowA = await page.evaluate(n => [...document.querySelectorAll('#mph-open .mpa-row')].find(r => r.textContent.includes(n)).textContent.replace(/\s+/g, ' '), lobby.a.name);
    ok(/3 Reiche \(1 KI, Schwer\)/.test(rowA) && /Zufallsnationen/.test(rowA) && /Ereignisse: hart/.test(rowA) && /Weltwunder/.test(rowA) && /2 Min\. pro Zug/.test(rowA),
        'row: a live lobby shows its settings', rowA);
    const rowRs = await page.evaluate(n => [...document.querySelectorAll('#mph-open .mpa-row')].find(r => r.textContent.includes(n)).textContent.replace(/\s+/g, ' '), host.name);
    ok(/Große Karte/.test(rowRs) && /3 Reiche \(1 KI, Mittel\)/.test(rowRs) && /Zufallsnationen/.test(rowRs) && /Weltwunder/.test(rowRs), 'row: an open Rundenspiel too', rowRs);

    ok(await page.isHidden('#mph-f-grid'), 'filters folded away at first');
    await page.click('.mph-f-toggle');
    ok(await page.isVisible('#mph-f-grid'), 'the button opens them');

    const set = async (k, v) => {
        await page.selectOption(`#mph-f-grid select[data-f="${k}"]`, v);
        await page.waitForTimeout(80);
    };
    const cases = [
        ['kind', 'live', 'a,b,c'], ['kind', 'async', 'rs'],
        ['map', '0', 'a'], ['map', 'gross', 'b,rs'], ['map', 'plaettchen', 'c'],
        ['empires', '3', 'a,rs'], ['empires', '2', 'b'],
        ['ki', 'none', 'b'], ['ki', 'some', 'a,c,rs'],
        ['level', 'schwer', 'a'], ['level', 'leicht', 'c'], ['level', 'mittel', 'rs'],
        ['civs', 'random', 'a,rs'], ['civs', 'fixed', 'b,c'],
        ['events', 'off', 'b,rs'], ['events', 'easy', 'c'], ['events', 'hard', 'a'],
        ['wonders', 'on', 'a,rs'], ['wonders', 'off', 'b,c'],
        ['ranked', 'yes', 'b'], ['ranked', 'no', 'a,c,rs'],
        ['turn', 'timed', 'a'], ['turn', 'free', 'b,c,rs'],
        ['bots', 'yes', 'a'], ['bots', 'no', 'b,c,rs'],
    ];
    for (const [k, v, want] of cases) {
        await set(k, v);
        const got = await shown();
        ok(got === want, `filter ${k} = ${v}`, got);
        await set(k, '');
    }
    await page.check('#mph-f-grid input[data-f="free"]');
    await page.waitForTimeout(80);
    ok(await shown() === 'a,c,rs', 'filter: only with a free seat (b is full)', await shown());
    await page.uncheck('#mph-f-grid input[data-f="free"]');

    // combined, the count and "x von y"
    await set('civs', 'random');
    await set('kind', 'live');
    ok(await shown() === 'a', 'combined: random nations + live', await shown());
    const badge = await page.textContent('#mph-f-count');
    ok(badge === '2', 'the button counts the filters', badge);
    ok(/^1 von \d+$/.test(await page.textContent('#mph-f-result')), '"x von y" under the filters', await page.textContent('#mph-f-result'));
    ok(await page.evaluate(() => document.querySelectorAll('#mph-f-grid select.set').length) === 2, 'set filters are marked');

    // search
    await page.click('#mph-f-grid .mph-f-foot .btn');
    ok(await shown() === 'a,b,c,rs' && !(await page.textContent('#mph-f-count')), '"Zurücksetzen" clears all', await shown());
    await page.fill('#mph-f-q', `LF${TAG}c`);
    ok(await shown() === 'c', 'search: host name', await shown());
    await page.fill('#mph-f-q', host.name);
    ok(await shown() === 'rs', 'search: a player of the Rundenspiel', await shown());
    await page.fill('#mph-f-q', 'plättchen');
    ok((await shown()).split(',').includes('c') && !(await shown()).includes('a'), 'search: map name', await shown());

    // nothing matches: hint with a reset link
    await page.fill('#mph-f-q', 'zzz-nichts-' + TAG);
    const empty = await page.textContent('#mph-open');
    ok(/Nichts passt zu deinen Filtern/.test(empty), 'no match: a hint instead of "keine Lobbys"', empty.replace(/\s+/g, ' ').slice(0, 160));
    await page.click('#mph-open a:has-text("Filter zurücksetzen")');
    ok(await shown() === 'a,b,c,rs' && await page.inputValue('#mph-f-q') === '', 'the hint\'s link resets the filters');

    // the filters stay
    await set('events', 'easy');
    await page.evaluate(() => { MP._filter = null; closeModal(); return MP.showLobby('open'); });
    await page.waitForFunction(n => document.getElementById('mph-open').textContent.includes(n), lobby.c.name, { timeout: 15000 });
    ok(await shown() === 'c' && await page.inputValue('#mph-f-grid select[data-f="events"]') === 'easy', 'filters stay after reopening the menu', await shown());

    // phone: the panel fits, two columns
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { if (!document.querySelector('#mph-filter.open')) MP.filterToggle(); });
    await page.waitForTimeout(200);
    const fit = await page.evaluate(() => {
        const g = document.getElementById('mph-f-grid'), r = g.getBoundingClientRect();
        const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
        const over = [...g.querySelectorAll('select,input,button')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length;
        return { cols, over, right: r.right, w: innerWidth };
    });
    ok(fit.cols === 2 && !fit.over && fit.right <= fit.w, 'phone: two columns, nothing sticks out', JSON.stringify(fit));
    await page.evaluate(() => MP.filterReset());

    ok(!errors.length, 'no page errors', errors.join(' | '));
}

(async () => {
    const { chromium } = require('playwright-core');
    const users = [makeUser(), makeUser()];
    const rsIds = [];
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        await run(browser, users, rsIds);
    } catch (e) {
        console.log('FAIL  crashed: ' + (e.stack || e));
        failed++;
    } finally {
        await browser.close();
        if (rsIds.length) sql(`DELETE FROM async_games WHERE id IN (${rsIds.map(i => `'${i}'`).join(',')})`);
        sql(`DELETE FROM users WHERE id IN (${users.map(u => `'${u.id}'`).join(',')})`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
