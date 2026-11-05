/**
 * Consent to the terms of use (client/consent.js, utils/terms.js) against the local docker setup:
 *
 *   TERMS_CHECK=on docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/terms/terms.test.js [http://localhost:3000]
 *
 * Accounts: popup after the login, the server refuses publishing a map until then, agreeing is
 * stored, declining logs out, a new version asks again. Guests: popup on
 * opening the multiplayer, not on the main menu; declining stays out of the lobby, agreeing is
 * kept on the device. The Discord Activity needs a real Discord login and is not covered: the
 * refusal of a seat is only seen in routes/activity.js.
 *
 * Uses an installed Chrome or Edge; set HOCHCIV_BROWSER to its path if it is not found.
 * HOCHCIV_DB_NAME names another database in the hochciv-db container.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const DB = process.env.HOCHCIV_DB_NAME || 'hochciv';
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
const sql = q => execFileSync('docker', ['exec', 'hochciv-db', 'psql', '-U', 'hochciv', '-d', DB, '-tAc', q]).toString().trim();
const PASSWORD = 'Test-' + crypto.randomBytes(6).toString('hex');
const HASH = require('bcryptjs').hashSync(PASSWORD, 10);

function makeUser() {
    const name = 'terms_' + crypto.randomBytes(3).toString('hex');
    const id = crypto.randomUUID();
    sql(`INSERT INTO users (id, username, email, password_hash, "isActive", "emailOtpEnabled", "notifyEmail", "createdAt", "updatedAt")
        VALUES ('${id}', '${name}', '${name}@example.com', '${HASH}', true, false, false, now(), now())`);
    return { name, id };
}
const popup = page => page.isVisible('#mp-consent');
const answer = (page, a) => page.click(`#mp-consent [data-answer="${a}"]`);

async function open(browser, user, errors) {
    const ctx = await browser.newContext({ locale: 'de-DE' });
    if (user) {
        const login = await ctx.request.post(BASE + '/api/auth/login', { data: { username: user.name, password: PASSWORD } });
        if (login.status() !== 200) throw new Error('login failed for ' + user.name);
    }
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof MP !== 'undefined' && typeof CONSENT !== 'undefined');
    return { ctx, page };
}

async function accounts(browser, errors) {
    const yes = makeUser(), no = makeUser();
    try {
        const { ctx, page } = await open(browser, yes, errors);
        await page.waitForSelector('#mp-consent');
        ok(true, 'account: the popup is shown after the login');
        const links = await page.$$eval('#mp-consent a', a => a.map(l => l.getAttribute('href')));
        ok(links.includes('/nutzungsbedingungen.html') && links.includes('/datenschutzerklaerung.html'), 'account: links to both texts');

        const pub = await ctx.request.post(BASE + `/api/maps/${crypto.randomUUID()}/publish`);
        ok(pub.status() === 400 && (await pub.json()).error === 'Bitte stimme zuerst den Nutzungsbedingungen zu.', 'server: no publishing before agreeing');

        // the same for texts in a live game (the popup is in the way, not the socket)
        await page.evaluate(() => MP.showLobby());
        await page.evaluate(() => MP.setMode('host'));
        await page.fill('#mp-n', 'TermsA');
        await page.evaluate(() => MP.host());
        await page.waitForSelector('#mp-p-civ-0', { state: 'attached' });
        const text = await page.evaluate(() => new Promise(r => MP.socket.emit('chat:send', { kind: 'text', text: 'Hallo' }, r)));
        ok(text.error === 'Bitte stimme zuerst den Nutzungsbedingungen zu.', 'server: no chat texts before agreeing', text.error);

        await answer(page, 'yes');
        await page.waitForSelector('#mp-consent', { state: 'detached' });
        await page.waitForFunction(() => MP.user && MP.user.termsAccepted === true);
        ok(sql(`SELECT "termsVersion" IS NOT NULL AND "termsAcceptedAt" IS NOT NULL FROM users WHERE id = '${yes.id}'`) === 't', 'account: the agreement is stored');
        await page.reload();
        await page.waitForFunction(() => MP.user);
        ok(!(await popup(page)), 'account: not asked again');
        const pub2 = await ctx.request.post(BASE + `/api/maps/${crypto.randomUUID()}/publish`);
        ok((await pub2.json()).error === 'Diese Karte gibt es nicht.', 'server: publishing allowed afterwards');

        sql(`UPDATE users SET "termsVersion" = 'old' WHERE id = '${yes.id}'`);
        await page.reload();
        await page.waitForSelector('#mp-consent');
        ok(true, 'account: a new version asks again');
        await ctx.close();

        const d = await open(browser, no, errors);
        await d.page.waitForSelector('#mp-consent');
        await answer(d.page, 'no');
        await d.page.waitForFunction(() => typeof MP !== 'undefined' && !document.getElementById('mp-consent'));
        const me = await d.ctx.request.get(BASE + '/api/auth/me');
        ok(me.status() === 401, 'account: declining logs out');
        ok(sql(`SELECT "termsVersion" IS NULL FROM users WHERE id = '${no.id}'`) === 't', 'account: nothing is stored on declining');
        await d.ctx.close();
    } finally {
        sql(`DELETE FROM users WHERE id IN ('${yes.id}', '${no.id}')`);
    }
}

async function guests(browser, errors) {
    const { ctx, page } = await open(browser, null, errors);
    await page.waitForFunction(() => document.querySelector('#screen-menu.show') || document.querySelector('.screen.show'));
    await page.waitForTimeout(500);
    ok(!(await popup(page)), 'guest: no popup on the main menu (offline games stay free)');
    page.evaluate(() => { MP.showLobby(); });
    await page.waitForSelector('#mp-consent');
    ok(true, 'guest: the popup is shown when opening the multiplayer');
    await answer(page, 'no');
    await page.waitForFunction(() => typeof MP !== 'undefined' && !document.getElementById('mp-consent'));
    ok(await page.evaluate(() => !document.querySelector('.mph')), 'guest: declining stays out of the lobby');
    page.evaluate(() => { MP.showLobby(); });
    await page.waitForSelector('#mp-consent');
    await answer(page, 'yes');
    await page.waitForSelector('.mph');
    ok(true, 'guest: agreeing opens the lobby');
    await page.reload();
    await page.waitForFunction(() => typeof CONSENT !== 'undefined' && typeof MP.showLobby === 'function');
    page.evaluate(() => { MP.showLobby(); });
    await page.waitForSelector('.mph');
    ok(!(await popup(page)), 'guest: kept on the device');

    const en = await open(browser, null, errors);
    await en.page.evaluate(() => { switchLang('en'); CONSENT.ask(); });
    const button = await en.page.textContent('#mp-consent [data-answer="yes"]');
    const links = await en.page.textContent('.mp-consent-links');
    ok(button === 'Agree' && /Terms of use/.test(links) && /Privacy policy/.test(links), 'English: the popup is translated', button);
    await en.ctx.close();
    await ctx.close();
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
    const errors = [];
    try {
        await accounts(browser, errors);
        await guests(browser, errors);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
