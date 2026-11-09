/**
 * Interaction tests of the mobile layer (client/mobile) on a phone-sized viewport with touch:
 * zoom and pan, taps vs. drags, the field next to its sheet, the action bar, tech tree tabs, the
 * view during KI turns, landscape. Held upright, the game (since v102) turns the page by 90° –
 * positions on the map are converted with HochcivMobile.frame / toScreen. Run after changes to client/mobile and after every game update
 * (the layer hooks into the game, see the list at the top of mobile.js).
 *
 *   docker compose -f docker-compose.local.yml up -d
 *   npm i --no-save playwright-core
 *   node tests/mobile/mobile.test.js [http://localhost:3000]
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/?app=1';
const BROWSER = process.env.HOCHCIV_BROWSER || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
let failed = 0;
const ok = (cond, name, info) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch({ executablePath: BROWSER });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'de-DE' });
  /* Map helpers in the page: the page frame (turned back when the game turned the page) and the
     screen point of a field. */
  await ctx.addInitScript(() => {
    window.__mapFrame = () => {
      const svg = document.getElementById('map'), r = HochcivMobile.frame(svg.getBoundingClientRect()), b = svg.viewBox.baseVal;
      return { r, b, k: r.width / b.width };
    };
    window.__inFrame = (row, col) => { const { r, b, k } = __mapFrame(), [mx, my] = hexCenter(row, col, 30); return [r.left + (mx - b.x) * k, r.top + (my - b.y) * k]; };
    window.__onScreen = (row, col) => HochcivMobile.toScreen(...__inFrame(row, col));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('hochciv.save'));
  await page.goto(URL, { waitUntil: 'networkidle' });
  ok(await page.evaluate(() => !!window.HochcivMobile), 'layer loaded');

  await page.click('#m-new');
  // since v99 the start player is random by default; the steps below need the human on turn
  await page.evaluate(() => { const st = document.getElementById('setup-start'); st.value = '0'; st.onchange(); });
  await page.evaluate(() => document.getElementById('setup-go').click());
  await page.waitForTimeout(1500);
  const vb = () => page.evaluate(() => document.getElementById('map').getAttribute('viewBox').split(' ').map(Number));
  const sheetOpen = () => page.evaluate(() => document.getElementById('sheet').classList.contains('open'));
  const host = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });

  const v0 = await vb();
  const whole = await page.evaluate(() => { const v = HochcivMobile.views.get(document.getElementById('map')); return [v.W, v.H]; });
  ok(v0[2] < whole[0] * 0.9 || v0[3] < whole[1] * 0.9, 'game map starts zoomed in on a phone', `view ${Math.round(v0[2])}x${Math.round(v0[3])} of ${whole.map(Math.round).join('x')}`);
  ok(await page.evaluate(() => HochcivMobile.turned()), 'held upright, the game turns the page (v102+)');
  const hexPx = await page.evaluate(() => Math.sqrt(3) * 30 * __mapFrame().k);
  ok(hexPx >= 43.5, 'hexes are touch-sized', `${hexPx.toFixed(1)} px`);

  // drag with touch via CDP (pointer events of type touch)
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  const cx = host.x + host.w / 2, cy = host.y + host.h / 2;
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - i * 15, cy - i * 10]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const v1 = await vb();
  ok(Math.abs(v1[0] - v0[0]) > 20 || Math.abs(v1[1] - v0[1]) > 20, 'drag pans the map', `dx ${Math.round(v1[0] - v0[0])} dy ${Math.round(v1[1] - v0[1])}`);
  ok(!(await sheetOpen()), 'a drag does not open a field');

  // pinch out
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 40 - i * 12, cy], [cx + 40 + i * 12, cy]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const v2 = await vb();
  ok(v2[2] < v1[2] * 0.8, 'pinch zooms in', `${Math.round(v1[2])} -> ${Math.round(v2[2])}`);
  ok(!(await sheetOpen()), 'a pinch does not open a field');

  // wheel zooms out
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  const v3 = await vb();
  ok(v3[2] > v2[2], 'mouse wheel zooms out', `${Math.round(v2[2])} -> ${Math.round(v3[2])}`);

  // "home" button returns to the capital, a tap opens the field
  await page.click('.m-zoom [data-z="home"]');            // whole map
  await page.click('.m-zoom [data-z="home"]');            // back to the capital
  await page.waitForTimeout(200);
  const capScreen = await page.evaluate(() => { const c = capitalOf(S, S.cur); return __onScreen(c.r, c.c); });
  await page.touchscreen.tap(capScreen[0], capScreen[1]);
  await page.waitForTimeout(400);
  ok(await sheetOpen(), 'a tap on the capital opens its sheet');
  ok(await page.evaluate(() => /Hauptstadt/.test(document.getElementById('sheet-body').textContent)), 'it is the city sheet');

  // a field under the sheet (bottom or side): after its sheet opened, it must be beside it
  await page.evaluate(() => closeSheet());
  await page.touchscreen.tap(capScreen[0], capScreen[1]);
  await page.waitForTimeout(400);
  const sheetBox = await page.evaluate(() => HochcivMobile.frame(document.getElementById('sheet').getBoundingClientRect()));
  await page.evaluate(() => closeSheet());
  await page.waitForTimeout(300);
  const low = await page.evaluate(sb => {
    const { r } = __mapFrame();
    // the visible field deepest inside the area the sheet covers
    let best = null;
    document.getElementById('map').querySelectorAll('[data-r]').forEach(el => {
      const [x, y] = __inFrame(+el.dataset.r, +el.dataset.c);
      if (x < r.left + 30 || x > r.right - 30 || y < r.top + 30 || y > r.bottom - 30) return;
      if (x < sb.left + 20 || x > sb.right - 20 || y < sb.top + 20 || y > sb.bottom - 20) return;
      const depth = Math.min(x - sb.left, sb.right - x, y - sb.top, sb.bottom - y);
      if (!best || depth > best.depth) best = { depth, r: +el.dataset.r, c: +el.dataset.c };
    });
    return best;
  }, sheetBox);
  if (!low) ok(false, 'a field under the sheet to test with');
  else {
    const at = await page.evaluate(([r0, c0]) => __onScreen(r0, c0), [low.r, low.c]);
    await page.touchscreen.tap(at[0], at[1]);
    await page.waitForTimeout(600);
    const pos = await page.evaluate(([r0, c0]) => {
      const [x, y] = __inFrame(r0, c0), s = HochcivMobile.frame(document.getElementById('sheet').getBoundingClientRect());
      return { x, y, s, open: document.getElementById('sheet').classList.contains('open'), under: x > s.left - 10 && x < s.right + 10 && y > s.top - 10 && y < s.bottom + 10 };
    }, [low.r, low.c]);
    ok(pos.open && !pos.under, 'a selected field is moved out from under its sheet', `field ${Math.round(pos.x)},${Math.round(pos.y)} / sheet ${Math.round(pos.s.left)}-${Math.round(pos.s.right)} x ${Math.round(pos.s.top)}-${Math.round(pos.s.bottom)}`);
  }
  await page.evaluate(() => closeSheet());

  // action bar (v102+): five buttons, all shown, no "Mehr"; Welt is the name in the Kopfzeile
  const bar = await page.evaluate(() => [...document.querySelectorAll('.actionbar > button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.id));
  ok(bar.join() === 'a-tech,a-found,a-power,a-abil,a-end', 'action bar: all five actions, no "Mehr"', bar.join(' / '));
  await page.click('#hud-civ');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('overlay').classList.contains('show') && /Welt|World/.test(document.getElementById('ov-title').textContent)), 'the name in the Kopfzeile opens the world sheet');
  await page.evaluate(() => closeModal());

  // tech tree: the turned phone has the landscape layout – all columns, no tabs (those are for
  // the narrow layout, which v100/v98 still use in the Android app)
  await page.click('#a-tech');
  await page.waitForTimeout(300);
  const tech = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.m-tabs')].filter(t => getComputedStyle(t).display !== 'none').length,
    cols: [...document.querySelectorAll('.techgrid .techcol')].filter(c => c.offsetParent).length,
  }));
  ok(tech.tabs === 0 && tech.cols >= 16, 'turned phone: tech tree with all columns, no tabs', JSON.stringify(tech));
  await page.evaluate(() => closeModal());

  // the view must not jump to a KI's capital during its turn
  const before = await vb();
  await page.evaluate(() => document.getElementById('a-end').click());
  await page.waitForTimeout(2500);
  const after = await vb();
  ok(Math.abs(after[0] - before[0]) < 1 && Math.abs(after[1] - before[1]) < 1, 'view stays put during KI turns', before.map(Math.round) + ' -> ' + after.map(Math.round));

  // rotation keeps a moved view, resizes cleanly
  await page.setViewportSize({ width: 915, height: 412 });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.documentElement.classList.contains('w-side') && !document.documentElement.classList.contains('w-narrow')), 'landscape: side layout');
  ok(await page.evaluate(() => !document.getElementById('a-more') && [...document.querySelectorAll('.actionbar > button')].every(b => getComputedStyle(b).display !== 'none')), 'landscape: all actions, no "Mehr"');

  // multiplayer menu: the new games are equally wide, one below the other and side by side
  await page.evaluate(() => MP.showLobby());
  await page.waitForSelector('.mph-new');
  for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    const cards = await page.$$eval('.mph-new > *', els => els.map(e => Math.round(HochcivMobile.frame(e.getBoundingClientRect()).width)));
    ok(cards.length >= 2 && new Set(cards).size === 1, `multiplayer menu: game cards equally wide at ${vp.width}x${vp.height}`, cards.join(' / '));
  }

  // login bar of the main menu, logged in with a long name: nothing sticks out, nothing is covered
  for (const vp of [{ width: 360, height: 780 }, { width: 915, height: 412 }]) {
    await page.setViewportSize(vp);
    await page.goto(URL, { waitUntil: 'networkidle' });
    const bar = await page.evaluate(async () => {
      MP.fetchUser = async function () { this.user = { username: 'Hochzeitsplaner_Wolfram2026', mmr: 1234, gamesPlayed: 187 }; };
      await MP.renderMainMenuAuth();
      const el = document.getElementById('mp-main-auth-container'), r = el.getBoundingClientRect();
      const w = document.documentElement.clientWidth, eb = document.querySelector('#screen-menu .title').getBoundingClientRect();
      return {
        overflow: [...el.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > w + 1),
        covers: eb.top < r.bottom - 1 && eb.bottom > r.top,
        buttons: [...el.querySelectorAll('.btn')].every(b => b.getBoundingClientRect().height < 48),
      };
    });
    ok(!bar.overflow && !bar.covers && bar.buttons, `login bar fits at ${vp.width}x${vp.height}`, JSON.stringify(bar));
  }

  // (the tutorial with its highlighted fields is gone since v102 – mobile.js keeps that part for v100/v98)

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
