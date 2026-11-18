/**
 * The game log in the player's language (utils/logtext.js, client/logtext.js) against the local
 * docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/i18n/log.test.js [http://localhost:3000]
 *
 * Reported: the game log (Protokoll) stayed German with the language set to English. The engine
 * writes it on the server in German; the server now records what each line is made of (e.t) and
 * the client puts it together in English. A live game in English (one player, three KI, wonders
 * and events) over a few rounds: the Protokoll has no German left, entries carry their parts, a
 * German page shows the server's text unchanged. The WebSocket is compressed (the parts make
 * the state bigger).
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
// German that must not be left in an English log (words, not names)
const GERMAN = /[äöüß]|\b(und|von|der|die|das|mit|auf|wird|Stadt|Städte|Runde|Einkommen|Nahrung|Münzen|Wissenschaft|Verfügbarkeit|Ereignis|greifen|wächst|gebaut|zieht|keine|verfügbar|erforscht|zerstört|diese|Armee)\b/;

async function startGame(browser, lang, rounds) {
    const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-GB' : 'de-DE' });
    await ctx.addInitScript(l => { try { localStorage.setItem('hochciv.lang', l); } catch (e) { } }, lang);
    const a = await ctx.newPage();
    const errors = [];
    a.on('pageerror', e => errors.push(e.message));
    await a.goto(BASE + '/');
    await a.waitForFunction(() => typeof MP !== 'undefined' && typeof io === 'function' && typeof LOGTEXT !== 'undefined');
    await a.evaluate(() => MP.showLobby());
    await a.waitForFunction(() => typeof MP.setMode === 'function');
    await a.evaluate(() => MP.setMode('host'));
    await a.fill('#mp-n', 'Log' + lang);
    await a.evaluate(() => MP.host());
    await a.waitForSelector('#mp-p-civ-0');
    await a.evaluate(() => MP.socket.emit('lobby:config', { playerCount: 4, kiCount: 3, mapKey: '0', wonders: true, events: true }));
    await a.waitForFunction(() => MP.gameConfig.playerCount === 4);
    await a.evaluate(() => MP.startGame());
    for (let k = 0; k < rounds; k++) {
        await a.waitForFunction(() => typeof S !== 'undefined' && S && (MP.isMyTurn() || S.over), null, { timeout: 90000 });
        if (await a.evaluate(() => !!S.over)) break;
        const r = await a.evaluate(() => S.round);
        await a.evaluate(() => new Promise(res => MP.sendAction({ type: 'endTurn' }, res)));
        await a.waitForFunction(r0 => (S.round > r0 && MP.isMyTurn()) || S.over, r, { timeout: 90000 });
    }
    await a.waitForFunction(() => !(typeof ui !== 'undefined' && (ui.botLock || ui.anim)), null, { timeout: 60000 });
    await a.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
    return { a, errors };
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    try {
        // 1. English
        const { a, errors } = await startGame(browser, 'en', 6);
        const info = await a.evaluate(() => ({
            lines: S.log.length,
            withParts: S.log.filter(e => Array.isArray(e.t)).length,
            german: S.log.filter(e => /[äöüß]/.test(e.m)).length,
        }));
        ok(info.lines > 50, 'the game has a log', info.lines + ' lines');
        ok(info.withParts > info.lines / 2, 'entries carry their parts (e.t)', `${info.withParts} of ${info.lines}`);
        ok(info.german > 0, 'the server text itself is German');

        await a.evaluate(() => logModal());
        const shown = await a.evaluate(() => [...document.querySelectorAll('#ov-body .logline, #ov-body .lsum')].map(x => x.textContent));
        const left = shown.filter(t => GERMAN.test(t));
        ok(shown.length > 30, 'Protokoll lines', shown.length);
        ok(left.length === 0, 'no German left in the Protokoll', left.slice(0, 5).join(' | '));
        const sample = shown.find(t => /researches|founded|grows|Income|Availability/.test(t));
        ok(!!sample, 'English game lines', sample);
        await a.evaluate(() => closeModal());

        // the same through logSince (the turn's log, battle toast)
        const since = await a.evaluate(() => logSince(S, 0).map(e => e.m).filter(m => /[äöüß]/.test(m)).length);
        ok(since === 0, 'logSince in English', since);
        ok(errors.length === 0, 'no page errors (English)', errors.join(' | '));

        // 2. German: the server's text, unchanged
        const de = await startGame(browser, 'de', 1);
        const same = await de.a.evaluate(() => {
            logModal();
            const shown = [...document.querySelectorAll('#ov-body .logline')].map(x => x.textContent);
            const raw = S.log.slice(-260).map(e => e.m.replace(/<[^>]+>/g, ''));
            return shown.every(t => raw.includes(t)) && shown.length > 0;
        });
        ok(same, 'German Protokoll is the server text');
        ok(de.errors.length === 0, 'no page errors (German)', de.errors.join(' | '));

        // 3. compressed WebSocket (permessage-deflate)
        const ext = await new Promise(resolve => {
            const WebSocket = require('ws');
            const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Origin: BASE } });
            ws.on('upgrade', res => { resolve(res.headers['sec-websocket-extensions'] || ''); ws.close(); });
            ws.on('error', e => resolve('error: ' + e.message));
        });
        ok(/permessage-deflate/.test(ext), 'WebSocket compression', ext);
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
