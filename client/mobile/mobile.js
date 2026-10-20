/*
 * HochCiv mobile layer – injected after the game and mp.js (inject.js), styles in mobile.css.
 * The game files stay untouched; everything here builds on the game's globals.
 *
 *  1. Zoom and pan for every map (game, start tile, draft, editor) on every screen size:
 *     pinch, drag, mouse wheel, and buttons + / − / ⌖ (whole map ↔ own capital).
 *  2. Narrow screens (html.w-narrow, set by ui.js below 600 px):
 *     – action bar "4 + Mehr": Fähigkeiten, Welt and Protokoll move into a small menu
 *     – tech tree with one tab per column (Forschung / Produktion / Militär / Spezial)
 *  3. A field selected under a sheet is moved into view next to it.
 *  4. Short screens: the editor starts with its settings folded.
 *  5. Tutorial: fields it highlights are brought into view.
 *
 * Hooks into the game – check these when the game is updated:
 *   drawMap(svg, map, opts)   wrapped: re-applies the zoom after every redraw
 *   openTile(r, c)            wrapped: keeps the selected field (ui.sel) visible next to its sheet
 *   editorScreen()            wrapped: folds the settings on short screens
 *   used: HEX, hexCenter, capitalOf, tutHighlight, ui.sel, ui.tut, S, MP, LANG, #a-abil/#a-info/#a-log/#a-end,
 *         #a-abil-n, #ov-body, .techgrid > .techcol (4 per era, h4 = field name in era 1)
 */
(function () {
  'use strict';
  if (window.HochcivMobile || typeof drawMap !== 'function' || typeof HEX === 'undefined') return;

  const $id = id => document.getElementById(id);
  const de = () => typeof LANG === 'undefined' || LANG === 'de';
  const narrow = () => document.documentElement.classList.contains('w-narrow');

  /* ------------------------------------------------------------------ 1. zoom and pan */

  const HEX_W = Math.sqrt(3) * HEX;   // width of a hex in map units
  const MIN_HEX_PX = 44;              // default zoom: a hex at least this wide (touch target) …
  const FIT_OK_PX = 36;               // … unless the whole map already gives hexes this big (tablet)
  const MAX_HEX_PX = 130;
  const views = new Map();            // svg -> view {W, H, k, cx, cy, key, auto}

  function hostRect(svg) { return svg.getBoundingClientRect(); }
  function kFit(v, r) { return Math.min(r.width / v.W, r.height / v.H); }
  function kMax(v, r) { return Math.max(kFit(v, r), MAX_HEX_PX / HEX_W); }
  function kDefault(v, r) {
    const fit = kFit(v, r);
    if (fit * HEX_W >= FIT_OK_PX) return fit;
    return Math.min(kMax(v, r), Math.max(fit, MIN_HEX_PX / HEX_W));
  }

  /** Whose capital the map starts on: your seat online, else the human at the move, else the
   *  first human – never a KI or bot whose turn it happens to be. */
  function homePlayer() {
    if (typeof MP !== 'undefined' && MP && MP.active && MP.playerIndex != null) return MP.playerIndex;
    const cur = S.players[S.cur];
    if (cur && cur.kind === 'human') return S.cur;
    const i = S.players.findIndex(p => p.kind === 'human');
    return i >= 0 ? i : S.cur;
  }

  /** Map point of the own capital (game map only), else the middle of the map. */
  function homePoint(svg, v) {
    try {
      if (svg.id === 'map' && typeof S !== 'undefined' && S && typeof capitalOf === 'function') {
        const cap = capitalOf(S, homePlayer());
        if (cap) return hexCenter(cap.r, cap.c, HEX);
      }
    } catch (e) { /* no game yet */ }
    return [v.W / 2, v.H / 2];
  }

  /* The map may be pulled past its edge by a third of the view – so a field at the edge can
     still be moved next to a sheet (revealSelection) – but never out of sight. */
  const SLACK = 0.34;
  function clampAxis(c, view, size, slack) {
    const s = view * slack;
    const lo = Math.min(view / 2, size / 2) - s, hi = Math.max(size - view / 2, size / 2) + s;
    return Math.min(hi, Math.max(lo, c));
  }
  function clampView(v, r) {
    v.k = Math.min(kMax(v, r), Math.max(kFit(v, r), v.k));
    // an untouched view sits exactly: a fully visible map is centred, a zoomed one stays inside
    const slack = v.auto ? 0 : SLACK;
    v.cx = clampAxis(v.cx, r.width / v.k, v.W, slack);
    v.cy = clampAxis(v.cy, r.height / v.k, v.H, slack);
  }

  function applyView(svg) {
    const v = views.get(svg), r = hostRect(svg);
    if (!v || !r.width || !r.height) return;
    if (v.auto) {                     // untouched by the player: follow size changes (rotation)
      v.k = kDefault(v, r);
      if (!v.homed) {                 // centre once – the capital may only exist after placing
        const home = homePoint(svg, v);
        [v.cx, v.cy] = home;
        v.homed = home[0] !== v.W / 2 || home[1] !== v.H / 2 || svg.id !== 'map';
      }
    }
    clampView(v, r);
    const vw = r.width / v.k, vh = r.height / v.k;
    svg.setAttribute('viewBox', `${v.cx - vw / 2} ${v.cy - vh / 2} ${vw} ${vh}`);
    updateControls(svg, v, r);
  }

  /** Called after the game drew a map: it set viewBox "0 0 W H" for the whole map. */
  function afterDraw(svg) {
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) return;
    const W = vb[2], H = vb[3];
    // Same map size and the same empires = the same game (S.seed is the dice state, it changes
    // with every roll; online S is a new object with every update).
    const game = svg.id === 'map' && typeof S !== 'undefined' && S && S.players
      ? S.players.map(p => p.civ).join(',') + (S.map && S.map.name ? '@' + S.map.name : '') : '';
    const key = `${W}x${H}:${game}`;
    let v = views.get(svg);
    if (!v || v.key !== key) {
      v = { W, H, k: 1, cx: W / 2, cy: H / 2, key, auto: true };
      views.set(svg, v);
      attachGestures(svg);
    }
    applyView(svg);
  }

  /** Tutorial: when it highlights new fields (gold frame) that are out of view, bring them in –
   *  centred on them, zoomed out as far as needed to show all of them. */
  let lastTutHl = '';
  function showTutorialFields(svg) {
    if (svg.id !== 'map' || typeof ui === 'undefined' || !ui || !ui.tut || typeof tutHighlight !== 'function') return;
    const hl = tutHighlight() || [];
    const key = JSON.stringify(hl);
    if (key === lastTutHl) return;
    lastTutHl = key;
    const v = views.get(svg), r = hostRect(svg);
    if (!v || !hl.length || !r.width) return;
    const pts = hl.map(([row, col]) => hexCenter(row, col, HEX));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs) - HEX, x1 = Math.max(...xs) + HEX, y0 = Math.min(...ys) - HEX, y1 = Math.max(...ys) + HEX;
    const vw = r.width / v.k, vh = r.height / v.k;
    const inView = x0 >= v.cx - vw / 2 && x1 <= v.cx + vw / 2 && y0 >= v.cy - vh / 2 && y1 <= v.cy + vh / 2;
    if (inView) return;
    v.k = Math.min(v.k, r.width / (x1 - x0), r.height / (y1 - y0));
    v.cx = (x0 + x1) / 2; v.cy = (y0 + y1) / 2;
    v.auto = false;
    applyView(svg);
  }

  const origDrawMap = window.drawMap;
  window.drawMap = function (svg) {
    const out = origDrawMap.apply(this, arguments);
    try { afterDraw(svg); showTutorialFields(svg); } catch (e) { /* never break drawing */ }
    return out;
  };

  function toMap(svg, v, clientX, clientY) {
    const r = hostRect(svg);
    return [v.cx + (clientX - r.left - r.width / 2) / v.k, v.cy + (clientY - r.top - r.height / 2) / v.k];
  }

  /** Zoom to k, keeping the map point under (clientX, clientY) in place. */
  function zoomAt(svg, v, k, clientX, clientY) {
    const r = hostRect(svg);
    const [mx, my] = toMap(svg, v, clientX, clientY);
    v.k = Math.min(kMax(v, r), Math.max(kFit(v, r), k));
    v.cx = mx - (clientX - r.left - r.width / 2) / v.k;
    v.cy = my - (clientY - r.top - r.height / 2) / v.k;
    v.auto = false;
    applyView(svg);
  }

  function attachGestures(svg) {
    if (svg.dataset.mZoom) return;
    svg.dataset.mZoom = '1';
    svg.style.touchAction = 'none';
    const pts = new Map();
    let g = null, suppressClick = false;

    const onMove = e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const v = views.get(svg);
      if (!v || !g) return;
      const list = [...pts.values()];
      if (list.length >= 2 && g.pinch) {
        const [a, b] = list;
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const r = hostRect(svg);
        v.k = Math.min(kMax(v, r), Math.max(kFit(v, r), g.k * d / g.d));
        v.cx = g.mapX - (mx - r.left - r.width / 2) / v.k;
        v.cy = g.mapY - (my - r.top - r.height / 2) / v.k;
        v.auto = false; g.moved = true;
        applyView(svg);
      } else if (list.length === 1) {
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.moved && Math.hypot(dx, dy) < 8) return;
        g.moved = true; v.auto = false;
        v.cx = g.cx - dx / v.k; v.cy = g.cy - dy / v.k;
        applyView(svg);
      }
    };
    const onUp = e => {
      pts.delete(e.pointerId);
      if (pts.size === 1 && g) {        // pinch ended, one finger left: continue as a drag from here
        const [p] = [...pts.values()], v = views.get(svg);
        g = { x: p.x, y: p.y, cx: v.cx, cy: v.cy, moved: true };
      }
      if (pts.size === 0) {
        if (g && g.moved) suppressClick = true;
        g = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }
    };

    svg.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const v = views.get(svg);
      if (!v) return;
      suppressClick = false;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        g = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const [mapX, mapY] = toMap(svg, v, mx, my);
        g = { pinch: true, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), k: v.k, mapX, mapY, moved: true };
      }
    });
    // A drag or pinch ends with a click on the field under the finger – that is not a tap.
    // Capture on the host runs before the game's own click handler on the svg.
    svg.parentNode.addEventListener('click', e => {
      if (suppressClick && svg.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
      suppressClick = false;
    }, true);
    svg.addEventListener('wheel', e => {
      const v = views.get(svg);
      if (!v) return;
      e.preventDefault();
      zoomAt(svg, v, v.k * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(() => applyView(svg)).observe(svg);
    addControls(svg);
  }

  /* zoom buttons: + / − / ⌖ (whole map ↔ own capital) */
  function addControls(svg) {
    const host = svg.parentNode;
    const box = document.createElement('div');
    box.className = 'm-zoom';
    box.innerHTML = '<button type="button" data-z="in" aria-label="+">+</button>' +
      '<button type="button" data-z="out" aria-label="−">−</button>' +
      '<button type="button" data-z="home" aria-label="⌖">⌖</button>';
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-z]'), v = views.get(svg);
      if (!b || !v) return;
      const r = hostRect(svg), mx = r.left + r.width / 2, my = r.top + r.height / 2;
      if (b.dataset.z === 'in') zoomAt(svg, v, v.k * 1.5, mx, my);
      else if (b.dataset.z === 'out') zoomAt(svg, v, v.k / 1.5, mx, my);
      else {
        const fit = kFit(v, r);
        if (v.k > fit * 1.02) { v.k = fit; v.cx = v.W / 2; v.cy = v.H / 2; v.auto = false; }
        else { v.k = kDefault(v, r); [v.cx, v.cy] = homePoint(svg, v); v.auto = false; }
        applyView(svg);
      }
    });
    host.appendChild(box);
    svg._mZoomBox = box;
  }

  function updateControls(svg, v, r) {
    const box = svg._mZoomBox;
    if (!box) return;
    const fit = kFit(v, r), max = kMax(v, r);
    box.hidden = max / fit < 1.15;              // nothing to zoom (big screen, small map)
    box.querySelector('[data-z="in"]').disabled = v.k >= max * 0.999;
    box.querySelector('[data-z="out"]').disabled = v.k <= fit * 1.001;
    const home = box.querySelector('[data-z="home"]');
    home.title = v.k > fit * 1.02 ? (de() ? 'Ganze Karte' : 'Whole map') : (de() ? 'Zur Hauptstadt' : 'To the capital');
  }

  /* ------------------------------------------------------------------ 3. selection next to a sheet */

  /** If the selected field lies under the open sheet, move the map so it is next to it. */
  function revealSelection() {
    const svg = $id('map'), sh = $id('sheet'), v = views.get(svg);
    if (!svg || !v || !sh || !sh.classList.contains('open')) return;
    if (typeof ui === 'undefined' || !ui || !ui.sel) return;
    const r = hostRect(svg), s = sh.getBoundingClientRect();
    if (!r.width || !s.height) return;
    const [mx, my] = hexCenter(ui.sel[0], ui.sel[1], HEX);
    const x = r.left + r.width / 2 + (mx - v.cx) * v.k, y = r.top + r.height / 2 + (my - v.cy) * v.k;
    const pad = HEX * v.k;
    const covered = x > s.left - pad && x < s.right + pad && y > s.top - pad && y < s.bottom + pad;
    if (!covered) return;
    const bottomDocked = s.width >= r.width * 0.8;
    // centre of the free area: above a bottom sheet, left of a side sheet
    const fx = bottomDocked ? r.left + r.width / 2 : r.left + (s.left - r.left) / 2;
    const fy = bottomDocked ? r.top + (s.top - r.top) / 2 : r.top + r.height / 2;
    v.cx = mx - (fx - r.left - r.width / 2) / v.k;
    v.cy = my - (fy - r.top - r.height / 2) / v.k;
    v.auto = false;
    applyView(svg);
  }

  // Only the sheet of a field: other sheets (KI turn, power, abilities) leave the map alone.
  if (typeof window.openTile === 'function') {
    const origOpenTile = window.openTile;
    window.openTile = function () {
      const out = origOpenTile.apply(this, arguments);
      setTimeout(revealSelection, 220);          // after the sheet's slide-in (.18 s)
      return out;
    };
  }

  /* ------------------------------------------------------------------ 2a. action bar "4 + Mehr" */

  const MORE = ['a-abil', 'a-info', 'a-log'];

  function setupMore() {
    const end = $id('a-end');
    if (!end || $id('a-more')) return;
    const more = document.createElement('button');
    more.id = 'a-more';
    more.type = 'button';
    more.className = 'btn small';
    more.innerHTML = '<span class="m-more-label"></span><span class="bar-count" id="a-more-n" hidden></span>';
    end.parentNode.insertBefore(more, end);

    const menu = document.createElement('div');
    menu.id = 'm-more-menu';
    menu.hidden = true;
    document.body.appendChild(menu);

    const label = () => { more.querySelector('.m-more-label').textContent = de() ? 'Mehr' : 'More'; };
    label();

    const close = () => { menu.hidden = true; more.classList.remove('on'); };
    more.addEventListener('click', e => {
      e.stopPropagation();
      if (!menu.hidden) return close();
      label();
      menu.innerHTML = '';
      MORE.forEach(id => {
        const orig = $id(id);
        if (!orig) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        // label (translated by the game) and badge, without the original ids
        b.innerHTML = orig.innerHTML.replace(/\sid="[^"]*"/g, '');
        // mp.js blocks actions while it is not your turn (pointer-events on the original)
        b.disabled = orig.disabled || getComputedStyle(orig).pointerEvents === 'none';
        b.onclick = () => { close(); orig.click(); };
        menu.appendChild(b);
      });
      const r = more.getBoundingClientRect();
      menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      menu.hidden = false;
      more.classList.add('on');
    });
    document.addEventListener('pointerdown', e => {
      if (!menu.hidden && !menu.contains(e.target) && !more.contains(e.target)) close();
    }, true);
    window.addEventListener('resize', close);

    // The badge of "Fähigkeiten" (number of free actions) is shown on "Mehr".
    const src = $id('a-abil-n'), dst = $id('a-more-n');
    if (src && dst) {
      const sync = () => { dst.textContent = src.textContent; dst.hidden = src.hidden; };
      new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
      sync();
    }
  }

  /* ------------------------------------------------------------------ 2b. tech tree tabs */

  let lastTab = null;

  function tabify(grid) {
    const cols = [...grid.children].filter(el => el.classList.contains('techcol'));
    if (cols.length < 4) return;
    cols.forEach((c, i) => c.classList.add('m-f' + (i % 4)));
    const names = cols.slice(0, 4).map(c => { const h = c.querySelector('h4'); return h ? h.textContent : ''; });
    const affordable = f => !!grid.querySelector(`.m-f${f} .tech.avail.afford`);
    const bar = document.createElement('div');
    bar.className = 'm-tabs';
    bar.setAttribute('role', 'tablist');
    const select = f => {
      lastTab = f;
      grid.dataset.tab = f;
      bar.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === f)));
    };
    names.forEach((n, f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.innerHTML = `<span>${n.replace(/</g, '&lt;')}</span>` + (affordable(f) ? '<i class="m-dot"></i>' : '');
      b.onclick = () => select(f);
      bar.appendChild(b);
    });
    grid.classList.add('m-tabbed');
    grid.parentNode.insertBefore(bar, grid);
    let start = lastTab;
    if (start === null || start > 3) start = [0, 1, 2, 3].find(affordable);
    select(start === undefined ? 0 : start);
  }

  function tabifyAll(root) {
    (root || document).querySelectorAll('.techgrid:not(.m-tabbed)').forEach(tabify);
  }

  /* ------------------------------------------------------------------ 4. editor on short screens */

  if (typeof window.editorScreen === 'function') {
    const origEditor = window.editorScreen;
    window.editorScreen = function () {
      const out = origEditor.apply(this, arguments);
      if (window.innerHeight < 560) document.querySelectorAll('#screen-editor details[open]').forEach(d => { d.open = false; });
      return out;
    };
  }

  /* ------------------------------------------------------------------ start */

  function init() {
    document.documentElement.classList.add('m-layer');
    setupMore();
    const ov = $id('ov-body');
    if (ov) new MutationObserver(() => tabifyAll(ov)).observe(ov, { childList: true });
    tabifyAll();
    // maps drawn before this script ran (e.g. a game continued at boot)
    ['map', 'pl-map', 'dr-map', 'ed-map'].forEach(id => { const svg = $id(id); if (svg && svg.firstChild) afterDraw(svg); });
  }

  window.HochcivMobile = { views, applyView, revealSelection, narrow };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
