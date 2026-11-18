/**
 * The end of a game in English (mp.js, MP.translateOver), against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/i18n/victory.test.js [http://localhost:3000]
 *
 * Reported (#179): "Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5)" stayed German on
 * the end screen with the language set to English. The engine writes the victory text on the
 * server, in German. Only the resign texts were translated. A live game (one player, one KI)
 * in English: each kind of victory text the engine writes, a points comparison with two claims,
 * the resign texts, all through the real end screen (state with `over` via MP.applyState, and
 * 'game:over'). German stays German.
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
const GERMAN = /sieg|Weltbevölkerung|Schwelle|Hauptstadt|erobert|Singularität|Weltwunder|Stufe|Punktvergleich|Rundenende|Mensch vor|aufgegeben/i;

async function startGame(browser, lang) {
    const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-GB' : 'de-DE' });
    await ctx.addInitScript(l => { try { localStorage.setItem('hochciv.lang', l); } catch (e) { } }, lang);
    const a = await ctx.newPage();
    const errors = [];
    a.on('pageerror', e => errors.push(e.message));
    await a.goto(BASE + '/');
    await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function');
    await a.evaluate(() => { MP.showLobby(); });
    await a.waitForFunction(() => typeof MP.setMode === 'function');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-n', 'Victory' + lang);
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 2, kiCount: 1, mapKey: '0' }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 2);
    await a.evaluate(() => MP.startGame());
    await a.waitForFunction(() => typeof S !== 'undefined' && S && MP.playerIndex != null
        && document.getElementById('screen-game').classList.contains('show'), null, { timeout: 60000 });
    return { ctx, a, errors };
}

/** The end screen for a state with this `over`, as the server sends it; its text. */
const endScreen = (a, over, via) => a.evaluate(([over, via]) => {
    const state = JSON.parse(JSON.stringify(S));
    if (via === 'event') { S = state; S.over = MP.translateOver(over); gameOver(); }
    else { state.over = over; MP.applyState(state); }
    const text = document.getElementById('ov-body').innerText;
    closeModal();
    return text;
}, [over, via]);

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        const { a, errors } = await startGame(browser, 'en');
        const cases = [
            ['economy', { winner: 0, winners: [0], how: 'Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5)' },
                'Economic victory (27 of 31 world population, threshold 4/5)'],
            ['science', { winner: 0, winners: [0], how: 'Forschungssieg (Singularität)' }, 'Research victory (Singularity)'],
            ['culture', { winner: 0, winners: [0], how: 'Kultursieg (Weltwunder der Stufe 3)' }, 'Cultural victory (level 3 wonder)'],
            ['military', { winner: 0, winners: [0], military: true, how: 'Militärsieg (Hauptstadt von Bot erobert)' },
                'Military victory (captured the capital of Bot)'],
            ['resign', { winner: 0, winners: [0], resign: true, how: 'Alle anderen haben aufgegeben' }, 'Everyone else resigned'],
        ];
        for (const [name, over, en] of cases) {
            const text = await endScreen(a, over, 'state');
            ok(text.includes(en) && !GERMAN.test(text.split('\n')[0]), `${name} victory in English`, text.split('\n')[0]);
        }

        // two claims: the parts joined with " · ", and each claim under the table
        const score = [
            { pi: 0, how: 'Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5)', pop: 27, wonders: 1, techs: 9, total: 37 },
            { pi: 1, how: 'Forschungssieg (Singularität)', pop: 4, wonders: 0, techs: 20, total: 24 },
        ];
        const two = await endScreen(a, {
            winner: 0, winners: [0], score, tiebreak: 'mensch',
            how: 'Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5) · Punktvergleich am Rundenende: A 37, B 24 · Mensch vor Bot',
        }, 'state');
        ok(two.includes('Economic victory (27 of 31 world population, threshold 4/5) · points compared at the end of the round: A 37, B 24 · human before bot'),
            'points comparison in English', two.split('\n')[0]);
        ok(two.includes('Research victory (Singularity)'), 'each claim in English');
        ok(!/Wirtschaftssieg|Forschungssieg|Punktvergleich|Mensch vor/.test(two), 'no German victory text left on the end screen');

        // 'game:over' event, and the same object twice stays right
        const ev = await endScreen(a, { winner: 0, winners: [0], how: 'Forschungssieg (Singularität)' }, 'event');
        ok(ev.includes('Research victory (Singularity)'), "'game:over' in English", ev.split('\n')[0]);
        const twice = await a.evaluate(() => {
            const o = { how: 'Forschungssieg (Singularität)' };
            MP.translateOver(o); MP.translateOver(o);
            return o.how;
        });
        ok(twice === 'Research victory (Singularity)', 'translated once', twice);
        ok(errors.length === 0, 'no page errors (English)', errors.join(' | '));

        // German stays as it is
        const de = await startGame(browser, 'de');
        const deText = await endScreen(de.a, { winner: 0, winners: [0], how: 'Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5)' }, 'state');
        ok(deText.includes('Wirtschaftssieg (27 von 31 Weltbevölkerung, Schwelle 4/5)'), 'German end screen unchanged', deText.split('\n')[0]);
        ok(de.errors.length === 0, 'no page errors (German)', de.errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
