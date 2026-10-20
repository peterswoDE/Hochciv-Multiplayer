/**
 * Interaction tests of the mobile layer (client/mobile) on a phone-sized viewport with touch:
 * zoom and pan, taps vs. drags, the field next to its sheet, "Mehr", tech tree tabs, the view
 * during KI turns, landscape. Run after changes to client/mobile and after every game update
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
  // as in the Android app: no self-rotation of the game
  await ctx.addInitScript(() => { try { localStorage.setItem('hochciv.noturn', 'true'); } catch (e) { } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('hochciv.save'));
  await page.goto(URL, { waitUntil: 'networkidle' });
  ok(await page.evaluate(() => !!window.HochcivMobile), 'layer loaded');

  await page.click('#m-new');
  await page.evaluate(() => document.getElementById('setup-go').click());
  await page.waitForTimeout(1500);
  const vb = () => page.evaluate(() => document.getElementById('map').getAttribute('viewBox').split(' ').map(Number));
  const sheetOpen = () => page.evaluate(() => document.getElementById('sheet').classList.contains('open'));
  const host = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });

  const v0 = await vb();
  ok(v0[2] < 1000, 'game map starts zoomed in on a phone', `view ${Math.round(v0[2])}x${Math.round(v0[3])}`);
  const hexPx = await page.evaluate(() => Math.sqrt(3) * 30 * document.getElementById('map').getBoundingClientRect().width / document.getElementById('map').viewBox.baseVal.width);
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
  const capScreen = await page.evaluate(() => {
    const svg = document.getElementById('map'), c = capitalOf(S, S.cur), [mx, my] = hexCenter(c.r, c.c, 30);
    const r = svg.getBoundingClientRect(), b = svg.viewBox.baseVal, k = r.width / b.width;
    return [r.left + (mx - b.x) * k, r.top + (my - b.y) * k];
  });
  await page.touchscreen.tap(capScreen[0], capScreen[1]);
  await page.waitForTimeout(400);
  ok(await sheetOpen(), 'a tap on the capital opens its sheet');
  ok(await page.evaluate(() => /Hauptstadt/.test(document.getElementById('sheet-body').textContent)), 'it is the city sheet');

  // a field near the bottom: after its sheet opened, it must be above the sheet
  await page.evaluate(() => closeSheet());
  const low = await page.evaluate(() => {
    const svg = document.getElementById('map'), r = svg.getBoundingClientRect(), b = svg.viewBox.baseVal, k = r.width / b.width;
    // the lowest visible field in the middle column of the view
    let best = null;
    svg.querySelectorAll('[data-r]').forEach(el => {
      const [mx, my] = hexCenter(+el.dataset.r, +el.dataset.c, 30);
      const x = r.left + (mx - b.x) * k, y = r.top + (my - b.y) * k;
      if (x > r.left + 60 && x < r.right - 60 && y < r.bottom - 40 && (!best || y > best.y)) best = { x, y, r: +el.dataset.r, c: +el.dataset.c };
    });
    return best;
  });
  await page.touchscreen.tap(low.x, low.y);
  await page.waitForTimeout(600);
  const pos = await page.evaluate(([r0, c0]) => {
    const svg = document.getElementById('map'), r = svg.getBoundingClientRect(), b = svg.viewBox.baseVal, k = r.width / b.width;
    const [mx, my] = hexCenter(r0, c0, 30);
    return { y: r.top + (my - b.y) * k, sheetTop: document.getElementById('sheet').getBoundingClientRect().top };
  }, [low.r, low.c]);
  ok(pos.y < pos.sheetTop - 10, 'a selected field is moved above its sheet', `field ${Math.round(pos.y)} / sheet ${Math.round(pos.sheetTop)}`);
  await page.evaluate(() => closeSheet());

  // "Mehr" menu
  await page.click('#a-more');
  ok(await page.evaluate(() => !document.getElementById('m-more-menu').hidden), '"Mehr" opens its menu');
  const items = await page.evaluate(() => [...document.querySelectorAll('#m-more-menu .btn')].map(b => b.textContent.trim()));
  ok(items.length === 3, 'menu has Fähigkeiten, Welt, Protokoll', items.join(' / '));
  await page.click('#m-more-menu .btn:nth-child(2)');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('overlay').classList.contains('show') && /Welt|World/.test(document.getElementById('ov-title').textContent)), '"Welt" from the menu opens the world sheet');
  ok(await page.evaluate(() => document.getElementById('m-more-menu').hidden), 'menu closes after a choice');
  await page.evaluate(() => closeModal());

  // tech tabs
  await page.click('#a-tech');
  await page.waitForTimeout(300);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.m-tabs button')].map(b => b.textContent.trim()));
  ok(tabs.length === 4, 'tech tree has 4 tabs', tabs.join(' / '));
  const visibleCols = () => page.evaluate(() => [...document.querySelectorAll('.techgrid .techcol')].filter(c => c.offsetParent).map(c => [...c.classList].find(x => x.startsWith('m-f'))));
  await page.click('.m-tabs button:nth-child(4)');
  const vis = await visibleCols();
  ok(vis.length === 4 && vis.every(f => f === 'm-f3'), 'Spezial tab shows only Spezial, all four eras', vis.join(','));
  const wide = await page.evaluate(() => document.querySelector('.techgrid').scrollWidth <= document.getElementById('ov-body').clientWidth + 1);
  ok(wide, 'tech tree fits the width');
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
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('a-more')).display === 'none' && getComputedStyle(document.getElementById('a-log')).display !== 'none'), 'landscape: all 7 actions, no "Mehr"');

  ok(errors.length === 0, 'no page errors', errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
