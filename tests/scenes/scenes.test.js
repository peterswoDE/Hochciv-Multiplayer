/**
 * What the others did, played on the map (F14: utils/scenes.js, client/scenes.js, mp.js) against
 * the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/scenes/scenes.test.js [http://localhost:3000]
 *
 * 1. Recording, with the engine: the chain of diffs rebuilds exactly the engine's snapshot,
 *    actions / battles / silent steps are recorded, the game is the same with and without
 *    recording, trim() keeps what comes after the earliest mark, v93 records nothing.
 * 2. Live game (A and B through the game page, one KI, a spectator): A sees the KI's and B's
 *    actions played, never its own; the turn starts only after them; a tap skips everything
 *    queued; the spectator sees A's actions too; "Animationen: Keine" plays nothing.
 * 3. Rundenspiel (two test accounts, one KI): opening the game in A's turn plays what B and
 *    the KI did, then "Seit deinem letzten Zug"; a reload does not play it again.
 *
 * Test accounts and games are deleted afterwards. Uses an installed Chrome or Edge (no browser
 * download); set HOCHCIV_BROWSER to its path if it is not found.
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
async function until(fn, ms = 15000, step = 200) {
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
    const name = 'scn_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}
// cheap technologies of the first age – a human researches the first one the server accepts
const TECHS = ['philosophie', 'bewaesserung', 'mathematik', 'astronomie', 'schrift', 'landwirtschaft', 'fischerei', 'rad', 'taktik', 'keramik', 'papier', 'segeln'];

function unit() {
    const engine = require('../../engine-adapter');
    const Scenes = require('../../utils/scenes');
    const Summary = require('../../utils/summary');
    const { apply } = require('../../client/scenes');
    const E = engine.getEngine();
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
        ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
    const game = () => engine.createGame({
        gameConfig: { mapKey: 'gross', playerCount: 4, seed: 5, wonders: true },
        players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'ki', kiLevel: 'schwer' },
            { civ: 'russland', kind: 'ki', kiLevel: 'schwer' }, { civ: 'wikinger', kind: 'ki', kiLevel: 'schwer' }].map(p => ({ ability: 'basis', ...p })),
    });
    // the human seat plays as KI too; marks as for a human (utils/summary.js)
    const play = (S, holder, turns) => {
        const human = S.players.findIndex(p => p.kind === 'human');
        let marks = Summary.track(null, E, S), same = true;
        for (let t = 0; t < turns && !S.over; t++) {
            S.players[human].kind = 'ki';
            engine.autoTurn(S);
            if (!engine.finishTurn(S)) E.advanceTurn(S);
            S.players[human].kind = 'human';
            marks = Summary.track(marks, E, S);
            if (holder) {
                Scenes.sync(E, S);
                let tip = holder.scenes.base;
                for (const f of holder.scenes.frames) tip = apply(tip, f.d);
                same = same && JSON.stringify(canon(tip)) === JSON.stringify(canon(JSON.parse(JSON.stringify(E.animSnap(S)))));
            }
        }
        return { marks, same, human };
    };
    const holder = {}, S = game();
    ok(!!engine.attachScenes(S, holder), 'unit: a scene log is attached');
    ok(!JSON.stringify(S).includes('frames') && !Object.keys(S).some(k => /scene/i.test(k)), 'unit: the log is not part of the state');
    const { marks, same, human } = play(S, holder, 24);
    ok(same, 'unit: after every turn the chain rebuilds the engine\'s snapshot exactly');
    const kinds = {};
    holder.scenes.frames.forEach(f => { kinds[f.t] = (kinds[f.t] || 0) + 1; });
    ok(kinds.a > 20 && kinds.s > 5, 'unit: actions and silent steps recorded', JSON.stringify(kinds));
    ok(holder.scenes.frames.every((f, i) => f.n === holder.scenes.n0 + i + 1), 'unit: frames numbered without gaps');
    ok(holder.scenes.frames.filter(f => f.t === 'a').every(f => typeof f.m === 'string' && f.pi >= 0), 'unit: actions carry their text and empire');
    const S2 = game();
    play(S2, null, 24);
    ok(JSON.stringify(S) === JSON.stringify(S2), 'unit: the game is the same with and without recording');

    // battles: a long game until there is one
    const S3 = game(), h3 = {};
    engine.attachScenes(S3, h3);
    play(S3, h3, 120);
    const fight = h3.scenes.frames.concat().reverse().find(f => f.t === 'f');
    ok(fight && fight.k && fight.k.art && !fight.k.snap && Array.isArray(fight.k.von || []), 'unit: a battle recorded with its entry, without the engine snapshot', fight && JSON.stringify(fight.k));

    // what the human has to see: after their mark
    const m = marks[human];
    const chain = Scenes.chain(holder.scenes, { afterSeq: m.seq });
    ok(chain && chain.frames.every(f => !('seq' in f)) && chain.from === chain.frames[0].n - 1 && chain.to === Scenes.lastN(holder.scenes),
        'unit: the chain since the mark (from / to / base)', chain && `${chain.from}→${chain.to}`);
    let tip = chain.base;
    for (const f of chain.frames) tip = apply(tip, f.d);
    let full = holder.scenes.base;
    for (const f of holder.scenes.frames) full = apply(full, f.d);
    ok(JSON.stringify(canon(tip)) === JSON.stringify(canon(full)), 'unit: base + frames of the chain end where the log ends');
    const before = holder.scenes.frames.length;
    Scenes.trim(holder.scenes, marks, S);
    ok(holder.scenes.frames.length < before && holder.scenes.frames.every(f => f.seq > m.seq), 'unit: trim keeps only what comes after the mark',
        `${before} → ${holder.scenes.frames.length}`);
    ok(Scenes.trim(holder.scenes, { last: null }, S) === undefined && holder.scenes.frames.length > 0, 'unit: without a mark of every human nothing goes');

    // a version without js/anim.js
    const old = engine.forVersion('v93');
    const So = old.createGame({ gameConfig: { mapKey: 'gross', playerCount: 2, seed: 1 }, players: [{ civ: 'griechenland', kind: 'human', ability: 'basis' }, { civ: 'england', kind: 'ki', kiLevel: 'leicht', ability: 'basis' }] });
    ok(old.attachScenes(So, {}) === null, 'unit: v93 records nothing');
}

// In the page: scenes played (pi, art, text) and when the turn started; short timings
const RECORD = () => {
    ANIM_MS = 40; COMBAT_MS = 40;
    window.__played = [];
    window.__turnStarts = [];
    if (!window.__wrapped) {
        window.__wrapped = true;
        const pa = window.playAnim;
        window.playAnim = function (szenen, weiter) {
            // only what is really shown ("Animationen: Keine" plays nothing)
            if (animAn()) for (const s of szenen) window.__played.push({ pi: s.pi, art: s.art, t: Date.now(), busy: MP.scenesBusy });
            return pa.apply(this, arguments);
        };
        const ht = window.humanTurnStart;
        window.humanTurnStart = function () {
            if (MP.isMyTurn() && !MP.scenesBusy) window.__turnStarts.push(Date.now());
            return ht.apply(this, arguments);
        };
    }
};

async function live(browser, errors) {
    const newPage = async name => {
        const ctx = await browser.newContext({ locale: 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof SCENES !== 'undefined');
        await page.evaluate(() => { localStorage.setItem('hochciv.summary.auto', '0'); prefs.anim = 'langsam'; MP.showLobby(); });
        await page.evaluate(RECORD);
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    const a = await newPage('A'), b = await newPage('B');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-hn', 'ScnA');
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.selectOption('#mp-p-civ-0', 'griechenland');
    const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
    await b.evaluate(() => MP.setMode('join'));
    await b.fill('#mp-c', cred.code); await b.fill('#mp-p', cred.pw); await b.fill('#mp-n', 'ScnB');
    await b.evaluate(() => MP.join());
    await b.waitForSelector('#mp-p-civ-1');
    await b.selectOption('#mp-p-civ-1', 'russland');
    await a.waitForFunction(() => MP.players.length === 2 && MP.players[1].civ === 'russland');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 1, mapKey: 'gross', difficulty: 'mittel' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
    const v = await newPage('V');
    await v.evaluate(([c, p]) => MP.watch(c, p, 'ScnV'), [cred.code, cred.pw]);
    await v.waitForFunction(() => MP.spectator);
    await a.evaluate(() => MP.startGame());
    for (const p of [a, b, v]) await p.waitForFunction(() => typeof S !== 'undefined' && S && document.getElementById('screen-game').classList.contains('show'));

    // each human researches something, then ends the turn – once per turn
    const move = (p, techs) => p.evaluate(async techs => {
        if (!S || S.over || !MP.isMyTurn() || MP.scenesBusy || MP._e === S.round + ':' + S.cur) return false;
        MP._e = S.round + ':' + S.cur;
        closeModal();
        for (const tech of techs) {
            const r = await new Promise(res => MP.socket.emit('action', { type: 'research', params: { tech } }, res));
            if (r && r.ok) { (window.__researched = window.__researched || []).push(tech); break; }
        }
        await new Promise(res => MP.socket.emit('action', { type: 'endTurn', params: {} }, res));
        return true;
    }, techs);
    const me = p => p.evaluate(() => MP.playerIndex);
    const ia = await me(a), ib = await me(b);
    const kiIndex = await a.evaluate(() => S.players.findIndex(p => p.kind === 'ki'));
    const driver = setInterval(() => { move(a, TECHS).catch(() => { }); move(b, TECHS).catch(() => { }); }, 250);
    const enough = await until(() => a.evaluate(([ki, ib]) => window.__played.some(s => s.pi === ki) && window.__played.some(s => s.pi === ib) && S.round >= 3, [kiIndex, ib]), 90000, 300);
    clearInterval(driver);
    await until(() => a.evaluate(() => !MP.scenesBusy), 20000);
    const pa = await a.evaluate(() => ({ played: window.__played, starts: window.__turnStarts, researched: window.__researched || [] }));
    const pb = await b.evaluate(() => ({ researched: window.__researched || [] }));
    ok(!!enough, 'live: A sees the KI\'s and B\'s actions played', `${pa.played.length} scenes`);
    ok(pa.played.some(s => s.pi === ib && s.art === 'forschen') || !pb.researched.length, 'live: B\'s research is a scene for A', pb.researched.join());
    ok(pa.played.every(s => s.pi !== ia), 'live: A\'s own actions are not played to A');
    ok(pa.played.every(s => s.busy), 'live: scenes play from the queue (state applied after them)');
    const lastKi = Math.max(...pa.played.filter(s => s.pi === kiIndex).map(s => s.t));
    ok(pa.starts.some(t => t > lastKi), 'live: A\'s turn starts after the scenes before it');
    const pv = await v.evaluate(() => window.__played);
    ok(pv.some(s => s.pi === ia) || !pa.researched.length, 'live: the spectator sees A\'s actions as well', pa.researched.join());

    // a tap skips everything queued: slow scenes, then endAnim() as the map tap does
    await a.evaluate(() => { ANIM_MS = 3000; window.__played = []; });
    await b.evaluate(() => { ANIM_MS = 3000; });
    const driver2 = setInterval(() => { move(a, TECHS).catch(() => { }); move(b, TECHS).catch(() => { }); }, 250);
    const playing = await until(() => a.evaluate(() => !!(ui.anim && MP.scenesBusy)), 60000, 100);
    let skipped = false;
    if (playing) {
        await a.evaluate(() => endAnim());
        skipped = await until(() => a.evaluate(() => !MP.scenesBusy && !ui.anim), 3000, 50);
    }
    clearInterval(driver2);
    ok(!!playing && !!skipped, 'live: a tap on the map skips the scenes still queued');

    // "Animationen: Keine" – nothing played, the state comes at once
    await a.evaluate(() => { prefs.anim = 'aus'; ANIM_MS = 40; window.__played = []; });
    await b.evaluate(() => { ANIM_MS = 40; });
    await until(() => a.evaluate(() => !MP.scenesBusy), 20000);
    const round0 = await a.evaluate(() => S.round);
    const driver3 = setInterval(() => { move(a, TECHS).catch(() => { }); move(b, TECHS).catch(() => { }); }, 250);
    await until(() => a.evaluate(r => S.round >= r + 1 && MP.isMyTurn(), round0), 60000, 300);
    clearInterval(driver3);
    ok(await a.evaluate(() => window.__played.length === 0 && !ui.anim), '"Animationen: Keine" plays no scenes');

    for (const p of [a, b, v]) await p.context().close();
}

async function rundenspiel(browser, errors) {
    const ua = makeUser(), ub = makeUser();
    let gameId = null;
    try {
        const login = async u => {
            const ctx = await browser.newContext({ locale: 'de-DE' });
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
            return ctx;
        };
        const ca = await login(ua), cb = await login(ub);
        const g = await (await ca.request.post(BASE + '/api/async', { data: { config: { mapKey: '0', civMode: 'fixed', playerCount: 3, kiCount: 1, difficulty: 'mittel' }, civ: 'griechenland', ability: 'basis' } })).json();
        gameId = g.id;
        await cb.request.post(BASE + `/api/async/${g.id}/join`, { data: { code: g.joinCode, civ: 'russland', ability: 'basis' } });
        // a move without the game open: research what the server accepts (B), then end the turn
        const act = async (ctx, research) => {
            const page = await ctx.newPage();
            await page.goto(BASE + '/');
            await page.waitForFunction(() => typeof MP !== 'undefined');
            const r = await page.evaluate(async ([id, techs]) => {
                await MP.fetchUser(); await MP.connect();
                const emit = (type, params) => new Promise(res => MP.socket.emit('async:action', { id, type, params }, res));
                let done = null;
                for (const tech of techs) { const x = await emit('research', { tech }); if (x && x.ok) { done = tech; break; } }
                const end = await emit('endTurn', {});
                return { researched: done, end };
            }, [g.id, research ? TECHS : []]);
            await page.close();
            return r;
        };
        // whoever's turn it is moves, until A's turn comes back after B and the KI
        const turnOf = async () => JSON.parse(sql(`SELECT json_build_object('cur', (state->>'cur')::int, 'waiting', "waitingIds") FROM async_games WHERE id = '${g.id}'`));
        let bResearched = null, aMoved = false;
        for (let i = 0; i < 8; i++) {
            const t = await turnOf();
            const wait = t.waiting || [];
            if (wait.includes(ua.id)) {
                if (aMoved && bResearched) break;
                const r = await act(ca, false); aMoved = aMoved || !!(r.end && r.end.ok);
            } else if (wait.includes(ub.id)) {
                const r = await act(cb, true); bResearched = bResearched || r.researched;
            }
            await sleep(800);
        }
        ok(aMoved && bResearched, 'Rundenspiel: A ended a turn, B researched and ended one', String(bResearched));
        const stored = sql(`SELECT jsonb_array_length(data->'scenes'->'frames') FROM async_games WHERE id = '${g.id}'`);
        ok(+stored > 0, 'Rundenspiel: the scenes are stored with the game', stored);

        const open = async () => {
            const page = await ca.newPage();
            page.on('pageerror', e => errors.push(`RA: ${e.message}`));
            await page.addInitScript(() => { try { localStorage.removeItem('hochciv.summary.auto'); } catch (_) { } });
            await page.goto(BASE + '/?async=' + g.id);
            await page.waitForFunction(() => typeof ANIM_MS !== 'undefined' && typeof MP !== 'undefined');
            await page.evaluate(RECORD);
            return page;
        };
        let page = await open();
        const pop = await until(() => page.evaluate(() => document.getElementById('overlay').classList.contains('show') && document.getElementById('ov-title').textContent), 60000);
        const seen = await page.evaluate(() => ({ played: window.__played, me: MP.playerIndex, busy: MP.scenesBusy, kinds: S.players.map(p => p.kind) }));
        const bIndex = seen.kinds.findIndex((k, i) => k === 'human' && i !== seen.me);
        const kiIndex = seen.kinds.indexOf('ki');
        ok(seen.played.some(s => s.pi === bIndex && s.art === 'forschen'), 'Rundenspiel: opening the game plays B\'s research', `${seen.played.length} scenes`);
        ok(seen.played.some(s => s.pi === kiIndex), 'Rundenspiel: … and the KI\'s turn');
        ok(seen.played.every(s => s.pi !== seen.me), 'Rundenspiel: nothing of A\'s own');
        ok(pop === 'Seit deinem letzten Zug' && !seen.busy, 'Rundenspiel: "Seit deinem letzten Zug" comes after the scenes', String(pop));
        await page.close();
        // again: already seen on this device
        page = await open();
        await until(() => page.evaluate(() => document.getElementById('overlay').classList.contains('show')), 30000);
        await sleep(500);
        ok(await page.evaluate(() => window.__played.length === 0), 'Rundenspiel: opened again, nothing is played twice');
        await page.close();
        await ca.close(); await cb.close();
    } finally {
        if (gameId) sql(`DELETE FROM async_games WHERE id = '${gameId}'`);
        sql(`DELETE FROM replay_frames WHERE "gameKey" NOT IN (SELECT id FROM async_games)`);
        sql(`DELETE FROM users WHERE id IN ('${ua.id}', '${ub.id}')`);
    }
}

(async () => {
    unit();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    try {
        await live(browser, errors);
        await rundenspiel(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
