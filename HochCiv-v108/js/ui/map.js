/* js/ui/map.js – Die Karte: Gelände, Städte, Armeen, Ringe, Flüsse, Antippen.
   Teil der Oberfläche; alle Skripte teilen einen globalen Gültigkeitsbereich, die
   Reihenfolge steht in index.html (die einzige Liste). */
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
  } else if (t === 'B') add('path', { d: `M${x - 8},${y + 6} L${x},${y - 7} L${x + 8},${y + 6} Z`, fill: '#f2ece0', stroke: '#7a6a58', 'stroke-width': 1 });
  else if (t === 'W') for (let i = -1; i <= 1; i++)
    add('path', { d: `M${x + i * 8 - 5},${y + 6} L${x + i * 8},${y - 4} L${x + i * 8 + 5},${y + 6} Z`, fill: '#3f5f38' });
  else if (t === 'I') {
    /* Insel (v99): ein Eiland mit Strand und Grün, rundum ein schmaler Wasserrand – das Feld selbst
       trägt die Meerfarbe (drawMap). Die Küstenlinie ist leicht unregelmäßig, je Feld anders, aber
       fest (aus der Lage berechnet, nicht ausgewürfelt). */
    const k = Math.round(x * 7 + y * 13), pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 2 * Math.PI, rr = HEX * (0.58 + 0.06 * (((k + i * 5) % 5) - 2) / 2);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]);
    }
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M${m(pts[9], pts[0]).join(',')}`;
    pts.forEach((p, i) => { d += ` Q${p.join(',')} ${m(p, pts[(i + 1) % 10]).join(',')}`; });
    add('path', { d, fill: 'none', stroke: '#eef6f6', 'stroke-width': 3.2, 'stroke-linejoin': 'round' });   // Brandung
    add('path', { d: d + 'Z', fill: TERRAIN.I.color, stroke: '#b9a46c', 'stroke-width': 1 });
    add('ellipse', { cx: x - 2, cy: y - 2, rx: HEX * 0.3, ry: HEX * 0.24, fill: '#86a95e' });
    add('circle', { cx: x + 3, cy: y - 4, r: HEX * 0.1, fill: '#5f8a45' });
  }
  else if (t === 'V') {            // Vulkan: Kegel mit glühendem Krater
    add('path', { d: `M${x - 9},${y + 7} L${x - 3.5},${y - 6} L${x + 3.5},${y - 6} L${x + 9},${y + 7} Z`,
      fill: '#3b322b', stroke: '#241f1a', 'stroke-width': 1 });
    add('path', { d: `M${x - 3.5},${y - 6} L${x + 3.5},${y - 6} L${x + 1},${y - 1} L${x - 1},${y - 1} Z`,
      fill: '#c4552f' });
  }
}
/* Weltwunder einer Stadt: kleine Rauten unter der Stadtscheibe, Zahl = Stufe. */
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
/* ------------------------------------------------------------------ Kartenansichten (v75)
   Drei Schichten legen sich auf Wunsch über die Karte:
   · Erträge – je Feld bis zu drei Chips: Wissenschaft blau, Nahrung grün, Münzen gold,
     Nullen weggelassen. Gerechnet für das Reich am Zug (tileYieldAt), also mit seinen
     Technologien. Stadtfelder bringen selbst nichts und bleiben frei. Seit v87 nur noch im
     Gründungsmodus: der eigene Umschalter „Erträge" zeigte genau dasselbe und ist entfallen
     (an seiner Stelle steht „Fähigkeiten").
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
/* Flussläufe (v99, Anweisung des Autors: Flüsse deutlicher und klar anders als Meer). Jedes
   Flussfeld bekommt einen Wasserlauf von seiner Mitte zur Mitte der Kanten, an denen der Fluss
   weiterläuft – zwei Flussfelder treffen sich so genau auf ihrer gemeinsamen Kante.
   • Zusammenhängende Flussfelder werden wie ein Baum verbunden (feste Reihenfolge: Zeile, Spalte,
     Richtung), damit drei aneinanderliegende Felder keinen Kreis bilden.
   • Ein Ende des Laufs, an das Meer grenzt, mündet dort: in das Meerfeld, das dem übrigen Lauf am
     weitesten gegenüberliegt. Ein Ende ohne Meer ist eine Quelle – der Lauf endet im Feld,
     ohne die Kante zu berühren. Ein einzelnes Flussfeld ohne Nachbarn ist ein kurzer Bach.
   Nur Zeichnung: an den Regeln (Fluss ist Land mit 🌾 und 🪙) ändert sich nichts. */
function riverLines(g, rows) {
  const R = rows.length, v = hexPoints(HEX);
  const at = (r, c) => (r >= 0 && r < R && c >= 0 && c < rows[r].length) ? rows[r][c] : null;
  const kante = d => { const a = v[(d + 1) % 6], b = v[(d + 2) % 6]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const abstand = (a, b) => Math.min((a - b + 6) % 6, (b - a + 6) % 6);
  // Baum über alle Flussfelder (Union-Find), Kanten in fester Reihenfolge
  const wurzel = {}, finde = k => (wurzel[k] === k ? k : (wurzel[k] = finde(wurzel[k])));
  const lauf = {};
  for (let r = 0; r < R; r++) for (let c = 0; c < rows[r].length; c++)
    if (rows[r][c] === 'F') { wurzel[key(r, c)] = key(r, c); lauf[key(r, c)] = []; }
  for (let r = 0; r < R; r++) for (let c = 0; c < rows[r].length; c++) {
    if (rows[r][c] !== 'F') continue;
    for (let d = 0; d < 3; d++) {                       // jede Nachbarschaft einmal (O, SO, SW)
      const [nr, nc] = neighbor(r, c, d);
      if (at(nr, nc) !== 'F') continue;
      const a = finde(key(r, c)), b = finde(key(nr, nc));
      if (a === b) continue;
      wurzel[a] = b;
      lauf[key(r, c)].push(d); lauf[key(nr, nc)].push((d + 3) % 6);
    }
  }
  for (const k of Object.keys(lauf)) {
    const [r, c] = unkey(k), enden = lauf[k].slice();
    const [x, y] = hexCenter(r, c, HEX);
    const meer = [];
    for (let d = 0; d < 6; d++) if (at(...neighbor(r, c, d)) === 'M') meer.push(d);
    if (enden.length <= 1 && meer.length)               // Mündung am Ende des Laufs
      enden.push(meer.slice().sort((a, b) =>
        (enden.length ? abstand(b, enden[0]) - abstand(a, enden[0]) : 0) || a - b)[0]);
    let d = '';
    const ast = (e, voll) => {
      const [kx, ky] = kante(e), f = voll ? 1 : 0.55, mx = kx * f, my = ky * f, s = (e + r + c) % 2 ? 1 : -1;
      // Kontrollpunkt auf halbem Weg, etwas zur Seite gedreht – so schlängelt sich der Lauf
      const cx = x + mx * 0.5 - my * 0.3 * s, cy = y + my * 0.5 + mx * 0.3 * s;
      d += `M${x + mx},${y + my} Q${cx},${cy} ${x},${y} `;
    };
    enden.forEach(e => ast(e, true));
    if (enden.length === 1) ast((enden[0] + 3) % 6, false);          // Quelle im Feld
    if (!enden.length) { const e = (r + c) % 3; ast(e, false); ast(e + 3, false); }   // Bach
    g.appendChild(svgEl('path', { d, fill: 'none', stroke: '#3576b0', 'stroke-width': 6.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
    g.appendChild(svgEl('path', { d, fill: 'none', stroke: '#a6d0ec', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.75, 'pointer-events': 'none' }));
  }
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
      points: pts, transform: `translate(${x},${y})`,
      fill: t === 'I' ? TERRAIN.M.color : TERRAIN[t].color,     // Insel: Wasser rundum (v99)
      stroke: '#8a8258', 'stroke-width': 1, 'data-r': r, 'data-c': c
    };
    if (off) { attrs.opacity = 0.4; attrs['stroke-dasharray'] = '3 3'; }
    world.appendChild(svgEl('polygon', attrs));
    if (!off) terrainGlyph(world, t, x, y);
  }
  riverLines(world, rows);
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
    // 4b Hervorhebung des Ersten Spiels: goldener Rahmen um die Felder, um die es gerade geht
    markHexes(opts.tutHl, 'tut');
    // 4b' Szene eines KI- oder Bot-Zugs (v94): dieselben goldenen Felder, unter den Figuren
    if (opts.anim) markHexes(opts.anim.felder, 'tut');
    // 4c Machtringe der Armeen, unter dem Armeesymbol
    if (opts.power) powerRings(world, S2, opts.power, 'armee');
    // 5 Armeen – die gerade ziehen (v94), zeichnet animMarks gleitend
    const gleiten = new Set(opts.anim ? opts.anim.zuege.map(z => z.id) : []);
    S2.armies.forEach(a => {
      if (gleiten.has(a.id)) return;
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
    // 5b Machtringe der Städte – außen um die Stadtscheibe, Wunder darüber
    if (opts.power) powerRings(world, S2, opts.power, 'stadt');
    // 6 Städte: in der Scheibe die Bevölkerung als Zahl, in der Farbe des Reichs (v84,
    // Anweisung des Autors – vorher stand dort das Reichssymbol, die Bevölkerung als Striche
    // darüber). Hauptstädte behalten den dunklen, dicken Ring; mehrstellige Zahlen werden
    // kleiner, damit sie in der Scheibe bleiben.
    S2.cities.forEach(ct => {
      const [x, y] = hexCenter(ct.r, ct.c, HEX);
      const civ = civOf(S2.players[ct.owner]);
      world.appendChild(svgEl('circle', {
        cx: x, cy: y, r: 15, fill: '#f7f1e0', stroke: ct.cap ? '#2a2721' : civ.color,
        'stroke-width': ct.cap ? 3.5 : 2.4, 'pointer-events': 'none'
      }));
      const n = String(Math.max(0, ct.pop)), lang = n.length;
      const t = svgEl('text', {
        x, y: y + (lang > 2 ? 4.5 : lang > 1 ? 6 : 7), 'text-anchor': 'middle',
        'font-size': lang > 2 ? 13 : lang > 1 ? 17 : 20, 'font-weight': 700,
        fill: civ.color, 'pointer-events': 'none', 'data-pop': n,
      });
      t.textContent = n; world.appendChild(t);
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
  // 6b Kampf nachspielen (v90): Kampffeld, Angreiferfelder, beide Machtwerte – über allem
  if (opts.fight && opts.state) fightMarks(world, opts.state, opts.fight, w, h);
  // 6c Szene eines KI- oder Bot-Zugs (v94): Züge, Ringe, +1/−1 – über allem
  if (opts.anim && opts.state) animMarks(world, opts.state, opts.anim);
  // 7 Auswahl
  if (opts.sel) markHexes([opts.sel], 'sel');
  return world;
}

/* Ein Kampf auf der Karte (v90): das Kampffeld golden, die Felder des Angreifers in seiner
   Farbe umrandet, daneben beide Machtwerte – ⚔️ Angriff in der Farbe des Angreifers, 🛡️
   Verteidigung in der des Verteidigers – und dazwischen, wer gewinnt (> der Angriff, ≤ die
   Verteidigung: Gleichstand hält). Dazu, welcher Kampf es ist und wie er ausgeht.
   Die Werte stehen gut zwei Felder über oder unter dem Kampffeld und zeigen mit einem Strich
   darauf. Welche Seite (und ob um ein Feld seitlich versetzt), entscheidet, was dabei am
   wenigsten von den Angreifern verdeckt; bei Gleichstand oben, und nie über den Kartenrand.
   Auf kleinen Bildschirmen (Telefon) wachsen die Werte mit, damit die Zahl lesbar bleibt
   (etwa 14 px). Der Maßstab ist der, mit dem die Karte eingepasst ist (das kleinere
   Verhältnis von Breite und Höhe); ist die App hochkant gedreht, misst das Rechteck des
   Browsers die Karte gedreht – dann sind seine Seiten vertauscht. */
function fightMarks(world, S2, f, breite, hoehe) {
  const att = civOf(S2.players[f.pi]), def = civOf(S2.players[f.gegner]);
  const ohne = { 'pointer-events': 'none' };
  f.von.forEach(([r, c]) => {
    const [x, y] = hexCenter(r, c, HEX);
    world.appendChild(svgEl('polygon', Object.assign({
      points: hexPath(HEX - 3), transform: `translate(${x},${y})`, fill: 'none',
      stroke: att.color, 'stroke-width': 4, 'stroke-linejoin': 'round', class: 'fight-from',
    }, ohne)));
  });
  const [x0, y] = hexCenter(f.r, f.c, HEX);
  world.appendChild(svgEl('polygon', Object.assign({
    points: hexPath(HEX), transform: `translate(${x0},${y})`, fill: 'rgba(255,214,102,.30)',
    stroke: '#b8860b', 'stroke-width': 4, 'stroke-linejoin': 'round', class: 'fight-field',
  }, ohne)));
  // Wie groß die Karte auf dem Schirm ist: daraus der Faktor für die Schrift
  const svg = world.ownerSVGElement, box = svg && svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
  let massstab = 1;
  if (box && box.width && box.height) {
    const [bw, bh] = turning() ? [box.height, box.width] : [box.width, box.height];
    massstab = Math.min(bw / breite, bh / hoehe);
  }
  const k = Math.min(2.2, Math.max(1, 14 / (18 * massstab)));
  const textA = '⚔️ ' + f.a, textD = '🛡️ ' + f.d;
  const breiteVon = text => (22 + 10.5 * [...text].length) * k;
  const halb = 40 * k, links = halb + breiteVon(textA) / 2, rechts = halb + breiteVon(textD) / 2;
  // Abstand: die Plaketten bleiben frei von den Figuren der Nachbarfelder (Mitte 1,5 Felder
  // entfernt, Figur gut ein halbes Feld groß)
  const abstand = HEX * 2.07 + 17 * k, figur = HEX * 0.55;
  const lage = (s, dx) => {
    const x = Math.max(links + 4, Math.min(breite - rechts - 4, x0 + dx));
    const by = y + s * abstand;
    const oben = s < 0 ? by - 33 * k : by - 14 * k, unten = s < 0 ? by + 14 * k : by + 39 * k;
    let kosten = oben < 0 || unten > hoehe ? 100 : 0;
    for (const [r, c] of f.von) {
      const [hx, hy] = hexCenter(r, c, HEX);
      if (hx + figur > x - links && hx - figur < x + rechts && hy + figur > by - 14 * k && hy - figur < by + 14 * k) kosten++;
    }
    return { s, x, by, kosten };
  };
  const schritt = Math.sqrt(3) * HEX;
  const wahl = [lage(-1, 0), lage(1, 0), lage(-1, -schritt), lage(-1, schritt), lage(1, -schritt), lage(1, schritt)]
    .reduce((a, b) => (b.kosten < a.kosten ? b : a));
  const { s, x, by } = wahl;
  world.appendChild(svgEl('line', Object.assign({
    x1: x, y1: by - s * 14 * k, x2: x0, y2: y + s * HEX * 0.8,
    stroke: '#2a2721', 'stroke-width': 2.5, 'stroke-linecap': 'round', class: 'fight-line',
  }, ohne)));
  const plakette = (cx, text, farbe, cls) => {
    const w = breiteVon(text);
    world.appendChild(svgEl('rect', Object.assign({
      x: cx - w / 2, y: by - 14 * k, width: w, height: 28 * k, rx: 9 * k, fill: farbe,
      stroke: '#f7f1e0', 'stroke-width': 2.5, class: cls + '-box',
    }, ohne)));
    const t = svgEl('text', Object.assign({
      x: cx, y: by + 6.5 * k, 'text-anchor': 'middle', 'font-size': 18 * k, 'font-weight': 700,
      fill: '#fff', class: cls,
    }, ohne));
    t.textContent = text; world.appendChild(t);
  };
  plakette(x - halb, textA, att.color, 'fight-a');
  plakette(x + halb, textD, def.color, 'fight-d');
  const zeichen = svgEl('text', Object.assign({
    x, y: by + 7 * k, 'text-anchor': 'middle', 'font-size': 20 * k, 'font-weight': 700,
    fill: '#2a2721', stroke: '#f7f1e0', 'stroke-width': 4, 'paint-order': 'stroke', class: 'fight-sign',
  }, ohne));
  zeichen.textContent = f.sieg ? '>' : '≤';
  world.appendChild(zeichen);
  if (f.caption) {
    const cx = Math.max(120 * k, Math.min(breite - 120 * k, x));
    const t = svgEl('text', Object.assign({
      x: cx, y: by + (s < 0 ? -22 : 36) * k, 'text-anchor': 'middle', 'font-size': 14 * k, 'font-weight': 700,
      fill: '#2a2721', stroke: '#f7f1e0', 'stroke-width': 4, 'paint-order': 'stroke', class: 'fight-caption',
    }, ohne));
    t.textContent = f.caption; world.appendChild(t);
  }
}

/* ------------------------------------------------------------------ Antippen
   Die Karte wird nicht mehr geschoben oder gezoomt: sie ist immer vollständig
   eingepasst. Deshalb braucht es auch keine Koordinatenrechnung mehr – der Treffer
   wird direkt auf dem Sechseck ausgewertet. Das ist genauer als „nächster Mittelpunkt"
   (die Ecken gehören jetzt dem richtigen Feld) und funktioniert auch dann, wenn die
   App im Hochformat um 90° gedreht dargestellt wird. */
function attachTaps(svg, onTap, daneben) {
  svg.addEventListener('click', e => {
    const el = e.target.closest ? e.target.closest('[data-r]') : null;
    if (!el) { if (daneben) daneben(); return; }
    onTap(+el.dataset.r, +el.dataset.c);
  });
}
// Ein Tipp neben die Felder (Kartenrand) überspringt ein Nachspiel ebenso wie einer auf ein Feld (v94)
const kartenrandTipp = () => { if (ui.anim) endAnim(); else if (ui.combat) endCombat(); };
