/* ================================================================== Vereinfachtes Spiel (v113)
   Anweisung des Autors: auf der Seite „Erstes Spiel" eine weitere Wahl – ein vereinfachtes Spiel,
   1 gegen 1 gegen die KI auf einer Zufallskarte. Die Regeln dazu stehen in data.js (EINFACH_TECHS,
   EINFACH_KOSTEN, EINFACH_BAUM, techFeld) und an wenigen Stellen in engine.js und ki.js, jeweils
   über S.einfach: zwei Bäume statt vier Felder, keine Zivilisationsfähigkeiten, kein
   Wirtschaftssieg. Hier: die Karte, der Aufbau einer Partie und die Spieltipps, die dazu passen.

   Die Karte (Wahl des Autors): 10 × 16, nur Grasland, Meer und Gebirge, am Mittelpunkt gespiegelt
   – beide Seiten bekommen dasselbe Land. Meer am Rand, aber nicht rundum, dazu ein paar kleine
   Binnenmeere (auch einzelne Felder); zusammen etwa 28 % Meer, dazu etwa 15 % Gebirge als Kämme,
   der Rest Grasland. Alles Land hängt zusammen. Die Hauptstädte stehen fest (keine Legephase),
   gespiegelt, also gleich gut. */
const EINFACH_ROWS = 10, EINFACH_COLS = 16;   // gerade Zeilenzahl: nur so ist die Spiegelung ein Hexraster-Zug
const EINFACH_MEER = 0.28;          // Anteil Meer insgesamt, Rand und Binnenmeere
const EINFACH_BERG = 0.15;          // Anteil Gebirge
const EINFACH_ABSTAND = [9, 13];    // Abstand der beiden Hauptstädte
const EINFACH_START = 4;            // Nahrung + ½ Münzen jeder Hauptstadt im ersten Zug (wie im Marathon)

/* Spiegelung am Mittelpunkt: (r, c) → (R−1−r, C−1−c). Mit gerader Zeilenzahl wechselt jede Zeile
   ihre Versetzung (odd-r) – genau dann ist das eine Drehung um 180° im Bild, Nachbarn bleiben
   Nachbarn (bei ungerader Zeilenzahl nicht). */
const einfachSpiegel = (r, c) => [EINFACH_ROWS - 1 - r, EINFACH_COLS - 1 - c];

/* Gelände zu einem Startwert, ohne Hauptstädte; null, wenn das Land nicht in einem Stück am
   Mittelpunkt hängt (dann versucht einfachKarte den nächsten Startwert). */
function einfachGelaende(rnd, binnen) {
  const R = EINFACH_ROWS, C = EINFACH_COLS, N = R * C;
  const inside = (r, c) => r >= 0 && r < R && c >= 0 && c < C;
  const alle = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) alle.push([r, c]);
  const sym = f => (r, c) => { const [a, b] = einfachSpiegel(r, c); return (f(r, c) + f(a, b)) / 2; };
  const n1 = marathonNoise(rnd, R, C, 5), n2 = marathonNoise(rnd, R, C, 2.5), kamm = marathonNoise(rnd, R, C, 3.2);
  // Höhe: Rauschen, am Rand abfallend – dort entsteht das Meer, aber nicht überall
  const hoehe = sym((r, c) => {
    const rand = Math.min(r, R - 1 - r, c, C - 1 - c);
    return n1(r, c) + 0.5 * n2(r, c) - [0.3, 0.1, 0][Math.min(rand, 2)];
  });
  const h = alle.map(([r, c]) => hoehe(r, c));
  const H = (r, c) => h[r * C + c];
  // Randmeer: die niedrigsten Felder, die mit dem Kartenrand zusammenhängen – so viele, dass mit den
  // Binnenmeeren etwa EINFACH_MEER herauskommt. Eingeschlossene Senken bleiben Land.
  const ziel = Math.round(EINFACH_MEER * N) - binnen;
  const randMeer = v => {
    const seen = new Set(), st = [];
    for (const [r, c] of alle) {
      if ((r === 0 || c === 0 || r === R - 1 || c === C - 1) && H(r, c) <= v) { seen.add(key(r, c)); st.push([r, c]); }
    }
    while (st.length) {
      const [r, c] = st.pop();
      for (const [x, y] of neighbors(r, c)) {
        if (!inside(x, y) || seen.has(key(x, y)) || H(x, y) > v) continue;
        seen.add(key(x, y)); st.push([x, y]);
      }
    }
    return seen;
  };
  const stufen = [...new Set(h)].sort((a, b) => a - b);
  let meer = new Set();
  for (const v of stufen) { meer = randMeer(v); if (meer.size >= ziel) break; }
  const t = alle.map(([r, c]) => meer.has(key(r, c)) ? 'M' : 'G');
  const T_ = (r, c) => t[r * C + c];
  const setze = (r, c, x) => { t[r * C + c] = x; };
  // Land in einem Stück: das größte Gebiet muss am Mittelpunkt hängen (gespiegelt auf sich selbst),
  // alles andere Land (Inseln im Randmeer) wird Meer
  const gebiete = [], gesehen = new Set();
  for (const [r, c] of alle) {
    if (T_(r, c) === 'M' || gesehen.has(key(r, c))) continue;
    const g = [], st = [[r, c]]; gesehen.add(key(r, c));
    while (st.length) {
      const [a, b] = st.pop(); g.push([a, b]);
      for (const [x, y] of neighbors(a, b))
        if (inside(x, y) && T_(x, y) !== 'M' && !gesehen.has(key(x, y))) { gesehen.add(key(x, y)); st.push([x, y]); }
    }
    gebiete.push(g);
  }
  gebiete.sort((a, b) => b.length - a.length);
  const haupt = gebiete[0];
  if (!haupt) return null;
  const imHaupt = new Set(haupt.map(([r, c]) => key(r, c)));
  if (!imHaupt.has(key(...einfachSpiegel(...haupt[0])))) return null;
  for (const g of gebiete.slice(1)) for (const [r, c] of g) setze(r, c, 'M');
  // Gebirge: Kämme – „geknicktes" Rauschen ist entlang einer Höhenlinie am höchsten (wie im Marathon)
  const berg = sym((r, c) => (1 - Math.abs(2 * kamm(r, c) - 1)) + 0.3 * H(r, c));
  const land = alle.filter(([r, c]) => T_(r, c) === 'G');
  const bw = land.map(([r, c]) => berg(r, c)).sort((a, b) => b - a);
  const bergMin = bw[Math.max(0, Math.round(EINFACH_BERG * N) - 1)];
  for (const [r, c] of land) if (berg(r, c) >= bergMin) setze(r, c, 'B');
  return { t, R, C };
}
const einfachRows = g => Array.from({ length: g.R }, (_, r) => g.t.slice(r * g.C, (r + 1) * g.C).join(''));

/* Die beiden Hauptstädte: ein Feld und sein Spiegelbild, EINFACH_ABSTAND auseinander, nicht am
   Rand, auf Grasland, mit genug Ertrag im ersten Zug (marathonStartYield mit 1 Bevölkerung) und
   Land ringsum. Bevorzugt ein gemischter Start – Nahrung, dazu Wissenschaft und Münzen aus Gebirge
   oder Meer (etwa 2/4/2 oder 3/3/3 statt 1/5/1 mitten im Grasland). Unter den erlaubten eines der
   besten. */
function einfachHauptstaedte(rows, rnd) {
  const R = rows.length, C = rows[0].length;
  const land = (r, c) => r >= 0 && r < R && c >= 0 && c < C && rows[r][c] !== 'M';
  const kand = [];
  for (let r = 1; r < R - 1; r++) for (let c = 2; c < C - 2; c++) {
    if (rows[r][c] !== 'G') continue;
    const [sr, sc] = einfachSpiegel(r, c), d = hexDistance(r, c, sr, sc);
    if (d < EINFACH_ABSTAND[0] || d > EINFACH_ABSTAND[1]) continue;
    const y = marathonStartYield(rows, r, c, 1);
    if (y.food + y.coins / 2 < EINFACH_START) continue;
    const raum = within(r, c, 3).filter(([x, z]) => land(x, z)).length;
    if (raum < 20) continue;
    kand.push({ r, c, wert: 2 * Math.min(5, y.food + y.coins / 2) + Math.min(3, y.sci) + 0.5 * Math.min(3, y.coins) +
      raum / 8 - Math.abs(d - 11) });
  }
  if (!kand.length) return null;
  const best = Math.max(...kand.map(k => k.wert));
  const gut = kand.filter(k => k.wert >= best - 1);
  const k = gut[Math.floor(rnd() * gut.length)];
  const [sr, sc] = einfachSpiegel(k.r, k.c);
  return [{ r: k.r, c: k.c }, { r: sr, c: sc }];
}

/* Binnenmeere (Wahl des Autors: wenige, kleine, auch einzelne Felder; dafür weniger Randmeer):
   ein Paar aus zwei bis drei Feldern, oft dazu ein Paar einzelner Felder – jeweils gespiegelt.
   Nur im Inneren, nicht neben anderem Meer, mindestens 3 Felder von jeder Hauptstadt, und nur, wenn
   alles Land danach noch zusammenhängt. Zurück kommt die Zahl der Meerfelder, die dazukamen. */
function einfachBinnenmeere(g, caps, rnd) {
  const { t, R, C } = g;
  const T_ = (r, c) => t[r * C + c];
  const inside = (r, c) => r >= 0 && r < R && c >= 0 && c < C;
  const frei = (r, c, see) => r > 0 && c > 0 && r < R - 1 && c < C - 1 && T_(r, c) !== 'M' &&
    caps.every(k => hexDistance(k.r, k.c, r, c) >= 3) &&
    neighbors(r, c).every(([x, y]) => inside(x, y) && (T_(x, y) !== 'M' || see.has(key(x, y))));
  const zusammen = () => {
    const start = caps[0], seen = new Set([key(start.r, start.c)]), st = [[start.r, start.c]];
    while (st.length) {
      const [a, b] = st.pop();
      for (const [x, y] of neighbors(a, b))
        if (inside(x, y) && T_(x, y) !== 'M' && !seen.has(key(x, y))) { seen.add(key(x, y)); st.push([x, y]); }
    }
    return seen.size === t.filter(x => x !== 'M').length;
  };
  const groessen = [2 + Math.floor(rnd() * 2)].concat(rnd() < 0.6 ? [1] : []);
  let dazu = 0;
  for (const n of groessen) {
    for (let versuch = 0; versuch < 30; versuch++) {
      const [r0, c0] = [1 + Math.floor(rnd() * (R - 2)), 1 + Math.floor(rnd() * (C - 2))];
      const see = new Set();
      if (!frei(r0, c0, see)) continue;
      const feld = [[r0, c0]]; see.add(key(r0, c0));
      while (feld.length < n) {
        const rand = feld.flatMap(([a, b]) => neighbors(a, b)).filter(([x, y]) => !see.has(key(x, y)) && frei(x, y, see));
        if (!rand.length) break;
        const [x, y] = rand[Math.floor(rnd() * rand.length)];
        feld.push([x, y]); see.add(key(x, y));
      }
      if (feld.length < n) continue;
      const spiegel = feld.map(([a, b]) => einfachSpiegel(a, b));
      // das Spiegelbild muss für sich stehen: nicht auf und nicht neben dem Original
      if (spiegel.some(([a, b]) => feld.some(([x, y]) => hexDistance(a, b, x, y) <= 1))) continue;
      const alt = feld.concat(spiegel).map(([a, b]) => [a, b, T_(a, b)]);
      if (!spiegel.every(([a, b]) => frei(a, b, new Set(spiegel.map(([x, y]) => key(x, y)))))) continue;
      alt.forEach(([a, b]) => { t[a * C + b] = 'M'; });
      if (zusammen()) { dazu += alt.length; break; }
      alt.forEach(([a, b, x]) => { t[a * C + b] = x; });
    }
  }
  return dazu;
}

/* Die Karte zu einem Startwert. Gelingt keine (Land zerfällt, keine Hauptstadt passt, kein
   Binnenmeer findet Platz), kommt der nächste Startwert dran – selten; test.js zählt es. Die
   Hauptstädte stehen nach Platz (map.capitals[slot]); welcher Platz welche Seite bekommt, lost
   der Startwert. */
function einfachKarte(seed) {
  for (let i = 0; i < 60; i++) {
    const rnd = mapRng((seed + i * 7919) || 1);     // 0 hieße bei mapRng: ungeseedet
    const g = einfachGelaende(rnd, 6);
    if (!g) continue;
    const caps = einfachHauptstaedte(einfachRows(g), rnd);
    if (!caps) continue;
    if (!einfachBinnenmeere(g, caps, rnd)) continue;
    // kein weiter Umweg zwischen den Hauptstädten: über Land höchstens 3 Schritte mehr als die Luftlinie
    const rows = einfachRows(g), [a, b] = caps;
    const weg = pathSteps(a.r, a.c, b.r, b.c, (r, c) => rows[r] && rows[r][c] && rows[r][c] !== 'M');
    if (weg == null || weg > hexDistance(a.r, a.c, b.r, b.c) + 3) continue;
    if (rnd() < 0.5) caps.reverse();
    return { name: T('Zufallskarte (%s × %s)', EINFACH_ROWS, EINFACH_COLS), rows, capitals: caps, tries: i + 1 };
  }
  throw new Error('Keine Karte für das vereinfachte Spiel gefunden');
}

/* Der Aufbau einer Partie: du gegen die KI (`stufe`, ab Werk leicht), zwei verschiedene der vier
   Grundreiche ausgelost – nur Name und Farbe, ohne Fähigkeit (drafted: [], wie abilitiesOf es
   liest) –, Startspieler ausgelost, ohne Ereignisse und Weltwunder. Das Rezept trägt die Stufe für
   „Nochmal spielen" (nach einem Sieg eine schwerer, rematch in js/ui/end.js). */
function einfachCfg(seed, stufe) {
  const rnd = mapRng(seed + 31);
  const civs = CIV_KEYS.slice();
  for (let i = civs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [civs[i], civs[j]] = [civs[j], civs[i]]; }
  const lvl = KI_LEVELS.some(l => l.k === stufe) ? stufe : 'leicht';
  return {
    seed, einfach: true, duel: true, seatOrder: true, map: einfachKarte(seed),
    startPlayer: Math.floor(rnd() * 2),
    players: [
      { civ: civs[0], kind: 'human', drafted: [] },
      { civ: civs[1], kind: 'ki', kiLevel: lvl, drafted: [] },
    ],
    recipe: { mode: 'einfach', players: [{ civ: 'zufall', kind: 'human' }, { civ: 'zufall', kind: 'ki', kiLevel: lvl }] },
  };
}

/* Spieltipps, die im vereinfachten Spiel passen (Stellen in TIPS): keiner, der eine Zivilisation
   oder eine ihrer Fähigkeiten nennt, eine Technologie, die es dort nicht gibt, Straßen, Weltwunder,
   Ereignisse oder den Wirtschaftssieg. Geprüft am deutschen Wortlaut (DATA_DE nach einem
   Sprachwechsel, sonst die Listen selbst); die englischen Tipps stehen an denselben Stellen. Ein
   Name zählt nur am Wortanfang („Rad" nicht in „gerade"). */
function einfachTipps() {
  const de = typeof DATA_DE !== 'undefined' && DATA_DE ? DATA_DE : null;
  const tipps = de ? de.tips : TIPS;
  const namen = TECHS.filter(t => !EINFACH_TECHS.has(t.k)).map(t => de ? de.tech[t.k][0] : t.n)
    .concat(ALL_CIVS.map(c => de ? de.civ[c.k] : c.n))
    .concat(ALL_CIVS.flatMap(c => c.abilities.map(a => de ? de.abil[c.k][a.k][0] : a.n)));
  const woerter = ['Wirtschaftssieg', 'Straße', 'Wunder', 'Ereignis'];
  const buchstabe = /[A-Za-zÄÖÜäöüß]/;
  const nennt = (text, name) => {
    for (let i = text.indexOf(name); i >= 0; i = text.indexOf(name, i + 1))
      if (i === 0 || !buchstabe.test(text[i - 1])) return true;
    return false;
  };
  return tipps.map((_, i) => i).filter(i => !namen.some(n => nennt(tipps[i], n)) && !woerter.some(w => tipps[i].includes(w)));
}
