/**
 * Tests of the map effects (client/fx.js): the layer loads, founding, growing and conquering a
 * city, a battle and the events each start an effect over #map, the same picture drawn again
 * starts nothing new, „Animationen: Keine" switches everything off, no page errors. Screenshots
 * of the effects land in tests/fx/shots (not checked in), to look at after changes.
 *
 *   docker compose -f docker-compose.local.yml up -d
 *   npm i --no-save playwright-core
 *   node tests/fx/fx.test.js [http://localhost:3000]
 *
 * Uses an installed Chrome or Edge (no browser download); set HOCHCIV_BROWSER to its path if
 * it is not found.
 */
const { chromium, firefox } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const URL = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/?app=1';
const SHOTS = path.join(__dirname, 'shots');
const BROWSER = process.env.HOCHCIV_BROWSER || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
let failed = 0;
const ok = (cond, name, info) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); if (!cond) failed++; };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: BROWSER });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' && m.text().startsWith('[FX]')) errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('hochciv.save'));
  await page.goto(URL, { waitUntil: 'networkidle' });
  ok(await page.evaluate(() => !!window.HCFX), 'effects loaded');

  await page.click('#m-new');
  await page.evaluate(() => { const st = document.getElementById('setup-start'); st.value = '0'; st.onchange(); });
  await page.evaluate(() => document.getElementById('setup-go').click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { HCFX.clear(); redraw(); });
  ok(await page.evaluate(() => !!document.querySelector('#map-host canvas.hcfx-layer')), 'canvas over the map');
  ok(await page.evaluate(() => HCFX.active === 0), 'the first picture starts nothing');

  const shot = async name => { await page.waitForTimeout(name.endsWith('-late') ? 900 : 450); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const settle = () => page.evaluate(() => { HCFX.clear(); redraw(); });

  // a free land field next to the first city of the human player
  const spot = await page.evaluate(() => {
    const own = S.cities.find(c => c.owner === 0) || S.cities[0];
    const taken = new Set(S.cities.map(c => c.r + ',' + c.c));
    for (let d = 2; d < 6; d++) for (let r = own.r - d; r <= own.r + d; r++) for (let c = own.c - d; c <= own.c + d; c++) {
      const t = (S.map.rows[r] || '')[c];
      if (t && 'GWH'.includes(t) && !taken.has(r + ',' + c)) return { r, c };
    }
    return null;
  });
  ok(!!spot, 'a free field for a new city', JSON.stringify(spot));

  // founding
  await page.evaluate(({ r, c }) => {
    const own = S.cities.find(x => x.owner === 0) || S.cities[0];
    S.cities.push(Object.assign(JSON.parse(JSON.stringify(own)), { id: 'fx-test', r, c, pop: 1, cap: false }));
    redraw();
  }, spot);
  ok(await page.evaluate(() => HCFX.active > 0), 'a new city starts an effect');
  await shot('found');
  await page.evaluate(() => redraw());
  await shot('found-late');
  ok(await page.evaluate(() => HCFX.active <= 1), 'drawing the same picture again starts nothing new', 'active ' + await page.evaluate(() => HCFX.active));
  await settle();

  // growing
  await page.evaluate(() => { S.cities.find(c => c.id === 'fx-test').pop += 2; redraw(); });
  ok(await page.evaluate(() => HCFX.active > 0), 'a growing city starts an effect');
  await shot('grow');
  await settle();

  // conquering
  await page.evaluate(() => { S.cities.find(c => c.id === 'fx-test').owner = 1; redraw(); });
  ok(await page.evaluate(() => HCFX.active > 0), 'a conquered city starts an effect');
  await shot('taken');
  await settle();

  // scenes of another empire's turn (animDraw): effects last as long as the scene, the next ends them
  const sceneRes = await page.evaluate(async () => {
    const svg = document.getElementById('map');
    const ct = S.cities.find(c => c.id === 'fx-test');
    const draw = (s, st) => drawMap(svg, S.map, { state: st, turn: -1, anim: s });
    const s1 = { tempo: 0.4, zuege: [], ringe: [], marken: [], felder: [] }, s2 = Object.assign({}, s1);
    const st1 = Object.assign({}, S, { cities: S.cities.map(c => c.id === ct.id ? Object.assign({}, c, { pop: c.pop + 1 }) : c) });
    draw(s1, st1);
    const a = HCFX.active;
    const st2 = Object.assign({}, st1, { cities: st1.cities.map(c => c.id === ct.id ? c : c) });
    draw(s2, st2);                                   // next scene, nothing new: the effect of scene 1 ends
    const b = HCFX.active;
    draw(s1, st1);                                   // (back to a picture of scene 1: no new effect, nothing changed)
    st1.cities.find(c => c.id === ct.id).pop += 1;
    draw(s1, st1);
    await new Promise(r => setTimeout(r, ANIM_MS * 0.4 + 150));
    const c = HCFX.active;
    redraw();
    return [a, b, c];
  });
  ok(sceneRes[0] > 0 && sceneRes[1] === 0, 'the next scene ends the effects of the scene before', sceneRes.join(' / '));
  ok(sceneRes[2] === 0, 'an effect in a short scene ends with the scene', sceneRes.join(' / '));
  await settle();

  // a battle, as combatDraw draws it (redrawn in between, as on resize)
  const fight = { ...spot, von: [[spot.r, spot.c - 1], [spot.r - 1, spot.c]] };
  await page.evaluate(f => {
    const opts = () => ({ state: S, turn: -1, fight: { pi: 0, gegner: 1, r: f.r, c: f.c, von: f.von, a: 7, d: 4, sieg: true, genommen: true, caption: 'Test' } });
    drawMap(document.getElementById('map'), S.map, opts());
    window.__fxCount = HCFX.active;
    drawMap(document.getElementById('map'), S.map, opts());
  }, fight);
  ok(await page.evaluate(() => window.__fxCount > 0 && HCFX.active === window.__fxCount), 'a battle starts one effect, also when redrawn');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, 'battle-shots.png') });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'battle-hit.png') });
  await settle();
  await page.evaluate(f => drawMap(document.getElementById('map'), S.map, { state: S, turn: -1, fight: { pi: 1, gegner: 0, r: f.r, c: f.c, von: f.von, a: 3, d: 6, sieg: false, caption: 'Test 2' } }), fight);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'battle-held.png') });
  await settle();

  // events
  for (const k of ['sturmflut', 'vulkan', 'waldbrand', 'pest', 'erdbeben', 'duerre', 'barbaren', 'revolution', 'dunkles_zeitalter', 'lawinen', 'hochwasser', 'wirtschaftskrise']) {
    const started = await page.evaluate(k => {
      const ct = S.cities.find(c => c.owner === 0);
      if (k === 'barbaren') S.barbs = [{ cityId: ct.id, owner: 0, power: 5 }];
      S.ev = true;
      S.event = { round: S.round, row: ct.r, col: ct.c, k };
      redraw();
      const n = HCFX.active;
      redraw();
      return [n, HCFX.active];
    }, k);
    ok(started[0] > 0 && started[1] === started[0], `event ${k}: an effect, once`, started.join(' → '));
    await shot('event-' + k);
    await page.evaluate(() => { S.event = null; S.barbs = []; });
    await settle();
  }

  // off with „Animationen: Keine"
  await page.evaluate(() => { prefs.anim = 'aus'; S.cities.find(c => c.id === 'fx-test').pop += 1; redraw(); });
  ok(await page.evaluate(() => HCFX.active === 0), 'nothing with Animationen: Keine');
  await page.evaluate(() => { prefs.anim = 'langsam'; S.cities = S.cities.filter(c => c.id !== 'fx-test'); redraw(); });

  ok(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));

  // big and wide screens: the game zooms the page (html{zoom}), the effect must still sit on the
  // city. Firefox too (it gets getScreenCTM wrong under zoom) – when Playwright's Firefox is
  // installed (node node_modules/playwright-core/cli.js install firefox), else skipped.
  let fox = null;
  try { fox = await firefox.launch(); } catch (e) { console.log('SKIP  Firefox (not installed)'); }
  const screens = [[browser, 1920, 1080, 0, 1], [browser, 2560, 1080, 0, 1], [browser, 1920, 1080, -400, 1], [browser, 1280, 800, 0, 1], [browser, 1536, 864, 0, 1.25]];
  if (fox) screens.push([fox, 1920, 1080, 0, 1], [fox, 1920, 1080, -400, 1]);
  for (const [br, vw0, vh, wheel, dsf] of screens) {
    const vw = vw0, tag = br === fox ? ' Firefox' : '';
    const p2 = await (await br.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, locale: 'de-DE' })).newPage();
    await p2.goto(URL, { waitUntil: 'networkidle' });
    await p2.evaluate(() => localStorage.removeItem('hochciv.save'));
    await p2.goto(URL, { waitUntil: 'networkidle' });
    await p2.click('#m-new');
    await p2.evaluate(() => { const st = document.getElementById('setup-start'); st.value = '0'; st.onchange(); });
    await p2.evaluate(() => document.getElementById('setup-go').click());
    await p2.waitForTimeout(1500);
    if (wheel) { await p2.mouse.move(vw / 2, vh / 2); await p2.mouse.wheel(0, wheel); await p2.waitForTimeout(400); }
    await p2.evaluate(() => HCFX.cityGrow(S.cities[0].r, S.cities[0].c, '#f00', 1, false));
    await p2.waitForTimeout(100);
    const at = await p2.evaluate(() => {
      const world = document.querySelector('#map #world'), ct = S.cities[0], [x, y] = hexCenter(ct.r, ct.c, HEX);
      const circ = [...world.querySelectorAll('circle')].find(c => +c.getAttribute('cx') === x && +c.getAttribute('cy') === y);
      if (!circ) return null;
      const b = circ.getBoundingClientRect(), sr = document.getElementById('map').getBoundingClientRect();
      const cr = document.querySelector('.hcfx-layer').getBoundingClientRect();
      return { city: [b.left + b.width / 2, b.top + b.height / 2], fx: HCFX.toScreen(ct.r, ct.c), cover: Math.max(Math.abs(sr.left - cr.left), Math.abs(sr.top - cr.top), Math.abs(sr.width - cr.width), Math.abs(sr.height - cr.height)) };
    });
    const off = at && at.fx ? Math.hypot(at.city[0] - at.fx[0], at.city[1] - at.fx[1]) : Infinity;
    ok(off < 3, `${vw}x${vh}${wheel ? ' zoomed' : ''}${tag}: the effect sits on the city`, at && `${off.toFixed(1)} px off`);
    ok(at && at.cover < 2, `${vw}x${vh}${wheel ? ' zoomed' : ''}${tag}: the canvas covers the map`, at && `${at.cover.toFixed(1)} px`);

    // a field overlay, checked on the picture: the storm surge darkens the sea fields where the map
    // shows them (their polygons' boxes), more than the same points moved by one field
    await p2.evaluate(() => { HCFX.clear(); S.ev = true; S.event = null; redraw(); });
    await p2.mouse.move(1, 1);
    await p2.waitForTimeout(200);
    const before = (await p2.screenshot({ scale: 'css' })).toString('base64');
    const sea = await p2.evaluate(() => {
      const own = S.cities.find(c => c.owner === 0);
      S.event = { round: S.round, row: own.r, col: own.c, k: 'sturmflut' };
      redraw();
      return [...document.querySelectorAll('#map polygon[data-r]')]
        .filter(p => S.map.rows[+p.dataset.r][+p.dataset.c] === 'M')
        .map(p => { const b = p.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width]; })
        .filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('#map'); });   // not under the bars
    });
    await p2.waitForTimeout(1300);
    const during = (await p2.screenshot({ scale: 'css' })).toString('base64');
    const score = await p2.evaluate(async ({ before, during, sea }) => {
      const px = async b64 => {
        const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height);
      };
      const A = await px(before), B = await px(during);
      const diff = (x, y) => {
        let s = 0, n = 0;
        for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
          const X = Math.round(x + dx), Y = Math.round(y + dy);
          if (X < 0 || Y < 0 || X >= A.width || Y >= A.height) continue;
          const i = (Y * A.width + X) * 4;
          s += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); n++;
        }
        return n ? s / n : 0;
      };
      const H = sea[0] ? sea[0][2] : 40;
      const at = (sx, sy) => sea.reduce((a, [x, y]) => a + diff(x + sx * H, y + sy * H * 0.86), 0) / (sea.length || 1);
      const moved = [[1, 0], [-1, 0], [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1]].map(([x, y]) => at(x, y));
      return { here: at(0, 0), moved: Math.max(...moved), tinted: sea.filter(([x, y]) => diff(x, y) > 25).length / (sea.length || 1) };
    }, { before, during, sea });
    ok(sea.length > 5 && score.here > score.moved * 1.2, `${vw}x${vh}${wheel ? ' zoomed' : ''}${tag}: the storm surge lies on the sea fields`, `${score.here.toFixed(0)} here, ${score.moved.toFixed(0)} one field off`);
    ok(score.tinted > 0.95, `${vw}x${vh}${wheel ? ' zoomed' : ''}${tag}: every sea field tinted`, `${(score.tinted * 100).toFixed(0)} %`);
    await p2.evaluate(() => { HCFX.clear(); S.event = null; redraw(); });
    await p2.context().close();
  }
  if (fox) await fox.close();
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
