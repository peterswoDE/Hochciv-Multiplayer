/**
 * Player report (#184, client/report.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/report/report.test.js [http://localhost:3000]
 *
 * The player list shows the turn order: rows from the start player on, each with its position.
 * A live game (one player, two KI – a duel against one KI can end in an economic victory
 * within a few rounds while the player does nothing) through the real game page, after two rounds:
 * a tap on a row of the player list opens the report on that empire – score and rank as the
 * engine counts them, the victory progress, the empire, the abilities. Its tech tree is read-only
 * without cost colours, and leads back to the report. The trend (chart and key moments) comes
 * via 'game:trend' with no income in it. The same in English.
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
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

async function startGame(browser, lang) {
    const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-GB' : 'de-DE', viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(l => { try { localStorage.setItem('hochciv.lang', l); } catch (e) { } }, lang);
    const a = await ctx.newPage();
    const errors = [];
    a.on('pageerror', e => errors.push(e.message));
    await a.goto(BASE + '/');
    await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function' && typeof REPORT !== 'undefined');
    await a.evaluate(() => { MP.showLobby(); });
    await a.waitForFunction(() => typeof MP.setMode === 'function');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-n', 'Report' + lang);
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 3, kiCount: 2, mapKey: '0' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 3);
    await a.evaluate(() => MP.startGame());
    const myTurn = () => a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null && MP.isMyTurn()
        && !(typeof ui !== 'undefined' && (ui.botLock || ui.anim))
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 60000 });
    // two rounds, so the trend has points
    for (let k = 0; k < 2; k++) {
        await myTurn();
        const r = await a.evaluate(() => S.round);
        const res = await a.evaluate(() => new Promise(res => MP.sendAction({ type: 'endTurn' }, res)));
        if (res && res.error) throw new Error('endTurn: ' + res.error);
        await a.waitForFunction(r0 => (S.round > r0 && MP.isMyTurn()) || S.over, r, { timeout: 60000 });
        if (await a.evaluate(() => !!S.over)) throw new Error('the game ended before the report could be tested');
    }
    await myTurn();
    await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); if (typeof closeSheet === 'function') closeSheet(); });
    return { a, errors };
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        const { a, errors } = await startGame(browser, 'de');
        const other = await a.evaluate(() => S.players.findIndex((p, i) => i !== MP.playerIndex));
        ok(await a.evaluate(n => document.querySelectorAll('#mp-players-content [data-report]').length === n, 3), 'every row of the player list opens a report');

        // 0. turn order in the player list: rows from the start player on, numbered 1 … n
        const order = await a.evaluate(() => {
            const rows = [...document.querySelectorAll('#mp-players-content [data-report]')];
            const n = S.players.length, first = S.startIdx || 0;
            return {
                rows: rows.map(r => +r.dataset.report).join(),
                expected: S.players.map((_, k) => (first + k) % n).join(),
                badges: rows.map(r => r.querySelector('.mp-pl-pos').textContent).join(),
                cur: document.querySelector('#mp-players-content .mp-pl-row.cur').dataset.report === String(S.cur),
                tip: rows[0].querySelector('.mp-pl-pos').title,
            };
        });
        ok(order.rows === order.expected, 'rows in turn order (from the start player)', `${order.rows} / ${order.expected}`);
        ok(order.badges === '1,2,3', 'turn positions', order.badges);
        ok(order.cur, 'the empire on turn is marked');
        ok(order.tip === 'Zugreihenfolge: 1', 'position tooltip', order.tip);
        // another start player: the list starts there and wraps around; an empire out has no number
        const rot = await a.evaluate(() => {
            const keep = { start: S.startIdx, dead: S.players[0].dead };
            S.startIdx = 1; S.players[0].dead = true; MP.updatePlayerList();
            const rows = [...document.querySelectorAll('#mp-players-content [data-report]')];
            const out = { rows: rows.map(r => r.dataset.report).join(), badges: rows.map(r => r.querySelector('.mp-pl-pos').textContent).join() };
            S.startIdx = keep.start; S.players[0].dead = keep.dead; MP.updatePlayerList();
            return out;
        });
        ok(rot.rows === '1,2,0' && rot.badges === '1,2,–', 'turn order from another start player, empire out without number', `${rot.rows} / ${rot.badges}`);

        // 1. tap the KI's row (not on a link)
        await a.click(`#mp-players-content [data-report="${other}"] .mp-pl-civ`);
        await a.waitForSelector('.mp-rep');
        const rep = await a.evaluate(i => {
            const sc = victoryScore(S, i);
            const living = S.players.map((p, k) => victoryScore(S, k).total).filter((_, k) => !S.players[k].dead);
            return {
                title: document.getElementById('ov-title').textContent,
                big: +document.querySelector('.mp-rep-big').textContent, total: sc.total,
                rank: document.querySelector('.mp-rep-rank').textContent, expRank: 1 + living.filter(t => t > sc.total).length,
                text: document.querySelector('.mp-rep').innerText,
                victory: document.querySelectorAll('.mp-rep-list')[0].children.length,
                cities: S.cities.filter(c => c.owner === i).length,
                abil: abilInfos(S.players[i]).map(x => x.n),
                rows: [...document.querySelectorAll('.mp-rep-tbl th')].map(x => x.textContent),
            };
        }, other);
        ok(rep.title.startsWith('Bericht: '), 'the report opens', rep.title);
        ok(rep.big === rep.total, 'score as the engine counts it', `${rep.big} / ${rep.total}`);
        ok(rep.rank.includes(`Platz ${rep.expRank} von 3`), 'rank', rep.rank);
        ok(rep.victory >= 3 && /Wirtschaft: .* Weltbevölkerung/.test(rep.text) && /Militär: /.test(rep.text) && /Forschung: /.test(rep.text),
            'progress towards the victories', rep.victory + ' lines');
        ok(new RegExp(`Städte\\s+${rep.cities}`).test(rep.text), 'cities', rep.cities);
        ok(rep.abil.every(n => rep.text.includes(n)), 'abilities', rep.abil.join());
        // (ability texts may mention coins – the table rows are what the report itself tells)
        ok(rep.rows.every(r => ['Städte', 'Bevölkerung', 'Armeen', 'Macht', 'Technologien', 'Weltwunder'].includes(r)), 'no resources or income', rep.rows.join());

        // 2. trend and key moments from the server
        await a.waitForFunction(() => !document.querySelector('#mp-rep-trend').textContent.includes('Lädt'), null, { timeout: 10000 });
        const trend = await a.evaluate(() => ({
            svg: !!document.querySelector('#mp-rep-trend svg'),
            moments: !document.querySelector('#mp-rep-moments').textContent.includes('Lädt'),
        }));
        ok(trend.svg, 'trend chart');
        ok(trend.moments, 'key moments filled');
        const raw = await a.evaluate(() => new Promise(res => MP.socket.emit('game:trend', {}, res)));
        const keys = new Set(((raw.trend || {}).rounds || []).flatMap(rd => rd.p.flatMap(x => Object.keys(x))));
        ok(raw.trend && raw.trend.rounds.length >= 2, "'game:trend' has the rounds so far", raw.trend && raw.trend.rounds.length);
        ok(!['ys', 'yf', 'yc', 'rs', 'rf', 'rc'].some(k => keys.has(k)), "'game:trend' without income", [...keys].join());

        // 3. tech tree: read-only, no cost colours, back to the report
        await a.click('#mp-rep-techs');
        await a.waitForSelector('#mp-rep-back');
        const tree = await a.evaluate(i => ({
            title: document.getElementById('ov-title').textContent,
            tiles: document.querySelectorAll('#ov-body .tech').length,
            clickable: document.querySelectorAll('#ov-body [data-tech]').length,
            colours: document.querySelectorAll('#ov-body .tech.afford, #ov-body .tech.costly').length,
            owned: document.querySelectorAll('#ov-body .tech.owned').length,
            expOwned: Object.keys(S.players[i].techs).filter(k => S.players[i].techs[k]).length,
        }), other);
        ok(tree.title.startsWith('Technologien · ') && tree.tiles > 10, 'the empire\'s tech tree', tree.title);
        ok(tree.clickable === 0, 'tech tree is read-only');
        ok(tree.colours === 0, 'no cost colours (science in hand stays private)');
        ok(tree.owned === tree.expOwned, 'its techs are marked', `${tree.owned} / ${tree.expOwned}`);
        await a.click('#mp-rep-back');
        await a.waitForSelector('.mp-rep');
        ok(true, 'back to the report');

        // 4. a new state while it is open leaves it alone; own row works too
        await a.evaluate(() => closeModal());
        await a.click(`#mp-players-content [data-report="${await a.evaluate(() => MP.playerIndex)}"] .mp-pl-civ`);
        await a.waitForSelector('.mp-rep');
        ok(await a.evaluate(() => document.querySelector('.mp-rep-head').textContent.includes('(du)')), 'own report says (du)');
        await a.evaluate(() => closeModal());
        ok(errors.length === 0, 'no page errors', errors.join(' | '));

        // 5. English
        const en = await startGame(browser, 'en');
        await en.a.click('#mp-players-content [data-report="0"] .mp-pl-civ');
        await en.a.waitForSelector('.mp-rep');
        await en.a.waitForFunction(() => !document.querySelector('#mp-rep-trend').textContent.includes('Loading'), null, { timeout: 10000 });
        const t = await en.a.evaluate(() => document.getElementById('ov-title').textContent + '\n' + document.querySelector('.mp-rep').innerText);
        ok(t.startsWith('Report: '), 'English title', t.split('\n')[0]);
        const german = t.match(/\b(Punkte|Platz|Bevölkerung|Weltbevölkerung|Wirtschaft|Militär|Forschung|Städte|Armeen|Macht|Technologien|Fähigkeiten|Verlauf|Wichtige|Lädt|Noch|Runde|erobert|Hauptstädten|Feldern)\b/g);
        ok(!german, 'no German in the English report', german && [...new Set(german)].join());
        ok(en.errors.length === 0, 'no page errors (English)', en.errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
