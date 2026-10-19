/* ================================================================== Marathon (v83)
   Anweisung des Autors: ein Modus für vier Reiche auf einer Zufallskarte, viermal so groß
   wie die Europakarte (Originalkarte 12 × 18 → 24 × 36 Felder). Technologien kosten je
   Zeitalter das Zwei-, Drei-, Vier- und Fünffache, die Singularität das 2,5-Fache (techBase
   in data.js). Jede Hauptstadt bringt zu Beginn Nahrung + ½ Münzen ≥ 4 – auch mit zwei
   Bevölkerung (Siedlertrecks), dem ungünstigsten Fall. Vor dem ersten Zug sehen alle die
   Karte und die Starttechnologien jedes Reichs und draften dann ihre Fähigkeiten: je Reich
   zwei, in Schlangenreihenfolge, aus 2n + 1 zufällig gezogenen (dieselbe darf mehrfach im
   Vorrat liegen). Bots draften nicht – sie haben nach den Bot-Regeln keine Fähigkeiten.

   Diese Datei: Kartengenerator, Hauptstädte, Draft-Vorrat und -Reihenfolge, die Wahl der
   KI. Die Regeln selbst (Kosten, mehrere Fähigkeiten) stehen in data.js und engine.js, die
   Oberfläche des Drafts in ui.js. */

/* ------------------------------------------------------------------ Karte
   Höhenfeld aus geglättetem Rauschen (drei Oktaven, am Rand abfallend) → die tiefsten 30 %
   werden Meer (wie auf der Originalkarte). Winzige Landstücke werden Inseln, eingeschlossene
   Seen Fluss. Gebirge entlang eines Kammrauschens, von dort Flüsse bergab bis ins Meer,
   Wald nach einem eigenen Rauschen, der Rest Grasland. Zielanteile wie auf der
   Originalkarte: Meer 30 %, Grasland 36 %, Wald 15 %, Gebirge 9 %, Fluss 8 %, Insel 2–3 %. */
function marathonNoise(rnd, R, C, cell) {
  // Wertrauschen: Zufallsgitter mit Abstand `cell` Felder, dazwischen weich interpoliert
  const gr = Math.ceil(R / cell) + 2, gc = Math.ceil(C / cell) + 2;
  const g = [];
  for (let i = 0; i < gr; i++) { g.push([]); for (let j = 0; j < gc; j++) g[i].push(rnd()); }
  const smooth = t => t * t * (3 - 2 * t);
  return (r, c) => {
    // in Pixelkoordinaten des Rasters gemessen, damit die versetzten Zeilen nicht streifen
    const x = (c + 0.5 * (r & 1)) / cell, y = (r * 0.866) / cell;
    const i = Math.floor(y), j = Math.floor(x), fy = smooth(y - i), fx = smooth(x - j);
    const a = g[i][j], b = g[i][j + 1], cc = g[i + 1][j], d = g[i + 1][j + 1];
    return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy;
  };
}
function marathonTerrain(seed) {
  const R = MARATHON_ROWS, C = MARATHON_COLS, rnd = mapRng(seed);
  const n1 = marathonNoise(rnd, R, C, 9), n2 = marathonNoise(rnd, R, C, 4.5), n3 = marathonNoise(rnd, R, C, 2.2);
  const ridge = marathonNoise(rnd, R, C, 5), wood = marathonNoise(rnd, R, C, 3.5);
  const inside = (r, c) => r >= 0 && r < R && c >= 0 && c < C;
  const elev = [];
  for (let r = 0; r < R; r++) {
    elev.push([]);
    for (let c = 0; c < C; c++) {
      const edge = Math.min(r, R - 1 - r, c, C - 1 - c);          // Felder bis zum Rand
      const fall = edge >= 3 ? 0 : (3 - edge) * 0.22;
      elev[r].push(n1(r, c) + 0.5 * n2(r, c) + 0.25 * n3(r, c) - fall);
    }
  }
  const all = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) all.push([r, c]);
  const quant = (vals, q) => { const s = vals.slice().sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; };
  const seaLevel = quant(all.map(([r, c]) => elev[r][c]), 0.30);
  const t = [];
  for (let r = 0; r < R; r++) { t.push([]); for (let c = 0; c < C; c++) t[r].push(elev[r][c] <= seaLevel ? 'M' : 'G'); }
  // zusammenhängende Gebiete gleicher Art (Land bzw. Meer)
  const parts = isLand => {
    const seen = new Set(), out = [];
    for (const [r, c] of all) {
      const k = key(r, c);
      if (seen.has(k) || (t[r][c] !== 'M') !== isLand) continue;
      const part = [], st = [[r, c]]; seen.add(k);
      while (st.length) {
        const [a, b] = st.pop(); part.push([a, b]);
        for (const [x, y] of neighbors(a, b)) {
          const kk = key(x, y);
          if (!inside(x, y) || seen.has(kk) || (t[x][y] !== 'M') !== isLand) continue;
          seen.add(kk); st.push([x, y]);
        }
      }
      out.push(part);
    }
    return out;
  };
  // winzige Landstücke (bis 3 Felder) werden Inseln, kleine Binnenseen (bis 2 Felder) Fluss
  for (const part of parts(true)) if (part.length <= 3) part.forEach(([r, c]) => { t[r][c] = 'I'; });
  for (const part of parts(false)) {
    const rand = part.some(([r, c]) => r === 0 || c === 0 || r === R - 1 || c === C - 1);
    if (!rand && part.length <= 2) part.forEach(([r, c]) => { t[r][c] = 'F'; });
  }
  const land = all.filter(([r, c]) => t[r][c] === 'G');
  // Gebirge: Kämme, kein Klumpen – „geknicktes" Rauschen (1 − |2n − 1|) ist entlang einer
  // Höhenlinie am höchsten und bildet so Linien; dazu ein wenig Höhe. Die obersten 13 %.
  const berg = land.map(([r, c]) => (1 - Math.abs(2 * ridge(r, c) - 1)) + 0.35 * elev[r][c]);
  const bergMin = quant(berg, 0.87);
  land.forEach(([r, c], i) => { if (berg[i] >= bergMin) t[r][c] = 'B'; });
  // Flüsse: von Gebirgsrändern bergab, bis Meer, Fluss oder Sackgasse (8 % der Karte)
  const ziel = Math.round(0.08 * R * C);
  let fluss = all.filter(([r, c]) => t[r][c] === 'F').length, versuche = 0;
  const quellen = all.filter(([r, c]) => t[r][c] === 'B' &&
    neighbors(r, c).some(([x, y]) => inside(x, y) && t[x][y] === 'G'));
  while (fluss < ziel && quellen.length && versuche++ < 200) {
    const [qr, qc] = quellen.splice(Math.floor(rnd() * quellen.length), 1)[0];
    let r = qr, c = qc, schritte = 0;
    const weg = [];
    while (schritte++ < 30) {
      const nb = neighbors(r, c).filter(([x, y]) => inside(x, y) && t[x][y] !== 'B' && !weg.some(w => w[0] === x && w[1] === y));
      if (!nb.length) break;
      nb.sort((a, b) => elev[a[0]][a[1]] - elev[b[0]][b[1]]);
      const [x, y] = nb[0];
      if (t[x][y] === 'M' || t[x][y] === 'F') break;     // mündet
      if (elev[x][y] > elev[r][c] + 0.05 && weg.length) break;   // kein Weg mehr bergab
      weg.push([x, y]); r = x; c = y;
    }
    if (weg.length < 3) continue;
    for (const [x, y] of weg) if (t[x][y] === 'G' && fluss < ziel) { t[x][y] = 'F'; fluss++; }
  }
  // Wald: 23 % des übrigen Graslands nach eigenem Rauschen (≈ 15 % der Karte)
  const gras = all.filter(([r, c]) => t[r][c] === 'G');
  const wv = gras.map(([r, c]) => wood(r, c));
  const waldMin = quant(wv, 1 - Math.min(0.9, (0.15 * R * C) / Math.max(1, gras.length)));
  gras.forEach(([r, c], i) => { if (wv[i] >= waldMin) t[r][c] = 'W'; });
  // ein paar Inseln im offenen Meer, bis gut 2 % Inseln
  const offen = all.filter(([r, c]) => t[r][c] === 'M' && r > 0 && c > 0 && r < R - 1 && c < C - 1 &&
    neighbors(r, c).every(([x, y]) => inside(x, y) && t[x][y] === 'M'));
  let inseln = all.filter(([r, c]) => t[r][c] === 'I').length;
  while (inseln < Math.round(0.022 * R * C) && offen.length) {
    const [r, c] = offen.splice(Math.floor(rnd() * offen.length), 1)[0];
    if (neighbors(r, c).some(([x, y]) => t[x][y] === 'I')) continue;
    t[r][c] = 'I'; inseln++;
  }
  return t.map(z => z.join(''));
}

/* ------------------------------------------------------------------ Hauptstädte
   Was eine Hauptstadt im ersten Zug einbringt, im ungünstigsten Fall: ohne Technologien und
   ohne Ertragsfähigkeit, mit zwei Bevölkerung (Siedlertrecks lässt sich draften – und dann
   startet die Hauptstadt mit 2). Gefordert: Nahrung + ½ Münzen ≥ 4. Mit einer Bevölkerung
   ist es immer ½ mehr. */
function marathonStartYield(rows, r, c, pop = 2) {
  let food = 0, coins = 0, sci = 0;
  for (const [x, y] of neighbors(r, c)) {
    const t = rows[x] && rows[x][y];
    if (!t || !TERRAIN[t] || isOff(t)) continue;
    const yy = TERRAIN[t].block ? [0, 0, 0] : TERRAIN[t].yield;
    sci += yy[0]; food += yy[1]; coins += yy[2];
  }
  return { sci: sci + pop * CITY_YIELD[0], food: food + pop * CITY_YIELD[1], coins: coins + pop * CITY_YIELD[2] };
}
const marathonStartOk = y => y.food + y.coins / 2 >= MARATHON_MIN_START;
/* Vier Hauptstädte, je eine im Umkreis von 6 Feldern um die Mitte eines Kartenviertels,
   mindestens MARATHON_MIN_DIST Felder voneinander entfernt. Erlaubt nur auf Land mit
   ausreichendem Startertrag (marathonStartOk) und mit genug Land ringsum (mindestens 30
   der 60 Felder im Umkreis 4). Unter allen erlaubten Vierergruppen die, deren schwächste
   Hauptstadt am besten dasteht (Startertrag und Land ringsum) – so fair wie möglich. */
function marathonCapitals(rows) {
  const R = rows.length, C = rows[0].length;
  const isLand = (r, c) => r >= 0 && r < R && c >= 0 && c < C && TERRAIN[rows[r][c]] &&
    TERRAIN[rows[r][c]].land && !TERRAIN[rows[r][c]].block;
  const mitten = [[R / 4, C / 4], [R / 4, 3 * C / 4], [3 * R / 4, C / 4], [3 * R / 4, 3 * C / 4]]
    .map(([r, c]) => [Math.floor(r), Math.floor(c)]);
  const kand = mitten.map(([mr, mc]) => {
    const out = [];
    for (const [r, c] of within(mr, mc, 6).concat([[mr, mc]])) {
      if (!isLand(r, c) || r < 2 || c < 2 || r > R - 3 || c > C - 3) continue;
      const y = marathonStartYield(rows, r, c);
      if (!marathonStartOk(y)) continue;
      const room = within(r, c, 4).filter(([x, z]) => isLand(x, z)).length;
      if (room < 30) continue;
      out.push({ r, c, y, room, score: 2 * Math.min(8, y.food + y.coins / 2) + room / 5 });
    }
    return out.sort((a, b) => b.score - a.score);
  });
  if (kand.some(k => !k.length)) return null;
  let best = null;
  const wahl = [];
  const suche = q => {
    if (q === 4) {
      const schwach = Math.min(...wahl.map(x => x.score));
      if (!best || schwach > best.schwach) best = { schwach, caps: wahl.slice() };
      return;
    }
    for (const x of kand[q].slice(0, 40)) {
      if (best && x.score <= best.schwach) break;            // kann die Schwächste nicht mehr heben
      if (wahl.some(w => hexDistance(w.r, w.c, x.r, x.c) < MARATHON_MIN_DIST)) continue;
      wahl.push(x); suche(q + 1); wahl.pop();
    }
  };
  suche(0);
  return best ? best.caps.map(x => ({ r: x.r, c: x.c })) : null;
}
/* Die Marathonkarte zu einem Startwert. Findet sich keine faire Aufstellung, wird mit dem
   nächsten Startwert neu erzeugt (selten; test.js zählt es). Die Hauptstädte stehen nach
   Platz im Aufbau (map.capitals[slot]), wie auf der Plättchenkarte. */
function marathonMap(seed) {
  for (let i = 0; i < 40; i++) {
    const rows = marathonTerrain(seed + i * 7919);
    const caps = marathonCapitals(rows);
    if (!caps) continue;
    const r = mapRng(seed + 99991 + i);
    for (let k = caps.length - 1; k > 0; k--) {            // welcher Platz welches Viertel bekommt
      const j = Math.floor(r() * (k + 1)); [caps[k], caps[j]] = [caps[j], caps[k]];
    }
    return { name: T('Marathonkarte (%s × %s)', MARATHON_ROWS, MARATHON_COLS), rows, capitals: caps, marathon: true, tries: i + 1 };
  }
  throw new Error('Keine Marathonkarte gefunden');
}

/* ------------------------------------------------------------------ Draft
   Vorrat: 2n + 1 Fähigkeiten, zufällig aus allen zwölf gezogen, mit Zurücklegen – dieselbe
   kann mehrfach im Vorrat liegen. n = Zahl der draftenden Reiche (Menschen und KI).
   Reihenfolge: Zugfolge ab dem Startspieler, dann rückwärts (Schlange). Bei vier Reichen
   also 1-2-3-4-4-3-2-1; der Letzte wählt aus den letzten zwei.
   Eine Fähigkeit, die man schon hat, darf man nur nehmen, wenn nichts anderes mehr übrig
   ist – doppelt wirkt sie nicht doppelt (abilitiesOf). */
const ALL_ABILITIES = CIVS.flatMap(c => c.abilities.map(a => c.k + ':' + a.k));
function draftDrafters(V) {
  const order = [];
  for (let i = 0; i < V.players.length; i++) {
    const pi = (V.startIdx + i) % V.players.length;
    if (V.players[pi].kind !== 'bot') order.push(pi);
  }
  return order;
}
/* Die Partie, die der Draft zeigt: dieselbe Karte und dieselben Würfe wie die echte, aber
   noch ohne jede Fähigkeit (drafted: []). Sonst zeigte der Bogen Griechenlands schon den
   Rabatt seiner Grundfähigkeit, die Hauptstadt Russlands den Taiga-Ertrag und die Karte die
   Gratisarmee der Wikinger – alles Fähigkeiten, die erst gedraftet werden. */
function draftView(cfg) {
  return newGame(Object.assign({}, cfg, {
    players: cfg.players.map(pc => pc.kind === 'bot' ? pc : Object.assign({}, pc, { drafted: [] })),
  }));
}
function draftNew(V, seed) {
  const rnd = mapRng(seed);
  const drafters = draftDrafters(V);
  const pool = [];
  for (let i = 0; i < 2 * drafters.length + 1; i++) pool.push(ALL_ABILITIES[Math.floor(rnd() * ALL_ABILITIES.length)]);
  return {
    pool, order: drafters.concat(drafters.slice().reverse()), at: 0,
    picks: Object.fromEntries(V.players.map((_, i) => [i, []])),
  };
}
const draftCurrent = D => D.at < D.order.length ? D.order[D.at] : null;
const draftDone = D => D.at >= D.order.length;
// Was der Spieler am Zug wählen darf: jede noch liegende Fähigkeit – nur eine, die er schon
// hat, nicht, solange es eine andere gibt
function draftOptions(D, pi) {
  const neu = D.pool.filter(a => !D.picks[pi].includes(a));
  return [...new Set(neu.length ? neu : D.pool)];
}
function draftPick(D, pi, id) {
  if (draftDone(D) || draftCurrent(D) !== pi) return T('Nicht am Zug.');
  if (!draftOptions(D, pi).includes(id)) return T('Diese Fähigkeit liegt nicht zur Wahl.');
  D.pool.splice(D.pool.indexOf(id), 1);
  D.picks[pi].push(id);
  D.at++;
  return null;
}

/* ------------------------------------------------------------------ Wahl der KI
   Feste Grundwerte je Fähigkeit, dazu, was die Karte um die eigene Hauptstadt hergibt
   (Wald für Taiga, Küste für Seemacht, Land für Siedler und Kolonisten).
   Die Grundwerte sind gemessen (v83, ANNAHMEN): 40 Marathonpartien mit vier KI (Schwer) und
   zufällig zugeteilten Fähigkeiten, Stärke je Fähigkeit über ein bedingtes Logit (wer
   gewinnt, gegeben die Fähigkeiten aller vier), Mitbesitz herausgerechnet. Eindeutig ist
   nur das Ergebnis für Kolonisten (21 Siege in 27 Partien, wo ein Viertel zu erwarten
   wäre); die übrigen liegen dicht beieinander und sind auf 40 Partien unsicher – sie sind
   die gemessene Reihenfolge, etwas zur Mitte gezogen. Taiga, Seemacht und Siedlertrecks
   haben einen niedrigen Grundwert, weil die Karte im Mittel etwas dazugibt (gemessen über
   120 Hauptstädte: Taiga +2,8, Seemacht +2,4, Land +1,5) – gemessen ist der Wert samt Karte. */
const KI_DRAFT_BASE = {
  'england:gruenden': 15, 'england:basis': 8, 'england:kuestenstaedte': 2,
  'griechenland:gratistech': 7.5, 'griechenland:basis': 5, 'griechenland:rueckschau': 4.5,
  'wikinger:armeemacht': 7.5, 'wikinger:basis': 6.5, 'wikinger:kampfertrag': 3.5,
  'russland:siedler': 2.5, 'russland:wachstum': 2.5, 'russland:basis': 1,
};
function kiDraftValue(V, pi, id, mine) {
  if (mine.includes(id)) return -5;                  // doppelt wirkt nichts
  let v = KI_DRAFT_BASE[id] || 0;
  const cap = capitalOf(V, pi);
  if (!cap) return v;
  const umkreis = within(cap.r, cap.c, 5).filter(([r, c]) => terrainAt(V, r, c));
  const zahl = t => umkreis.filter(([r, c]) => terrainAt(V, r, c) === t).length;
  const land = umkreis.filter(([r, c]) => TERRAIN[terrainAt(V, r, c)].land).length;
  if (id === 'russland:basis') v += Math.min(4, zahl('W') / 4);    // +1 Nahrung je Wald
  if (id === 'england:kuestenstaedte') {
    // Landfelder am Meer, auf denen eine Stadt stehen könnte
    const kueste = umkreis.filter(([r, c]) => TERRAIN[terrainAt(V, r, c)].land &&
      neighbors(r, c).some(([x, y]) => terrainAt(V, x, y) === 'M')).length;
    v += Math.min(4, kueste / 6);
  }
  if (id === 'russland:siedler' || id === 'england:gruenden') v += Math.max(-2, Math.min(2, (land - 50) / 15));
  // eine militärische Ausrichtung passt zur anderen
  const krieg = ['wikinger:armeemacht', 'wikinger:kampfertrag', 'wikinger:basis'];
  if (krieg.includes(id) && mine.some(a => krieg.includes(a))) v += 1.5;
  // Kolonisten verdoppeln die Wachstumskosten, Fruchtbarkeit streicht die Nahrung daran
  if (id === 'england:gruenden' && mine.includes('russland:wachstum')) v += 1;
  if (id === 'russland:wachstum' && mine.includes('england:gruenden')) v += 1;
  return v;
}
function kiDraftPick(V, D, pi) {
  const mine = D.picks[pi];
  const opts = draftOptions(D, pi);
  let best = opts[0], bv = -Infinity;
  for (const id of opts) {
    const v = kiDraftValue(V, pi, id, mine);
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}
