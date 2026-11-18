/**
 * Public bot descriptions on the local Docker server and in a real browser.
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/bots/description.test.js [http://localhost:3000]
 *
 * Uses an installed Chrome or Edge. Set HOCHCIV_BROWSER if it is not found.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const CONTAINER = 'hochciv-multiplayer-local';
const BROWSER = process.env.HOCHCIV_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
const TAG = 'bd' + crypto.randomBytes(3).toString('hex');
const PASSWORD = 'Test-' + crypto.randomBytes(8).toString('hex');
const inServer = code => execFileSync('docker', ['exec', '-i', '-w', '/app', CONTAINER, 'node', '-'], { input: code }).toString().trim();

async function main() {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const ownerName = TAG + '_owner', adminName = TAG + '_admin', outsiderName = TAG + '_outsider';
    try {
        inServer(`const { User, sequelize } = require('./models');
            const password_hash = require('bcryptjs').hashSync('${PASSWORD}', 10);
            User.bulkCreate([['${ownerName}', 'botcreator'], ['${adminName}', 'admin'], ['${outsiderName}', 'botcreator']]
                .map(([username, role]) => ({ username, role, password_hash, email: username + '@example.com',
                    isActive: true, emailOtpEnabled: false })))
                .then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });`);
        const context = () => browser.newContext({ viewport: { width: 360, height: 760 } });
        const login = async username => {
            const ctx = await context();
            const res = await ctx.request.post(BASE + '/api/auth/login', { data: { username, password: PASSWORD } });
            assert.equal(res.status(), 200);
            return ctx;
        };
        const owner = await login(ownerName), admin = await login(adminName), outsider = await login(outsiderName);
        const guest = await context();
        const created = await owner.request.post(BASE + '/api/bots', { data: { username: TAG + '_bot' } });
        assert.equal(created.status(), 200);
        const { bot, token } = await created.json();
        const botSession = await context();
        assert.equal((await botSession.request.post(BASE + '/api/auth/bot', { data: { token } })).status(), 200);

        const descriptionPath = `/api/bots/${bot.id}/description`;
        const set = (ctx, description, path = descriptionPath) => ctx.request.post(BASE + path, { data: { description } });
        const profile = async id => {
            const res = await guest.request.get(BASE + '/api/profile/' + id);
            assert.equal(res.status(), 200);
            return res.json();
        };
        const me = await (await owner.request.get(BASE + '/api/auth/me')).json();
        assert.equal(bot.description, null);
        assert.equal((await profile(bot.id)).description, null);
        assert.equal(Object.hasOwn(await profile(me.id), 'description'), false);
        assert.equal((await set(guest, 'Guest')).status(), 401);
        assert.equal((await set(outsider, 'A different bot owner')).status(), 404);
        assert.equal((await set(botSession, 'Bot session')).status(), 403);
        assert.equal((await set(admin, 'Human profile', `/api/bots/${me.id}/description`)).status(), 404);
        assert.equal((await profile(bot.id)).description, null);
        console.log('PASS  public defaults and owner/admin write scope');

        const maxEmoji = '🤖'.repeat(280);
        assert.equal((await set(owner, '  ' + maxEmoji + '\n')).status(), 200);
        assert.equal((await profile(bot.id)).description, maxEmoji);
        for (const invalid of [undefined, null, ['text'], maxEmoji + '🤖', 'a\0b']) {
            assert.equal((await set(owner, invalid)).status(), 400);
        }
        assert.equal((await profile(bot.id)).description, maxEmoji);
        console.log('PASS  280 Unicode code points, trimming and invalid input');

        const unbroken = 'a'.repeat(280);
        const changed = await set(admin, unbroken);
        assert.equal(changed.status(), 200);
        assert.deepEqual(await changed.json(), { description: unbroken });
        const list = await owner.request.get(BASE + '/api/bots');
        assert.equal(list.status(), 200);
        assert.equal((await list.json()).bots.find(b => b.id === bot.id).description, unbroken);

        const publicPage = await guest.newPage();
        await publicPage.goto(BASE + '/');
        await publicPage.waitForFunction(() => typeof PROFILE !== 'undefined');
        const openProfile = async () => {
            await publicPage.evaluate(id => PROFILE.open(id), bot.id);
            await publicPage.locator('.hcp-name').waitFor({ state: 'visible' });
        };
        await openProfile();
        const description = publicPage.locator('.hcp-bot-description');
        assert.equal(await description.textContent(), unbroken);
        assert.equal(await description.evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getClientRects().length > 1 && el.scrollWidth <= el.clientWidth;
        }), true);
        console.log('PASS  admin edit and unbroken public text wraps on a phone');

        await owner.addInitScript(() => localStorage.setItem('hochciv.lang', 'en'));
        const accountPage = await owner.newPage();
        await accountPage.goto(BASE + '/client/account.html#bots');
        const edit = accountPage.locator(`[data-bot-description="${bot.id}"]`);
        assert.equal(await edit.textContent(), 'Edit description');
        await edit.click();
        const modal = accountPage.locator('#bot-description-modal');
        const input = accountPage.locator('#input-bot-description');
        assert.equal(await input.inputValue(), unbroken);
        assert.equal(await modal.locator('#bot-description-title').textContent(), 'Public description for ' + bot.username);
        await input.fill(unbroken + 'b');
        await modal.getByRole('button', { name: 'Save' }).click();
        await modal.getByText('The description must be text of at most 280 characters.').waitFor({ state: 'visible' });

        const markup = '<img src=x onerror="window.botDescriptionExecuted=true"> & Bot\nSecond line';
        const save = async text => {
            await input.fill(text);
            await modal.getByRole('button', { name: 'Save' }).click();
            await modal.waitFor({ state: 'hidden' });
        };
        await save(markup);
        await openProfile();
        assert.equal(await description.textContent(), markup);
        assert.equal(await description.locator('img').count(), 0);
        assert.equal(await publicPage.evaluate(() => window.botDescriptionExecuted), undefined);

        await edit.click();
        assert.equal(await input.inputValue(), markup);
        await save('');
        assert.equal((await profile(bot.id)).description, null);
        await openProfile();
        assert.equal(await description.count(), 0);
        console.log('PASS  English editor, literal multiline text and clearing through the UI');
    } finally {
        await browser.close();
        inServer(`const { User, sequelize } = require('./models');
            const { Op } = require('sequelize');
            User.destroy({ where: { username: { [Op.startsWith]: '${TAG}' } } })
                .then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });`);
    }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
