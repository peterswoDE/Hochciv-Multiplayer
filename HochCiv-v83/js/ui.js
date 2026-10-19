/* Hochzeivilization – Oberfläche */
const $ = id => document.getElementById(id);
const SYM = { star: '★', cross: '✕', square: '■', triangle: '▲', skull: '☠' };
const HEX = 30;
let S = null, ui = { sel: null, army: null, mode: null, botTimer: null };
let customMap = null, editMap = null, edTool = 'G';

/* ------------------------------------------------------------------ Basics */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  if (typeof applyTurn === 'function') applyTurn();     // Drehung hängt am Bildschirm
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function modal(title, html) {
  $('ov-title').textContent = title; $('ov-body').innerHTML = html;
  $('overlay').classList.remove('wide');
  $('overlay').classList.add('show');
  lockBar();
}
function closeModal() {
  $('overlay').classList.remove('show'); $('overlay').classList.remove('wide'); lockBar();
  // Leseschritte im Tutorial warten darauf, dass das Fenster wieder zu ist.
  if (typeof tutMaybeAdvance === 'function' && ui && ui.tut) tutMaybeAdvance();
}
/* `opts.power`: dieses Blatt ist das Machtblatt – nur solange es offen ist, zeigt die
   Karte die Machtringe (v75). Jedes andere Blatt beendet die Machtansicht. */
function sheet(html, opts) {
  const machtAus = ui && ui.powerView && !(opts && opts.power);
  if (machtAus) ui.powerView = false;
  $('sheet-body').innerHTML = html;
  $('sheet').classList.add('open');
  // Im Tutorial sind auch Macht- und Armeeblatt an die Schienen gebunden. Hier zählt nur
  // die Beschriftung – die Feldprüfung macht openTile für das Aktionsblatt selbst.
  if (typeof ui !== 'undefined' && ui && ui.tut) tutGateSheet(null, null);
  lockBar();
  if (machtAus && S) redraw();
}
function closeSheet() {
  if (ui.botLock) return;
  $('sheet').classList.remove('open'); lockBar();
  if (ui.powerView) { ui.powerView = false; if (S) redraw(); }
}
/* Die Aktionsleiste wird nur noch vom Bot-Fenster gesperrt – dort führt allein
   „Weiter" weiter. Ein normales Aktionsblatt sperrt sie NICHT mehr: es endet seit
   dieser Fassung oberhalb der Leiste (--bar-h), liegt also nicht mehr darauf, und
   die Menüpunkte unten bleiben durchweg bedienbar. */
function lockBar() {
  document.body.classList.toggle('blocked', !!(ui && ui.botLock));
}
/* Echte Höhe von Kopf- und Aktionsleiste ins CSS spiegeln, damit das Blatt exakt
   darüber endet – die Leiste wächst mit Schriftgröße und Geräteeinfassung. */
function setBarHeight() {
  const bar = document.querySelector('#screen-game .actionbar');
  const hud = document.querySelector('#screen-game .hud');
  const st = document.documentElement.style;
  // getBoundingClientRect statt offsetHeight: subpixelgenau und auch dann korrekt,
  // wenn die App gedreht dargestellt wird.
  const hoch = el => el ? Math.round(el.getBoundingClientRect().height) : 0;
  if (hoch(bar)) st.setProperty('--bar-h', hoch(bar) + 'px');
  if (hoch(hud)) st.setProperty('--hud-h', hoch(hud) + 'px');
}
/* Querformat. Eine echte Sperre gibt es nur, wo screen.orientation.lock existiert
   (installiertes Android/Chrome); iOS kennt sie nicht – weder über die API noch über
   das Manifest. Dort bleibt nur, die App im Hochformat selbst zu drehen (html.turn,
   siehe style.css). Abschalten lässt sich das im Spielmenü (☰); die Wahl wird gemerkt.

   Gedreht wird NUR der Spielbildschirm. Menü, Aufbau, Editor und die Regelseite haben
   keine feste Karte, die Platz in der Breite bräuchte – dort wäre der Zwang lästig.
   Deshalb hängt html.turn am aktiven Bildschirm und wird aus show() nachgeführt. */
const TURN_SCREENS = ['screen-game', 'screen-place', 'screen-draft'];
function turnWanted() { return !load('hochciv.noturn'); }
function onTurnScreen() {
  return TURN_SCREENS.some(id => { const el = $(id); return el && el.classList.contains('show'); });
}
function applyTurn() {
  const on = turnWanted() && onTurnScreen();
  document.documentElement.classList.toggle('turn', on);
  try {
    const so = screen && screen.orientation;
    if (so && typeof so.lock === 'function') {
      // Nur im Spiel sperren; beim Verlassen wieder freigeben.
      if (on) so.lock('landscape').catch(() => { });
      else if (typeof so.unlock === 'function') so.unlock();
    }
  } catch { /* Browser ohne screen.orientation – dann bleibt es bei html.turn */ }
  syncLayout();
}
function turning() {
  return document.documentElement.classList.contains('turn') &&
    window.innerHeight > window.innerWidth;
}
/* Effektive Layoutgröße: im gedrehten Zustand sind Breite und Höhe vertauscht.
   Media Queries können das nicht wissen – sie messen den ungedrehten Viewport und
   lägen um 90° daneben. Deshalb setzt diese Funktion die Layoutklassen selbst. */
function syncLayout() {
  const t = turning();
  const w = t ? window.innerHeight : window.innerWidth;
  const h = t ? window.innerWidth : window.innerHeight;
  const cl = document.documentElement.classList;
  cl.toggle('w-wide', w >= 820);
  // Neben der Karte statt darunter, sobald quer und breit genug: gestapelt bliebe auf
  // flachen Schirmen (Telefon quer) fast nichts von der Karte übrig.
  cl.toggle('w-side', w >= 600 && w > h);
  cl.toggle('w-narrow', w < 600);
  setBarHeight();
}
function setTurn(on) {
  store('hochciv.noturn', on ? null : true);
  applyTurn();
}
function initOrientation() {
  applyTurn();
  window.addEventListener('resize', syncLayout);
  window.addEventListener('orientationchange', syncLayout);
}

// localStorage kann fehlen oder sperren (privater Modus) – dann wird eben nichts gemerkt.
function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* nicht speicherbar */ } }
function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function saveGame() { if (S) store('hochciv.save', S); }

/* ------------------------------------------------------------------ Kartenzeichnung */
/* Text, der in HTML eingesetzt wird. Die Texte kommen aus den eigenen Tabellen, aber
   Anführungszeichen in title-Attributen zerlegen sonst das Markup. */
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function svgEl(n, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', n);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function hexPath(size) {
  return hexPoints(size).map(p => p.join(',')).join(' ');
}
function terrainGlyph(g, t, x, y) {
  const add = (n, a) => { const e = svgEl(n, Object.assign({ 'pointer-events': 'none' }, a)); g.appendChild(e); return e; };
  const line = (x1, y1, x2, y2, col, w) => add('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': w || 1.4, 'stroke-linecap': 'round' });
  if (t === 'G') { line(x - 5, y + 4, x - 5, y - 1, '#7b8a52'); line(x + 5, y + 4, x + 5, y - 1, '#7b8a52'); }
  else if (t === 'M') {
    for (let i = 0; i < 2; i++) add('path', {
      d: `M${x - 9},${y + i * 7 - 2} q4.5,-4 9,0 q4.5,4 9,0`, fill: 'none', stroke: '#6f97a8', 'stroke-width': 1.6
    });
  } else if (t === 'F') add('path', { d: `M${x - 7},${y + 8} q7,-6 0,-8 q-7,-2 0,-8`, fill: 'none', stroke: '#4a7f9c', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
  else if (t === 'B') add('path', { d: `M${x - 8},${y + 6} L${x},${y - 7} L${x + 8},${y + 6} Z`, fill: '#f2ece0', stroke: '#7a6a58', 'stroke-width': 1 });
  else if (t === 'W') for (let i = -1; i <= 1; i++)
    add('path', { d: `M${x + i * 8 - 5},${y + 6} L${x + i * 8},${y - 4} L${x + i * 8 + 5},${y + 6} Z`, fill: '#3f5f38' });
  else if (t === 'I') add('circle', { cx: x, cy: y, r: 5, fill: '#9fb37a', stroke: '#7c8a5a' });
  else if (t === 'V') {            // Vulkan: Kegel mit glühendem Krater
    add('path', { d: `M${x - 9},${y + 7} L${x - 3.5},${y - 6} L${x + 3.5},${y - 6} L${x + 9},${y + 7} Z`,
      fill: '#3b322b', stroke: '#241f1a', 'stroke-width': 1 });
    add('path', { d: `M${x - 3.5},${y - 6} L${x + 3.5},${y - 6} L${x + 1},${y - 1} L${x - 1},${y - 1} Z`,
      fill: '#c4552f' });
  }
}
/* Weltwunder einer Stadt: kleine Rauten unter dem Stadtsymbol, Zahl = Stufe. */
function wonderMarks(g, S2, ct, x, y) {
  const list = (S2.wonders || []).filter(w => w.cityId === ct.id);
  if (!list.length) return;
  list.forEach((w, i) => {
    const dx = (i - (list.length - 1) / 2) * 15;
    g.appendChild(svgEl('rect', {
      x: x + dx - 6, y: y + 15, width: 12, height: 12, rx: 2,
      transform: `rotate(45 ${x + dx} ${y + 21})`,
      fill: '#f7f1e0', stroke: '#8a6f2f', 'stroke-width': 1.6, 'pointer-events': 'none'
    }));
    const t = svgEl('text', {
      x: x + dx, y: y + 25, 'text-anchor': 'middle', 'font-size': 10,
      fill: '#8a6f2f', 'font-weight': 700, 'pointer-events': 'none'
    });
    t.textContent = w.lvl; g.appendChild(t);
  });
}
/* Freistehende Wunder (Stonehenge-Ruinen ohne Stadt) */
function orphanMarks(g, S2) {
  (S2.wonders || []).filter(w => w.cityId == null).forEach(w => {
    const [x, y] = hexCenter(w.r, w.c, HEX);
    const t = svgEl('text', {
      x, y: y + 7, 'text-anchor': 'middle', 'font-size': 20, fill: '#8a6f2f', 'pointer-events': 'none'
    });
    t.textContent = '◈'; g.appendChild(t);
  });
}
function tallyMarks(g, n, x, y, col) {
  for (let i = 0; i < Math.min(n, 20); i++) {
    const row = Math.floor(i / 5), k = i % 5;
    g.appendChild(svgEl('line', {
      x1: x - 14 + k * 6, y1: y - 22 - row * 6, x2: x - 14 + k * 6 + 2, y2: y - 30 - row * 6,
      stroke: col, 'stroke-width': 2, 'stroke-linecap': 'round', 'pointer-events': 'none'
    }));
  }
}
/* ------------------------------------------------------------------ Kartenansichten (v75)
   Drei Schichten legen sich auf Wunsch über die Karte:
   · Erträge – je Feld bis zu drei Chips: Wissenschaft blau, Nahrung grün, Münzen gold,
     Nullen weggelassen. Gerechnet für das Reich, das gerade schaut (tileYieldAt), also
     mit seinen Technologien. Stadtfelder bringen selbst nichts und bleiben frei.
   · Gründungsmodus – auf jedem möglichen Platz die Kosten in Nahrung (rot, wenn sie
     diesen Zug nicht reichen), unmögliche Felder abgeblendet. Entscheiden tun
     foundSiteError und foundCost aus engine.js, nicht die Oberfläche.
   · Machtansicht – Ringe um Städte und Armeen: der Anteil in der Farbe des Besitzers ist
     seine Verteidigung bzw. sein Machtwert, die übrigen Anteile die Angreifer bzw.
     Flankierer in ihrer Farbe (powerView). Bewusst ohne Zahl: man sieht, wer überwiegt;
     die Zahlen stehen im Feldblatt.                                                   */
const YIELD_CHIP = ['#3b6ea5', '#4b8a2c', '#b07a12'];
function yieldChips(g, S2, pi) {
  const rows = S2.map.rows;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const t = rows[r][c];
    if (!TERRAIN[t] || isOff(t) || cityAt(S2, r, c)) continue;
    const y = tileYieldAt(S2, pi, r, c);
    const list = [0, 1, 2].filter(i => y[i] > 0);
    if (!list.length) continue;
    const [x, yy] = hexCenter(r, c, HEX);
    list.forEach((i, k) => {
      const cx = x + (k - (list.length - 1) / 2) * 13.5, cy = yy + 14.5;
      g.appendChild(svgEl('circle', {
        cx, cy, r: 6.6, fill: YIELD_CHIP[i], stroke: '#fbf7ec', 'stroke-width': 1.3,
        'pointer-events': 'none', 'data-yield': i, 'data-rc': r + '/' + c,
      }));
      const tx = svgEl('text', {
        x: cx, y: cy + 3.3, 'text-anchor': 'middle', 'font-size': y[i] > 9 ? 8 : 9.5,
        'font-weight': 700, fill: '#fff', 'pointer-events': 'none',
      });
      tx.textContent = y[i]; g.appendChild(tx);
    });
  }
}
/* Gründungsmodus: abblenden, was nicht geht; Kosten auf allem, was geht. Alle Felder
   auf einmal – mit der vorgerechneten Wegtabelle (withFoundTable), sonst kostete jedes
   Zeichnen auf der großen Karte gut 50 ms. */
function foundMarks(g, S2, pi) { withFoundTable(S2, pi, () => foundMarksAll(g, S2, pi)); }
function foundMarksAll(g, S2, pi) {
  const rows = S2.map.rows, pts = hexPath(HEX);
  const food = available(S2, pi, 'food');
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const t = rows[r][c];
    if (!TERRAIN[t] || isOff(t)) continue;
    const [x, y] = hexCenter(r, c, HEX);
    if (foundSiteError(S2, pi, r, c)) {
      g.appendChild(svgEl('polygon', {
        points: pts, transform: `translate(${x},${y})`, fill: 'rgba(236,229,208,.66)',
        'pointer-events': 'none', 'data-found': 'nein', 'data-rc': r + '/' + c,
      }));
      continue;
    }
    /* Die Karte zeigt auch seit v82 den Preis, nicht was tatsächlich abgeht: sie dient dem
       Vergleich der Plätze, und mit wenig Nahrung im Vorrat stünde sonst auf fast jedem
       Platz dieselbe Nahrungszahl. Was wirklich abgeht, sagt das Gründungsblatt. */
    const cost = foundCost(S2, pi, r, c), knapp = food < cost;
    const col = knapp ? '#b3321f' : '#2a2721';
    g.appendChild(svgEl('circle', {
      cx: x, cy: y - 10, r: 10, fill: '#fbf7ec', stroke: col, 'stroke-width': 1.8,
      'pointer-events': 'none', 'data-found': knapp ? 'knapp' : 'ja', 'data-rc': r + '/' + c,
    }));
    const tx = svgEl('text', {
      x, y: y - 6, 'text-anchor': 'middle', 'font-size': cost > 99 ? 9 : 11.5,
      'font-weight': 700, fill: col, 'pointer-events': 'none',
    });
    tx.textContent = cost; g.appendChild(tx);
  }
}
/* Ein Ring aus Kreisanteilen: parts = [{ v, col }], der erste ist der Besitzer, von zwölf
   Uhr im Uhrzeigersinn. Seit v76 ist jeder Punkt ein eigenes Teilstück – eine Stadt mit
   Verteidigung 1 und Angriff 2 trägt drei, eines in der Farbe des Verteidigers und zwei in
   der des Angreifers. So lässt sich der Wert abzählen, ohne dass eine Zahl dasteht.
   Über RING_MAX_PUNKTE Punkten würden die Stücke zu schmal zum Zählen (Stadtring bei 60:
   gut 2 Karteneinheiten je Stück, auf dem iPad bei ganzer Karte etwa 2–3 Pixel); dann
   bleibt nur der Anteil mit Grenzstrichen zwischen den Reichen.
   Gemessen an 60 Bot-Partien liegen 99 % der Stadt- und alle Armeeringe darunter, bei
   bedrohten Städten 93 %.
   Ohne einen einzigen Punkt (Armee mit Macht 0, niemand flankiert) bleibt der Ring leer:
   nur der Umriss in der Besitzerfarbe – bis v75 war er dann voll, wie bei voller Stärke. */
const RING_MAX_PUNKTE = 60;
function powerRing(g, cx, cy, r0, r1, parts, tag) {
  const total = Math.round(parts.reduce((s, p) => s + Math.max(0, p.v), 0));
  const attrs = { 'pointer-events': 'none', 'data-power': tag };
  const rm = (r0 + r1) / 2;
  // heller Saum darunter: sonst verschwindet ein grüner Ring auf Wald und Grasland
  g.appendChild(svgEl('circle', {
    cx, cy, r: rm, fill: 'none', stroke: '#fbf7ec', 'stroke-width': r1 - r0 + 2.6,
    'pointer-events': 'none',
  }));
  if (total === 0) {
    [r0, r1].forEach(r => g.appendChild(svgEl('circle', Object.assign({
      cx, cy, r, fill: 'none', stroke: parts[0].col, 'stroke-width': 1.1, 'data-anteil': '0',
    }, attrs))));
    return;
  }
  const zeig = parts.filter(p => p.v > 0);
  const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const strich = (a, w, art) => {
    const [xa, ya] = pt(r0 - 0.4, a), [xb, yb] = pt(r1 + 0.4, a);
    g.appendChild(svgEl('line', {
      x1: xa, y1: ya, x2: xb, y2: yb, stroke: '#fbf7ec', 'stroke-width': w,
      'pointer-events': 'none', [art]: tag,
    }));
  };
  const grenzen = [];
  if (zeig.length === 1) {
    g.appendChild(svgEl('circle', Object.assign({
      cx, cy, r: rm, fill: 'none', stroke: zeig[0].col, 'stroke-width': r1 - r0,
      'data-anteil': '1',
    }, attrs)));
  } else {
    let a0 = 0;
    zeig.forEach(p => {
      const a1 = a0 + 2 * Math.PI * p.v / total;
      const gross = a1 - a0 > Math.PI ? 1 : 0;
      const [x1, y1] = pt(r1, a0), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r0, a1), [x4, y4] = pt(r0, a0);
      g.appendChild(svgEl('path', Object.assign({
        d: `M${x1},${y1} A${r1},${r1} 0 ${gross} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${gross} 0 ${x4},${y4} Z`,
        fill: p.col, 'data-anteil': (p.v / total).toFixed(3),
      }, attrs)));
      grenzen.push(a0);
      a0 = a1;
    });
  }
  // Zu viele Punkte zum Zählen: nur die Grenzen zwischen den Reichen, wie bis v75
  if (total > RING_MAX_PUNKTE) { grenzen.forEach(a => strich(a, 1.3, 'data-grenze')); return; }
  // sonst ein Trennstrich je Punkt (v76), je mehr Punkte, desto feiner. Die Werte sind
  // ganze Zahlen, die Grenzen zwischen den Reichen fallen also auf Striche.
  const w = total <= 12 ? 1.3 : total <= 24 ? 0.9 : 0.55;
  for (let k = 0; k < total; k++) strich(2 * Math.PI * k / total, w, 'data-strich');
}
function powerRings(g, S2, view, was) {
  const col = pi => civOf(S2.players[pi]).color;
  if (was === 'armee') view.armies.forEach(({ army, pow, flank }) => {
    const [x, y] = hexCenter(army.r, army.c, HEX);
    powerRing(g, x, y - 2, 14, 18.5,
      [{ v: pow, col: col(army.owner) }].concat(flank.map(f => ({ v: f.v, col: col(f.pi) }))),
      'armee ' + army.r + '/' + army.c);
  });
  if (was === 'stadt') view.cities.forEach(({ city, def, atk }) => {
    const [x, y] = hexCenter(city.r, city.c, HEX);
    powerRing(g, x, y, 17, 21.5,
      [{ v: def, col: col(city.owner) }].concat(atk.map(a => ({ v: a.v, col: col(a.pi) }))),
      'stadt ' + city.r + '/' + city.c);
  });
}
function drawMap(svg, map, opts) {
  opts = opts || {};
  svg.innerHTML = '';
  const rows = map.rows, R = rows.length, C = Math.max(...rows.map(r => r.length));
  const w = Math.sqrt(3) * HEX * (C + 1), h = HEX * 1.5 * R + HEX * 0.5;
  const world = svgEl('g', { id: 'world' });
  svg.appendChild(world);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const pts = hexPath(HEX);

  /* Feldmarkierungen. Immer dasselbe Sechseck, nur andere Füllung und Kante:
     erreichbare Felder, die goldene Tutorial-Hervorhebung, der Rahmen der Legephase
     und die Auswahl. Vier Stellen zeichneten das vorher wortgleich selbst. */
  const OVERLAY = {
    reach: { fill: 'rgba(255,255,255,.42)', stroke: '#2a2721', 'stroke-width': 2, 'stroke-dasharray': '5 4' },
    tut: { fill: 'rgba(255,214,102,.30)', stroke: '#b8860b', 'stroke-width': 3.4, 'stroke-linejoin': 'round' },
    frame: { fill: 'none', stroke: '#b8860b', 'stroke-width': 3, 'stroke-linejoin': 'round' },
    // Legephase: erlaubt, aber dominiert. Etwas eingerückt, damit es innerhalb des goldenen
    // Rahmens sitzt und nicht mit der Auswahl (volle Größe, dunkelrot) verwechselt wird.
    dom: { inset: 5, fill: 'none', stroke: '#d0402c', 'stroke-width': 3, 'stroke-linejoin': 'round' },
    sel: { fill: 'none', stroke: '#9d3b2f', 'stroke-width': 4 },
  };
  const markHexes = (list, art) => (list || []).forEach(([r, c]) => {
    const [x, y] = hexCenter(r, c, HEX);
    const { inset, ...stil } = OVERLAY[art];
    world.appendChild(svgEl('polygon', Object.assign({
      points: inset ? hexPath(HEX - inset) : pts,
      transform: `translate(${x},${y})`, 'pointer-events': 'none',
    }, stil)));
  });

  // 1 Gelände. „Kein Feld" (X) gehört nicht zur Karte: es wird nicht gezeichnet und
  // ist nicht antippbar – so entsteht die Form einer Plättchenkarte. Nur der Editor
  // zeigt es blass, sonst ließe sich ein versehentlich gesetztes X nicht zurücknehmen.
  for (let r = 0; r < R; r++) for (let c = 0; c < rows[r].length; c++) {
    const t = rows[r][c], [x, y] = hexCenter(r, c, HEX);
    if (!TERRAIN[t]) continue;
    const off = isOff(t);
    if (off && !opts.showVoid) continue;
    const attrs = {
      points: pts, transform: `translate(${x},${y})`, fill: TERRAIN[t].color,
      stroke: '#8a8258', 'stroke-width': 1, 'data-r': r, 'data-c': c
    };
    if (off) { attrs.opacity = 0.4; attrs['stroke-dasharray'] = '3 3'; }
    world.appendChild(svgEl('polygon', attrs));
    if (!off) terrainGlyph(world, t, x, y);
  }
  // 2 Straßen / Eisenbahn
  if (opts.state) {
    const S2 = opts.state;
    const roadTiles = new Set(Object.keys(S2.roads));
    S2.cities.forEach(ct => { if (effectiveRoad(S2, ct.r, ct.c) >= 1) roadTiles.add(key(ct.r, ct.c)); });
    for (const k of roadTiles) {
      const [r, c] = unkey(k), lvl = effectiveRoad(S2, r, c), [x, y] = hexCenter(r, c, HEX);
      for (const [nr, nc] of neighbors(r, c)) {
        const nk = key(nr, nc); if (!roadTiles.has(nk) || nk < k) continue;
        const [x2, y2] = hexCenter(nr, nc, HEX);
        const lv = Math.min(lvl, effectiveRoad(S2, nr, nc));
        if (lv < 1) continue;
        world.appendChild(svgEl('line', {
          x1: x, y1: y, x2, y2, stroke: '#5b4a33', 'stroke-width': lv >= 2 ? 3 : 2,
          'stroke-dasharray': lv >= 2 ? '6 4' : '', 'pointer-events': 'none'
        }));
      }
    }
    // 3 Reichsgrenzen
    S2.players.forEach((p, i) => {
      if (p.dead) return;
      const own = controlledTiles(S2, i);
      citiesOf(S2, i).forEach(ct => own.add(key(ct.r, ct.c)));
      const col = civOf(p).color;
      for (const k of own) {
        const [r, c] = unkey(k), [x, y] = hexCenter(r, c, HEX), v = hexPoints(HEX);
        for (let d = 0; d < 6; d++) {
          const [nr, nc] = neighbor(r, c, d);
          if (own.has(key(nr, nc))) continue;
          const a = v[(d + 1) % 6], b = v[(d + 2) % 6];
          world.appendChild(svgEl('line', {
            x1: x + a[0], y1: y + a[1], x2: x + b[0], y2: y + b[1],
            stroke: col, 'stroke-width': 3.5, 'stroke-linecap': 'round', 'pointer-events': 'none'
          }));
        }
      }
    });
    // 3b Erträge je Feld und Gründungsmodus (v75) – unter den Einheiten, damit Städte und
    // Armeen lesbar bleiben; das Abblenden legt sich auch über die Chips
    if (opts.yields != null) yieldChips(world, S2, opts.yields);
    if (opts.found != null) foundMarks(world, S2, opts.found);
    // 4 Overlay (erreichbare Felder)
    markHexes(opts.highlight, 'reach');
    // 4b Tutorial-Hervorhebung: goldener Rahmen um die Felder, um die es gerade geht
    markHexes(opts.tutHl, 'tut');
    // 4c Machtringe der Armeen, unter dem Armeesymbol
    if (opts.power) powerRings(world, S2, opts.power, 'armee');
    // 5 Armeen
    S2.armies.forEach(a => {
      const [x, y] = hexCenter(a.r, a.c, HEX);
      const civ = civOf(S2.players[a.owner]);
      // Symbol zweimal: erst als heller Umriss, dann gefüllt – so bleibt es auf
      // jedem Gelände lesbar, ohne wie eine Stadt (Kreis) auszusehen.
      for (const halo of [true, false]) {
        const t = svgEl('text', {
          x, y: y + 8, 'text-anchor': 'middle', 'font-size': 25,
          fill: halo ? 'none' : civ.color, stroke: halo ? '#f7f1e0' : 'none',
          'stroke-width': halo ? 5 : 0, 'stroke-linejoin': 'round', 'pointer-events': 'none'
        });
        t.textContent = SYM[civ.sym]; world.appendChild(t);
      }
      if (a.owner === (opts.turn ?? -1) && a.mp > 0)      // eigene, noch bewegliche Armee
        world.appendChild(svgEl('circle', {
          cx: x, cy: y + 15, r: 3, fill: civ.color, 'pointer-events': 'none'
        }));
    });
    // 5b Machtringe der Städte – außen um die Stadtscheibe, Striche und Wunder darüber
    if (opts.power) powerRings(world, S2, opts.power, 'stadt');
    // 6 Städte
    S2.cities.forEach(ct => {
      const [x, y] = hexCenter(ct.r, ct.c, HEX);
      const civ = civOf(S2.players[ct.owner]);
      world.appendChild(svgEl('circle', {
        cx: x, cy: y, r: 15, fill: '#f7f1e0', stroke: ct.cap ? '#2a2721' : civ.color,
        'stroke-width': ct.cap ? 3.5 : 2.4, 'pointer-events': 'none'
      }));
      const t = svgEl('text', {
        x, y: y + 7, 'text-anchor': 'middle', 'font-size': 20, fill: civ.color, 'pointer-events': 'none'
      });
      t.textContent = SYM[civ.sym]; world.appendChild(t);
      tallyMarks(world, ct.pop, x, y, civ.color);
      wonderMarks(world, S2, ct, x, y);
    });
  } else if (map.capitals) {
    // Ohne Spielstand: Legephase. Erlaubte Felder werden genauso markiert wie im Spiel
    // die erreichbaren, nur eben vor den Hauptstädten gezeichnet.
    markHexes(opts.highlight, 'reach');
    markHexes(opts.frame, 'frame');
    markHexes(opts.dominated, 'dom');
    const capList = Array.isArray(map.capitals)
      ? map.capitals.filter(Boolean).map(e => [e.civ, [e.r, e.c]])
      : Object.keys(map.capitals).map(k => [k, map.capitals[k]]);
    for (const [k, pos] of capList) {
      const [r, c] = pos, civ = CIVS.find(x => x.k === k);
      if (!civ || r >= R) continue;
      const [x, y] = hexCenter(r, c, HEX);
      world.appendChild(svgEl('circle', { cx: x, cy: y, r: 15, fill: '#f7f1e0', stroke: '#2a2721', 'stroke-width': 3, 'pointer-events': 'none' }));
      const t = svgEl('text', { x, y: y + 7, 'text-anchor': 'middle', 'font-size': 20, fill: civ.color, 'pointer-events': 'none' });
      t.textContent = SYM[civ.sym]; world.appendChild(t);
    }
  }
  if (opts.state) orphanMarks(world, opts.state);
  // 7 Auswahl
  if (opts.sel) markHexes([opts.sel], 'sel');
  return world;
}

/* ------------------------------------------------------------------ Antippen
   Die Karte wird nicht mehr geschoben oder gezoomt: sie ist immer vollständig
   eingepasst. Deshalb braucht es auch keine Koordinatenrechnung mehr – der Treffer
   wird direkt auf dem Sechseck ausgewertet. Das ist genauer als „nächster Mittelpunkt"
   (die Ecken gehören jetzt dem richtigen Feld) und funktioniert auch dann, wenn die
   App im Hochformat um 90° gedreht dargestellt wird. */
function attachTaps(svg, onTap) {
  svg.addEventListener('click', e => {
    const el = e.target.closest ? e.target.closest('[data-r]') : null;
    if (!el) return;
    onTap(+el.dataset.r, +el.dataset.c);
  });
}

/* ------------------------------------------------------------------ Spielansicht */
function currentMap() { return customMap || DEFAULT_MAP; }
/* Wessen Erträge zeigt die Ertragsansicht? Wer am Zug ist – während Bots oder die KI
   ziehen, der Mensch, der zuschaut (sonst sprängen die Zahlen mit jedem Zug um). */
function viewerOf(S2) {
  if (!isAuto(P(S2))) return S2.cur;
  const m = S2.players.findIndex(p => p.kind === 'human' && !p.dead);
  return m >= 0 ? m : S2.cur;
}
function redraw() {
  if (ui.army && !S.armies.includes(ui.army)) ui.army = null;
  const p = P(S), civ = civOf(p);
  const human = !isAuto(p) && !S.over;
  if (!human && ui.mode === 'found') ui.mode = null;     // Gründen gibt es nur im eigenen Zug
  const highlight = ui.army ? [...armyReach(S, ui.army).keys()].map(unkey) : [];
  const gruenden = ui.mode === 'found';
  drawMap($('map'), S.map, {
    state: S, sel: ui.sel, highlight, tutHl: ui.tut ? tutHighlight() : null,
    turn: isAuto(p) ? -1 : S.cur,
    yields: showYields || gruenden ? viewerOf(S) : null,
    found: gruenden ? S.cur : null,
    power: ui.powerView ? powerView(S) : null,
  });
  $('a-found').classList.toggle('on', gruenden);
  $('a-yields').classList.toggle('on', showYields);
  $('hud-sym').textContent = SYM[civ.sym];
  $('hud-sym').style.borderColor = civ.color;
  // Neben dem Reichsnamen steht die Fähigkeit – ausgelost oder gewählt, hier sieht man,
  // was man hat. Bots haben keine.
  // Im Marathon (v83) zwei gedraftete – beide stehen da
  const abils = abilInfos(p);
  $('hud-name').innerHTML = esc(civ.n) + (p.kind === 'bot' ? T(' · Bot') : p.kind === 'ki' ? T(' · KI') : '') +
    abils.map(a => `<span class="hud-abil" title="${esc(a.e)}">${esc(a.n)}</span>`).join('');
  const ev = curEvent();
  // Anteil an der Weltbevölkerung – die Siegschwelle ist ein Anteil, keine Stückzahl,
  // also gehört die Prozentzahl gleich daneben. Kaufmännisch gerundet. Der aktuelle Stand:
  // geprüft wird er seit v83 zu Beginn der nächsten Runde.
  const mine = popOf(S, S.cur), all = worldPop(S);
  const pct = all > 0 ? Math.round((mine / all) * 100) : 0;
  // Ist ein Sieg angemeldet, läuft die Runde noch zu Ende – das muss in der Kopfzeile
  // stehen, sonst wirkt das plötzliche Spielende willkürlich.
  const letzte = S.endRound != null && !S.over
    ? ' · ' + T('letzte Runde (%s)', (S.claims || []).map(c => civOf(S.players[c.pi]).n).join(', ')) : '';
  $('hud-round').textContent = T('Runde %s · Bevölkerung %s/%s (%s %)', S.round, mine, all, pct) +
    (ev ? ` · ${ev.n}` : '') + letzte;
  $('hud-sci').textContent = p.res.sci;
  $('hud-food').textContent = p.res.food + (p.foodDeficit ? ` (−${p.foodDeficit})` : '');
  $('hud-coins').textContent = p.res.coins; $('hud-power').textContent = powerOf(S, S.cur);
  ['a-tech', 'a-found', 'a-power', 'a-end'].forEach(id => $(id).disabled = !human);
  // „Erträge" ist reine Ansicht: immer bedienbar, auch im Tutorial und während Bots ziehen
  $('a-yields').disabled = false;
  if (ui.tut) {
    const bar = tutAllow().bar;
    TUT_BAR.forEach(id => $(id).disabled = !human || (bar ? !bar.includes(id) : true));
    renderTutPanel();
  }
  saveGame();
}
/* Die Knöpfe der Leiste, die das Tutorial an seine Schienen bindet (alle außer „Erträge"). */
const TUT_BAR = ['a-tech', 'a-found', 'a-power', 'a-info', 'a-log', 'a-end'];
/* Ertragsansicht an/aus – je Gerät gemerkt. */
let showYields = !!load('hochciv.yields');
function toggleYields() {
  showYields = !showYields;
  store('hochciv.yields', showYields || null);
  if (S && $('screen-game').classList.contains('show')) redraw();
}
/* Gründungsmodus an/aus (v75). Stadtgründung ist eine eigene Aktion der Leiste: an, zeigt
   die Karte Erträge und Kosten; ein Tipp auf ein Feld öffnet das Gründungsblatt. */
function toggleFoundMode() {
  if (!S || S.over || isAuto(P(S))) return;
  const an = ui.mode !== 'found';
  ui.mode = an ? 'found' : null;
  if (an) ui.army = null;
  closeSheet();
  redraw();
  if (an) toast(T('Feld für die neue Stadt antippen'));
}
/* Andere Aktionen der Leiste beenden den Gründungsmodus. */
function endFoundMode() {
  if (ui.mode !== 'found') return;
  ui.mode = null;
  if (S) redraw();
}

/* Beim Start eines normalen Spiels darf kein Tutorial-Panel stehen bleiben. */
function endTutorialPanel() {
  ui = { sel: null, army: null, mode: null, botTimer: null };
  const panel = $('tut-panel');
  if (panel) panel.hidden = true;
  document.body.classList.remove('tut');
}
function tapHex(r, c) {
  if (S.over || isAuto(P(S))) return;
  ui.powerView = false;                 // ein Feld antippen beendet die Machtansicht
  if (ui.army) {
    if (ui.tut && !tutMoveOk(r, c)) return toast(T('Im Tutorial: ziehe die Armee auf das goldene Feld.'));
    const army = ui.army;
    const e = moveArmy(S, army, r, c);
    if (e) { toast(e); } else {
      ui.army = null; ui.sel = [r, c]; redraw();
      // v80: wer in eine Kontrollzone zieht, hält an – das soll man sehen, nicht nur im Protokoll lesen
      if (army.halted) toast(T('Kontrollzone – die Armee hält für diesen Zug an.'));
      return;
    }
  }
  ui.sel = [r, c]; redraw();
  if (ui.mode === 'found') foundSheet(r, c); else openTile(r, c);
}
function mp(a) { return T('Bewegung %s', LANG === 'de' ? String(a.mp).replace('.', ',') : String(a.mp)); }
const Y_ICON = ['🔬', '🌾', '🪙'];
const fmtY = y => y.map((n, i) => n + Y_ICON[i]).join(' ');
/* Kosten am Knopf (v82, Wunsch des Autors). Ab Werk steht dort, was TATSÄCHLICH abgeht:
   Gründen für 10 Nahrung mit 8 im Vorrat zeigt „8🌾 4🪙", weil die fehlenden 2 Nahrung
   in Münzen bezahlt werden. Gerechnet von costPaid – derselben Rechnung, mit der
   bezahlt wird (Gilden, England, Alchemie, Bürgerkrieg … stecken also schon drin).
   `alt` ist der Text, der bis v81 dastand. Er bleibt, wenn
   · nichts umgetauscht wird (dann sind beide gleich, und Knöpfe wie Kacheln behalten ihr
     gewohntes Bild – auch die Zahl ohne Zeichen im Technologiebogen),
   · es gar nicht reicht (dann ginge nichts ab; der Preis selbst sagt, was fehlt),
   · in den Einstellungen „Kosten ohne Umtausch anzeigen" angehakt ist (prefs).
   Reihenfolge: erst die Arten des Preises, dann was einspringt.
   Im Technologiebogen nur auf Kacheln, die man jetzt erforschen könnte – auf den übrigen
   wäre die Rechnung hypothetisch. Die Karte im Gründungsmodus zeigt weiter den Preis. */
const COST_ICON = { sci: '🔬', food: '🌾', coins: '🪙' };
function costText(cost, alt, opts) {
  if (prefs.listPrice || !S || S.over) return alt;
  const paid = costPaid(S, S.cur, cost, opts);
  if (!paid) return alt;
  const eigen = COST_ORDER.filter(k => cost[k] > 0);
  if (COST_ORDER.every(k => (paid[k] || 0) === (cost[k] || 0))) return alt;
  const reihe = eigen.concat(['food', 'coins', 'sci'].filter(k => !eigen.includes(k)));
  return reihe.filter(k => paid[k] > 0).map(k => paid[k] + COST_ICON[k]).join(' ') || alt;
}
const fmtGain = g => [g.sci, g.food, g.coins]
  .map((n, i) => (n > 0 ? '+' : '') + n + Y_ICON[i]).join(' ');
/* Was eine Stadt auf diesem Feld dem Reich einbrächte – nur dort, wo der Platz taugt
   (foundSiteError). Fehlt bloß die Nahrung, steht der Ertrag trotzdem da: gerade dann
   will man wissen, ob sich das Sparen lohnt. Wo gar nicht gegründet werden kann, wäre
   die Zahl eine Antwort auf eine Frage, die sich nicht stellt.
   Der Wert kommt aus settleGain: Umland, Fähigkeiten, Wunder und der eine mitessende
   Bevölkerungspunkt sind darin verrechnet, überlappendes Umland zählt nicht doppelt. */
function settleFact(r, c) {
  const pi = S.cur;
  if (foundSiteError(S, pi, r, c)) return '';
  const g = settleGain(S, pi, r, c);
  return `<div class="tile-facts">
    <span class="fact"><span class="fact-k">${T('Ertrag beim Siedeln')}</span>
      <span class="fact-v">${fmtGain(g)}</span></span></div>`;
}
/* Gründungsblatt (v75): im Gründungsmodus öffnet ein Feld dieses Blatt statt des
   Feldblatts – Kosten, Ertrag beim Siedeln und der Knopf „Hier gründen". Geht es nicht,
   steht der Grund am gesperrten Knopf. Nach dem Gründen endet der Modus. */
function foundSheet(r, c) {
  const pi = S.cur, t = terrainAt(S, r, c);
  if (!t || isOff(t)) return closeSheet();
  const cost = foundCost(S, pi, r, c), err = canFound(S, pi, r, c);
  const id = 'hier' + Math.random().toString(36).slice(2, 6);
  sheet(`<h3>${T('Stadt gründen')} · ${TERRAIN[t].name}</h3>
    <p class="sub">${T('Feld %s/%s · Ertrag', r, c)} ${fmtY(tileYieldAt(S, pi, r, c))}</p>` +
    settleFact(r, c) +
    `<button class="opt" id="${id}" data-label="Hier gründen" ${err ? 'disabled' : ''}>` +
    `<span>${T('Hier gründen')}<small>${err || T('Grundkosten + Distanz zur Hauptstadt (über passierbare Felder)')}</small></span>` +
    `<span class="cost">${cost === Infinity ? '—' : costText({ food: cost }, cost + '🌾')}</span></button>`);
  if (ui.tut) tutGateSheet(r, c);
  $(id).onclick = () => {
    const e = foundCity(S, pi, r, c);
    if (e) return toast(e);
    ui.mode = null;
    closeSheet(); redraw();
  };
}
function openTile(r, c) {
  const pi = S.cur, p = P(S);
  const t = terrainAt(S, r, c);
  if (!t) return closeSheet();
  const city = cityAt(S, r, c), army = armyAt(S, r, c);
  const rows = [], handlers = [];
  /* Der erste Parameter ist der **deutsche** Text: er wird hier übersetzt und zusätzlich
     als `data-label` mitgegeben. Daran erkennt das Tutorial seine Knöpfe – es prüft
     Beschriftungen mit deutschen Ausdrücken, und die passen sonst nicht mehr, sobald die
     Oberfläche auf Englisch steht (dann war „Stadt gründen" gesperrt und das Tutorial
     hing fest). */
  const btn = (label, sub, cost, fn, off) => {
    const id = 'x' + (handlers.length + 1) + Math.random().toString(36).slice(2, 6);
    rows.push(`<button class="opt" id="${id}" data-label="${label}" ${off ? 'disabled' : ''}>` +
      `<span>${T(label)}${sub ? `<small>${sub}</small>` : ''}</span>` +
      `<span class="cost">${cost || ''}</span></button>`);
    handlers.push([id, fn]);
  };
  /* Fast jede Aktion im Aktionsblatt endet gleich: Fehler melden oder neu zeichnen,
     danach dasselbe Feld wieder öffnen – dann stehen die Preise und Zustände frisch
     im Blatt (nach dem Straßenbau kostet der Ausbau weniger, nach dem Wachsen ist die
     Stadt größer). Die Zeile stand vorher fünfmal wortgleich da. */
  const act = fn => () => {
    const e = fn();
    if (e) toast(e); else redraw();
    openTile(r, c);
  };
  // Gegründet wird seit v75 über „Stadt gründen" in der Leiste, nicht mehr hier. Taugt
  // das Feld als Platz, sagt ein Satz, wo es langgeht.
  let head = `<h3>${TERRAIN[t].name}</h3><p class="sub">${T('Feld %s/%s · Ertrag', r, c)} `
    + fmtY(tileYieldAt(S, pi, r, c)) + '</p>' +
    (!city && !army && !foundSiteError(S, pi, r, c)
      ? `<p class="sub">${T('Hier ließe sich eine Stadt gründen – über „Stadt gründen" in der Leiste.')}</p>` : '');

  if (city) {
    const owner = civOf(S.players[city.owner]);
    const wl = (S.wonders || []).filter(w => w.cityId === city.id);
    head = `<h3>${owner.n}${city.cap ? ' · ' + T('Hauptstadt') : ''}</h3>
      <p class="sub">${T('Bevölkerung %s · Verteidigung %s', city.pop, defenseValue(S, city))}</p>` +
      (wl.length ? `<div class="wlist">${wl.map(w =>
        `<span class="wtag">◈ ${WONDER_BY_KEY[w.k].n} (${T('Stufe %s', w.lvl)})</span>`).join('')}</div>` : '');
    if (city.owner === pi) {
      if (freeGrowthAvailable(S, pi, city))
        btn('Kostenlos wachsen', T('auf %s · Verbundwerkstoffe', city.pop + 1), T('gratis'),
          act(() => growCity(S, pi, city, 'free')));
      const pc = growPrice(S, pi, city);
      const perr = canGrowPaid(S, pi, city);
      btn('Bevölkerung wachsen', perr || T('auf %s', city.pop + 1), costText(pc, `${pc.food}🌾 ${pc.coins}🪙`),
        act(() => growCity(S, pi, city, 'paid')), !!perr);
      if (S.wo) {
        const wcost = wonderCost(S, pi);
        const full = wondersInCity(S, city).length >= 2;
        const any = availableWonders(S).some(w => !canBuildWonder(S, pi, city, w.k));
        btn('Weltwunder bauen', full ? T('diese Stadt hat schon zwei Wunder')
          : any ? T('%s/2 in dieser Stadt', wondersInCity(S, city).length)
            : T('nichts baubar (Münzen oder Stufenregel)'), costText({ coins: wcost }, `${wcost}🪙`),
          () => wonderSheet(city), full || !any);
      }
      const ac = armyCost(S, pi);
      // payOpts, nicht die nackte Münzprüfung: im Bürgerkrieg zählt auch Nahrung mit.
      const civil = payOpts(S, pi).foodOk;
      btn('Armee bauen', civil ? T('Bürgerkrieg: auch mit Nahrung zahlbar')
        : T('muss die Stadt noch verlassen'), costText({ coins: ac }, `${ac}🪙`, payOpts(S, pi)),
        act(() => buildArmy(S, pi, city)),
        available(S, pi, 'coins', payOpts(S, pi)) < ac || !!armyAt(S, r, c));
      if (slaveryUsable(p))
        btn('Bevölkerung opfern', city.sacrificed === S.round ? T('diese Runde schon geopfert') : TECH_BY_KEY.sklaverei.n, '+10🪙',
          act(() => sacrifice(S, pi, city)),
          city.pop < 2 || city.sacrificed === S.round);
      if (army && army.owner === pi)          // Armee steht in der Stadt und muss heraus
        btn('Armee hier bewegen', army.born === S.round ? T('muss die Stadt noch verlassen')
          : T('erreichbare Felder werden markiert'), mp(army),
          () => { ui.army = army; closeSheet(); redraw(); toast(T('Zielfeld antippen')); }, army.mp <= 0);
    } else {
      const atk = attackersOn(S, pi, city).length;
      const sk = S.sieges[pi + '|' + city.id] || 0;
      rows.push(`<p class="sub">${T('Deine Armeen in Reichweite: %s · Angriffswert %s', atk, attackValue(S, pi, atk))}
        ${sk ? ' · ' + T('Belagerung %s/2', sk) : ''}</p>`);
    }
  } else if (army) {
    const owner = civOf(S.players[army.owner]);
    head = `<h3>${T('Armee')} · ${owner.n}</h3><p class="sub">${T('Angriffswert %s', powerOf(S, army.owner))} · ${mp(army)}</p>`;
    if (army.owner === pi)
      btn('Diese Armee bewegen', army.halted ? T('Kontrollzone – hält bis zum nächsten Zug')
        : T('erreichbare Felder werden markiert'), '',
        () => { ui.army = army; closeSheet(); redraw(); toast(T('Zielfeld antippen')); }, army.mp <= 0);
  } else {
    if (has(p, 'kolonialismus')) {
      const owned = S.players.some((_, i) => controlledTiles(S, i).has(key(r, c)));
      btn('Feld kaufen', owned ? T('nur herrenlose Felder') : TECH_BY_KEY.kolonialismus.n,
        costText({ coins: COLONY_COST }, `${COLONY_COST}🪙`),
        act(() => buyTile(S, pi, r, c)), owned);
    }
  }
  if (has(p, 'atomwaffen')) {
    // Atomwaffenproteste sperren den Einsatz dauerhaft – dann ist der Knopf auch aus
    const banned = evNukeBan(S, pi);
    btn('Atomschlag auf dieses Feld',
      banned ? T('durch Atomwaffenproteste dauerhaft gesperrt')
        : p.nuked ? T('diese Runde schon eingesetzt')
          : T('zerstört alle Armeen hier und ringsum, auch eigene'), '☢︎',
      () => {
        toast(nuke(S, S.cur, r, c) || T('Atomschlag ausgeführt'));
        redraw(); openTile(r, c);
      }, p.nuked || banned);
  }
  // Die Stufen kommen aus roadTargets, nicht aus einer eigenen Rechnung – sonst weicht
  // das Blatt von dem ab, was buildRoad erlaubt (Eisenbahn ohne Rad war so unbaubar).
  if (canBuildRoads(p) && !city) {
    const ziele = roadTargets(S, pi, r, c);
    const lvl = roadLevel(S, r, c);
    if (!ziele.length) {
      // Nichts baubar – trotzdem anzeigen, damit der Grund sichtbar ist.
      btn(lvl >= 1 ? 'Eisenbahn bauen' : 'Straße bauen',
        lvl >= 2 ? T('hier liegt schon eine Eisenbahn') : T('Eisenbahn noch nicht erforscht'),
        '–🪙', () => { }, true);
    } else ziele.forEach(z => {
      btn(z === 2 ? 'Eisenbahn bauen' : 'Straße bauen',
        z === 2 ? T('Bewegung kostenlos · Handelsroute +2') : T('Bewegung ½ Punkt · Handelsroute +1'),
        costText({ coins: roadPrice(S, pi, r, c, z) }, roadPrice(S, pi, r, c, z) + '🪙'),
        () => doRoad(r, c, z), available(S, pi, 'coins') < roadPrice(S, pi, r, c, z));
    });
  }
  sheet(head + rows.join(''));
  if (ui.tut) tutGateSheet(r, c);
  handlers.forEach(([id, fn]) => { const el = $(id); if (el) el.onclick = fn; });
}
function doRoad(r, c, ziel) {
  // Die Zielstufe kommt vom Knopf. Der Preis wird von buildRoad frisch bestimmt –
  // wer erst die Straße baut und dann im selben Blatt die Eisenbahn, zahlt für den
  // Ausbau nur noch 1 statt 2. Deshalb muss das Blatt danach neu gezeichnet werden,
  // sonst steht am Knopf noch der alte Preis.
  const target = ziel || roadTarget(S, S.cur, r, c);
  if (!target) return toast(T('Hier lässt sich nichts weiter bauen.'));
  const e = buildRoad(S, S.cur, r, c, target);
  toast(e || (target === 2 ? T('Eisenbahn gebaut') : T('Straße gebaut')));
  redraw();
  openTile(r, c);
}


/* Wie viele Menschen spielen mit? Nur dann lohnt die Anzeige, wer eine Technologie
   erforschen KÖNNTE – Bots kennen keine Verfügbarkeiten, sie würfeln frei aus dem Pool. */
function humanCount(S) { return S.players.filter(p => (p.kind === 'human' || p.kind === 'ki') && !p.dead).length; }
/* Marken an einer Technologiekachel: wer sie hat, wer sie erforschen könnte – zwei sehr
   verschiedene Dinge (erledigte Tatsache gegen bloße Möglichkeit), die vorher kaum zu
   unterscheiden waren (gleiches Symbol, gleiche Farbe, nur der Ring gestrichelt statt
   durchgezogen). Jetzt ist „hat sie" eine **ausgefüllte** Marke in der Reichsfarbe mit
   hellem Symbol, „könnte sie" eine **leere** Marke mit farbigem Symbol auf Papier und
   einem kleinen Fragezeichen. Voll gegen leer trägt auch bei 16 px und in Graustufen. */
function ownerMark(civ, art, self) {
  const hat = art === 'hat';
  const stil = hat
    ? `background:${civ.color};border-color:${civ.color};color:#fff`
    : `color:${civ.color};border-color:${civ.color}`;
  const titel = hat ? T('%s%s hat sie erforscht', civ.n, self ? ' (du)' : '')
    : T('%s könnte sie erforschen', civ.n);
  return `<span class="owner-mark ${hat ? 'has' : 'can'}${self ? ' self' : ''}"
    style="${stil}" title="${titel}">${SYM[civ.sym]}${hat ? '' : '<i>?</i>'}</span>`;
}
function ownerMarks(S, techKey, pi) {
  const mehrere = humanCount(S) > 1;
  const marks = S.players.map((pl, i) => {
    if (pl.dead) return '';
    const civ = civOf(pl), self = i === pi;
    if (pl.techs[techKey]) return ownerMark(civ, 'hat', self);
    // Verfügbar bei einem anderen Menschen – die eigene Verfügbarkeit sieht man an der Kachel
    if (mehrere && !self && (pl.kind === 'human' || pl.kind === 'ki') && pl.avail && pl.avail[techKey])
      return ownerMark(civ, 'kann', false);
    return '';
  }).join('');
  return marks ? `<span class="owner-marks">${marks}</span>` : '';
}
/* Kompakte Ertragsübersicht (Inspiration: Ozymandias). Je Geländetyp ein farbiger
   Punkt, Feldanzahl und der Beitrag zu Wissenschaft/Nahrung/Münzen; darunter die
   Bevölkerung und die Gesamtsumme. Zeigt das Einkommen des laufenden Zugs. */
const YIELD_ICON = ['🔬', '🌾', '🪙'];
const TERRAIN_GLYPH = { G: '🌿', W: '🌲', B: '⛰️', F: '💧', M: '🌊', I: '🏝️' };
function yieldRow(label, glyph, color, count, y, opts = {}) {
  const cells = y.map((n, i) => n
    ? `<span class="yv"><span class="yi">${YIELD_ICON[i]}</span>${n}</span>`
    : `<span class="yv zero">·</span>`).join('');
  return `<div class="yrow ${opts.cls || ''}">
    <span class="yl"><span class="ydot" style="background:${color}">${glyph}</span>
      <span class="yname">${label}</span>${count != null ? `<span class="ycount">×${count}</span>` : ''}</span>
    <span class="yvals">${cells}</span></div>`;
}
function yieldOverview(S, pi) {
  const b = incomeBreakdown(S, pi);
  let h = `<div class="yield-panel"><h4 class="yhead">${T('Ertrag nächster Zug')}</h4>`;
  for (const r of b.rows)
    h += yieldRow(r.name, TERRAIN_GLYPH[r.key] || '▪', TERRAIN[r.key].color, r.count, r.y);
  for (const e of (b.extra || []))
    h += yieldRow(e.name, e.glyph || '✦', '#c8a86a', e.count, e.y);
  h += yieldRow(T('Bevölkerung'), '👥', '#c8b98a', b.pop.count, b.pop.y, { cls: 'pop' });
  h += yieldRow(T('Summe'), '∑', '#6b5d47', null, b.total, { cls: 'sum' });
  // Vorschau: kein Einkommen, sondern was die Armeen zu Zugende erbeuten (Wikinger)
  for (const e of (b.preview || []))
    h += yieldRow(e.name, e.glyph || '⚔︎', '#b08a4a', null, e.y, { cls: 'prev' });
  h += '</div>';
  return h;
}
/* ------------------------------------------------------------------ Technologien */
/* Der Technologiebogen selbst: vier Felder × vier Zeitalter und darunter die
   Singularität. Zweimal gebraucht – im Spiel mit Knöpfen (techModal) und in der
   Legephase als reine Ansicht (placeTechView). `opts.plain` lässt die Kostenampel
   (bezahlbar / zu teuer) weg und macht jede Kachel unantastbar: vor dem ersten Zug gibt
   es noch nichts zu kaufen, und eine Kachel, die sich drücken ließe, aber nichts tut,
   wäre schlimmer als gar keine. */
function techBoardHTML(S, pi, opts) {
  const plain = !!(opts || {}).plain, p = S.players[pi];
  let grid = '<div class="techgrid">';
  for (let a = 0; a < 4; a++) {
    grid += `<div class="age-label">${AGES[a]}</div>`;
    for (let f = 0; f < 4; f++) {
      grid += `<div class="techcol">${a === 0 ? `<h4>${FIELDS[f]}</h4>` : ''}`;
      for (const t of techsIn(f, a, S)) {
        const owned = has(p, t.k), avail = p.avail[t.k] && !owned;
        const cost = techCost(S, pi, t);
        const can = !plain && avail && available(S, pi, 'sci') >= cost;
        // Sklaverei wird mit der ersten Technologie der Moderne obsolet – im Bogen sichtbar.
        const dead = t.k === 'sklaverei' && owned && !slaveryUsable(p);
        const eff = dead ? T('obsolet – seit der Moderne nicht mehr nutzbar') : techEffect(t, S);
        // Verfügbar zerfällt in zwei Zustände: bezahlbar (afford) und zu teuer (costly).
        // Rein grafisch – der Kostenwert steht ohnehin schon in der Kachel.
        const state = owned ? 'owned'
          : avail ? (plain ? 'avail' : can ? 'avail afford' : 'avail costly') : 'locked';
        grid += `<button class="tech ${state}${dead ? ' obsolete' : ''}"
          ${can ? `data-tech="${t.k}"` : 'disabled'}><span class="c">${owned ? '✓' : avail && !plain ? costText({ sci: cost }, String(cost)) : cost}</span>
          <b>${t.n}</b><span class="eff">${eff}</span>${ownerMarks(S, t.k, pi)}</button>`;
      }
      grid += '</div>';
    }
  }
  grid += '</div>';
  const sing = singularityReady(p), sc = techCost(S, pi, SINGULARITY);
  const singCan = !plain && sing && available(S, pi, 'sci') >= sc && !p.techs.singularitaet;
  const singState = p.techs.singularitaet ? 'owned'
    : sing ? (plain ? 'avail' : singCan ? 'avail afford' : 'avail costly') : 'locked';
  grid += `<button class="tech ${singState}" style="margin-top:10px"
      ${singCan ? 'data-tech="singularitaet"' : 'disabled'}>
      <span class="c">${sing && !plain && !p.techs.singularitaet ? costText({ sci: sc }, String(sc)) : sc}</span><b>${SINGULARITY.n}</b><span class="eff">${SINGULARITY.e}</span></button>`;
  return grid;
}
function techModal() {
  endFoundMode();
  const pi = S.cur, p = P(S);
  // Nur die kleine Legende mit zwei Beispielmarken – der erklärende Absatz darüber ist
  // raus, er stand in jeder Ansicht im Weg.
  const bsp = S.players.find((pl, i) => i !== pi && !pl.dead);
  let grid = bsp
    ? `<p class="sub owner-legend" style="margin:-2px 0 10px">
         ${ownerMark(civOf(bsp), 'hat', false)} <span>${T('hat sie erforscht')}</span>
         ${humanCount(S) > 1
        ? `${ownerMark(civOf(bsp), 'kann', false)} <span>${T('könnte sie erforschen')}</span>` : ''}
       </p>`
    : '';
  grid += techBoardHTML(S, pi);
  // Griechenland "Freie Forschung": eine verfügbare Tech bis Industrialisierung gratis
  const ft = freeTechOptions(S, pi);
  if (ft.length) {
    grid += `<p class="sub" style="margin-top:14px">${T('Freie Forschung (1× pro Runde, kostenlos)')}</p>`;
    grid += ft.map(t => `<button class="tech avail afford" data-freetech="${t.k}">
      <span class="c">${T('gratis')}</span><b>${t.n}</b><span class="eff">${techEffect(t, S)}</span></button>`).join('');
  }
  const bp = backPickOptions(S, pi);
  if (bp.length) {
    grid += `<p class="sub" style="margin-top:14px">${T('Rückschau: eine Technologie aus %s, früheres Zeitalter, kostenlos', FIELDS[backPick(p).f])}</p>`;
    grid += bp.map(t => `<button class="tech avail afford" data-backtech="${t.k}">
      <span class="c">${T('gratis')}</span><b>${t.n}</b><span class="eff">${techEffect(t, S)}</span></button>`).join('');
  }
  const cop = copyableTechs(S, pi);
  if (cop.length) {
    const anyFree = internetAvailable(S, pi) && cop.some(o => o.freeOk);
    grid += `<p class="sub" style="margin-top:14px">${T('Technologien kopieren')}${
      anyFree ? ' · ' + T('1× gratis per Internet') : ''}</p>`;
    cop.slice(0, 40).forEach(o => {
      // je Technologie ggf. zwei Knöpfe: bezahlt und/oder gratis
      const buttons = [];
      if (o.paidCoins != null)
        buttons.push(`<button class="tech avail ${available(S, pi, 'coins') >= o.paidCoins
          ? 'afford' : 'costly'}" data-copy="${o.tech.k}" data-mode="paid">
          <span class="c">${costText({ coins: o.paidCoins }, `${o.paidCoins}🪙`)}</span><b>${o.tech.n}</b>
          <span class="eff">${techEffect(o.tech, S)}</span>${ownerMarks(S, o.tech.k, pi)}</button>`);
      // Gratiskopie: dieselbe Kachel wie jede andere, mit der Wirkung der Technologie.
      // Dass es die Internet-Kopie ist, sagen schon „gratis" und die Überschrift.
      if (o.freeOk)
        buttons.push(`<button class="tech avail afford" data-copy="${o.tech.k}" data-mode="free">
          <span class="c">${T('gratis')}</span><b>${o.tech.n}</b>
          <span class="eff">${techEffect(o.tech, S)}</span>
          ${ownerMarks(S, o.tech.k, pi)}</button>`);
      grid += buttons.join('');
    });
  }
  const layout = `<div class="tech-layout">
    <aside class="tech-aside">${yieldOverview(S, pi)}</aside>
    <div class="tech-main">${grid}</div>
  </div>`;
  modal(T('Technologien · %s Wissenschaft verfügbar', available(S, pi, 'sci')), layout);
  $('overlay').classList.add('wide');
  if (ui.tut) tutGateTechs();
  $('ov-body').querySelectorAll('[data-tech]').forEach(b => b.onclick = () => {
    const e = doResearch(S, S.cur, b.dataset.tech);
    if (e) return toast(e);
    redraw(); if (S.over) { closeModal(); gameOver(); } else techModal();
  });
  $('ov-body').querySelectorAll('[data-freetech]').forEach(b => b.onclick = () => {
    const e = useFreeTech(S, S.cur, b.dataset.freetech);
    if (e) return toast(e); redraw(); techModal();
  });
  $('ov-body').querySelectorAll('[data-backtech]').forEach(b => b.onclick = () => {
    const e = useBackPick(S, S.cur, b.dataset.backtech);
    if (e) return toast(e); redraw(); techModal();
  });
  $('ov-body').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
    const e = copyTech(S, S.cur, b.dataset.copy, b.dataset.mode);
    if (e) return toast(e); redraw(); techModal();
  });
}
function powerSheet() {
  endFoundMode();
  // payOpts, nicht die nackte Münzprüfung: im Bürgerkrieg zählt auch Nahrung mit.
  const pi = S.cur, price = powerPrice(S, pi);
  const maxN = Math.floor(available(S, pi, 'coins', payOpts(S, pi)) / price);
  let h = `<h3>${T('Macht kaufen')}</h3><p class="sub">` +
    T('%s Münzen = 1 Macht · aktuell %s Macht. Zu Zugbeginn verlierst du %s davon.',
      price, P(S).power, has(P(S), 'panzer') ? '1/4' : has(P(S), 'stahl') ? '1/3' : '1/2') +
    (payOpts(S, pi).foodOk ? ' ' + T('Bürgerkrieg: auch mit Nahrung zahlbar.') : '') + '</p>' +
    // Machtansicht (v75): solange dieses Blatt offen ist, tragen Städte und Armeen Ringe
    `<p class="sub power-legend">${T('Ringe auf der Karte, ein Teilstück je Punkt: in der Farbe des Besitzers seine Verteidigung bzw. sein Machtwert, in fremder Farbe der Angriff bzw. die Flankierer. Überwiegt ein fremder Anteil, läuft die Belagerung bzw. fällt die Armee – bei Gleichstand hält der Verteidiger. Über %s Punkte nur noch als Anteil.', RING_MAX_PUNKTE)}</p>`;
  [1, 5, maxN].forEach((n, i) => {
    if (n <= 0 || (i === 2 && maxN <= 5)) return;
    h += `<button class="opt" data-n="${n}" data-label="+${n} Macht"><span>${T('+%s Macht', n)}${i === 2 ? `<small>${T('alles ausgeben')}</small>` : ''}</span>
      <span class="cost">${costText({ coins: n * price }, `${n * price}🪙`, payOpts(S, pi))}</span></button>`;
  });
  if (maxN <= 0) h += `<p class="sub">${T('Nicht genug Münzen.')}</p>`;
  sheet(h, { power: true });
  if (!ui.powerView) { ui.powerView = true; redraw(); }
  $('sheet-body').querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    const e = buyPower(S, S.cur, +b.dataset.n);
    if (e) toast(e);
    redraw(); powerSheet();             // die Ringe zeigen gleich den neuen Machtwert
  });
}
/* Protokollzeilen als HTML. Die Würfe, die zu einer Aktion geführt haben, hängen als
   aufklappbares Detail an dieser Aktionszeile: sichtbar ist nur, was passiert ist,
   die Würfe holt man sich per Antippen. Eine Bot-Runde besteht sonst zu gut der Hälfte
   aus 🎲-Zeilen und man findet die eigentliche Aktion nicht mehr.
   Die Zuordnung „Würfe davor gehören zur nächsten Aktionszeile" stimmt, weil die
   Regelmaschine erst würfelt und dann das Ergebnis protokolliert. Würfe, auf die keine
   Aktion folgt (Fehlschläge am Ende eines Zuges), stehen als eigener Sammelposten. */
function rollSummary(rolls) {
  // Aus „🎲 4 — Wachstum (2+)" wird der Grund gezogen; gleiche Gründe werden gezählt.
  const why = [], seen = new Map();
  for (const l of rolls) {
    const m = /—\s*(.+?)\s*(?:\(\d(?:[–-]\d)?\+?\))?\s*$/.exec(l.m);
    const w = m ? m[1] : 'Wurf';
    if (!seen.has(w)) { seen.set(w, 1); why.push(w); } else seen.set(w, seen.get(w) + 1);
  }
  const parts = why.slice(0, 3).map(w => seen.get(w) > 1 ? `${w} ×${seen.get(w)}` : w);
  if (why.length > 3) parts.push('…');
  return parts.join(', ');
}
function rollsBlock(rolls, lead) {
  const n = rolls.length;
  const tag = `<em class="rtag">🎲 ${n}</em>`;
  const inner = rolls.map(l => `<div class="logline roll">${l.m}</div>`).join('');
  const head = lead
    ? `<span class="lsum ${lead.c}">${lead.m}</span>${tag}`
    : `<span class="lsum">${rollSummary(rolls)}</span>${tag}`;
  return `<details class="rolls"><summary>${head}</summary>${inner}</details>`;
}
function logHtml(entries) {
  const out = [];
  let buf = [];
  for (const l of entries) {
    if (l.c === 'roll') { buf.push(l); continue; }
    // Rundenüberschriften bekommen keine Würfe angehängt – sie trennen die Züge.
    if (buf.length && l.c !== 'head') { out.push(rollsBlock(buf, l)); buf = []; continue; }
    if (buf.length) { out.push(rollsBlock(buf, null)); buf = []; }
    out.push(`<div class="logline ${l.c}">${l.m}</div>`);
  }
  if (buf.length) out.push(rollsBlock(buf, null));
  return out.join('');
}
function logModal() {
  modal('Protokoll', logHtml(S.log.slice(-260)));
  const b = $('ov-body'); b.scrollTop = b.scrollHeight;
}

/* ------------------------------------------------------------------ Zugende & Bots */
/* Der Zugwechsel darf nie hängen bleiben (v80). Gemeldet: nach den Zügen der KI blieb der
   Bildschirm gesperrt; von Hand half nur, die Sperre aufzuheben und den Zug des Menschen zu
   starten. Nachstellen ließ es sich nicht (Hunderte Partien über die echte Oberfläche, mit
   und ohne wildes Tippen). Deshalb zweierlei:
   · Ein Fehler in einem Zug oder beim Zugwechsel bricht den Ablauf nicht mehr ab. Er steht
     im Protokoll und in der Konsole (UI_ERRORS für smoke.js), und es geht weiter.
   · Die Sperre des KI-Blatts kann den Zug eines Menschen nicht überdauern (humanTurnStart),
     „Zug beenden" wirkt nur im eigenen Zug, und dieselbe KI zieht nie zweimal (runBots). */
const UI_ERRORS = [];
function sicher(was, fn) {
  try { return fn(); }
  catch (e) {
    const msg = (e && e.message) || String(e);
    UI_ERRORS.push(was + ': ' + msg);
    if (typeof console !== 'undefined' && console.error) console.error(e);
    if (S) log(S, 'warn', T('Interner Fehler (%s): %s – das Spiel läuft weiter. Bitte melden.', T(was), msg));
    toast(T('Interner Fehler – das Spiel läuft weiter. Näheres im Protokoll.'));
    return undefined;
  }
}
function endHumanTurn() {
  // Nur im eigenen Zug und nie, solange das Blatt eines KI- oder Bot-Zugs offen ist: sonst
  // liefe dessen Kampf ein zweites Mal, und der Zug spränge an seinem „Weiter" vorbei.
  if (!S || S.over || isAuto(P(S)) || ui.botLock) return;
  // Harte Sperre: eine Armee, die noch in einer Stadt steht, verhindert das Zugende
  // ganz – da hilft kein Bestätigen, der Zustand ist schlicht ungültig.
  const stop = blockingIssues(S, S.cur);
  if (stop.length) { toast(stop[0]); return; }
  const warn = pendingWarnings(S, S.cur);
  if (warn.length && !ui.confirmedEnd) {
    ui.confirmedEnd = true;
    toast(warn[0] + ' ' + T('Nochmal tippen zum Bestätigen.'));
    return;
  }
  ui.confirmedEnd = false; ui.army = null; ui.sel = null; ui.mode = null;
  closeSheet();
  const sinceSeq = S.logSeq || 0;
  sicher('Kampf', () => finishTurn(S));                    // Kampf und Siegprüfung
  const fights = logSince(S, sinceSeq).filter(l => l.c === 'fight');
  redraw();
  if (S.over) return gameOver();
  sicher('Zugwechsel', () => advanceTurn(S));
  redraw();
  runBots();
  if (fights.length) toast(fights[fights.length - 1].m);
}
/* Züge, die ohne Eingabe laufen: Bots nach den Bot-Regeln, die KI nach den Regeln für
   Menschen (kiTurn in js/ki.js). Beide enden gleich – Kampf und Sieg in finishTurn, dann
   das Blatt mit dem, was passiert ist, und „Weiter".
   Dieselbe KI zieht nie zweimal in einer Runde (S.autoPlayed, v80): gespeichert wird nach
   ihrem Zug, „Weiter" kommt erst danach. Wurde die App dazwischen neu geladen (oder runBots
   zweimal angestoßen), zog sie bis v79 noch einmal – samt zweitem Kampf. Jetzt zeigt das
   Blatt nur wieder, was sie getan hat. */
function runBots() {
  if (S.over) return gameOver();
  const p = P(S);
  if (!isAuto(p)) return humanTurnStart();
  const done = !!S.autoPlayed && S.autoPlayed.cur === S.cur && S.autoPlayed.round === S.round;
  const sinceSeq = done ? S.autoPlayed.seq : (S.logSeq || 0);
  if (!done) {
    S.autoPlayed = { cur: S.cur, round: S.round, seq: sinceSeq };
    sicher(p.kind === 'ki' ? 'KI-Zug' : 'Bot-Zug', () => { if (p.kind === 'ki') kiTurn(S, S.cur); else botTurn(S, S.cur); });
    sicher('Kampf', () => finishTurn(S));    // Kampf des Bots bzw. der KI, einmal pro Zug
  }
  redraw();
  const entries = logSince(S, sinceSeq);
  const lines = entries.length
    ? logHtml(entries)
    : `<div class="logline info">${T('Keine Aktionen in dieser Runde.')}</div>`;
  ui.botLock = true;                   // Sheet ist jetzt gesperrt: nur „Weiter" führt weiter
  sheet(`<h3>${civOf(p).n} (${p.kind === 'ki' ? T('KI') : T('Bot')})</h3><p class="sub">${T('Runde %s', S.round)}</p>${lines}
    <button class="btn wide" id="bot-next">${T('Weiter')}</button>`);
  $('sheet').classList.add('locked');
  $('bot-next').onclick = afterAutoTurn;
}
/* „Weiter" unter dem Blatt eines KI- oder Bot-Zugs. Ist schon ein Mensch am Zug (ein
   zweites, verspätetes Antippen), wird nichts übersprungen. */
function afterAutoTurn() {
  ui.botLock = false;
  $('sheet').classList.remove('locked');
  closeSheet();
  if (S.over) return gameOver();
  if (!isAuto(P(S))) return humanTurnStart();
  sicher('Zugwechsel', () => advanceTurn(S));
  redraw();
  if (S.over) return gameOver();
  if (isAuto(P(S))) runBots();
  else humanTurnStart();
}
/* ------------------------------------------------------------- Nochmal spielen
   Allein gegen Bots steht am Spielende ein zweiter, hervorgehobener Knopf: dieselbe
   Aufstellung, aber ein ausgelostes Reich – und nach einem Sieg eine Stufe schwerer.
   Gedacht für die Runde nach der Runde: nichts wieder einstellen, nicht dreimal
   hintereinander dasselbe Reich, und ein Sieg zieht von selbst weiter.

   Nur bei EINEM Menschen: zu mehreren gehört die Aufstellung nicht einem allein, und ein
   ausgeloster Platz wäre eine Entscheidung über andere hinweg. Dann bleibt es beim Weg
   über den Aufbau.                                                                     */
// Plätze, nicht Überlebende: ein Mensch, dessen Hauptstadt gefallen ist, saß trotzdem
// mit am Tisch. Barbaren sind eine Ereignisfraktion und kein Platz.
const humanSeats = S => S.players
  .map((p, i) => i).filter(i => S.players[i].kind === 'human');
// Der einzige Mensch – oder −1, wenn es mehrere sind oder kein Rezept vorliegt
// (Tutorial und von Hand geladene Spielstände älterer Fassungen haben keines).
function soloHuman(S) {
  const h = humanSeats(S);
  return (S && S.recipe && h.length === 1) ? h[0] : -1;
}
/* Eine Stufe schwerer. DIFFICULTIES steht von leicht nach schwer (Siedler … David):
   weiter hinten heißt, die Bots brauchen weniger auf dem Würfel. Am Ende der Liste
   bleibt es dabei – wir erfinden keinen Grad. */
const nextDiff = k => {
  const i = DIFFICULTIES.findIndex(d => d.k === k);
  return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, (i < 0 ? 2 : i) + 1)].k;
};
const diffName = k => (DIFFICULTIES.find(d => d.k === k) || DIFFICULTIES[2]).n;
// Der Aufbau setzt einen Grad für alle Plätze, gelesen wird deshalb der erste.
const recipeDiff = rec => ((rec.players || []).find(p => p.diff) || {}).diff || 'prinz';
/* Dasselbe für die KI: ihre Stufen (KI_LEVELS, leicht → schwer). Sitzt eine KI mit am
   Tisch, spricht „Nochmal spielen" von ihrer Stufe – sie ist dann der eigentliche Gegner. */
const nextKiLevel = k => {
  const i = KI_LEVELS.findIndex(d => d.k === k);
  return KI_LEVELS[Math.min(KI_LEVELS.length - 1, (i < 0 ? 1 : i) + 1)].k;
};
const kiLevelName = k => (KI_LEVELS.find(d => d.k === k) || KI_LEVELS[1]).n;
const recipeHasKi = rec => (rec.players || []).some(p => p.kind === 'ki');
const recipeKiLevel = rec => ((rec.players || []).find(p => p.kind === 'ki' && p.kiLevel) || {}).kiLevel || KI_DEFAULT_LEVEL;

function rematch(harder) {
  const rec = JSON.parse(JSON.stringify(S.recipe));
  const frei = rec.mapPick === 'plaettchen';    // dort darf ein Reich doppelt sitzen
  rec.players.forEach((p, i) => {
    if (harder) p.diff = nextDiff(p.diff);
    if (harder && p.kind === 'ki') p.kiLevel = nextKiLevel(p.kiLevel);
    if (p.kind !== 'human') return;
    // Ausgelostes Reich – und damit auch eine ausgeloste Fähigkeit.
    p.ability = 'zufall';
    if (frei) { p.civ = 'zufall'; return; }     // freie Auslosung erledigt startFromRecipe
    /* Auf den festen Karten sitzt jede Zivilisation genau einmal. Ein simples „Zufall"
       hilft hier nicht: die Auslosung nimmt nur, was noch frei ist, und bei vier Reichen
       ist das genau das eigene alte – man bekäme jedes Mal dasselbe. Deshalb wird hier
       wirklich getauscht: gezogen wird aus allen vier, und wer das gezogene Reich hatte,
       übernimmt das alte des Menschen. Die Reiche bleiben damit paarweise verschieden. */
    const gezogen = CIV_KEYS[Math.floor(Math.random() * CIV_KEYS.length)];
    const vorher = p.civ;
    const halter = rec.players.find((q, j) => j !== i && q.civ === gezogen);
    if (halter) halter.civ = vorher;
    p.civ = gezogen;
  });
  startFromRecipe(rec);
}
function startFromRecipe(rec) {
  const frei = rec.mapPick === 'plaettchen';       // dort darf ein Reich doppelt sitzen
  const players = nameDoubles(resolveRandom(JSON.parse(JSON.stringify(rec.players)), frei));
  const cfg = {
    players, duel: rec.mode === 'duell', recipe: rec,
    startPlayer: rec.start === 'zufall' ? Math.floor(Math.random() * players.length)
      : Math.min(players.length - 1, Math.max(0, +rec.start || 0)),
    events: rec.events, eventMode: rec.eventMode, wonders: rec.wonders,
    // Ein Rezept aus v70–v81 kann noch altTree tragen – egal: jede neue Partie läuft seit
    // v82 im (einzigen) Techtree, auch „Nochmal spielen" nach einer alten Partie.
  };
  // Vom alten Spiel darf nichts stehen bleiben: gesperrtes Bot-Blatt, offenes Fenster,
  // die Schnipsel des letzten Sieges. endTutorialPanel setzt ui zurück, auch botLock.
  endTutorialPanel();
  $('sheet').classList.remove('locked');
  closeModal(); closeSheet();
  const schnipsel = $('confetti'); if (schnipsel) schnipsel.remove();
  // Marathon: neue Karte, neuer Draft
  if (rec.mode === 'marathon') return startMarathon(cfg);
  // Plättchenkarte: erst legen alle ihr Startdreieck neu, dann beginnt das Spiel.
  if (frei) return startPlacement(cfg);
  cfg.map = rec.mapPick === 'eigene' ? (customMap || DEFAULT_MAP)
    : (MAPS[+rec.mapPick] || DEFAULT_MAP);
  S = newGame(cfg);
  startGameScreen();
}

function gameOver() {
  const o = S.over, w = o.winner;
  const namen = (o.winners || [w]).map(i => civOf(S.players[i]).n).join(T(' und '));
  const titel = o.shared ? T('%s gewinnen gemeinsam.', namen) : T('%s gewinnt.', namen);
  // Bei mehreren Siegansprüchen die Punkte offenlegen: Bevölkerung + Wunder + Techs.
  let tafel = '';
  if (o.score && o.score.length > 1) {
    tafel = `<table class="tbl" style="margin:10px 0"><tr><th>${T('Reich')}</th><th>${T('Bev.')}</th>
      <th>${T('Wunder')}</th><th>${T('Techs')}</th><th>${T('Punkte')}</th></tr>` +
      o.score.map(x => `<tr${(o.winners || []).includes(x.pi) ? ' style="font-weight:700"' : ''}>
        <td>${civOf(S.players[x.pi]).n}</td><td>${x.pop}</td><td>${x.wonders}</td>
        <td>${x.techs}</td><td>${x.total}</td></tr>`).join('') + '</table>' +
      `<p class="sub">${o.score.map(x => `${civOf(S.players[x.pi]).n}: ${x.how}`).join(' · ')}</p>` +
      (o.tiebreak === 'mensch'
        ? `<p class="sub">${T('Melden Mensch und Bot in derselben Runde einen Sieg an, gewinnt der Mensch – auch mit weniger Punkten.')}</p>`
        : '');
  }
  /* Ein Tipp fürs nächste Mal, gewonnen oder verloren. Gelost wird EINMAL je Partie und
     im Spielstand gemerkt: gameOver() wird aus mehreren Wegen aufgerufen (Zugende,
     Bot-Fenster, Forschen, ein neu geladener beendeter Spielstand), und ein bei jedem
     Aufruf anderer Tipp sähe wie ein Fehler aus. */
  if (S.tip == null) { S.tip = Math.floor(Math.random() * TIPS.length); saveGame(); }
  const tipp = `<p class="tip"><b>${T('Tipp')}</b>${esc(TIPS[S.tip % TIPS.length])}</p>`;
  /* Allein gegen Bots: „Nochmal spielen" vor und über dem Weg ins Menü – der häufigere
     Wunsch nach einer Partie ist die nächste Partie. */
  const mensch = soloHuman(S);
  const gewonnen = mensch >= 0 && (o.winners || [w]).includes(mensch);
  let nochmal = '';
  if (mensch >= 0) {
    // Mit KI am Tisch zählt ihre Stufe, sonst der Schwierigkeitsgrad der Bots
    const ki = recipeHasKi(S.recipe);
    const alt = ki ? recipeKiLevel(S.recipe) : recipeDiff(S.recipe);
    const neu = gewonnen ? (ki ? nextKiLevel(alt) : nextDiff(alt)) : alt;
    const name = ki ? kiLevelName : diffName;
    const sub = !gewonnen
      ? T('Dieselben Einstellungen, ausgelostes Reich, Schwierigkeit %s.', name(alt))
      : neu !== alt
        ? T('Dieselben Einstellungen, ausgelostes Reich – und eine Stufe schwerer: %s.', name(neu))
        : T('Dieselben Einstellungen, ausgelostes Reich. Schwerer als %s geht es nicht.', name(alt));
    nochmal = `<button class="btn primary wide" id="go-again">${T('Nochmal spielen')}</button>
      <p class="sub" style="margin:6px 2px 0;text-align:center">${sub}</p>`;
  }
  modal(T('Spielende'), `<p style="font-family:var(--serif);font-size:22px;margin:0 0 6px">
    ${titel}</p><p class="sub">${o.how}</p>${tafel}${tipp}${nochmal}
    <button class="btn wide" id="go-menu">${T('Zurück zum Menü')}</button>`);
  if ($('go-again')) $('go-again').onclick = () => rematch(gewonnen);
  $('go-menu').onclick = () => { store('hochciv.save', null); location.reload(); };
  confetti(civOf(S.players[w]).color);
}
/* Kleiner Sieggruß: ein paar Papierschnipsel, die einmal durchs Bild fallen.
   Bewusst sparsam – 40 Stück, gut zwei Sekunden, danach räumt es sich selbst ab.
   Reines CSS in Bewegung, kein Zeitgeber je Schnipsel; wer Bewegung reduziert haben
   möchte (prefers-reduced-motion), bekommt gar keins. */
function confetti(farbe) {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch { /* Browser ohne matchMedia – dann gibt es Schnipsel */ }
  const alt = $('confetti'); if (alt) alt.remove();
  const box = document.createElement('div');
  box.id = 'confetti';
  const farben = [farbe || '#9a3b2f', '#c8a83c', '#4d7a4a', '#e8dfc4'];
  let h = '';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 100, dauer = 1.6 + Math.random() * 1.1;
    const spät = Math.random() * 0.5, dreh = Math.random() * 720 - 360;
    const c = farben[i % farben.length], br = 5 + Math.random() * 5;
    h += `<i style="left:${x}%;background:${c};width:${br.toFixed(1)}px;
      height:${(br * 1.6).toFixed(1)}px;animation-duration:${dauer.toFixed(2)}s;
      animation-delay:${spät.toFixed(2)}s;--dreh:${dreh.toFixed(0)}deg"></i>`;
  }
  box.innerHTML = h;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3400);
}

/* --------------------------------------------------------- Ereignis & Erweiterungen */
function curEvent() {
  if (!S || !S.ev || !S.event || !S.event.k || S.event.round !== S.round) return null;
  return EVENT_BY_KEY[S.event.k];
}
/* „Welt": Ereignis dieser Runde, Weltwunder, Barbaren – alles auf einen Blick. */
function worldModal() {
  const pi = S.cur;
  // Wer ist wer: Reich, Farbe und Fähigkeit. Bei ausgelosten Fähigkeiten ist das die
  // Stelle, an der man in Ruhe nachliest, was man (und die anderen) bekommen hat.
  let h = `<p class="sub">${T('Die Reiche')}</p><div class="civ-list">` +
    S.players.filter(x => x.kind !== 'barbar').map((x, i) => {
      const c = civOf(x), as = abilInfos(x);
      return `<div class="civ-row${i === pi ? ' self' : ''}">
        <span class="civ-chip" style="border-color:${c.color};color:${c.color}">${SYM[c.sym]}</span>
        <span class="civ-n">${esc(c.n)}${x.dead ? ' · ' + T('ausgeschieden') : ''}</span>
        <span class="civ-a">${as.length ? as.map(a => `<b>${esc(a.n)}</b><small>${esc(a.e)}</small>`).join('')
        : `<i>${T('Bots haben keine Fähigkeit')}</i>`}</span></div>`;
    }).join('') + '</div>';
  if (oldTreeShown())
    h += `<p class="sub" style="margin-top:12px">${T('Alter Techtree')} · ${oldTreeText()}</p>`;
  if (S.ev) {
    const ev = curEvent();
    h += ev
      ? `<div class="evbox"><b>${T('Ereignis: %s', ev.n)}</b><p>${ev.e}</p>
         ${hasWonder(S, pi, 'palast') ? `<p>${T('Der Apostolische Palast schützt dich davor.')}</p>` : ''}</div>`
      : `<div class="evbox"><b>${T('Kein Ereignis in dieser Runde')}</b><p>${T('Der Spaltenwürfel ging ins Leere.')}</p></div>`;
    if (hasWonder(S, pi, 'orakel')) {
      const nx = peekNextEvent(S);
      const nn = nx && nx.k ? EVENT_BY_KEY[nx.k].n : T('keines');
      h += `<p class="sub">${T('Das Orakel sieht für die nächste Runde: %s', '<b>' + nn + '</b>')}</p>`;
    }
    if ((S.barbs || []).length)
      h += `<p class="sub">${T('Barbaren belagern %s Stadt/Städte.', S.barbs.length)}</p>`;
    if (S.nukeBan) h += `<p class="sub">${T('Atomwaffenproteste: Atomwaffen sind gesperrt.')}</p>`;
  }
  if (S.wo) {
    const c = wonderCounts(S, pi);
    h += `<p class="sub" style="margin-top:12px">` +
      T('Deine Weltwunder — Stufe 1: %s · Stufe 2: %s · Stufe 3: %s · nächstes Wunder %s Münzen',
        c[1], c[2], c[3], wonderCost(S, pi)) + '</p>';
    h += '<div class="wlist">' + (wondersOf(S, pi).map(w =>
      `<span class="wtag">${WONDER_BY_KEY[w.k].n}${w.cityId == null ? ' (' + T('freistehend') + ')' : ''}</span>`).join('')
      || `<span class="sub">${T('noch keins')}</span>`) + '</div>';
    for (const lvl of [1, 2, 3]) {
      const pool = poolOf(S, lvl);
      if (!pool.length) continue;
      h += `<p class="sub" style="margin-top:10px">${T('Verfügbar, Stufe %s', lvl)}</p>`;
      h += pool.map(k => `<div class="tech ${wonderLevelOk(S, pi, lvl) ? 'avail' : 'locked'}">
        <span class="c">${WONDER_BY_KEY[k].lvl}</span><b>${WONDER_BY_KEY[k].n}</b>
        <span class="eff">${WONDER_BY_KEY[k].e}</span></div>`).join('');
    }
    const others = S.players.map((pl, i) => i).filter(i => i !== pi && wondersOf(S, i).length);
    if (others.length) {
      h += `<p class="sub" style="margin-top:10px">${T('Andere Reiche')}</p>`;
      h += others.map(i => `<p style="font-size:12px;margin:2px 0">
        <b style="color:${civOf(S.players[i]).color}">${civOf(S.players[i]).n}</b>: ` +
        wondersOf(S, i).map(w => WONDER_BY_KEY[w.k].n).join(', ') + '</p>').join('');
    }
  }
  if (!S.ev && !S.wo) h += `<p class="sub">${T('Dieses Spiel läuft ohne Ereignisse und ohne Weltwunder.')}</p>`;
  modal(T('Welt'), h);
}
/* Weltwunder in einer Stadt bauen */
function wonderSheet(city) {
  const pi = S.cur;
  const cost = wonderCost(S, pi);
  let h = `<h3>${T('Weltwunder bauen')}</h3><p class="sub">` +
    T('Kosten %s Münzen · diese Stadt hat %s/2 Wunder · verfügbar: %s Münzen',
      cost, wondersInCity(S, city).length, available(S, pi, 'coins')) + '</p>';
  const list = availableWonders(S);
  const rows = list.map(w => {
    const err = canBuildWonder(S, pi, city, w.k);
    return `<button class="opt" data-w="${w.k}" ${err ? 'disabled' : ''}>
      <span>${w.n}<small>${T('Stufe %s', w.lvl)} · ${w.e}${err ? ' · ' + err : ''}</small></span>
      <span class="cost">${costText({ coins: cost }, `${cost}🪙`)}</span></button>`;
  }).join('');
  sheet(h + (rows || `<p class="sub">${T('Keine Wunder verfügbar.')}</p>`));
  $('sheet-body').querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
    const e = buildWonder(S, S.cur, city, b.dataset.w);
    if (e) return toast(e);
    redraw();
    if (S.over) { closeSheet(); return gameOver(); }
    if (freePick(P(S))) return freePickModal();
    openTile(city.r, city.c);
  });
}
/* Nahrungsübersicht zu Zugbeginn: was das Land produziert, was die Bevölkerung isst
   und – mit Gentechnik/Massenmedien – wie viel davon aus Wissenschaft oder Münzen
   bestritten wird. Voreingestellt ist die Deckung aus Nahrung, also gar keine
   Verschiebung; jede Änderung lässt sich zurücknehmen.
   Kein Umtausch: gedeckt wird höchstens, was die Bevölkerung tatsächlich isst. */
function foodSheet() {
  const pi = S.cur, p = ensureFoodState(S, pi);
  const isst = p.popFood || 0, gedeckt = p.popCovered || 0;
  const land = (p.foodRaw || 0) + isst;              // Produktion ohne die Bevölkerung
  const offen = Math.max(0, isst - gedeckt);
  const src = feedSources(S, pi);

  const zeile = (n, v, cls) => `<div class="fl ${cls || ''}"><span>${n}</span>
    <b>${v > 0 ? '+' : ''}${v} 🌾</b></div>`;
  let h = `<h3>${T('Nahrung diese Runde')}</h3>
    <div class="foodcalc">
      ${zeile(T('Das Land produziert'), land)}
      ${zeile(T('Die Bevölkerung isst (%s)', popOf(S, pi)), -isst)}
      ${gedeckt ? zeile(T('Davon aus %s bestritten', [
        p.popCoveredBy && p.popCoveredBy.sci ? T('Wissenschaft') : '',
        p.popCoveredBy && p.popCoveredBy.coins ? T('Münzen') : ''].filter(Boolean).join(' ' + T('und') + ' ')),
        gedeckt, 'plus') : ''}
      ${zeile(T('Bleibt nutzbar'), p.res.food, 'sum')}
      ${p.foodDeficit ? `<p class="hint warn-t">${T('Ungedeckt: %s 🌾 – die Nahrung bleibt bei 0, die Bevölkerung nimmt keinen Schaden.', p.foodDeficit)}</p>` : ''}
    </div>`;

  if (!src.length) {
    h += T('<p class="hint">Mit <b>Gentechnik</b> oder <b>Massenmedien</b> ließe sich ein Teil davon aus Wissenschaft oder Münzen bestreiten.</p>');
    sheet(h); return;
  }
  h += T('<p class="sub" style="margin-top:10px">Aus anderen Quellen bestreiten – höchstens %s, also nur die tatsächlichen Kosten.</p>', isst);
  src.forEach(x => {
    const have = p.res[x.kind];
    /* Eine Einheit deckt x.rate (Massenmedien: eine Münze fünf). Angeboten werden eine
       Einheit und die Zahl, die alles Offene deckt – mehr als nötig lässt coverPop
       ohnehin nicht zu. Die letzte Einheit darf dabei teilweise verfallen, deshalb
       steht auf dem Knopf, was sie WIRKLICH deckt, nicht Anzahl × Kurs. */
    const noetig = Math.min(have, Math.ceil(offen / x.rate));
    const steps = [...new Set([1, noetig])].filter(n => n > 0 && n <= noetig).sort((a, c) => a - c);
    const deckung = n => Math.min(n * x.rate, offen);
    const gesetzt = (p.popSpent && p.popSpent[x.kind]) || 0;
    h += `<p class="sub" style="margin-top:8px">${T('%s: %s übrig', x.n, have)}${
      x.rate > 1 ? ' · ' + T('1 %s deckt %s', x.n1 || x.n, x.rate) : ''}${
      gesetzt ? ' · ' + T('%s eingesetzt', gesetzt) : ''}</p>`;
    if (!steps.length && !gesetzt) { h += `<p class="hint">${T('Nichts einzusetzen.')}</p>`; return; }
    steps.forEach(n => {
      h += `<button class="opt" data-k="${x.kind}" data-n="${n}"><span>${T('%s %s einsetzen', n, x.n)}${
        deckung(n) === offen ? `<small>${T('deckt alles, was die Bevölkerung isst')}</small>` : ''}</span>
        <span class="cost">+${deckung(n)}🌾</span></button>`;
    });
    if (gesetzt)
      h += `<button class="opt ghost" data-back="${x.kind}" data-n="${gesetzt}">
        <span>${T('%s %s zurücknehmen', gesetzt, x.n)}</span>
        <span class="cost">−${(p.popCoveredBy && p.popCoveredBy[x.kind]) || 0}🌾</span></button>`;
  });
  sheet(h);
  $('sheet-body').querySelectorAll('[data-k]').forEach(b2 => b2.onclick = () => {
    const e = coverPop(S, S.cur, b2.dataset.k, +b2.dataset.n);
    if (e) return toast(e);
    redraw(); foodSheet();
  });
  $('sheet-body').querySelectorAll('[data-back]').forEach(b2 => b2.onclick = () => {
    const e = uncoverPop(S, S.cur, b2.dataset.back, +b2.dataset.n);
    if (e) return toast(e);
    redraw(); foodSheet();
  });
}
/* Auswahl kostenloser Technologien (Bibliothek, Oxford, Griechenland) */
function freePickModal() {
  // Die Singularität ist über Oxford kostenlos wählbar und beendet das Spiel sofort.
  // Ohne diese Prüfung liefe die Auswahl weiter, das Fenster schlösse sich stumm und
  // der Siegbildschirm käme nie – das Spiel wirkte hängengeblieben.
  if (S.over) { closeModal(); return gameOver(); }
  const pi = S.cur, p = P(S);
  const pick = freePick(p);
  const list = pick ? freePickOptions(S, pi) : backPickOptions(S, pi);
  const title = pick ? pick.why : T('Rückschau');
  if (!list.length) { closeModal(); return; }
  const h = `<p class="sub">${pick ? T('Noch %s kostenlose Technologie(n).', pick.n) :
    T('Eine beliebige Technologie desselben Feldes aus einem früheren Zeitalter, kostenlos.')}</p>` +
    list.map(t => `<button class="tech avail" data-free="${t.k}">
      <span class="c">${T('gratis')}</span><b>${t.n}</b><span class="eff">${techEffect(t, S)}</span></button>`).join('');
  modal(title, h);
  $('ov-body').querySelectorAll('[data-free]').forEach(b => b.onclick = () => {
    const e = pick ? useFreePick(S, S.cur, b.dataset.free) : useBackPick(S, S.cur, b.dataset.free);
    if (e) return toast(e);
    redraw();
    if (S.over) { closeModal(); return gameOver(); }
    if (freePick(P(S)) || backPickOptions(S, S.cur).length) freePickModal();
    else closeModal();
  });
}
/* Nach jedem Zugwechsel auf einen Menschen: Ereignis melden, Defizit anbieten. Eine Sperre
   aus dem Blatt eines KI- oder Bot-Zugs darf hier nicht mehr stehen (v80) – genau das war
   der gemeldete Zustand: der Mensch am Zug, das Blatt gesperrt, „Weiter" ohne Wirkung. */
function humanTurnStart() {
  if (ui.botLock || $('sheet').classList.contains('locked')) {
    ui.botLock = false;
    $('sheet').classList.remove('locked');
    closeSheet();
  }
  redraw();
  const p = P(S);
  if (S.over) return gameOver();
  const ev = curEvent();
  toast(ev ? T('%s ist am Zug · Ereignis: %s', civOf(p).n, ev.n)
    : T('%s ist am Zug', civOf(p).n));
  sicher('Zugbeginn', () => {
    // Mit Gentechnik/Massenmedien gehört die Nahrungsrechnung zu Zugbeginn entschieden.
    if (canFeed(p) && popOpen(ensureFoodState(S, S.cur)) > 0) foodSheet();
    else if (p.foodDeficit > 0) toast(T('Nahrungsdefizit %s – Nahrung bleibt bei 0.', p.foodDeficit));
    else if (freePick(p)) freePickModal();
  });
}

/* ------------------------------------------------ Einstellungen: Erweiterungsmodule
   Ereignisse und Weltwunder sind Erweiterungen des Grundspiels. Ab Werk sind beide AUS
   und tauchen im Aufbau überhaupt nicht auf – wer das erste Mal spielt, wird nicht nach
   Regeln gefragt, die er noch nicht kennt. Eingeschaltet erscheint je Modul die bekannte
   Zeile im Aufbau und entscheidet weiterhin je Partie: das Modul macht die Wahl
   verfügbar, es trifft sie nicht.

   Die Wahl gilt geräteweit und bleibt gespeichert. Sie ändert am Spiel selbst nichts:
   ein Spiel mit abgeschalteten Modulen läuft genau wie eines, in dem beide Häkchen
   fehlen – die Vorgabe im Aufbau war schon immer „ohne\".                             */
const MODULES = [
  { k: 'ereignisse', box: 'opt-events', row: 'setup-events-row', flag: 'setup-events' },
  { k: 'wunder', box: 'opt-wonders', row: 'setup-wonders-row', flag: 'setup-wonders' },
];
const OPT_KEY = 'hochciv.opts';
const modules = { ereignisse: false, wunder: false };
function loadModules() {
  const o = load(OPT_KEY) || {};
  MODULES.forEach(m => { modules[m.k] = !!o[m.k]; });
}
/* Anzeige (v82): „Kosten ohne Umtausch anzeigen" – ab Werk aus, dann zeigen die Knöpfe,
   was tatsächlich abgeht (costText). Geräteweit gemerkt, ändert am Spiel nichts. Eigener
   Schlüssel, damit die Module ihr gespeichertes Objekt behalten, wie es war. */
const PREF_KEY = 'hochciv.prefs';
const prefs = { listPrice: false };
function loadPrefs() {
  const o = load(PREF_KEY) || {};
  prefs.listPrice = !!o.listPrice;
}
function optionsScreen() {
  MODULES.forEach(m => {
    const box = $(m.box);
    box.checked = !!modules[m.k];
    box.onchange = () => {
      modules[m.k] = box.checked;
      store(OPT_KEY, modules);
    };
  });
  const lp = $('opt-listprice');
  lp.checked = prefs.listPrice;
  lp.onchange = () => { prefs.listPrice = lp.checked; store(PREF_KEY, prefs); };
}
/* Zeilen abgeschalteter Module aus dem Aufbau nehmen – und ihr Häkchen löschen. Ohne das
   Löschen könnte ein Modul, das jemand einmal eingeschaltet und angehakt hat, nach dem
   Abschalten unsichtbar weiterlaufen: die Zeile wäre weg, das Häkchen noch gesetzt. */
function applyModules() {
  MODULES.forEach(m => {
    const on = !!modules[m.k];
    if (!on) $(m.flag).checked = false;
    $(m.row).hidden = !on;
  });
  evmodeRow();
}
// Die Ereignisstärke gehört zu den Ereignissen und hängt an deren Häkchen.
function evmodeRow() { $('setup-evmode-row').hidden = !$('setup-events').checked; }
/* Der alte Techtree (bis v81 Standard) ist seit v82 nicht mehr wählbar – die Zeile im Aufbau
   ist weg. Er lebt nur im Tutorial weiter und in Partien, die vor v82 mit ihm begonnen
   wurden (migrateState). Für solche Partien nennen Weltblatt und Regelbogen ihn; im
   Tutorial nicht, dort wäre der Hinweis für Neulinge nur verwirrend. Der Text kommt aus
   OLD_TECH_COSTS, damit er nicht veraltet. */
function oldTreeText() {
  return FIELDS.map((fn, f) => {
    const liste = Object.keys(OLD_TECH_COSTS).map(k => TECH_BY_KEY[k]).filter(t => t.f === f)
      .sort((a, b) => OLD_TECH_COSTS[a.k] - OLD_TECH_COSTS[b.k]);
    return liste.length ? liste.map(t => `${t.n} ${OLD_TECH_COSTS[t.k]}`).join(', ') + ` (${fn})` : '';
  }).filter(Boolean).join(' · ');
}
const oldTreeShown = () => !!(S && S.oldTree && !ui.tut);

/* ------------------------------------------------------------------ Aufbau */
// 'vier' = alle vier Reiche, 'drei' = drei Reiche, 'duell' = 1 gegen 1
let setupMode = 'vier';
const setupCount = () => setupMode === 'duell' ? 2 : setupMode === 'drei' ? 3 : 4;

/* Kartenliste. Sie hängt an der Spielerzahl: die Plättchenkarte hat für zwei, drei und
   vier Reiche eine eigene Form, die festen Karten haben vier Startsterne (bei drei
   Reichen bleibt einer ungenutzt), und im Duell passen sie gar nicht. */
function mapOptions() {
  const n = setupCount();
  const out = [];
  if (n > 2) MAPS.forEach((m, i) => out.push([String(i), m.name]));
  out.push(['plaettchen', TILE_SHAPES[n].name]);
  if (customMap && n > 2) out.push(['eigene', T('Eigene Karte')]);
  return out;
}
/* Die zuletzt bewusst gewählte Karte. Sie wird gemerkt, damit ein Ausflug in den
   Duellmodus (dort gibt es die festen Karten nicht) die Wahl nicht still umstellt. */
let setupMapWanted = '0';
function fillMapSelect() {
  const sel = $('setup-map');
  // Marathon (v83): immer eine neue Zufallskarte – keine Wahl, dafür der Hinweis
  const marathon = setupMode === 'marathon';
  $('setup-marathon-hint').hidden = !marathon;
  if (marathon) {
    $('setup-map-row').hidden = true;
    $('setup-tile-hint').hidden = true; $('setup-double-hint').hidden = true;
    return;
  }
  const opts = mapOptions();
  sel.innerHTML = opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  sel.value = opts.some(o => o[0] === setupMapWanted) ? setupMapWanted : opts[0][0];
  // Im Duell gibt es nur die Plättchenkarte – dann bleibt die Zeile weg statt einer
  // Auswahl mit einem einzigen Eintrag.
  $('setup-map-row').hidden = opts.length < 2;
  sel.disabled = opts.length < 2;
  sel.onchange = () => {
    setupMapWanted = sel.value;
    renderSlots();          // die Plättchenkarte lässt jede Zivilisation mehrfach zu
  };
  $('setup-tile-hint').hidden = sel.value !== 'plaettchen';
  $('setup-double-hint').hidden = sel.value !== 'plaettchen';
}
// Auf der Plättchenkarte darf jeder Platz frei wählen, auch dieselbe Zivilisation
// mehrfach – auf den festen Karten sitzt jede Zivilisation genau einmal (feste
// Startsterne, ein Stern je Reich).
const freieCivWahl = () => setupMode !== 'marathon' && setupMapWanted === 'plaettchen';
function setupScreen() {
  $('setup-evmode').innerHTML = EVENT_MODES.map(m => `<option value="${m.k}">${m.n}</option>`).join('');
  $('setup-diff').innerHTML = DIFFICULTIES.map(x =>
    `<option value="${x.k}"${x.k === 'prinz' ? ' selected' : ''}>${x.n}</option>`).join('');
  $('setup-kilevel').innerHTML = KI_LEVELS.map(x =>
    `<option value="${x.k}"${x.k === KI_DEFAULT_LEVEL ? ' selected' : ''}>${x.n}</option>`).join('');
  $('setup-events').onchange = evmodeRow;
  // Erweiterungsmodule: was in den Einstellungen aus ist, steht hier nicht zur Wahl
  applyModules();
  // Der gewählte Modus bleibt erhalten, wenn man den Aufbau erneut öffnet
  $('setup-mode').querySelectorAll('[data-mode]').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === setupMode));
  fillMapSelect();
  $('setup-mode').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    $('setup-mode').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    setupMode = b.dataset.mode;
    renderSlots();
  });
  renderSlots();
}
/* Zeichnet die Reichs-Karteikarten. Auf den festen Karten sitzt jede Zivilisation genau
   einmal (bei vier Reichen liegt sie damit fest); auf der Plättchenkarte wählt jeder Platz
   frei, auch zweimal dieselbe. */
function renderSlots() {
  const n = setupCount(), duel = setupMode === 'duell';
  $('setup-duel-hint').hidden = !duel;
  fillMapSelect();
  const list = $('setup-list');
  const frei = freieCivWahl();
  // Mensch/Bot und Fähigkeit überleben ein Neuzeichnen (Kartenwechsel, Zivilisationswahl)
  const alt = [...list.children].map(x => ({
    kind: x.querySelector('[data-kind].on').dataset.kind,
    abil: x.querySelector('[data-abil]').value,
  }));
  const chosen = (frei || n < 4) ? pickChoice(n) : CIV_KEYS.slice();
  // Feste Karte: Doppelungen auflösen, sonst säßen zwei Reiche auf einem Startstern
  if (!frei) for (let i = 0; i < n; i++)
    if (chosen.indexOf(chosen[i]) !== i)
      chosen[i] = pickCivs[i] = CIV_KEYS.find(k => !chosen.slice(0, n).includes(k));
  list.innerHTML = '';
  chosen.forEach((civKey, i) => {
    const zufall = civKey === 'zufall';
    const civ = zufall ? null : CIV_BY_KEY[civKey];
    /* Bei ausgeloster Zivilisation stehen ihre Fähigkeiten noch nicht fest – dann bleibt
       auch bei der Fähigkeit nur der Zufall. Eine Zeile „Grundfähigkeit" gab es hier
       früher; sie ist ersatzlos weg. Sie benannte nichts: die Grundfähigkeit heißt bei
       jedem Reich anders und wirkt anders (Günstige Forschung, Handelsreich, Taiga,
       Seefahrer), und welche man bekommt, entscheidet erst die Auslosung. */
    const abils = zufall
      ? [{ k: 'zufall', n: T('Zufall') }]
      : civ.abilities.map((a, j) => ({ k: a.k, n: j === 0 ? a.n : T('Alternative %s: %s', j + 1, a.n), e: a.e }))
        .concat([{ k: 'zufall', n: T('Zufall'), e: T('Wird beim Spielstart ausgelost.') }]);
    const d = document.createElement('div');
    d.className = 'slot'; d.dataset.civ = civKey;
    d.innerHTML = ((frei || n < 4)
      ? `<h3>${zufall ? '🎲' : SYM[civ.sym]} ${T('Platz %s', i + 1)}</h3>
         <label class="row"><span>${T('Zivilisation')}</span>
           <select data-civpick>${CIVS.map(c =>
             `<option value="${c.k}"${c.k === civKey ? ' selected' : ''}>${c.n}</option>`).join('')}
             <option value="zufall"${zufall ? ' selected' : ''}>${T('Zufall')}</option>
           </select></label>`
      : `<h3>${SYM[civ.sym]} ${civ.n}</h3>`) +
      /* Drei Arten: Mensch, KI (spielt nach den Regeln für Menschen, js/ki.js) und Bot (nach
         den Bot-Regeln). Die KI ist die Vorgabe für die Gegner – Bots bleiben wählbar. */
      `<div class="seg">
        <button data-kind="human" class="${(alt[i] ? alt[i].kind === 'human' : i === 0) ? 'on' : ''}">${T('Mensch')}</button>
        <button data-kind="ki" class="${(alt[i] ? alt[i].kind === 'ki' : i !== 0) ? 'on' : ''}">${T('KI')}</button>
        <button data-kind="bot" class="${(alt[i] && alt[i].kind === 'bot') ? 'on' : ''}">${T('Bot')}</button>
      </div>
      <label class="row"><span>${T('Fähigkeit')}</span>
        <select data-abil="${zufall ? 'zufall' : civ.k}">${abils.map(a =>
          `<option value="${a.k}">${a.n}</option>`).join('')}
        </select></label>
      <p class="abil"></p>`;
    list.appendChild(d);
    const sela = d.querySelector('[data-abil]');
    if (alt[i] && abils.some(a => a.k === alt[i].abil)) sela.value = alt[i].abil;
    // Marathon (v83): Fähigkeiten werden vor dem ersten Zug gedraftet, hier gibt es keine Wahl
    const marathon = setupMode === 'marathon';
    sela.closest('label').hidden = marathon;
    const note = d.querySelector('.abil');
    const paint = () => {
      const kind = d.querySelector('[data-kind].on').dataset.kind;
      // Bots haben keine Fähigkeit, und bei ausgelostem Reich gibt es nur den Zufall –
      // beides ist keine Wahl, also steht das Menü still.
      sela.disabled = kind === 'bot' || zufall;
      const a = abils.find(x => x.k === sela.value) || abils[0];
      note.textContent = kind === 'bot' ? T('Bots erhalten keine Zivilisationsfähigkeit.')
        : marathon ? T('Fähigkeiten werden vor dem ersten Zug gedraftet – je zwei, auch fremde.')
          : zufall ? T('Zivilisation und Fähigkeit werden beim Spielstart ausgelost.')
            : (a.e || T('Wird beim Spielstart ausgelost.'));
      kindRows();
    };
    sela.onchange = paint;
    d.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
      d.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b));
      paint(); refreshStart();
    });
    const pick = d.querySelector('[data-civpick]');
    if (pick) pick.onchange = () => {
      pickCivs[i] = pick.value;
      // Nur auf den festen Karten: jeder andere Platz mit derselben Zivilisation zieht
      // auf eine freie um. Auf der Plättchenkarte darf sie doppelt vorkommen.
      if (!freieCivWahl()) for (let j = 0; j < n; j++) {
        if (j === i || pickCivs[j] !== pick.value) continue;
        pickCivs[j] = CIV_KEYS.find(k => !pickCivs.slice(0, n).includes(k));
      }
      renderSlots();          // Mensch/Bot und Fähigkeit bleiben dabei erhalten
    };
    paint();
  });
  refreshStart();
}
// Vorauswahl der frei wählbaren Plätze (Duell, drei Reiche, Plättchenkarte)
let pickCivs = ['griechenland', 'wikinger', 'russland', 'england'];
function pickChoice(n) { return pickCivs.slice(0, n); }
function setupConfig() {
  const diff = $('setup-diff').value;    // ein Schwierigkeitsgrad für alle Bots
  const kiLevel = $('setup-kilevel').value || KI_DEFAULT_LEVEL;   // eine Stufe für alle KI
  // Rohwahl: 'zufall' bleibt stehen, aufgelöst wird erst in startPlayers()
  return [...$('setup-list').children].map(slot => ({
    civ: slot.dataset.civ,
    kind: slot.querySelector('[data-kind].on').dataset.kind,
    diff, kiLevel,
    ability: slot.querySelector('[data-abil]').value,
  }));
}
/* Die Zeilen für Bot-Schwierigkeit und KI-Stufe stehen nur da, wenn es solche Plätze gibt –
   sonst fragt der Aufbau nach etwas, das in dieser Partie niemand braucht. */
function kindRows() {
  const kinds = [...$('setup-list').children].map(x => {
    const on = x.querySelector('[data-kind].on');
    return on ? on.dataset.kind : null;
  });
  $('setup-diff-row').hidden = !kinds.includes('bot');
  $('setup-kilevel-row').hidden = !kinds.includes('ki');
  $('setup-ki-hint').hidden = !kinds.includes('ki');
}
/* Rezept einer Partie: die ROHE Wahl aus dem Aufbau, „Zufall" noch nicht aufgelöst.
   Genau das macht es wiederverwendbar – wer mit ausgeloster Zivilisation gestartet ist,
   bekommt beim nächsten Mal eine neue. Wandert in den Spielstand (S.recipe), damit
   „Nochmal spielen" auch nach einem Neuladen noch weiß, wie aufgesetzt war. */
function setupRecipe(mapPick, startWahl) {
  return {
    mode: setupMode, mapPick, start: startWahl,
    events: $('setup-events').checked, eventMode: $('setup-evmode').value,
    wonders: $('setup-wonders').checked,
    players: setupConfig(),
  };
}
/* Sitzt eine Zivilisation mehrfach am Tisch, bekommen ihre Reiche römische Ziffern und
   je eine der vier Zivilisationsfarben – keine Schattierungen. Die erste behält ihre
   eigene Farbe, die Doppelgänger nehmen eine noch freie (zwei Griechenland: eines blau,
   das andere zum Beispiel Englands Rot). Ohne Farbunterschied wären sie auf der Karte
   nicht auseinanderzuhalten: Städte, Armeen und Grenzen werden nur über sie unterschieden. */
const ROMAN = ['I', 'II', 'III', 'IV'];
function nameDoubles(players) {
  const zaehler = {};
  players.forEach(p => { zaehler[p.civ] = (zaehler[p.civ] || 0) + 1; });
  const belegt = new Set();
  // erster Durchgang: wer seine eigene Farbe noch bekommen kann, behält sie
  players.forEach(p => {
    if (belegt.has(p.civ)) return;
    belegt.add(p.civ); p.colorOf = p.civ;
  });
  // zweiter Durchgang: die Doppelgänger nehmen eine freie Zivilisationsfarbe
  players.forEach(p => {
    if (p.colorOf) return;
    const frei = CIV_KEYS.find(k => !belegt.has(k));
    belegt.add(frei); p.colorOf = frei;
  });
  const lauf = {};
  players.forEach(p => {
    const civ = CIV_BY_KEY[p.civ];
    p.color = p.colorOf === p.civ ? null : CIV_BY_KEY[p.colorOf].color;
    delete p.colorOf;
    if (zaehler[p.civ] < 2) return;
    const k = lauf[p.civ] = (lauf[p.civ] || 0) + 1;
    p.roman = ROMAN[k - 1] || String(k);      // civOf baut den Namen daraus
    p.name = `${civ.n} ${p.roman}`;           // für Anzeigen, die nur den Text kennen
  });
  return players;
}
/* „Zufall" in der Auswahl wird erst beim Spielstart aufgelöst – bis dahin steht im
   Aufbau wirklich Zufall, damit niemand aus der Anzeige schon die Wahl abliest.
   `frei` = Doppelungen erlaubt (Plättchenkarte); sonst bleibt jede Zivilisation einmalig. */
function resolveRandom(players, frei) {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  players.forEach((p, i) => {
    if (p.civ !== 'zufall') return;
    const pool = CIV_KEYS.filter(k => frei ||
      !players.some((q, j) => j !== i && q.civ === k));
    p.civ = pick(pool.length ? pool : CIV_KEYS);
    p.randomCiv = true;
  });
  players.forEach(p => {
    if (p.ability !== 'zufall') return;
    p.ability = pick(CIV_BY_KEY[p.civ].abilities).k;
    p.randomAbility = true;
  });
  return players;
}
/* Fertige Spielerliste für den Start: Zufall auflösen, dann Ziffern und Farben. */
function startPlayers() {
  return nameDoubles(resolveRandom(setupConfig(), freieCivWahl()));
}
// Nur eine bewusste Wahl bleibt stehen; ohne sie richtet sich der Startspieler nach der
// Besetzung (bei mehreren Menschen Zufall, sonst der einzige Mensch).
let startWanted = null;
function refreshStart() {
  const cfg = setupConfig(), sel = $('setup-start');
  const label = p => p.civ === 'zufall' ? T('Zufällige Zivilisation')
    : (CIV_BY_KEY[p.civ] ? CIV_BY_KEY[p.civ].n : p.civ);
  sel.innerHTML = `<option value="zufall">${T('Zufällig')}</option>` + cfg.map((p, i) =>
    `<option value="${i}">${label(p)}${kindTag(p)}</option>`).join('');
  const menschen = cfg.filter(p => p.kind === 'human').length;
  sel.value = (startWanted != null && [...sel.options].some(o => o.value === startWanted))
    ? startWanted
    : menschen > 1 ? 'zufall' : String(Math.max(0, cfg.findIndex(p => p.kind === 'human')));
  sel.onchange = () => { startWanted = sel.value; };
}

/* Vor dem Tutorial die eine Frage, die den Umfang bestimmt: Wer solche Spiele kennt,
   braucht keine Erklärung, was eine Stadt ist – wohl aber die Eigenheiten dieses Spiels.
   Beide Fassungen führen durch **dieselben** Aktionen. */
function tutorialAsk() {
  modal(T('Tutorial'), `<p class="sub">${T('Hast du schon Erfahrung mit Spielen wie Civilization?')}</p>
    <button class="btn primary wide" id="tut-ja">${T('Ja – kurze Fassung')}</button>
    <p class="hint" style="margin:2px 2px 10px">${T('Dieselben Schritte, aber nur die Eigenheiten dieses Spiels: Sieg, Kampf, Ressourcen, Zufall im Technologiebaum.')}</p>
    <button class="btn wide" id="tut-nein">${T('Nein – alles erklären')}</button>
    <p class="hint" style="margin:2px 2px 0">${T('Das ausführliche Tutorial in 29 Schritten.')}</p>`);
  $('tut-ja').onclick = () => { closeModal(); tutorialStart({ kurz: true }); };
  $('tut-nein').onclick = () => { closeModal(); tutorialStart({ kurz: false }); };
}

/* ------------------------------------------------- Startplättchen legen
   Eine Plättchenkarte entsteht nicht im Aufbau, sondern in einer eigenen Phase:
   die offenen Dreiecke liegen schon, jedes Reich legt sein eigenes selbst – Lage
   (eine von drei) und Hauptstadt (irgendein Landfeld darauf, das keiner fremden
   Startecke zu nah kommt). Gelegt wird verdeckt: sichtbar sind nur die offenen
   Plättchen und das eigene. Bots legen sofort, zufällig, Hauptstadt auf einem der
   drei mittigen Felder. Erst wenn alle fertig sind, wird aufgedeckt.               */
let placeState = null;

function startPlacement(cfg) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const plan = tilePlan(cfg.players.map(p => p.civ), seed);
  if (!plan) return toast(T('Für diese Spielerzahl gibt es keine Plättchenkarte.'));
  /* Erst würfeln, dann legen (v66): Was jedes Reich zu Beginn erforschen kann und welche
     Wunder im Stapel liegen, hängt nicht an der Karte – also steht es schon fest, bevor
     das erste Plättchen liegt, und jeder darf es beim Legen ansehen. Der Seed der Partie
     wird hier festgelegt, damit Vorabwurf und echte Partie derselbe Wurf sind. */
  cfg = Object.assign({}, cfg, { seed });
  const setup = rollSetup(cfg);
  const rnd = mapRng(seed + 12345);
  placeState = { cfg, plan, rnd, setup, queue: [], at: 0, o: 0, cell: null, done: false };
  plan.seats.forEach(seat => {
    const pl = cfg.players[seat.idx];        // nach Platz, nicht nach Zivilisation
    if (pl && pl.kind === 'bot') botPlaceSeat(plan, seat, rnd);
    // Die KI legt wie ein Mensch – verdeckt, sie sieht nur die offenen und ihr Plättchen
    else if (pl && pl.kind === 'ki') { if (kiPlaceSeat(plan, seat, pl, setup)) botPlaceSeat(plan, seat, rnd); }
    else placeState.queue.push(seat);
  });
  show('screen-place');
  placeStep();
}
/* Erträge aller Wahlmöglichkeiten des Sitzes, der gerade legt, und welche davon dominiert
   sind (placeYieldTable/dominatedCells in tiles.js). 3 × 15 Wegwerf-Partien – einmal je
   Sitz gerechnet und in placeState gemerkt; Drehen und Antippen ändern daran nichts. */
function placeInfo(st, seat) {
  if (!st.info || st.info.idx !== seat.idx) {
    const table = placeYieldTable(st.plan, seat, st.cfg.players[seat.idx]);
    st.info = { idx: seat.idx, table, dom: dominatedCells(table) };
  }
  return st.info;
}
/* Ertragsübersicht für die gewählte Hauptstadt – dasselbe, was im Spiel vor dem Siedeln
   steht (placeYieldAt). Bis v72 hing hier „– noch verdeckte Nachbarfelder kommen dazu"
   an jedem Feld am Kartenrand oder am Loch: gezählt wurde jedes X, dort kommt aber nie
   etwas dazu, und an verdeckte Plättchen grenzt eine erlaubte Hauptstadt nicht. */
function placeYield(plan, seat, st) {
  if (st.cell == null) return '';
  const y = placeInfo(st, seat).table[st.o][st.cell];
  if (!y) return '';
  return `<span class="pl-yield"><b>${T('Ertragsübersicht')}</b> ${fmtGain(y)}</span>`;
}
/* Anzeige eines Sitzes: bei doppelten Zivilisationen der Platzname („Russland II") */
function seatCiv(seat) {
  const pl = placeState.cfg.players[seat.idx] || {};
  return civOf({ civ: seat.civ, name: pl.name, roman: pl.roman, color: pl.color });
}
/* Fähigkeit dieses Platzes – auch dann schon gültig, wenn sie ausgelost wurde. */
function seatAbil(seat) {
  const pl = placeState.cfg.players[seat.idx] || {};
  return abilInfo({ civ: seat.civ, kind: pl.kind || 'human', ability: pl.ability });
}
function placeSeatNow() {
  const st = placeState;
  return (st && !st.done && st.at < st.queue.length) ? st.queue[st.at] : null;
}
function placeStep() {
  const st = placeState;
  if (st.at >= st.queue.length) return placeReveal();
  st.o = 0; st.cell = null;
  drawPlace();
  // Hotseat: zwischen zwei Menschen wird das Gerät übergeben, vorher nichts gezeigt.
  if (st.queue.length > 1) {
    const civ = seatCiv(placeSeatNow());
    modal('Verdeckt legen', T('<p class="sub">%s <b>%s</b> ist dran. Das eigene Startplättchen sehen die anderen erst nach dem Aufdecken – jetzt also Gerät übergeben.</p> <button class="btn primary wide" id="pl-gate">Plättchen ansehen</button>', SYM[civ.sym], civ.n));
    $('pl-gate').onclick = closeModal;
  }
}
function drawPlace() {
  const st = placeState, plan = st.plan;
  const seat = placeSeatNow();
  const shape = TILE_SHAPES[plan.n];
  const shown = shape.slots.map((_, i) => i)
    .filter(i => st.done || !isSeatSlot(plan, i) || (seat && seat.slot === i));
  const map = tileMap(plan, {
    show: shown, seat, o: seat ? st.o : null, cell: st.cell,
    caps: st.done ? null : (seat ? [seat.idx] : []),
  });
  const opts = {};
  if (seat) {
    const rcs = slotRC(plan, seat.slot), ok = placeOptions(plan, seat, st.o);
    const dom = placeInfo(st, seat).dom[st.o];
    opts.frame = rcs;
    opts.highlight = rcs.filter((_, i) => ok[i]);
    // rötlicher Rand: erlaubt, aber ein anderes Feld bringt rundum mehr (v73)
    opts.dominated = rcs.filter((_, i) => dom[i]);
    if (st.cell != null) opts.sel = rcs[st.cell];
  }
  drawMap($('pl-map'), map, opts);
  const note = $('pl-note');
  // Beschriftung kommt aus index.html und wird von applyStaticLang übersetzt – hier
  // steht nur, wann der Knopf überhaupt etwas zu zeigen hat.
  $('pl-tech').hidden = st.done;
  if (st.done) {
    note.innerHTML = T('Alle Plättchen liegen offen. %s Reiche, %s Dreiecke.',
      plan.n, shape.slots.length);
    $('pl-rot').hidden = true;
    $('pl-ok').textContent = T('Spiel beginnen');
  } else {
    // Kein Plättchenname mehr – er sagt nichts über das Feld, das man wählt. Dafür die
    // Fähigkeit: bei ausgeloster Zivilisation ist das hier die erste Stelle, an der man
    // sieht, was man spielt.
    const civ = seatCiv(seat), abil = seatAbil(seat);
    note.innerHTML = `<b>${SYM[civ.sym]} ${esc(civ.n)}</b>` +
      (abil ? ` · <span class="pl-abil" title="${esc(abil.e)}">${esc(abil.n)}</span>` : '') +
      ' · ' + T('Lage %s von 3', st.o + 1) + ' · ' +
      (st.cell == null ? T('Hauptstadt auf ein markiertes Feld tippen')
        : T('Hauptstadt gesetzt – „Fertig", wenn es passt')) +
      // Legende nur, wenn überhaupt ein Feld rot umrandet ist
      ((opts.dominated || []).length
        ? ` <span class="pl-dom">${T('Rot umrandet: ein anderes Feld bringt von etwas mehr und von nichts weniger.')}</span>` : '') +
      placeYield(plan, seat, st);
    $('pl-rot').hidden = false;
    $('pl-ok').textContent = T('Fertig');
  }
}
/* Forschungsseite in der Legephase (v66). Gezeigt wird genau der Bogen aus dem Spiel,
   nur ohne Knöpfe: was dieser Platz zu Beginn erforschen könnte, ausgewürfelt VOR dem
   Legen – damit man die Hauptstadt mit dieser Kenntnis wählt.
   Gerechnet wird auf einer Wegwerf-Partie mit genau diesen Verfügbarkeiten, damit Liste,
   Kosten und Wunderstapel aus der Regelmaschine kommen und nicht hier nachgebaut werden.
   Fremde Verfügbarkeiten stehen nicht darin: im Hotseat wird verdeckt gelegt. */
function placeTechView() {
  const st = placeState, seat = placeSeatNow();
  if (!st) return;
  if (!seat) return toast(T('Alle Plättchen liegen schon.'));
  const pl = st.cfg.players[seat.idx] || {};
  const V = newGame({
    seed: 1, map: DEFAULT_MAP, wonders: st.cfg.wonders,
    players: [{ civ: seat.civ, kind: 'human', ability: pl.ability }],
    avail: [st.setup.avail[seat.idx]], wpool: st.setup.wpool,
  });
  const civ = seatCiv(seat);
  let h = `<p class="sub">${T('Vor dem Legen ausgewürfelt – im Spiel steht genau das hier.')}</p>`;
  h += techBoardHTML(V, 0, { plain: true });
  if (st.cfg.wonders) {
    h += `<p class="sub" style="margin-top:14px">${T('Weltwunder im Stapel')}</p>`;
    [1, 2].forEach(lvl => {
      const pool = poolOf(V, lvl);
      if (!pool.length) return;
      h += pool.map(k => WONDER_BY_KEY[k]).map(w => `<button class="tech avail" disabled>
        <b>${w.n}</b><span class="eff">${T('Stufe %s', w.lvl)} · ${w.e}</span></button>`).join('');
    });
  }
  modal(T('%s · Forschung vor dem Legen', civ.n), h);
  $('overlay').classList.add('wide');
}
function plTap(r, c) {
  const st = placeState, seat = placeSeatNow();
  if (!seat) return;
  const rcs = slotRC(st.plan, seat.slot);
  const i = rcs.findIndex(x => x[0] === r && x[1] === c);
  if (i < 0) return toast(T('Nur auf dem eigenen Plättchen.'));
  if (!placeOptions(st.plan, seat, st.o)[i])
    return toast(T('Nur auf Land – und nicht so nah an einem fremden Startplättchen.'));
  st.cell = i;
  drawPlace();
}
function placeRotate() {
  const st = placeState, seat = placeSeatNow();
  if (!seat) return;
  st.o = (st.o + 1) % 3;
  // Die Hauptstadt bleibt liegen, solange das Feld auch in der neuen Lage passt.
  if (st.cell != null && !placeOptions(st.plan, seat, st.o)[st.cell]) st.cell = null;
  drawPlace();
}
function placeConfirm() {
  const st = placeState;
  if (!st) return;
  if (st.done) return placeGo();
  const seat = placeSeatNow();
  if (st.cell == null) return toast(T('Erst die Hauptstadt setzen.'));
  const err = placeSeat(st.plan, seat, st.o, st.cell);
  if (err) return toast(err);
  st.at++;
  placeStep();
}
function placeReveal() {
  const st = placeState;
  // Sicherheitsnetz: wer (aus welchem Grund auch immer) nichts gelegt hat, wird gelegt.
  st.plan.seats.forEach(seat => { if (seat.cell == null) botPlaceSeat(st.plan, seat, st.rnd); });
  st.done = true; st.plan.revealed = true;
  drawPlace();
}
function placeGo() {
  const st = placeState;
  const cfg = Object.assign({}, st.cfg, {
    map: tileMap(st.plan), avail: st.setup.avail, wpool: st.setup.wpool,
  });
  placeState = null;
  S = newGame(cfg);
  startGameScreen();
}

/* ------------------------------------------------- Marathon: Fähigkeiten draften (v83)
   Nach dem Aufbau entsteht die Karte, die Starttechnologien werden ausgewürfelt (rollSetup,
   wie vor der Legephase) – und eine Vorschau-Partie zeigt beides: Karte mit Hauptstädten und
   für jedes Reich, was es zu Beginn erforschen kann. Dann wird gedraftet (Regeln in
   js/marathon.js). Die KI wählt sofort, wenn sie dran ist; Menschen tippen. Alles ist offen –
   anders als in der Legephase gibt es nichts zu verbergen, also auch keine Übergabe.
   „Spiel beginnen" startet die echte Partie mit genau dieser Karte, diesen
   Starttechnologien und den gedrafteten Fähigkeiten. */
let draftState = null;
function startMarathon(cfg) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  cfg = Object.assign({}, cfg, { seed, marathon: true, map: marathonMap(seed) });
  const setup = rollSetup(cfg);
  cfg.avail = setup.avail; cfg.wpool = setup.wpool;
  const V = draftView(cfg);          // dieselbe Partie, noch ohne Fähigkeiten
  draftState = { cfg, V, D: draftNew(V, seed + 1) };
  show('screen-draft');
  draftAdvance();
}
function draftAdvance() {
  const st = draftState;
  while (!draftDone(st.D) && st.V.players[draftCurrent(st.D)].kind === 'ki') {
    const pi = draftCurrent(st.D);
    draftPick(st.D, pi, kiDraftPick(st.V, st.D, pi));
  }
  drawDraft();
}
function drawDraft() {
  const st = draftState, V = st.V, D = st.D, cur = draftCurrent(D);
  const capCur = cur != null ? capitalOf(V, cur) : null;
  drawMap($('dr-map'), V.map, { state: V, tutHl: capCur ? [[capCur.r, capCur.c]] : [] });
  const name = i => { const c = civOf(V.players[i]); return `${SYM[c.sym]} <b>${esc(c.n)}</b>`; };
  $('dr-note').innerHTML = draftDone(D)
    ? T('Alle haben gewählt – die Partie kann beginnen.')
    : T('%s wählt Fähigkeit %s von 2 (Wahl %s von %s, Schlangenreihenfolge).', name(cur),
      D.picks[cur].length + 1, D.at + 1, D.order.length);
  const opts = cur != null ? draftOptions(D, cur) : [];
  $('dr-pool').innerHTML = draftDone(D) ? '' : `<p class="sub">${T('Zur Wahl')}</p>` +
    D.pool.map(id => {
      const a = abilById(id), civ = CIV_BY_KEY[a.civ];
      return `<button class="dr-ab" data-ab="${id}" ${opts.includes(id) ? '' : 'disabled'}>
        <span class="dr-civ">${SYM[civ.sym]} ${esc(civ.n)}</span><b>${esc(a.n)}</b><small>${esc(a.e)}</small></button>`;
    }).join('');
  // Reiche in Zugfolge: gewählte Fähigkeiten, Startertrag der Hauptstadt, Starttechnologien
  const reihe = V.players.map((_, k) => (V.startIdx + k) % V.players.length);
  $('dr-players').innerHTML = `<p class="sub">${T('Reiche in Zugfolge')}</p>` + reihe.map(i => {
    const p = V.players[i], y = income(V, i);
    const techs = TECHS.filter(t => p.avail[t.k] && techActive(V, t)).map(t => t.n).join(', ') || '—';
    const picks = p.kind === 'bot' ? T('Bot – ohne Fähigkeiten')
      : D.picks[i].length ? D.picks[i].map(id => esc(abilById(id).n)).join(' · ') : T('noch keine Fähigkeit');
    return `<div class="dr-pl${i === cur ? ' now' : ''}">
      <h4>${name(i)}${kindTag(p) ? `<small>${esc(kindTag(p))}</small>` : ''}
        <button class="btn small ghost" data-bogen="${i}">${T('Bogen')}</button></h4>
      <p class="dr-picks">${picks}</p>
      <p>${T('Hauptstadt im ersten Zug, ohne Fähigkeiten: %s', fmtY([y.sci, y.food, y.coins]))}</p>
      <p>${T('Starttechnologien: %s', esc(techs))}</p></div>`;
  }).join('');
  $('dr-go').hidden = !draftDone(D);
  $('dr-pool').querySelectorAll('[data-ab]').forEach(b => b.onclick = () => draftChoose(b.dataset.ab));
  $('dr-players').querySelectorAll('[data-bogen]').forEach(b => b.onclick = () => draftTechView(+b.dataset.bogen));
  $('dr-go').onclick = draftGo;
}
function draftChoose(id) {
  const st = draftState, cur = draftCurrent(st.D);
  if (cur == null) return;
  const e = draftPick(st.D, cur, id);
  if (e) return toast(e);
  draftAdvance();
}
// Der Technologiebogen eines Reichs, wie er zu Beginn aussieht – mit den Kosten des Marathons
function draftTechView(i) {
  const V = draftState.V;
  modal(T('%s · Starttechnologien', civOf(V.players[i]).n),
    `<p class="sub">${T('Ausgewürfelt vor dem Draft – im Spiel steht genau das hier. Kosten ohne Fähigkeiten.')}</p>` + techBoardHTML(V, i, { plain: true }));
  $('overlay').classList.add('wide');
}
function draftGo() {
  const st = draftState;
  if (!st || !draftDone(st.D)) return;
  const players = st.cfg.players.map(pc => Object.assign({}, pc));
  st.V.players.forEach((p, i) => { if (p.kind !== 'bot') players[p.slot].drafted = st.D.picks[i].slice(); });
  draftState = null;
  S = newGame(Object.assign({}, st.cfg, { players }));
  startGameScreen();
}

/* ------------------------------------------------------------------ Karteneditor */
function editorScreen() {
  editMap = JSON.parse(JSON.stringify(currentMap()));
  const pal = $('ed-palette'); pal.innerHTML = '';
  const add = (k, label, col) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (edTool === k ? ' on' : '');
    b.innerHTML = `<i style="background:${col}"></i>${label}`;
    b.onclick = () => { edTool = k; pal.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b)); };
    pal.appendChild(b);
  };
  Object.values(TERRAIN).forEach(t => add(t.key, t.name, t.color));
  CIVS.forEach(c => add('cap:' + c.k, SYM[c.sym] + ' ' + c.n, c.color));
  drawEditor();
}
function drawEditor() { drawMap($('ed-map'), editMap, { showVoid: true }); }
function edTap(r, c) {
  if (r < 0 || r >= editMap.rows.length) return;
  if (c < 0 || c >= editMap.rows[r].length) return;
  if (edTool.startsWith('cap:')) {
    const civ = edTool.slice(4);
    if (!TERRAIN[editMap.rows[r][c]].land) return toast(T('Hauptstädte nur auf Land.'));
    editMap.capitals[civ] = [r, c];
  } else {
    const row = editMap.rows[r];
    if (c >= row.length) return;
    editMap.rows[r] = row.slice(0, c) + edTool + row.slice(c + 1);
  }
  drawEditor();
}

/* ------------------------------------------------------------------ Start */
/* ---------------------------------------------------------------- Sprache
   Der feste Text aus index.html wird beim Start einmal eingesammelt (deutsche Fassung
   als Schlüssel) und beim Sprachwechsel neu gesetzt. Dynamische Texte laufen ohnehin
   durch T(); für sie genügt ein Neuzeichnen. */
let staticText = null;
function collectStatic() {
  staticText = [];
  const walk = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue.trim();
    if (!t || t.length < 2) continue;
    if (n.parentNode && /SCRIPT|STYLE/.test(n.parentNode.nodeName)) continue;
    staticText.push([n, n.nodeValue]);
  }
}
function applyStaticLang() {
  if (!staticText) return;
  staticText.forEach(([n, de]) => {
    if (!n.parentNode) return;                 // inzwischen neu gezeichnet
    const roh = de.trim();
    // Schlüssel ohne Zeilenumbrüche und Einrückung – im Markup umbrochene Sätze sollen
    // im Wörterbuch als ein Satz stehen.
    const neu = T(roh.replace(/\s+/g, ' '));
    n.nodeValue = de.replace(roh, neu);
  });
}
function langRow() {
  const box = $('m-lang');
  if (!box) return;
  box.innerHTML = LANGS.map(l =>
    `<button class="lang-btn${l.k === LANG ? ' on' : ''}" data-lang="${l.k}"
       title="${l.n}" aria-label="${l.n}">${l.flag}</button>`).join('');
  box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => switchLang(b.dataset.lang));
}
function switchLang(k) {
  if (k === LANG) return;
  setLang(k);
  document.documentElement.lang = k;
  applyStaticLang();
  langRow();
  bootTexts();
  // was gerade offen ist, neu zeichnen
  if (S && $('screen-game').classList.contains('show')) redraw();
  // das Tutorialpanel behält sonst den Text, mit dem es gezeichnet wurde
  if (ui && ui.tut && typeof renderTutPanel === 'function') renderTutPanel();
  if ($('screen-setup').classList.contains('show')) setupScreen();
  if ($('screen-editor').classList.contains('show')) editorScreen();
  closeModal(); closeSheet();
}
/* Texte, die boot() einmalig setzt – beim Sprachwechsel dieselben Zeilen erneut. */
function bootTexts() {
  $('m-tutorial').textContent = T('Tutorial – geführtes Übungsspiel');
  const ver = $('m-version');
  if (ver) ver.textContent = 'Hochzeivilization ' + APP_VERSION;
}

function boot() {
  initLang();
  document.documentElement.lang = LANG;
  collectStatic();
  applyStaticLang();
  langRow();
  customMap = load('hochciv.map');
  loadModules();
  loadPrefs();
  const saved = load('hochciv.save');
  $('m-continue').hidden = !saved;
  bootTexts();

  $('m-new').onclick = () => { show('screen-setup'); setupScreen(); };
  $('m-options').onclick = () => { show('screen-options'); optionsScreen(); };
  // Tutorial: geführtes Übungsspiel in der normalen Oberfläche
  $('m-tutorial').onclick = tutorialAsk;
  $('tut-prev').onclick = () => tutMove(-1);
  $('tut-next').onclick = () => tutMove(1);
  $('tut-quit').onclick = () => tutorialQuit();
  $('m-editor').onclick = () => { show('screen-editor'); editorScreen(); };
  $('m-rules').onclick = () => rulesModal();
  // migrateState: Spielstände von vor v82 behalten ihren Techtree (S.altTree → S.oldTree)
  $('m-continue').onclick = () => { endTutorialPanel(); S = migrateState(load('hochciv.save')); startGameScreen(); };
  $('m-load').onclick = () => upload(txt => {
    try { endTutorialPanel(); S = migrateState(JSON.parse(txt)); saveGame(); startGameScreen(); toast(T('Spielstand geladen')); }
    catch { toast(T('Datei nicht lesbar')); }
  });
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('screen-menu'));
  $('ov-close').onclick = closeModal;
  $('overlay').onclick = e => { if (e.target === $('overlay')) closeModal(); };
  $('sheet-grip').onclick = closeSheet;
  $('sheet-close').onclick = closeSheet;

  $('setup-go').onclick = () => {
    const players = startPlayers();      // Zufall auflösen, dann Ziffern und Farben
    if (!players.some(p => p.kind === 'human')) return toast(T('Mindestens eine menschliche Zivilisation.'));
    const duel = setupMode === 'duell';
    const pick = $('setup-map').value;
    const startWahl = $('setup-start').value;
    const recipe = setupRecipe(pick, startWahl);
    const cfg = {
      players, duel, recipe,
      startPlayer: startWahl === 'zufall'
        ? Math.floor(Math.random() * players.length) : +startWahl,
      events: recipe.events, eventMode: recipe.eventMode,
      wonders: recipe.wonders,
    };
    endTutorialPanel();
    // Marathon: Zufallskarte, dann sehen alle Karte und Starttechnologien und draften
    if (setupMode === 'marathon') return startMarathon(cfg);
    // Plättchenkarte: erst legen alle ihr Startdreieck, dann beginnt das Spiel.
    if (pick === 'plaettchen') return startPlacement(cfg);
    cfg.map = pick === 'eigene' ? customMap : MAPS[+pick];
    S = newGame(cfg);
    startGameScreen();
  };
  $('a-tech').onclick = techModal;
  $('a-found').onclick = toggleFoundMode;
  $('a-power').onclick = powerSheet;
  $('a-yields').onclick = toggleYields;
  $('a-info').onclick = worldModal;
  $('hud-feed').onclick = () => { if (!isAuto(P(S)) && !S.over) foodSheet(); };
  $('a-log').onclick = () => { if (ui.tut) { ui.tutSawLog = true; renderTutPanel(); } logModal(); };
  $('a-end').onclick = endHumanTurn;
  $('g-menu').onclick = () => {
    // turnWanted() ist die gespeicherte Wahl – nicht html.turn, das zusätzlich vom
    // Bildschirm abhängt (gedreht wird nur das Spiel).
    const on = turnWanted();
    modal(T('Menü'), `<button class="btn wide" id="mm-rules">${T('Regeln & Technologien')}</button>
      <button class="btn wide" id="mm-turn">${T('Hochkant drehen: %s', on ? T('an') : T('aus'))}</button>
      <p class="hint" style="margin:6px 2px 0">${T('Hält man das Gerät im Spiel hochkant, dreht die App sich selbst quer, damit die Karte breit steht. Menü, Aufbau und Editor bleiben unberührt. iOS erlaubt keine echte Orientierungssperre.')}</p>
      <button class="btn wide" id="mm-export">${T('Spielstand exportieren')}</button>
      <button class="btn wide" id="mm-quit">${T('Spiel beenden')}</button>`);
    $('mm-rules').onclick = rulesModal;
    $('mm-turn').onclick = () => { setTurn(!turnWanted()); closeModal(); };
    $('mm-export').onclick = () => download('hochzeiv-spielstand.json', JSON.stringify(S));
    $('mm-quit').onclick = () => { store('hochciv.save', null); location.reload(); };
  };
  $('ed-save').onclick = () => {
    customMap = editMap; store('hochciv.map', editMap);
    toast(T('Karte gespeichert')); show('screen-menu');
  };
  $('ed-export').onclick = () => download('hochzeiv-karte.json', JSON.stringify(editMap, null, 1));
  $('ed-import').onclick = () => upload(txt => { editMap = JSON.parse(txt); drawEditor(); toast(T('Karte geladen')); });
  $('ed-reset').onclick = () => { editMap = JSON.parse(JSON.stringify(DEFAULT_MAP)); drawEditor(); };
  $('ed-size').onclick = () => {
    const r = prompt('Zeilen', editMap.rows.length), c = prompt('Spalten', editMap.rows[0].length);
    if (!r || !c) return;
    const R = Math.max(4, Math.min(40, +r)), C = Math.max(4, Math.min(40, +c));
    const out = [];
    for (let i = 0; i < R; i++) out.push(((editMap.rows[i] || '').padEnd(C, 'M')).slice(0, C));
    editMap.rows = out; drawEditor();
  };

  attachTaps($('map'), tapHex);
  attachTaps($('ed-map'), edTap);
  attachTaps($('pl-map'), plTap);
  $('pl-tech').onclick = placeTechView;
  $('pl-rot').onclick = placeRotate;
  $('pl-ok').onclick = placeConfirm;
  initOrientation();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
}
function startGameScreen() {
  show('screen-game');
  redraw();
  setBarHeight();
  if (isAuto(P(S))) setTimeout(runBots, 400);
  else setTimeout(humanTurnStart, 60);
}
/* Kurzregeln („Regeln & Technologien"). Die Abschnitte „Bewegung, Straßen und Eisenbahn"
   und „Kontrollzone (Schießpulver)" kamen mit v81 dazu – Wortlaut vom Autor freigegeben
   (2.10.); die Handelsrouten, vorher ein eigener Absatz, stehen jetzt im ersten davon.
   Jede Aussage dort ist an der Regelmaschine geprüft (moveCost, buildRoad, tradeRoutes,
   zocStop, arriveAt) – wer eine dieser Regeln ändert, ändert den Text mit. */
function rulesModal() {
  modal(T('Kurzregeln'), `
    <p class="sub">${T('Zugablauf')}</p>
    <ol style="font-size:14px;line-height:1.5;padding-left:20px">
      <li>${T('Einkommen aus allen Feldern rund um deine Städte plus Bevölkerung.')}</li>
      <li>${T('Macht halbiert sich (aufgerundet).')}</li>
      <li>${T('Aktionen in beliebiger Reihenfolge, beliebig oft.')}</li>
      <li>${T('Kampf: Angriff = Macht je Armee, Verteidigung = Bevölkerung + benachbarte Armeen. Zwei Züge in Folge stärker → Stadt erobert.')}</li>
      <li>${T('Sieg: Singularität · mehr als %s der Weltbevölkerung (UN %s, Theologie %s; geprüft zu Beginn jeder Runde ab Runde 2, für alle mit der Bevölkerung von dort) · gegnerische Hauptstadt · Weltwunder der Stufe 3. Außer beim Militärsieg endet das Spiel erst am Rundenende; mehrere Ansprüche entscheiden Punkte (Bevölkerung + Wunder + Technologien).',
        victoryLabels(!!(S && S.duel)).base, victoryLabels(!!(S && S.duel)).un,
        victoryLabels(!!(S && S.duel)).theologie)}</li>
    </ol>
    <p class="sub">${T('Ressourcen gelten nur für den laufenden Zug – nur Macht bleibt liegen. 2 Münzen zählen als 1 Nahrung oder 1 Wissenschaft.')}</p>
    <p class="sub">${T('Die Nahrungsproduktion darf nicht negativ werden: Wachstum wird blockiert, sobald das Einkommen dadurch unter 0 fiele – gerechnet auf dem dauerhaften Wert, ein Ereignis dieser Runde zählt dafür nicht. Gentechnik und Massenmedien heben die Grenze auf: zu Zugbeginn ernährt jede Münze drei Bevölkerung, jede Wissenschaft eine – höchstens bis zur Höhe dessen, was die Bevölkerung isst, also kein allgemeiner Umtausch. Gentechnik bringt zusätzlich Nahrung ins Einkommen: je vier Wissenschaft eine.')}</p>
    <p class="sub">${T('Bewegung, Straßen und Eisenbahn')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Jede Armee hat je Zug 3 Bewegungspunkte (mit Panzerschiff 6, mit Luftwaffe 9); ein Schritt aufs Nachbarfeld kostet 1. Armeen ziehen nicht auf Städte und nicht auf andere Armeen. Eine Armee, die in einer Stadt entsteht, muss sie im selben Zug verlassen.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Straßen (ab Rad) und Eisenbahnen (ab Eisenbahn, auch ohne Rad) baust du, indem du ein Feld antippst – auf Land, in deinem Gebiet oder auf herrenlosen Feldern, nicht auf Städten. Straße 1 Münze, Eisenbahn 2 Münzen, auf einer Straße 1.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Ein Schritt kostet ½, wenn beide Felder mindestens eine Straße haben, und nichts, wenn beide eine Eisenbahn haben: Auf einem zusammenhängenden Eisenbahnnetz kommt eine Armee mit übriger Bewegung beliebig weit. Ein Stadtfeld zählt als Straße bzw. Eisenbahn, sobald ein Nachbarfeld eine hat. Straßen und Eisenbahnen gehören niemandem – auch gegnerische Armeen fahren darauf.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Handelsrouten: jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg mit ihr verbunden ist, bringt +1 auf alle drei Erträge – über eine reine Eisenbahn +2. Gemischte Strecken zählen als Straße. Der Weg darf durch herrenloses und fremdes Gebiet führen; nur eine fremde Stadt unterbricht ihn.')}</p>
    <p class="sub">${T('Kontrollzone (Schießpulver)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Mit Schießpulver hat jede deiner Armeen eine Kontrollzone: die sechs Felder ringsum, mit Raketentechnik auch den zweiten Ring. Mit Burgenbau gilt das auch für deine Städte.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Eine fremde Armee, die ein Feld in einer Kontrollzone betritt, hält dort an: Ihre übrige Bewegung verfällt für diesen Zug, auch auf Straße und Eisenbahn. Durch eine Kontrollzone kommt sie also nicht hindurch – eine Straße oder Eisenbahn, die hindurchführt, ist für sie dort unterbrochen.')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Eine Armee, die ihren Zug in einer Kontrollzone beginnt, darf heraus; betritt sie dabei wieder ein Feld einer Kontrollzone, hält sie dort an. Die Luftwaffe ignoriert Kontrollzonen. Handelsrouten unterbrechen sie nicht.')}</p>
    <p class="sub">${T('Geländeerträge je Feld')}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr style="color:var(--ink-soft);font-size:11px"><th align="left">${T('Feld')}</th><th>🔬</th><th>🌾</th><th>🪙</th></tr>
      ${Object.values(TERRAIN).filter(t => !t.off).map(t => `<tr style="border-top:1px solid var(--rule)">
        <td>${t.name}</td>${t.yield.map(n => `<td align="center">${n || '·'}</td>`).join('')}</tr>`).join('')}
      <tr style="border-top:1px solid var(--rule)"><td>${T('Stadt (je Bevölkerung)')}</td>
        <td align="center">1</td><td align="center">−1</td><td align="center">1</td></tr>
    </table>
    <p class="sub">${T('Zivilisationen — je drei wählbare Fähigkeiten (Bots haben keine)')}</p>
    ${CIVS.map(c => `<p style="font-size:13px;margin:6px 0"><b>${SYM[c.sym]} ${c.n}</b><br>` +
      c.abilities.map((a, j) => `<span style="color:var(--ink-soft)">${j === 0 ? T('Grund') : T('Alt. %s', j + 1)}:</span> ${a.e}`).join('<br>') +
      '</p>').join('')}
    <p class="sub">${T('Weltwunder (Erweiterung)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Kosten 10/20/30/40 … für das 1./2./3./4. Wunder. Stufe 2 muss seltener sein als Stufe 1, Stufe 3 seltener als Stufe 2. Je Stadt zwei Wunder. Ein Wunder der Stufe 3 gewinnt zu Beginn des nächsten Zuges.')}</p>
    <p class="sub">${T('Ereignisse (Erweiterung)')}</p>
    <p style="font-size:13px;margin:4px 0">${T('Zu Rundenbeginn wird gewürfelt: Zeile, dann Spalte. Hart trifft jede Runde, leicht etwa jede zweite. Bots sind nie betroffen.')}</p>
    <p class="sub">${T('Alle Technologien')}</p>
    <p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('Kosten links, Wirkung rechts. Verfügbar wird eine Technologie erst, wenn sie ausgewürfelt ist.')}</p>
    ${oldTreeShown() ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('In dieser Partie gilt noch der alte Techtree.')}</p>` : ''}
    ${S && S.marathon ? `<p style="font-size:12px;color:var(--ink-soft);margin:0 0 8px">${T('Marathon: Technologien kosten je Zeitalter das Zwei-, Drei-, Vier- und Fünffache, die Singularität das 2,5-Fache – die Kosten hier sind schon umgerechnet.')}</p>` : ''}
    ${FIELDS.map((fn, f) => `<p class="rule-field">${fn}</p>` +
      AGES.map((an, a) => {
        const list = techsIn(f, a, S);
        if (!list.length) return '';
        return `<p class="rule-age">${an}</p>` + list.map(t =>
          `<div class="rule-tech"><span class="c">${techBase(S, t)}</span><b>${t.n}</b><i>${techEffect(t, S)}</i></div>`).join('');
      }).join('')).join('')}
    <p class="rule-field">${T('Sieg')}</p>
    <div class="rule-tech"><span class="c">${techBase(S, SINGULARITY)}</span><b>${SINGULARITY.n}</b>
      <i>${SINGULARITY.e}</i></div>`);
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function upload(cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
  i.onchange = () => { const f = i.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => cb(rd.result); rd.readAsText(f); };
  i.click();
}
boot();
