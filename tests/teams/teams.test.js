/**
 * Team mode (F22: utils/teams.js, sockets/game.js, mp.js, client/chat.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/teams/teams.test.js [http://localhost:3000]
 *
 * Unit: the engine patch – an army next to a teammate's city doesn't besiege it (it does without
 * teams), owners and power are back afterwards; a winner's team wins together. Live, four
 * players: the host switches teams on (KI off, teams dealt alternately), a player picks a team,
 * only the host moves others; the game starts with the teams on the state, the player list tags
 * them, a team message reaches only the team; both players of team B resign → team A wins
 * together. English.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const emit = (page, ev, data) => page.evaluate(([ev, data]) => new Promise(r => MP.socket.emit(ev, data, r)), [ev, data || {}]);

function unit() {
    const engine = require('../../engine-adapter');
    const Teams = require('../../utils/teams');
    const E = engine.getEngine();
    ok(!!E.__mpTeamsPatched, 'unit: the engine is patched');
    const run = teams => {
        const S = engine.createGame({ gameConfig: { mapKey: '0', playerCount: 4, seed: 7 }, players: ['griechenland', 'england', 'russland', 'wikinger'].map(civ => ({ civ, ability: 'basis', kind: 'human' })) });
        const pi = S.cur, target = S.cities.find(c => c.owner !== pi), owner = target.owner;
        S.armies = S.armies.filter(a => a.owner !== pi);
        [[0, 1], [1, 0], [0, -1]].forEach(([dr, dc], n) => S.armies.push({ id: 900 + n, owner: pi, r: target.r + dr, c: target.c + dc, moved: 0 }));
        S.players[pi].power = 20;
        if (teams) S.mpTeams = S.players.map((_, i) => (i === pi || i === owner ? 0 : 1));
        const owners = S.armies.map(a => a.owner).join() + '|' + S.cities.map(c => c.owner).join();
        const power = E.powerOf;
        E.combatPhase(S, pi, null);
        return { siege: S.sieges[pi + '|' + target.id] || 0, back: S.armies.map(a => a.owner).join() + '|' + S.cities.map(c => c.owner).join() === owners, power: E.powerOf === power };
    };
    const without = run(false), withTeams = run(true);
    ok(without.siege === 1 && withTeams.siege === 0, 'unit: no siege of a teammate\'s city (one without teams)', JSON.stringify({ without, withTeams }));
    ok(withTeams.back && withTeams.power, 'unit: owners and the power function are back afterwards');
    const S = { players: [{}, {}, {}, {}], mpTeams: [0, 1, 0, 1], over: { winner: 2, winners: [2], how: 'x' } };
    Teams.expandWin(S);
    ok(S.over.winners.join() === '0,2' && S.over.teamWin.join() === '0', 'unit: the winner\'s team wins together', JSON.stringify(S.over));
}

(async () => {
    try { unit(); } catch (e) { ok(false, 'unit', e.stack); }
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const errors = [];
    const newPage = async (name, en) => {
        const ctx = await browser.newContext({ locale: en ? 'en-US' : 'de-DE' });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        page.on('dialog', d => d.accept());
        if (en) await page.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
        await page.evaluate(() => MP.showLobby());
        await page.waitForFunction(() => typeof MP.setMode === 'function');
        return page;
    };
    try {
        const a = await newPage('A'), b = await newPage('B'), c = await newPage('C'), d = await newPage('D', true);
        await a.fill('#mp-n', 'TeamA');
        await a.evaluate(() => MP.host());
        await a.waitForSelector('#mp-p-civ-0');
        await a.selectOption('#mp-p-civ-0', 'griechenland');
        await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 0, mapKey: '0' }));
        await a.waitForFunction(() => MP.gameConfig.playerCount === 4);
        const cred = await a.evaluate(() => ({ code: MP.joinCode, pw: MP.password }));
        const civs = ['england', 'russland', 'wikinger'];
        for (const [i, p] of [b, c, d].entries()) {
            await p.evaluate(([c2, n]) => MP.joinWith(c2.code, c2.pw, n), [cred, 'Team' + 'BCD'[i]]);
            await p.waitForSelector(`#mp-p-civ-${i + 1}`);
            await p.selectOption(`#mp-p-civ-${i + 1}`, civs[i]);
        }
        await a.waitForFunction(() => MP.players.length === 4 && MP.players.every(p => p.connected));

        // the host switches teams on
        await a.check('#mp-set-teams');
        await a.waitForFunction(() => MP.gameConfig.teams === true && MP.players.every(p => p.team === 0 || p.team === 1), null, { timeout: 8000 });
        const t1 = await a.evaluate(() => ({ teams: MP.players.map(p => p.team).join(), ki: MP.gameConfig.kiCount }));
        ok(t1.teams === '0,1,0,1' && t1.ki === 0, 'teams on: dealt alternately, KI off', JSON.stringify(t1));
        ok(await a.isVisible('#mp-p-team-1') && !(await b.isDisabled('#mp-p-team-1')) && await b.isDisabled('#mp-p-team-0'), 'lobby: team selects (own and the host\'s editable)');
        await b.selectOption('#mp-p-team-1', '0');
        await a.waitForFunction(() => MP.players[1].team === 0, null, { timeout: 5000 });
        ok(true, 'a player picks a team');
        const notHost = await emit(c, 'lobby:team', { playerIndex: 1, team: 1 });
        ok(notHost.error === 'Nur der Host kann andere Spieler einteilen.', 'only the host moves others', notHost.error);
        await a.selectOption('#mp-p-team-1', '1');
        await a.waitForFunction(() => MP.players[1].team === 1, null, { timeout: 5000 });
        ok(true, 'the host moves a player');
        ok(/Teams \(2 teams, no AI\)/.test(await d.textContent('#overlay')), 'English: the lobby row');

        // start
        await a.evaluate(() => MP.startGame());
        const inGame = p => p.waitForFunction(() => typeof S !== 'undefined' && S && Array.isArray(S.mpTeams) && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 20000 });
        await Promise.all([a, b, c, d].map(inGame));
        const st = await a.evaluate(() => ({ teams: S.mpTeams, kinds: S.players.map(p => p.kind), me: MP.playerIndex, idx: MP.players.map(p => p.index) }));
        const byName = await a.evaluate(() => S.players.map((sp, i) => { const lp = MP.lobbyPlayerOf(sp); return lp ? lp.name + ':' + S.mpTeams[i] : '?'; }));
        ok(st.teams.length === 4 && st.kinds.every(k => k === 'human') && byName.sort().join() === 'TeamA:0,TeamB:1,TeamC:0,TeamD:1', 'started: four humans, the teams on the state', byName.join());
        await a.waitForFunction(() => document.querySelectorAll('#mp-players-content .mp-team-tag').length === 4, null, { timeout: 8000 })
            .then(() => ok(true, 'player list: team tags'), () => ok(false, 'player list: team tags'));

        // team chat (guests send emotes)
        await a.evaluate(() => { CHAT.setOpen && CHAT.setOpen(true); CHAT.render(); });
        ok(await a.isVisible('#mp-chat-team-btn'), 'chat: the team button');
        await a.evaluate(() => { CHAT.teamMode = true; });
        await a.evaluate(() => CHAT.send({ kind: 'emote', emote: CHAT.EMOTES[0] }));
        await c.waitForFunction(() => CHAT.list.some(m => m.team === 0), null, { timeout: 5000 }).then(() => ok(true, 'team message: the teammate gets it'), () => ok(false, 'team message: the teammate gets it'));
        await sleep(800);
        ok(!(await b.evaluate(() => CHAT.list.some(m => m.team != null))) && !(await d.evaluate(() => CHAT.list.some(m => m.team != null))), 'team message: the other team doesn\'t');

        // team B (B and D) resigns → team A wins together
        ok((await emit(b, 'game:resign')).ok, 'B resigns');
        await sleep(500);
        ok(!(await a.evaluate(() => !!S.over)), 'one of team B left: the game goes on');
        ok((await emit(d, 'game:resign')).ok, 'D resigns');
        const over = await a.waitForFunction(() => S && S.over ? S.over : null, null, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
        const winners = over && await a.evaluate(w => w.map(i => MP.lobbyPlayerOf(S.players[i]).name).sort().join(), over.winners);
        ok(over && over.teamWin && over.teamWin.join() === '0' && winners === 'TeamA,TeamC', 'team A wins together', JSON.stringify({ winners, how: over && over.how }));
    } catch (err) {
        ok(false, 'test run', err.stack);
    } finally {
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
        await browser.close();
        console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
        process.exit(failed ? 1 : 0);
    }
})();
