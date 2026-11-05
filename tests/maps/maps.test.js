/**
 * Map browser and favorites (client/maps, maps/service.js, routes/maps.js) against the local docker setup:
 *
 *   docker compose -f docker-compose.local.yml up -d --build
 *   npm i --no-save playwright-core
 *   node tests/maps/maps.test.js [http://localhost:3000]
 *
 * Author A publishes two maps, player B browses them, admin C moderates:
 *   · API: the browser lists published maps for everybody (search, players filter, sorting by
 *     favorites / newest), favorites and "Meine" only logged in;
 *   · B marks a favorite in the browser (★), the count and the Favoriten tab follow, twice is once;
 *   · the detail view: "Zu meinen Karten" (counted as played), "Als Vorlage im Editor öffnen";
 *   · the lobby: favorites in the host's map menu, the browser in pick mode ("Wählen");
 *   · the Rundenspiel form: a map from the browser lands in "Meine Karten" and is the form's map;
 *   · reporting a map (once, not the own), the admin sees it with a picture on the admin page and
 *     takes the map out of the browser from there;
 *   · entry points: main menu, multiplayer menu, editor, "Meine Karten"; the browser on a phone;
 *   · merging accounts (Discord Activity): favorites move, one both had counts once;
 *   · deleting the author's account takes the maps and their favorites along.
 *
 * Test accounts, maps and reports are deleted afterwards. Uses an installed Chrome or Edge (no
 * browser download); set HOCHCIV_BROWSER to its path if it is not found.
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
function makeUser(role) {
    const name = 'map_' + crypto.randomBytes(3).toString('hex');
    const id = inServer(`const { User } = require('./models'); const bcrypt = require('bcryptjs');
        User.create({ username: '${name}', email: '${name}@example.com', password_hash: bcrypt.hashSync('${PASSWORD}', 10),
            isActive: true, emailOtpEnabled: false, notifyEmail: false, role: '${role || 'user'}' })
            .then(u => { console.log(u.id); process.exit(0); })`);
    return { name, id };
}

async function run(browser, [ua, ub, uc]) {
    const errors = [];
    const login = async (u, opts) => {
        const ctx = await browser.newContext(Object.assign({ locale: 'de-DE' }, opts || {}));
        if (u) {
            const r = await ctx.request.post(BASE + '/api/auth/login', { data: { username: u.name, password: PASSWORD } });
            if (r.status() !== 200) throw new Error('login failed for ' + u.name);
        }
        return ctx;
    };
    const newPage = async (ctx, name, answer) => {
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
        page.on('dialog', d => d.accept(d.type() === 'prompt' ? (answer || 'unpassend') : undefined));
        await page.goto(BASE + '/');
        await page.waitForFunction(() => typeof MP !== 'undefined' && typeof MAPBROWSER !== 'undefined');
        await page.evaluate(() => { try { localStorage.clear(); } catch (_) { } return MP.fetchUser(); });
        return page;
    };
    const api = async (ctx, path, method, body) => {
        const r = await ctx.request.fetch(BASE + '/api/maps' + path, { method: method || 'GET', data: body });
        return Object.assign(await r.json().catch(() => ({})), { status: r.status() });
    };
    const ca = await login(ua), cb = await login(ub), cc = await login(uc), anon = await login(null);
    // in the open browser: tab "Beliebt", search for one map, wait until it is the only card
    const search = async (page, name) => {
        await page.click('#mb .mb-tab[data-tab="popular"]');
        await page.fill('#mb-q', name);
        await page.waitForFunction(n => MAPBROWSER.q === n && MAPBROWSER.list.length === 1 && MAPBROWSER.list[0].name === n
            && !document.querySelector('#mb-grid .mb-ghost'), name);
    };

    // ── The big map: published, belongs to nobody, opens for everybody ──
    const big = await api(anon, '/code/GRKART');
    ok(big.map && big.map.name === 'Große Karte' && big.map.rows.length === 15 && big.map.rows[0].length === 24 && big.map.maxPlayers === 4 && big.author === null,
        'the big map opens by its code, without an author', JSON.stringify(big).slice(0, 200));
    const listed = await api(anon, '/browse?q=' + encodeURIComponent('Große Karte'));
    const bigRow = (listed.maps || []).find(m => m.code === 'GRKART');
    ok(bigRow && bigRow.author === null && !bigRow.own, 'the big map is in the browser, without an author', JSON.stringify(listed).slice(0, 200));
    const bigPicked = await api(cb, `/browse/${bigRow && bigRow.id}/pick`, 'POST');
    ok(bigPicked.map && bigPicked.code === 'GRKART', 'the big map can be picked', JSON.stringify(bigPicked).slice(0, 200));
    ok((await api(cb, `/${bigRow && bigRow.id}`, 'DELETE')).error, 'nobody can delete the big map');

    // ── A publishes two maps (the game's own fixed maps, made playable custom maps) ──
    const a = await newPage(ca, 'A');
    const maps = await a.evaluate(tag => [
        checkCustomMap(Object.assign({}, MAPS[0], { name: 'Alpha ' + tag })).map,
        checkCustomMap(Object.assign({}, MAPS[0], { name: 'Beta ' + tag, marathon: true })).map,
    ], TAG);
    const ids = [];
    for (const m of maps) {
        const saved = await api(ca, '', 'POST', { map: m });
        const pub = await api(ca, `/${saved.map.id}/publish`, 'POST', {});
        ids.push(saved.map.id);
        ok(!!pub.map.code, `publish ${m.name}`, pub.map.code);
        await new Promise(r => setTimeout(r, 30));          // Beta is the newer one
    }
    const [alpha, beta] = ids;

    // ── API: for everybody, filters and sorting ──
    let r = await api(anon, `/browse?q=${TAG}`);
    ok(r.total === 2 && r.maps.every(m => !m.fav && !m.own) && r.maps.every(m => m.author === ua.name), 'browse: both maps for a guest, with the author', JSON.stringify(r.maps && r.maps.map(m => [m.name, m.author])));
    r = await api(anon, `/browse?q=${ua.name}`);
    ok(r.total === 2, 'browse: found by the author\'s name', r.total);
    r = await api(anon, `/browse?q=${TAG}&players=5`);
    ok(r.total === 0, 'browse: players filter (both maps are for 4)', r.total);
    r = await api(anon, `/browse?q=${TAG}%25`);
    ok(r.total === 0, 'browse: % in the search is a letter, not a wildcard', r.total);
    r = await api(anon, `/browse?only=favorites`);
    ok(r.status === 400 && /angemeldet/.test(r.error), 'browse: favorites only logged in', r.error);
    r = await api(ca, `/browse?only=mine`);
    ok(r.maps.length === 2 && r.maps.every(m => m.own), 'browse: "Meine" lists the own published maps', r.maps.length);
    r = await api(anon, `/${alpha}/favorite`, 'POST', { on: true });
    ok(r.status === 401, 'favorite: not without login', r.status);

    // ── B: favorite in the browser ──
    const b = await newPage(cb, 'B');
    ok(await b.$('#mp-maps-btn') !== null, 'main menu: "Karten entdecken"');
    await b.click('#mp-maps-btn');
    await b.waitForSelector('#mb.show');
    await b.fill('#mb-q', TAG);
    await b.waitForFunction(tag => MAPBROWSER.q === tag && MAPBROWSER.list.length === 2 && document.querySelectorAll('#mb-grid .mb-card:not(.mb-ghost)').length === 2, TAG);
    const cards = await b.$$eval('#mb-grid .mb-card', cs => cs.map(c => ({ name: c.querySelector('b').textContent, svg: !!c.querySelector('svg path') })));
    ok(cards.every(c => c.svg), 'browser: cards with a map picture', JSON.stringify(cards));
    ok(cards.map(c => c.name).join() === `Alpha ${TAG},Beta ${TAG}` || cards.length === 2, 'browser: both maps listed', cards.map(c => c.name).join());
    await b.click('#mb-grid .mb-card:has(b:text-is("Beta ' + TAG + '")) .mb-fav');
    await b.waitForFunction(() => MAPBROWSER.favs.length === 1);
    r = await api(anon, `/browse?q=${TAG}`);
    ok(r.maps[0].name === `Beta ${TAG}` && r.maps[0].favorites === 1, 'popular: the favorite comes first', r.maps.map(m => m.name + ':' + m.favorites).join());
    r = await api(anon, `/browse?q=${TAG}&sort=new`);
    ok(r.maps[0].name === `Beta ${TAG}`, 'newest first', r.maps.map(m => m.name).join());
    r = await api(cb, `/${beta}/favorite`, 'POST', { on: true });
    ok(r.favorites === 1, 'favorite: twice counts once', r.favorites);
    await api(cb, `/${alpha}/favorite`, 'POST', { on: true });
    r = await api(cb, `/${alpha}/favorite`, 'POST', { on: false });
    ok(r.favorites === 0 && !r.fav, 'favorite: unmarking counts down', JSON.stringify(r));
    await b.click('#mb .mb-tab[data-tab="favorites"]');
    await b.waitForFunction(() => MAPBROWSER.tab === 'favorites' && !document.querySelector('#mb-grid .mb-ghost'));
    const favNames = await b.$$eval('#mb-grid .mb-card b', bs => bs.map(x => x.textContent));
    ok(favNames.length === 1 && favNames[0] === `Beta ${TAG}`, 'tab Favoriten: just the favorite', favNames.join());

    // ── detail view: keep and open as template ──
    await b.click('#mb-grid .mb-card .mb-thumb');
    await b.waitForSelector('#mb-detail:not([hidden]) #mb-d-keep');
    const code = await b.$eval('#mb-detail .mapcode', el => el.textContent);
    ok(code.length === 6, 'detail: shows the code', code);
    await b.click('#mb-d-keep');
    await b.waitForFunction(tag => myMaps.some(m => m.name === 'Beta ' + tag), TAG);
    ok(sql(`SELECT loads FROM custom_maps WHERE id = '${beta}'`) === '1', 'detail: "Zu meinen Karten" counts as played');
    await b.click('#mb-d-edit');
    await b.waitForFunction(() => document.getElementById('screen-editor').classList.contains('show'));
    const ed = await b.evaluate(() => ({ name: document.getElementById('ed-name').value, rows: editMap.rows.length, marathon: editMap.marathon, mb: document.getElementById('mb').classList.contains('show') }));
    ok(ed.name === '' && ed.rows === 12 && ed.marathon && !ed.mb, 'detail: someone else\'s map opens as a template without its name', JSON.stringify(ed));
    ok(await b.isVisible('#ed-browse'), 'editor: "Karten entdecken" in Datei');

    // ── editor: painting by dragging, one step to undo; "Verschieben" moves the map instead ──
    const hexAt = (r, c) => b.$eval(`#ed-map [data-r="${r}"][data-c="${c}"]`, el => { const q = el.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
    await b.evaluate(() => { edSetMode('paint'); edSetBrush(0); edTool = 'B'; editorPalette(); });
    const before = await b.evaluate(() => editMap.rows.join(''));
    const [x1, y1] = await hexAt(5, 3), [x2, y2] = await hexAt(5, 9);
    await b.mouse.move(x1, y1); await b.mouse.down();
    for (let k = 1; k <= 12; k++) await b.mouse.move(x1 + (x2 - x1) * k / 12, y1 + (y2 - y1) * k / 12);
    await b.mouse.up();
    const painted = await b.evaluate(() => editMap.rows[5].slice(3, 10));
    ok(painted === 'BBBBBBB', 'editor: a drag paints every tile on its way', painted);
    await b.click('#ed-undo');
    ok(await b.evaluate(() => editMap.rows.join('')) === before, 'editor: one undo takes the whole stroke back');
    await b.click('#ed-redo');
    ok(await b.evaluate(() => editMap.rows[5].slice(3, 10)) === 'BBBBBBB', 'editor: redo brings it back');
    await b.evaluate(() => { const v = HochcivMobile.views.get(document.getElementById('ed-map')); v.k *= 2; v.auto = false; HochcivMobile.applyView(document.getElementById('ed-map')); });
    await b.click('#ed-modes [data-mode="pan"]');
    const vb = () => b.$eval('#ed-map', el => el.getAttribute('viewBox'));
    const view0 = await vb(), rows0 = await b.evaluate(() => editMap.rows.join(''));
    const [px, py] = await hexAt(6, 6);
    await b.mouse.move(px, py); await b.mouse.down();
    await b.mouse.move(px - 60, py - 40, { steps: 6 }); await b.mouse.up();
    ok(await vb() !== view0 && await b.evaluate(() => editMap.rows.join('')) === rows0, 'editor: "Verschieben" moves the map and paints nothing');
    await b.keyboard.press('b');
    ok(await b.evaluate(() => edMode) === 'paint', 'editor: key B is the paint tool again');

    // ── lobby: favorites in the map menu, the browser in pick mode ──
    await b.evaluate(() => { show('screen-menu'); MP.showLobby(); });
    await b.waitForFunction(() => typeof MP.setMode === 'function');
    ok(await b.$('.mph-maps') !== null, 'multiplayer menu: "Karten entdecken"');
    await b.evaluate(() => MP.setMode('host'));
    await b.evaluate(() => MP.host());
    await b.waitForSelector('#mp-set-map');
    await b.selectOption('#mp-set-map', 'eigene');
    await b.waitForSelector('#mp-set-custom');
    const favOpt = await b.$eval('#mp-set-custom', s => [...s.querySelectorAll('optgroup')].map(g => g.label + ':' + [...g.children].map(o => o.value).join('|')).join(' / '));
    ok(favOpt.includes('Favoriten:fav:' + beta), 'lobby: the favorite in the map menu', favOpt);
    await b.selectOption('#mp-set-custom', 'fav:' + beta);
    await b.waitForFunction(tag => MP.gameConfig.customMap && MP.gameConfig.customMap.name === 'Beta ' + tag, TAG);
    ok(true, 'lobby: a favorite becomes the lobby\'s map');
    await b.evaluate(() => MP.browseMaps());
    await b.waitForSelector('#mb.show.picking');
    await search(b, 'Alpha ' + TAG);
    await b.click('#mb-grid .mb-use');
    await b.waitForFunction(tag => MP.gameConfig.customMap && MP.gameConfig.customMap.name === 'Alpha ' + tag, TAG);
    ok(!(await b.isVisible('#mb')), 'lobby: "Wählen" takes the map and closes the browser');
    await b.goto(BASE + '/');
    await b.waitForFunction(() => typeof MAPBROWSER !== 'undefined');
    await b.evaluate(() => MP.fetchUser());

    // ── Rundenspiel form: a browsed map goes into "Meine Karten" ──
    await b.evaluate(() => { ASYNC.form = null; return ASYNC.showCreate(); });
    await b.waitForSelector('#mpa-map');
    await b.selectOption('#mpa-map', 'eigene');
    await b.waitForSelector('#mpa-custom');
    await b.evaluate(() => ASYNC.browseMaps());
    await search(b, 'Alpha ' + TAG);
    await b.click('#mb-grid .mb-use');
    await b.waitForFunction(tag => ASYNC.form.customName === 'Alpha ' + tag && myMaps.some(m => m.name === 'Alpha ' + tag), TAG);
    ok(await b.$eval('#mpa-custom', s => s.value) === 'Alpha ' + TAG, 'Rundenspiel: the browsed map is the form\'s map');
    await b.evaluate(() => closeModal());

    // ── report ──
    await b.evaluate(() => MAPBROWSER.open());
    await search(b, 'Beta ' + TAG);
    await b.click('#mb-grid .mb-thumb');
    await b.click('#mb-d-report');
    await b.waitForFunction(() => /Admin/.test(document.getElementById('toast').textContent));
    ok(sql(`SELECT count(*) FROM reports WHERE kind = 'map' AND "sourceId" = '${beta}' AND reason = 'unpassend' AND "reportedId" = '${ua.id}'`) === '1', 'report: stored with reason and author');
    r = await api(cb, `/${beta}/report`, 'POST', { reason: 'nochmal' });
    ok(r.status === 400 && /schon gemeldet/.test(r.error), 'report: only once', r.error);
    r = await api(ca, `/${beta}/report`, 'POST', {});
    ok(r.status === 400 && /eigene/.test(r.error), 'report: not the own map', r.error);
    ok(!(await b.$('#mb-d-unlist')), 'detail: no "remove" button for players');

    // ── admin: the report with a picture, the map out of the browser ──
    r = await api(cc, `/browse?q=${TAG}`);
    ok(r.moderator === true, 'browse: an admin is a moderator');
    const c = await cc.newPage();
    c.on('pageerror', e => errors.push(`C: ${e.message}`));
    c.on('dialog', d => d.accept());
    await c.goto(BASE + '/client/admin.html#reports');
    await c.waitForSelector('#admin-reports-list .report-card .report-map path', { timeout: 15000, state: 'attached' });
    const card = await c.$eval('#admin-reports-list .report-card:has(.report-map)', el => el.textContent.replace(/\s+/g, ' '));
    ok(card.includes('Beta ' + TAG) && card.includes('unpassend'), 'admin: the map report with name and reason', card.slice(0, 120));
    await c.click('#admin-reports-list .report-card:has(.report-map) button.error');
    await c.waitForFunction(() => !document.querySelector('#admin-reports-list .report-map'), null, { timeout: 10000 }).catch(() => null);
    ok(sql(`SELECT coalesce(code, 'null') FROM custom_maps WHERE id = '${beta}'`) === 'null', 'admin: "Karte zurückziehen" unpublishes the map');
    ok(sql(`SELECT status || ' ' || note FROM reports WHERE kind = 'map' AND "sourceId" = '${beta}'`) === 'resolved Karte zurückgezogen', 'admin: the report is done, with a note');
    r = await api(anon, `/browse?q=${TAG}`);
    ok(r.total === 1 && r.maps[0].name === `Alpha ${TAG}`, 'browse: the removed map is gone', r.maps.map(m => m.name).join());
    r = await api(cb, `/browse/${beta}/pick`, 'POST', {});
    ok(r.status === 400, 'pick: an unpublished map can\'t be picked', r.error);
    r = await api(cb, `/browse?only=favorites`);
    ok(r.maps.length === 0, 'favorites: an unpublished favorite is not listed', r.maps.length);

    // ── phone ──
    const cp = await login(ub, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await newPage(cp, 'phone');
    await p.evaluate(() => MAPBROWSER.open());
    await p.waitForFunction(() => MAPBROWSER.list.length > 0 && !document.querySelector('#mb-grid .mb-ghost'));
    const lay = await p.evaluate(() => {
        const box = document.querySelector('#mb .mb-box').getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height), over: document.documentElement.scrollWidth > innerWidth };
    });
    ok(lay.w === 390 && lay.h === 844 && !lay.over, 'phone: the browser fills the screen, nothing sideways', JSON.stringify(lay));
    await p.click('#mb-grid .mb-thumb');
    const det = await p.evaluate(() => {
        const t = document.querySelector('.mb-d-thumb').getBoundingClientRect(), s = document.querySelector('.mb-d-side').getBoundingClientRect();
        return { stacked: s.top >= t.bottom - 1, w: Math.round(s.width) };
    });
    ok(det.stacked && det.w > 300, 'phone: detail picture above, actions below', JSON.stringify(det));
    await cp.close();

    for (const ctx of [ca, cb, cc, anon]) await ctx.close();
    return { errors, alpha };
}

function merge([, , , ux, uy], alpha) {
    // X and Y both like Alpha; X's account is merged into Y's (utils/mergeAccounts.js → moveOwner)
    inServer(`const s = require('./maps/service'); const { sequelize } = require('./models');
        (async () => {
            await s.setFavorite({ id: '${ux.id}' }, '${alpha}', true);
            await s.setFavorite({ id: '${uy.id}' }, '${alpha}', true);
            await sequelize.transaction(t => s.moveOwner('${ux.id}', '${uy.id}', t));
            console.log('ok'); process.exit(0);
        })()`);
    const left = sql(`SELECT count(*) FROM map_favorites WHERE "userId" = '${ux.id}'`);
    const kept = sql(`SELECT count(*) FROM map_favorites WHERE "userId" = '${uy.id}' AND "mapId" = '${alpha}'`);
    const count = sql(`SELECT favorites FROM custom_maps WHERE id = '${alpha}'`);
    ok(left === '0' && kept === '1' && count === '1', 'merge: a favorite both accounts had counts once', `${left} ${kept} ${count}`);
}

function deletion([ua]) {
    // the author's account goes: maps and the favorites on them too
    sql(`INSERT INTO map_favorites (id, "userId", "mapId", "createdAt") SELECT gen_random_uuid(), "ownerId", id, now() FROM custom_maps WHERE "ownerId" = '${ua.id}'`);
    const ids = sql(`SELECT string_agg('''' || id || '''', ',') FROM custom_maps WHERE "ownerId" = '${ua.id}'`);
    inServer(`const { User } = require('./models'); const { deleteAccount } = require('./utils/deleteAccount');
        User.findByPk('${ua.id}').then(u => deleteAccount(u)).then(e => { console.log(e || 'ok'); process.exit(0); })`);
    ok(sql(`SELECT count(*) FROM custom_maps WHERE id IN (${ids})`) === '0' && sql(`SELECT count(*) FROM map_favorites WHERE "mapId" IN (${ids})`) === '0',
        'deletion: the author\'s maps and their favorites are gone');
}

(async () => {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: BROWSER });
    const users = [makeUser(), makeUser(), makeUser('admin'), makeUser(), makeUser()];
    let errors = [];
    try {
        const r = await run(browser, users);
        errors = r.errors;
        merge(users, r.alpha);
        deletion(users);
        ok(errors.length === 0, 'no page errors', errors.join(' | '));
    } finally {
        await browser.close();
        const list = users.map(u => `'${u.id}'`).join(',');
        sql(`DELETE FROM reports WHERE kind = 'map' AND ("reporterId" IN (${list}) OR "reportedId" IN (${list}))`);
        sql(`DELETE FROM map_favorites WHERE "userId" IN (${list}) OR "mapId" IN (SELECT id FROM custom_maps WHERE "ownerId" IN (${list}))`);
        sql(`DELETE FROM custom_maps WHERE "ownerId" IN (${list})`);
        sql(`DELETE FROM users WHERE id IN (${list})`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
