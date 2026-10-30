/* Hochzeivilization – Erstes Spiel (v92, umgebaut in v93 – Wünsche des Autors).

   Das zweite, neue Tutorial: eine ganze Partie bis zum Sieg, 1 gegen 1 auf einer kleinen
   Karte – Griechenland (du) gegen England. Statt langer Texte nennt jeder Schritt ein ZIEL
   („Gründe eine Stadt dort, wo sie dir am meisten Nahrung bringt"); wie man es erreicht,
   findet man selbst heraus. Wer festhängt, holt sich mit „💡 Tipp anzeigen" den Weg – dann
   sind auch Feld und Knopf golden markiert. Nach jedem erreichten Ziel steht oben ein Satz,
   warum es wichtig war.

   Auf Schienen, aber ohne gesperrte Knöpfe: Alles bleibt antippbar. Was den Verlauf
   verlassen würde, lehnt fgVeto ab und sagt, warum (Toast). Abgelehnt wird nur, was die
   Partie wirklich verbiegen würde – eine Stadt am falschen Platz, eine Armee, die nicht
   mehr zurückkommt, ein Sieg auf einem anderen Weg als dem gewählten.

   Ablauf (seit v93): Vor der Partie eine Seite – eine einzige Stadt in der Steinzeit, eine
   Zivilisation, die die Zeiten überdauert, mehrere Wege zum Sieg – und gleich die Wahl:
   Militär, Wirtschaft oder Forschung (fgSeite). Runde 1–4 lehren allen dasselbe (gründen,
   wachsen, forschen, der Würfel im Technologiebogen, Handelsroute, belagert werden,
   verteidigen, flankieren, alles ausgeben), aber vom Weg geführt: Lage, Tipps und die
   Technologie, um die es in Runde 3 und 4 geht, hängen am gewählten Weg (fgJe). Danach
   die Schritte des Wegs bis zum Sieg.

   England zieht nach einem festen Drehbuch (fgGegnerZug) und nach den Regeln für Menschen
   (Spielerart 'ki': es bezahlt alles). Welche Technologien es gibt, steht für diese Partie
   fest – in jedem Zeitalter fehlt etwa die Hälfte, wie beim echten Würfeln (fgVerfuegbar);
   die Würfel fallen passend dazu und stehen im Protokoll (fgNextDie).
   Gibt man das Erste Spiel auf, spielt England als gewöhnliche KI (leicht) weiter.

   Zustand: S.fg im Spielstand (Schritt, Weg, Merker) – das Erste Spiel lässt sich also
   fortsetzen wie jede Partie. ui.fg nur für die laufende Sitzung (Zeitgeber). Welche Wege
   schon gewonnen sind, merkt sich das Gerät (FG_KEY) – die Seite hakt sie ab.
   Alle Zahlen in den Texten kommen aus dem laufenden Spielstand.
   test.js spielt alle drei Wege mit den Musterlösungen (loesung) bis zum Sieg, smoke.js
   fährt die Oberfläche. */

const FG_SEED = 92;
const FG_ICH = 0, FG_ER = 1;            // Platz 0: Griechenland (Mensch), Platz 1: England
/* Die Karte (10 × 13). Ausgelegt und nachgerechnet (v92): In Runde 1 bringt genau ein
   bezahlbares Feld +5 Nahrung (5/5), in Runde 2 genau eines +6 Wissenschaft (2/3) – die
   beiden Gründungsrätsel haben also eine eindeutige Lösung. Hauptstädte: Griechenland 5/2,
   England 3/9. */
const FG_ROWS = [
  'MMMMMMMMMMMMM',
  'MWWBGBWWGGBMM',
  'MMWWGGBWWWFBM',
  'MGBWWWBBGGGMM',
  'MMGWWFGGBGBGM',
  'MGGFGGGWGBWMM',
  'MMGFBGFGGWBWM',
  'MBWWWGBGFGGMM',
  'MMBWWGGBWWGGM',
  'MMMMMMMMMMMMM',
];
const fgKarte = () => ({
  name: T('Erstes Spiel'), rows: FG_ROWS.slice(),
  capitals: [{ r: 5, c: 2 }, { r: 3, c: 9 }],
});
const FG_ER_STADT = [6, 8];             // Englands zweite Stadt (Runde 1)
const FG_ER_STELLUNG = [5, 6];          // dort belagert Englands Armee in Runde 2
/* Verfügbar in der Antike – ausgewählt, damit Runde 1 genau zwei kostenlose Technologien
   hat (Mathematik, Taktik) und der Bogen zeigt, dass nicht alles da ist. */
const FG_ANTIKE = {
  [FG_ICH]: ['schrift', 'mathematik', 'rad', 'keramik', 'landwirtschaft', 'taktik', 'belagerung',
    'eisenverarbeitung', 'demokratie'],
  [FG_ER]: ['schrift', 'landwirtschaft', 'belagerung', 'keramik', 'navigation'],
};
/* Ab dem Mittelalter (v93, Anweisung des Autors: „nicht immer alle", fest statt gewürfelt):
   für Griechenland in jedem Feld und Zeitalter etwa die Hälfte – 24 von 46 –, in keinem
   alle. Dabei ist alles, was ein Ziel oder Tipp nennt (Papier, Universitätswesen, Biologie,
   Wissenschaftliche Methode, Theologie), und je Feld ein Weg bis in die Moderne
   (Forschungssieg). Nicht dabei, weil das Erste Spiel es nicht erklärt: Kontrollzone
   (Schießpulver), Kopieren (Kundschafterei, Spionage, Internet), Kolonialismus, Eisenbahn,
   Raketentechnik und Atomwaffen. Englands spätere Zeitalter: jede zweite nach einer festen
   Prüfsumme (fgZahl) – England forscht im Drehbuch nur Belagerungsmaschinen, seine Liste
   bestimmt bloß, was sein Bogen zeigt. */
const FG_SPAETER = [
  'papier', 'universitaet', 'biologie', 'wiss_methode', 'computertechnik', 'ki',        // Forschung
  'muehlentechnik', 'gilden', 'dampfmaschine', 'kunstduenger', 'verbundwerkstoffe', 'robotik',   // Produktion
  'stahl', 'gewehre', 'dynamit', 'panzer', 'luftwaffe',                                  // Militär
  'rittertum', 'buerokratie', 'theologie', 'nationalismus', 'militaergericht', 'massenmedien', 'oekologie', // Spezial
];
const FG_WEGE = ['militaer', 'wirtschaft', 'wissenschaft'];
const FG_KEY = 'hochciv.fg';            // auf dem Gerät: { geschafft: [Wege, die schon gewonnen sind] }
let FG_AUTO_MS = 900;                   // Weiterschalten nach erreichtem Ziel; Tests: 0

/* ------------------------------------------------------------------ Würfel
   d6() fragt tutNextDie(ctx); im Ersten Spiel landet das hier. Gewürfelt wird nur die
   Verfügbarkeit (ctx.tech) und – wenn nichts verfügbar wurde – die eine, die es dann gibt
   (ctx.pick: die erste gewünschte, sonst die erste). Die Augen passen zum Ergebnis: 4–6 für
   verfügbar, 1–3 für nicht (mit Philosophie-Bonus entsprechend weniger), je Technologie
   fest – das Protokoll liest sich wie echtes Würfeln, und der Bogen nennt dieselbe Zahl
   (fgBlassText). Ohne ctx (Bots, Ereignisse – kommen hier nicht vor) bleibt es beim echten
   Wurf. */
function fgZahl(s) {                    // FNV-1a: eine feste, gut gestreute Zahl je Text
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function fgVerfuegbar(pi, k) {
  const t = TECH_BY_KEY[k];
  if (!t) return false;
  if (t.age === 0) return (FG_ANTIKE[pi] || []).includes(k);
  if (pi === FG_ICH) return FG_SPAETER.includes(k);
  return fgZahl(pi + ':' + k) % 2 === 0;
}
function fgWurf(pi, k, bonus) {
  const h = fgZahl('wurf:' + pi + ':' + k);
  return fgVerfuegbar(pi, k) ? 4 + h % 3 : 1 + h % Math.max(1, 3 - (bonus || 0));
}
function fgNextDie(ctx) {
  if (!ctx || ctx.pi == null) return null;
  if (ctx.tech) return fgWurf(ctx.pi, ctx.tech, ctx.bonus);
  if (ctx.pick) {
    const i = ctx.pick.findIndex(k => fgVerfuegbar(ctx.pi, k));
    return i >= 0 ? i + 1 : 1;
  }
  return null;
}

/* ------------------------------------------------------------------ Kürzel */
const fgAn = () => !!(typeof ui !== 'undefined' && ui && ui.fg && S && S.fg);
const fgP = () => S.players[FG_ICH];
const fgCap = () => capitalOf(S, FG_ICH);
const fgErCap = () => capitalOf(S, FG_ER);
const fgNah = (a, r, c) => hexDistance(a.r, a.c, r, c) === 1;
const fgPlain = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
// Die erste neue Stadt Griechenlands – um sie geht es in Runde 2 bis 4
function fgStadt2() {
  return citiesOf(S, FG_ICH).filter(c => !c.cap).sort((a, b) => a.id - b.id)[0] || null;
}
// Englands Armee, die eine griechische Stadt bedroht (Runde 2–4)
function fgErArmee() {
  return armiesOf(S, FG_ER).find(a => citiesOf(S, FG_ICH).some(c => fgNah(c, a.r, a.c))) || null;
}
// Was übrig ist, als Text: „3 🔬 · 1 🪙" – oder „nichts"
function fgRest() {
  const R = fgP().res;
  const teile = [[R.sci, '🔬'], [R.food, '🌾'], [R.coins, '🪙']].filter(x => x[0] > 0).map(x => x[0] + ' ' + x[1]);
  return teile.length ? teile.join(' · ') : T('nichts');
}
const fgHaken = ok => ok ? ' <span class="fg-ja">✓</span>' : ' <span class="fg-nein">✗</span>';
// Schwelle für den Wirtschaftssieg als Bruch (Text) – mit oder ohne eine gedachte Technologie
function fgSchwelle(extra) {
  const p = fgP();
  if (!extra || p.techs[extra]) return victoryOption(S, p);
  p.techs[extra] = true;
  try { return victoryOption(S, p); } finally { delete p.techs[extra]; }
}
/* Felder neben (r, c), die eine Armee aus dieser Stadt in diesem Zug erreicht – gerechnet
   mit einer gedachten Armee voller Bewegung, so wie buildArmy sie hinstellt. */
function fgErreichtNeben(city, r, c) {
  const tmp = { owner: FG_ICH, r: city.r, c: city.c, mp: moveAllowance(S, FG_ICH) };
  const reach = armyReach(S, tmp);
  return neighbors(r, c).filter(([rr, cc]) => reach.has(key(rr, cc)));
}
// Steht das Feld neben einer Stadt Englands? Dort würde eine Armee mitkämpfen.
const fgNebenEngland = (r, c) => citiesOf(S, FG_ER).some(ct => fgNah(ct, r, c));

/* Der beste bezahlbare Platz für eine neue Stadt – nach Nahrung oder Wissenschaft, die er
   dem Reich bringt (settleGain, wie im Gründungsblatt). Bei Gleichstand gelten alle. */
function fgBestePlaetze(art) {
  let best = -Infinity, list = [];
  withFoundTable(S, FG_ICH, () => {
    const vor = income(S, FG_ICH);
    for (let r = 0; r < S.map.rows.length; r++) for (let c = 0; c < S.map.rows[r].length; c++) {
      if (canFound(S, FG_ICH, r, c)) continue;
      const g = settleGain(S, FG_ICH, r, c, vor)[art];
      if (g > best) { best = g; list = [[r, c]]; } else if (g === best) list.push([r, c]);
    }
  });
  return { best, list };
}
// Felder auf dem kürzesten Weg zwischen Hauptstadt und zweiter Stadt – dort gehört die Straße hin
function fgWegFelder() {
  const a = fgCap(), b = fgStadt2();
  if (!a || !b) return [];
  const d = hexDistance(a.r, a.c, b.r, b.c), out = [];
  for (let r = 0; r < S.map.rows.length; r++) for (let c = 0; c < S.map.rows[r].length; c++) {
    if (!isLand(S, r, c) || cityAt(S, r, c)) continue;
    if (hexDistance(a.r, a.c, r, c) + hexDistance(r, c, b.r, b.c) === d) out.push([r, c]);
  }
  return out;
}
// Belagerungsstand Griechenlands gegen Englands Hauptstadt
function fgKampfHaupt() {
  const cap = fgErCap();
  if (!cap) return null;
  const n = attackersOn(S, FG_ICH, cap).length;
  return { cap, n, a: attackValue(S, FG_ICH, n), d: defenseValue(S, cap), zug: S.sieges[FG_ICH + '|' + cap.id] || 0 };
}
// Englands Angriff auf die bedrohte Stadt, so wie er jetzt stünde
function fgKampfStadt2() {
  const city = fgStadt2();
  if (!city) return null;
  const n = attackersOn(S, FG_ER, city).length;
  return { city, n, a: attackValue(S, FG_ER, n), d: defenseValue(S, city) };
}
const fgModerneFelder = () => FIELDS.map((_, f) => TECHS.some(t => t.f === f && t.age === 3 && fgP().techs[t.k]));
/* Der gewählte Weg führt durch den gemeinsamen Teil: fgJe(Militär, Wirtschaft, Forschung)
   gibt zurück, was zum Weg gehört. Ohne Weg (Spielstand von v92 vor der Wahl) wie Militär. */
const fgJe = (m, w, s) => (S && S.fg && S.fg.pfad === 'wirtschaft' ? w : S && S.fg && S.fg.pfad === 'wissenschaft' ? s : m);
/* Ist das Zeitalter `a` im Feld `f` für Spieler p schon ausgewürfelt? Die Antike zu
   Spielbeginn, jedes weitere mit der ersten Technologie des Zeitalters davor (applyTech). */
const fgOffen = (p, f, a) => a === 0 || techPool(S).some(t => t.f === f && t.age === a - 1 && p.techs[t.k]);
// Technologien Griechenlands, die ausgewürfelt und durchgefallen sind (je Zeitalter)
const fgDurchgefallen = a => techPool(S).filter(t => t.age === a && fgOffen(fgP(), t.f, a) && !fgP().avail[t.k] && !fgP().techs[t.k]);
// Die Felder, in denen das Zeitalter `a` schon offen ist (für die Texte)
const fgOffeneFelder = a => FIELDS.map((_, f) => f).filter(f => a > 0 && fgOffen(fgP(), f, a));
/* Die Technologie, um die es in Runde 3 und 4 geht – je Weg die, die ihn voranbringt:
   Militär Belagerungsmaschinen, dann Eisenverarbeitung (Macht billiger); Wirtschaft Keramik
   (zweimal wachsen), dann Demokratie (öffnet das Mittelalter in Spezial – die Theologie);
   Forschung Schrift, dann Papier (öffnet die Industrialisierung in der Forschung). */
const fgRestTech = runde => runde === 3 ? fgJe('belagerung', 'keramik', 'schrift') : fgJe('eisenverarbeitung', 'demokratie', 'papier');
const fgKann = k => !has(fgP(), k) && !!fgP().avail[k] && available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, TECH_BY_KEY[k]);

/* ------------------------------------------------------------------ England
   Das Drehbuch. Runde 1: zweite Stadt, Hauptstadt wächst. Runde 2: Belagerungsmaschinen,
   eine Armee neben Griechenlands neue Stadt – sie greift am Zugende an und gewinnt (sonst
   kauft England Macht nach, bis es reicht). Runde 3: beide Städte wachsen, die Armee greift
   wieder an. Ab Runde 4: England verteidigt – eine Armee neben der Hauptstadt (auf der von
   Griechenland abgewandten Seite), der Rest in Macht. Ab Runde 5 wachsen seine Städte
   wieder, bevor es Macht kauft: Wer auf die Mehrheit spielt, muss England überwachsen
   (sonst wäre der Wirtschaftssieg schon mit dem gemeinsamen Teil fast geschafft).
   Englands Angriff wird gemerkt (S.fg.angriff) – die Texte nennen ihn. */
function fgGegnerZug(S2) {
  const E = FG_ER, cap = capitalOf(S2, E);
  if (!cap) return;
  const runde = S2.round;
  if (runde === 1) {
    const [r, c] = FG_ER_STADT;
    if (!canFound(S2, E, r, c)) foundCity(S2, E, r, c);
    growCity(S2, E, cap, 'paid');
    return;
  }
  if (runde === 2) {
    if (!has(S2.players[E], 'belagerung')) doResearch(S2, E, 'belagerung');
    const ziel = citiesOf(S2, FG_ICH).filter(c => !c.cap).sort((a, b) => a.id - b.id)[0];
    if (!ziel) return;
    const von = citiesOf(S2, E).sort((a, b) => hexDistance(a.r, a.c, ziel.r, ziel.c) - hexDistance(b.r, b.c, ziel.r, ziel.c))[0];
    if (buildArmy(S2, E, von)) return;
    const armee = armyAt(S2, von.r, von.c);
    const reach = armyReach(S2, armee);
    const felder = [FG_ER_STELLUNG].concat(neighbors(ziel.r, ziel.c))
      .filter(([r, c]) => hexDistance(r, c, ziel.r, ziel.c) === 1 && reach.has(key(r, c)));
    if (felder.length) moveArmy(S2, armee, felder[0][0], felder[0][1]);
    else {                              // kein Feld neben der Stadt – dann so nah wie möglich
      const nah = [...reach.keys()].map(unkey).sort((a, b) =>
        hexDistance(a[0], a[1], ziel.r, ziel.c) - hexDistance(b[0], b[1], ziel.r, ziel.c))[0];
      if (nah) moveArmy(S2, armee, nah[0], nah[1]);
    }
    // Der erste Angriff soll durchkommen – so beginnt die Belagerung, um die es geht
    let guard = 0;
    while (guard++ < 6 && attackersOn(S2, E, ziel).length &&
      attackValue(S2, E, attackersOn(S2, E, ziel).length) <= defenseValue(S2, ziel) && !buyPower(S2, E, 1)) { /* nachkaufen */ }
    fgMerkeAngriff(S2, ziel);
    return;
  }
  if (runde === 3) {
    citiesOf(S2, E).forEach(c => growCity(S2, E, c, 'paid'));
    const ziel = citiesOf(S2, FG_ICH).filter(c => !c.cap).sort((a, b) => a.id - b.id)[0];
    if (ziel) fgMerkeAngriff(S2, ziel);
    return;
  }
  // ab Runde 4: verteidigen – und ab Runde 5 auch wieder wachsen (nach der Armee, vor der Macht)
  if (!armiesOf(S2, E).length) {
    const gegner = citiesOf(S2, FG_ICH).concat(armiesOf(S2, FG_ICH));
    const nahe = (r, c) => Math.min(...gegner.map(g => hexDistance(g.r, g.c, r, c)));
    const felder = neighbors(cap.r, cap.c).filter(([r, c]) => canStop(S2, E, r, c))
      .sort((a, b) => nahe(b[0], b[1]) - nahe(a[0], a[1]) || a[0] - b[0] || a[1] - b[1]);
    if (felder.length && available(S2, E, 'coins', payOpts(S2, E)) >= armyCost(S2, E) && !buildArmy(S2, E, cap)) {
      const armee = armyAt(S2, cap.r, cap.c);
      const reach = armyReach(S2, armee);
      const z = felder.find(([r, c]) => reach.has(key(r, c)));
      if (z) moveArmy(S2, armee, z[0], z[1]);
    }
  }
  if (runde >= 5) growAllOrder(S2, E).forEach(c => growCity(S2, E, c, 'paid'));
  const n = Math.floor(available(S2, E, 'coins', payOpts(S2, E)) / powerPrice(S2, E));
  if (n > 0) buyPower(S2, E, n);
}
function fgMerkeAngriff(S2, ziel) {
  if (!S2.fg) return;
  const n = attackersOn(S2, FG_ER, ziel).length;
  S2.fg.angriff = { runde: S2.round, a: attackValue(S2, FG_ER, n), d: defenseValue(S2, ziel), n };
}

/* ------------------------------------------------------------------ Schienen
   Jede Aktion der Oberfläche kommt als Objekt hierher, bevor sie geschieht:
   { art: 'forschen', k } · { art: 'gruenden', r, c } · { art: 'wachsen', city | alle, mode }
   · { art: 'armee', city } · { art: 'waehlen', army } (Armee zum Ziehen auswählen)
   · { art: 'ziehen', army, r, c } · { art: 'macht', n } · { art: 'strasse', r, c }
   · 'opfern', 'kopieren', 'feld', 'atom', 'gratis', 'wunder'. Das Zugende fragt
   fgZugendeRegel. Ein Schritt erlaubt mit `erlaubt` die Arten, die zu seinem Ziel gehören
   ('*' = alle), und prüft mit `darf` die Einzelheiten. Alles andere: „Eins nach dem
   anderen". */
function fgEinsNach(st) {
  return T('Eins nach dem anderen – jetzt: %s', fgPlain(st.ziel ? st.ziel() : T(st.t)));
}
/* Kein Wirtschaftssieg auf einem anderen Weg als dem gewählten. Gerechnet mit dem jetzigen
   Stand Englands: seine Bevölkerung sinkt bis zum Rundenende nicht – es wächst nur, und
   Griechenland nimmt ihm keine Stadt (friedliche Wege: Armeen stehen still; Militärweg: nur
   die Hauptstadt, und die beendet das Spiel sofort – fgNurHauptstadt). Wer auf Wirtschaft
   spielt, darf die Schwelle jederzeit reißen – das ist sein Sieg (vor dem Ende von Runde 4
   reicht es dafür nicht, test.js prüft das auch mit zufälligem Spiel). */
function fgSchwellenVeto(a) {
  if (S.fg.pfad === 'wirtschaft') return null;
  let plus = 0, extra = null;
  if (a.art === 'wachsen') plus = a.alle ? growAllPlan(S, FG_ICH, a.mode || 'paid').done : 1;
  else if (a.art === 'gruenden') plus = 1;
  else if ((a.art === 'forschen' || a.art === 'gratis') && (a.k === 'theologie' || a.k === 'un')) extra = a.k;
  else return null;
  const o = fgSchwelle(extra);
  const mine = popOf(S, FG_ICH) + plus, welt = worldPop(S) + plus;
  if (!(welt > 0 && mine > welt * o.frac)) return null;
  return T('Damit hättest du mehr als %s der Weltbevölkerung – das wäre ein Wirtschaftssieg. Diesmal gewinnst du anders.', o.label);
}
// Die Prüfung selbst, ohne Nebenwirkung
function fgVetoRoh(a) {
  const st = fgSchritt();
  if (!st) return null;
  const w = fgSchwellenVeto(a);
  if (w) return w;
  const liste = st.erlaubt || [];
  const frei = liste === '*' || liste.includes(a.art) || (a.art === 'waehlen' && liste.includes('ziehen'));
  if (!frei) return fgEinsNach(st);
  return st.darf ? st.darf(a) : null;
}
/* Was die Oberfläche fragt. Ist das Ziel des Schritts schon erreicht und das Weiterschalten
   nur noch nicht gelaufen, gehört die Aktion bereits zum nächsten Schritt. */
function fgVeto(a) {
  if (!fgAn() || S.over || S.cur !== FG_ICH) return null;
  if (!S.fg.pfad) return T('Wähle deinen Weg zum Sieg.');     // Spielstand von v92 ohne Weg
  fgNachholen();
  return fgVetoRoh(a);
}
/* Zugende: null = in Ordnung, Text = abgelehnt, { frage } = erst nach zweitem Tippen. */
function fgZugendeRegel() {
  if (S.fg && !S.fg.pfad) return T('Wähle deinen Weg zum Sieg.');
  const st = fgSchritt();
  if (!st) return null;
  if (st.zugende) return st.zugende();
  if (st.zug) return null;
  return fgEinsNach(st);
}
// Was noch ginge: forschen (bezahlbar, nicht abgelehnt) und wachsen
function fgNochWas() {
  const was = [];
  const sci = available(S, FG_ICH, 'sci');
  if (researchable(S, FG_ICH).some(t => sci >= techCost(S, FG_ICH, t) && !fgVetoRoh({ art: 'forschen', k: t.k })))
    was.push('forschen');
  if (citiesOf(S, FG_ICH).some(c => !canGrowPaid(S, FG_ICH, c) && !fgVetoRoh({ art: 'wachsen', city: c, mode: 'paid' })))
    was.push('wachsen');
  return was;
}
const fgNochWasText = was => was.map(w => w === 'forschen' ? T('forschen') : T('wachsen')).join(T(' und '));
// Am Ende eines eigenen Zugs: nichts liegen lassen – sonst einmal nachfragen
function fgRestFrage() {
  const was = fgNochWas();
  return was.length ? { frage: T('Du könntest noch %s.', fgNochWasText(was)) } : null;
}
/* Die Singularität gehört dem Forschungsweg – auf den anderen Wegen wäre sie ein Sieg auf
   fremdem Weg (wer lange braucht, kommt im Lauf der Runden an sie heran). */
function fgKeineSingularitaet(a) {
  return (a.art === 'forschen' || a.art === 'gratis') && a.k === 'singularitaet'
    ? T('Die Singularität wartet – diesmal gewinnst du anders.') : null;
}
/* Armeen bleiben auf den friedlichen Wegen stehen. Raketentechnik gäbe den stehenden Armeen
   einen zweiten Ring – stünde dann eine vor einer Stadt Englands, griffe sie von selbst an.
   Für die Moderne im Militär bleiben Panzer, Luftwaffe und Atomwaffen. */
function fgFriedlich(a) {
  if (a.art === 'armee' || a.art === 'waehlen' || a.art === 'ziehen')
    return T('Diesmal gewinnst du friedlich – deine Armeen bleiben, wo sie sind.');
  if (fgRaketenNah(false)(a)) return T('Mit Raketentechnik griffen deine Armeen Englands Städte an – diesmal gewinnst du friedlich.');
  return fgKeineSingularitaet(a);
}
// Auf dem Forschungsweg: Armeen bleiben stehen, die Singularität ist das Ziel
const fgFriedlichForschen = a => (a.k === 'singularitaet' ? null : fgFriedlich(a));
/* Englands Städte, die eine griechische Armee auf (r, c) angriffe – bei Reichweite `rng`
   (1, mit Raketentechnik 2). `ohneHaupt`: nur die übrigen, nicht die Hauptstadt. */
const fgInReichweite = (r, c, rng, ohneHaupt) => citiesOf(S, FG_ER)
  .filter(ct => !(ohneHaupt && ct.cap) && hexDistance(ct.r, ct.c, r, c) <= rng);
// Raketentechnik verlängert die Reichweite – stünde dann eine Armee vor einer Stadt Englands?
const fgRaketenNah = ohneHaupt => (a) => (a.art === 'forschen' || a.art === 'gratis') && a.k === 'raketentechnik' &&
  armiesOf(S, FG_ICH).some(x => fgInReichweite(x.r, x.c, 2, ohneHaupt).length);
/* Militärweg: Ziel ist die Hauptstadt. Fiele Englands andere Stadt zuerst, hätte Griechenland
   am Rundenende leicht mehr als 3/4 der Weltbevölkerung – ein Wirtschaftssieg, bevor die
   Hauptstadt fällt. Gesperrt ist deshalb jedes Feld, von dem aus eine Armee die andere
   Stadt angriffe (auch mit Raketentechnik). Englands Städte liegen 3 Felder auseinander:
   neben der Hauptstadt bleiben genug Felder frei. */
function fgNurHauptstadt(a) {
  const nein = T('Diesmal geht es um Englands Hauptstadt – seine andere Stadt lässt du in Ruhe.');
  if (a.art === 'ziehen' && fgInReichweite(a.r, a.c, attackRange(S, FG_ICH), true).length) return nein;
  if (fgRaketenNah(true)(a)) return T('Mit Raketentechnik griffe eine deiner Armeen Englands andere Stadt an – zieh sie erst weg.');
  return fgKeineSingularitaet(a);
}
const fgZugVorbei = runde => (S.round > runde || (S.round === runde && S.cur !== FG_ICH));
const fgWiederDran = runde => S.round >= runde && S.cur === FG_ICH && !(typeof ui !== 'undefined' && ui && (ui.botLock || ui.anim));
/* Werden Englands Züge auf der Karte nachgespielt (v94, js/anim.js) oder – Animationen „Keine" –
   als Blatt mit „Weiter" gezeigt? Danach richten sich die Sätze dazu. Ohne Oberfläche (test.js):
   wie das Blatt. */
const fgAnimAn = () => typeof animAn === 'function' && animAn();
// Ein Ziel-Weg ist geschafft, sobald das Spiel vorbei ist (Sieg)
const fgSieg = () => !!S.over;

/* ------------------------------------------------------------------ Die Schritte
   t: Titel (deutscher Schlüssel) · info: Lage · ziel: das Ziel, ein Satz · stand: was gerade
   erreicht ist · tipp: der Weg (auf Wunsch) · hl: Felder, die der Tipp golden umrandet ·
   zeige: Felder, die immer umrandet sind · leiste/knopf/techs: Knöpfe, die der Tipp
   hervorhebt · fertig · gut: Rückmeldung, steht im nächsten Schritt oben · erlaubt/darf:
   Schienen · zug/zugende: darf der Zug enden · pfad: nur auf diesem Weg · lassen: beim
   Weiterschalten offene Blätter stehen lassen · sofort: ohne Pause weiter (das Ergebnis ist
   schon der neue Zug) · enter: einmal beim Betreten ·
   naechster/zurueck: Sprünge · loesung: Musterlösung (test.js, smoke.js). */
const FG_STEPS = [
  /* ---------------------------------------------------------------- Runde 1 */
  {
    id: 'hauptstadt', runde: 1, t: 'Dein Reich', lassen: true,
    info: () => T('Du spielst <b>Griechenland</b> (blau) gegen <b>England</b> (rot), ihr zieht abwechselnd, du fängst an.') + ' ' + fgWegSatz(),
    ziel: () => T('Tippe deine Hauptstadt an.'),
    tipp: () => T('Sie ist jetzt golden umrandet: der blaue Kreis links. Die Zahl darin ist ihre Bevölkerung.'),
    hl: () => [[fgCap().r, fgCap().c]],
    fertig: () => !!S.fg.flags.hauptstadt,
    gut: () => T('Eine Stadt erntet die <b>sechs Felder um sich herum</b> – das Feld unter ihr bringt nichts. Was du hast, steht oben: 🔬 Wissenschaft, 🌾 Nahrung, 🪙 Münzen und ⚔︎ Macht.'),
    loesung: () => fgSieht('stadt', fgCap()),
  },
  {
    id: 'faehigkeit', runde: 1, t: 'Was Griechenland kann', lassen: true,
    info: () => T('Jedes Reich hat eine eigene Fähigkeit.'),
    ziel: () => T('Finde heraus, was Griechenland besonders gut kann.'),
    tipp: () => T('Unten in der Leiste: <b>Fähigkeiten</b>.'),
    leiste: ['#a-abil'],
    fertig: () => !!S.fg.flags.faehigkeiten,
    // die Zahlen aus GREEK_DISCOUNT (seit v97 1/1/2/2/5)
    gut: () => T('Griechenland forscht günstiger: Jede Technologie kostet %s weniger in der Antike, %s im Mittelalter, %s in der Industrialisierung und %s in der Moderne (die Singularität %s).', ...GREEK_DISCOUNT),
    loesung: () => fgSieht('faehigkeiten'),
  },
  {
    id: 'gratis', runde: 1, t: 'Kostenlos forschen',
    info: () => T('Technologien kosten 🔬 Wissenschaft und wirken für den Rest des Spiels.'),
    ziel: () => T('Erforsche alle Technologien, die dich nichts kosten.'),
    stand: () => { const n = fgGratis().length; return n ? T('Noch %s übrig.', n) : T('Alle erforscht.'); },
    tipp: () => T('Unten auf <b>Forschen</b>. Oben rechts in jeder Kachel steht ihr Preis – such die Nullen.'),
    leiste: ['#a-tech'], techs: () => fgGratis().map(t => t.k),
    fertig: () => !fgGratis().length,
    erlaubt: ['forschen'],
    darf: a => {
      const t = TECH_BY_KEY[a.k];
      const c = t ? techCost(S, FG_ICH, t) : 0;
      return c > 0 ? T('Diese kostet %s 🔬 – gesucht sind die kostenlosen.', c) : null;
    },
    gut: () => T('Technologien wirken sofort und für immer: Mathematik bringt dir ab jetzt +1 🔬 je Wald. Und beide haben etwas geöffnet …'),
    loesung: () => fgGratis().forEach(t => fgTu({ art: 'forschen', k: t.k }, () => doResearch(S, FG_ICH, t.k))),
  },
  {
    /* Der Würfel im Technologiebogen (v93, Wunsch des Autors: „die 50 % erklären"). Mathematik
       und Taktik haben eben das Mittelalter in Forschung und Militär geöffnet – dabei wurde
       gewürfelt. Gesucht ist eine Kachel, die durchgefallen ist: Im Ersten Spiel lassen sich
       blasse Kacheln antippen und sagen, warum sie blass sind (fgBlass). */
    id: 'wuerfel', runde: 1, t: 'Ausgewürfelt',
    info: () => {
      const f = fgOffeneFelder(1).map(i => FIELDS[i]);
      return f.length ? T('Ein Zeitalter öffnet sich mit deiner ersten Technologie des Zeitalters davor im selben Feld – eben das <b>Mittelalter</b> in %s. Dabei wurde gewürfelt.', f.join(T(' und ')))
        : T('Ein Zeitalter öffnet sich mit deiner ersten Technologie des Zeitalters davor im selben Feld. Dabei wird gewürfelt.');
    },
    ziel: () => T('Finde eine Technologie, die es in dieser Partie nicht gibt.'),
    stand: () => {
      const teile = fgOffeneFelder(1).map(f => {
        const liste = techsIn(f, 1, S);
        return T('%s: %s von %s', FIELDS[f], liste.filter(t => fgP().avail[t.k] || fgP().techs[t.k]).length, liste.length);
      });
      return teile.length ? T('Im %s verfügbar – %s', AGES[1], teile.join(' · ')) : '';
    },
    tipp: () => T('<b>Forschen</b> öffnet den Bogen. Tippe im Mittelalter eine blasse Kachel an – in Forschung oder Militär. Blass heißt: gibt es nicht, oder noch nicht.'),
    leiste: ['#a-tech'], techs: () => fgDurchgefallen(1).map(t => t.k),
    fertig: () => !!S.fg.flags.blass,
    erlaubt: [],
    gut: () => {
      const t = TECH_BY_KEY[S.fg.flags.blass];
      return (t ? T('%s ist durchgefallen: Der Würfel zeigte %s.', t.n, fgWurf(FG_ICH, t.k)) + ' ' : '') +
        T('Für jede Technologie eines neuen Zeitalters fällt ein Würfel: Bei <b>4, 5 oder 6</b> gibt es sie in dieser Partie – eine Chance von <b>50 %</b>. Fällt in einem Feld keine, wird eine ausgelost. So fehlt in jedem Zeitalter ungefähr die Hälfte – plane mit dem, was du bekommst. Alle Würfe stehen im Protokoll.');
    },
    loesung: () => { const t = fgDurchgefallen(1)[0] || fgDurchgefallen(0)[0]; fgSieht('blass', t.k); },
  },
  {
    id: 'gruenden1', runde: 1, t: 'Eine zweite Stadt',
    info: () => T('Mehr Städte heißt mehr Felder – Ausbreitung ist der Kern des Spiels.') + ' ' +
      fgJe(T('Nahrung lässt Städte wachsen – und Bevölkerung verteidigt sie.'),
        T('Nahrung lässt Städte wachsen – und auf Bevölkerung kommt es dir an.'),
        T('Nahrung lässt Städte wachsen – und jede Bevölkerung forscht mit: +1 🔬.')),
    ziel: () => T('Gründe eine Stadt dort, wo sie dir am meisten 🌾 Nahrung bringt.'),
    tipp: () => T('Tippe unten auf <b>Stadt gründen</b>: Jedes mögliche Feld zeigt dann seinen Preis. Tippst du ein Feld an, steht im Blatt sein Ertrag beim Siedeln. Gesucht ist das golden umrandete Feld.'),
    hl: () => fgBestePlaetze('food').list, leiste: ['#a-found'], knopf: () => ['Hier gründen'],
    fertig: () => citiesOf(S, FG_ICH).length >= 2,
    erlaubt: ['gruenden'],
    darf: a => fgPlatzVeto(a, 'food'),
    gut: () => T('Eine Stadt kostet 🌾: die zweite <b>1</b>, die dritte 3, die vierte 6 … – plus <b>1 je Feld</b> Weg von der Hauptstadt.'),
    loesung: () => { const [r, c] = fgBestePlaetze('food').list[0]; fgTu({ art: 'gruenden', r, c }, () => foundCity(S, FG_ICH, r, c)); },
  },
  {
    id: 'wachsen1', runde: 1, t: 'Wachsen',
    info: () => T('Was am Zugende übrig ist, verfällt – nur ⚔︎ Macht bleibt.'),
    ziel: () => T('Lass deine Hauptstadt wachsen.'),
    tipp: () => T('Hauptstadt antippen → <b>Bevölkerung wachsen</b>.'),
    hl: () => [[fgCap().r, fgCap().c]], knopf: () => ['Bevölkerung wachsen'],
    fertig: () => fgCap().pop >= 2,
    erlaubt: ['wachsen'],
    darf: a => a.alle || (a.city && a.city.cap) ? null : T('Diesmal die Hauptstadt – neue Städte wachsen erst ab der nächsten Runde.'),
    gut: () => T('Wachsen kostet je vorhandener Bevölkerung 1 🌾 und 1 🪙. Fehlt Nahrung oder Wissenschaft, springen Münzen ein: <b>2 🪙 für 1</b>.'),
    loesung: () => fgTu({ art: 'wachsen', city: fgCap(), mode: 'paid' }, () => growCity(S, FG_ICH, fgCap(), 'paid')),
  },
  {
    id: 'zug1', runde: 1, t: 'Zug beenden', zug: true, sofort: true,
    info: () => fgAnimAn() ? T('Dann ist England dran – auf der Karte siehst du, was es tut. Alles steht auch im Protokoll.')
      : T('Dann ist England dran. Ein Blatt zeigt, was es getan hat – mit <b>Weiter</b> kommst du zurück.'),
    ziel: () => T('Beende deinen Zug.'),
    tipp: () => T('Unten rechts: <b>Zug beenden</b>.'),
    leiste: ['#a-end'],
    fertig: () => fgWiederDran(2),
    loesung: () => fgTestZug(),
  },
  /* ---------------------------------------------------------------- Runde 2 */
  {
    id: 'wachsen2', runde: 2, t: 'Runde 2',
    enter: () => fgMerkeEinkommen(),
    info: () => {
      const a = S.fg.ein[1], b = S.fg.ein[2] || income(S, FG_ICH);
      return a ? T('Dein Einkommen: <b>%s 🔬 %s 🌾 %s 🪙</b> – in Runde 1 waren es %s, %s und %s.', b.sci, b.food, b.coins, a.sci, a.food, a.coins) : '';
    },
    ziel: () => T('Lass beide Städte wachsen.'),
    tipp: () => T('Jede Stadt antippen – oder einmal für alle: <b>Fähigkeiten</b> → <b>Alle Städte wachsen</b>.'),
    hl: () => citiesOf(S, FG_ICH).filter(c => !c.grown).map(c => [c.r, c.c]),
    leiste: ['#a-abil'], knopf: () => ['Alle Städte wachsen', 'Bevölkerung wachsen'],
    fertig: () => citiesOf(S, FG_ICH).every(c => c.grown > 0),
    erlaubt: ['wachsen'],
    gut: () => T('Kleine Städte wachsen billiger: Die neue kostete nur 1 🌾 und 1 🪙.'),
    loesung: () => fgTu({ art: 'wachsen', alle: true, mode: 'paid' }, () => { growAll(S, FG_ICH, 'paid'); }),
  },
  {
    id: 'strasse', runde: 2, t: 'Handelsroute',
    info: () => T('Hängt eine Stadt über Straßen an der Hauptstadt, bringt sie jede Runde <b>+1 🔬 🌾 🪙</b> extra.') +
      fgJe(' ' + T('Und auf Straßen ziehen Armeen doppelt so weit – gut für deinen Angriff.'), '', ''),
    ziel: () => T('Verbinde deine beiden Städte mit Straßen.'),
    tipp: () => T('Straßen gibt es erst mit dem <b>Rad</b> (Forschen). Dann die golden umrandeten Felder antippen → <b>Straße bauen</b>.'),
    hl: () => fgWegFelder().filter(([r, c]) => roadLevel(S, r, c) < 1),
    techs: () => ['rad'], knopf: () => ['Straße bauen'],
    fertig: () => tradeRoutes(S, FG_ICH).count >= 1,
    erlaubt: ['forschen', 'strasse'],
    darf: a => {
      if (a.art === 'forschen') return a.k === 'rad' ? null : T('Jetzt nur, was die Straße braucht.');
      return fgWegFelder().some(([r, c]) => r === a.r && c === a.c) ? null : T('Diese Straße läge nicht zwischen deinen Städten.');
    },
    gut: () => T('Die Handelsroute steht. Auf Straßen ziehen Armeen außerdem doppelt so weit.'),
    loesung: () => {
      if (!has(fgP(), 'rad')) fgTu({ art: 'forschen', k: 'rad' }, () => doResearch(S, FG_ICH, 'rad'));
      const weg = fgWegFelder();
      // eine durchgehende Kette: von der Hauptstadt aus je das nächste Feld
      const cap = fgCap();
      weg.sort((x, y) => hexDistance(cap.r, cap.c, x[0], x[1]) - hexDistance(cap.r, cap.c, y[0], y[1]));
      let letztes = [cap.r, cap.c];
      for (const f of weg) {
        if (tradeRoutes(S, FG_ICH).count) break;
        if (hexDistance(letztes[0], letztes[1], f[0], f[1]) !== 1) continue;
        if (roadLevel(S, f[0], f[1]) < 1) fgTu({ art: 'strasse', r: f[0], c: f[1] }, () => buildRoad(S, FG_ICH, f[0], f[1], 1));
        letztes = f;
      }
    },
  },
  {
    id: 'gruenden2', runde: 2, t: 'Die dritte Stadt',
    info: () => fgJe(T('Wissenschaft brauchst du auch im Krieg: Belagerungsmaschinen kosten 🔬.'),
      T('Wissenschaft brauchst du auch fürs Wachsen: Keramik und Theologie kosten 🔬.'),
      T('Wissenschaft ist dein Weg zum Sieg – jede Quelle zählt.')),
    ziel: () => T('Gründe eine Stadt dort, wo sie dir am meisten 🔬 Wissenschaft bringt.'),
    tipp: () => T('<b>Stadt gründen</b>, dann Felder antippen und den Ertrag beim Siedeln vergleichen – Gebirge bringt 🔬. Gesucht ist das golden umrandete Feld.'),
    hl: () => fgBestePlaetze('sci').list, leiste: ['#a-found'], knopf: () => ['Hier gründen'],
    fertig: () => citiesOf(S, FG_ICH).length >= 3,
    erlaubt: ['gruenden'],
    darf: a => fgPlatzVeto(a, 'sci'),
    gut: () => T('Die dritte Stadt kostete 3 und den Weg. Jede weitere wird teurer – aber jede bringt neue Felder.'),
    loesung: () => { const [r, c] = fgBestePlaetze('sci').list[0]; fgTu({ art: 'gruenden', r, c }, () => foundCity(S, FG_ICH, r, c)); },
  },
  {
    id: 'zug2', runde: 2, t: 'Zug beenden', zug: true, sofort: true,
    info: () => { const r = fgRest(); return r === T('nichts') ? T('Alles ausgegeben.') : T('Übrig: %s – das verfällt.', r); },
    ziel: () => T('Beende deinen Zug.'),
    tipp: () => T('Unten rechts: <b>Zug beenden</b>.'),
    leiste: ['#a-end'],
    fertig: () => fgWiederDran(3),
    loesung: () => fgTestZug(),
  },
  /* ---------------------------------------------------------------- Runde 3 */
  {
    id: 'belagert', runde: 3, t: 'Belagert!',
    enter: () => fgMerkeEinkommen(),
    info: () => {
      const k = S.fg.angriff;
      return k ? T('England hat eine Armee neben deine Stadt gestellt und angegriffen: <b>Angriff %s gegen Verteidigung %s</b>. Belagerung 1 von 2 – gewinnt England noch einmal, fällt die Stadt.', k.a, k.d)
        : T('Eine englische Armee steht neben deiner Stadt.');
    },
    ziel: () => T('Stell eine Armee neben die Stadt: Ihre Verteidigung muss mindestens so hoch sein wie Englands Angriff.'),
    stand: () => {
      const k = fgKampfStadt2();
      return k ? T('Verteidigung <b>%s</b> · Englands Angriff <b>%s</b>', k.d, k.a) + fgHaken(fgGehalten()) : '';
    },
    tipp: () => T('Stadt antippen → <b>Armee bauen</b>: Sie muss die Stadt im selben Zug verlassen. Dann <b>Macht</b> kaufen. Verteidigung = Bevölkerung + deine Macht für jede eigene Armee daneben.'),
    zeige: () => { const c = fgStadt2(), a = fgErArmee(); return [c && [c.r, c.c], a && [a.r, a.c]]; },
    hl: () => { const c = fgStadt2(); return c ? neighbors(c.r, c.c).filter(([r, c2]) => canStop(S, FG_ICH, r, c2)) : []; },
    leiste: ['#a-power'], knopf: () => ['Armee bauen', 'Armee hier bewegen', '+1 Macht'],
    fertig: () => !fgErArmee() || fgGehalten(),
    erlaubt: ['armee', 'ziehen', 'macht', 'wachsen'],
    darf: a => {
      const ziel = fgStadt2();
      if (a.art === 'armee') {
        if (armiesOf(S, FG_ICH).length) return T('Eine Armee reicht hier.');
        if (!fgErreichtNeben(a.city, ziel.r, ziel.c).length) return T('Von dort käme die Armee in diesem Zug nicht zur bedrohten Stadt.');
      }
      if (a.art === 'ziehen' && !fgNah(ziel, a.r, a.c)) return T('Zieh die Armee direkt neben die bedrohte Stadt.');
      if (a.art === 'macht' && !armiesOf(S, FG_ICH).some(x => fgNah(ziel, x.r, x.c) && !cityAt(S, x.r, x.c)))
        return T('Macht wirkt über Armeen – stell erst eine neben die Stadt.');
      if (a.art === 'wachsen' && (a.alle || a.city !== ziel)) return fgEinsNach(fgSchritt());
      return null;
    },
    zugende: () => {
      const k = fgKampfStadt2();
      return T('Die Stadt fiele: Verteidigung %s gegen Angriff %s.', k ? k.d : 0, k ? k.a : 0);
    },
    gut: () => T('Macht zählt für <b>jede</b> deiner Armeen – und halbiert sich zu Beginn jedes deiner Züge. Kauf sie, wenn du sie brauchst.'),
    loesung: () => {
      const ziel = fgStadt2();
      if (!armiesOf(S, FG_ICH).length) fgTu({ art: 'armee', city: ziel }, () => buildArmy(S, FG_ICH, ziel));
      const armee = armiesOf(S, FG_ICH)[0];
      if (!fgNah(ziel, armee.r, armee.c) || cityAt(S, armee.r, armee.c)) {
        const [r, c] = [...armyReach(S, armee).keys()].map(unkey).find(([r2, c2]) => fgNah(ziel, r2, c2));
        fgTu({ art: 'ziehen', army: armee, r, c }, () => moveArmy(S, armee, r, c));
      }
      let guard = 0;
      while (!fgGehalten() && guard++ < 6) fgTu({ art: 'macht', n: 1 }, () => buyPower(S, FG_ICH, 1));
    },
  },
  fgRestSchritt(3, {
    id: 'rest3', t: 'Nichts verschenken',
    tipp: () => fgJe(T('<b>Belagerungsmaschinen</b> (Militär) geben jeder Armee +3 Angriff gegen Städte – ohne sie fällt kaum eine Hauptstadt.'),
      T('<b>Keramik</b> (Produktion): Jede Stadt kann zweimal pro Runde wachsen.'),
      T('<b>Schrift</b> (Forschung): +1 🔬 je Bevölkerung – jede Runde.')) + ' ' + T('Fehlt 🔬, zahlen Münzen 2:1. Danach wachsen, bis nichts mehr geht.'),
    gut: () => fgJe(T('Mit Belagerungsmaschinen greift jede deiner Armeen Städte mit 3 mehr an.'),
      T('Mit Keramik wächst jede Stadt bis zu zweimal pro Runde.'),
      T('Schrift zahlt sich jede Runde aus – mit jeder Bevölkerung mehr.')) + ' ' + T('Was übrig bleibt, verfällt am Zugende.'),
    vorzug: () => fgJe(['landwirtschaft', 'schrift'], ['landwirtschaft', 'schrift'], ['landwirtschaft', 'papier']),
  }),
  {
    id: 'zug3', runde: 3, t: 'Hält die Stadt?', zug: true, sofort: true,
    info: () => T('England greift am Ende seines Zugs wieder an – du siehst den Kampf.'),
    ziel: () => T('Beende deinen Zug.'),
    tipp: () => T('Unten rechts: <b>Zug beenden</b>.'),
    leiste: ['#a-end'],
    fertig: () => fgWiederDran(4),
    loesung: () => fgTestZug(),
  },
  /* ---------------------------------------------------------------- Runde 4 */
  {
    id: 'flanke', runde: 4, t: 'Gegenangriff',
    info: () => {
      const k = S.fg.angriff;
      if (!fgErArmee()) return T('Die englische Armee ist schon fort.');
      return k && k.runde === 3 ? T('Deine Stadt hat gehalten (Angriff %s, Verteidigung %s), die Belagerung ist gebrochen. Die englische Armee steht aber noch da.', k.a, k.d)
        : T('Die englische Armee steht noch neben deiner Stadt.');
    },
    ziel: () => T('Zerstöre die englische Armee: zwei deiner Armeen daneben und mehr ⚔︎ Macht als England.'),
    stand: () => {
      const e = fgErArmee();
      if (!e) return '';
      const n = flankersOf(S, FG_ICH, e).length;
      return T('Neben ihr: <b>%s/2</b> · Macht <b>%s</b> gegen <b>%s</b>', n, powerOf(S, FG_ICH), powerOf(S, FG_ER)) + fgHaken(fgFlankiert());
    },
    tipp: () => T('Dank <b>Taktik</b> aus Runde 1 reichen zwei beliebige Seiten. Baue eine zweite Armee, stell sie daneben und kauf Macht – deine hat sich zu Zugbeginn halbiert.'),
    zeige: () => { const a = fgErArmee(); return a ? [[a.r, a.c]] : []; },
    hl: () => { const a = fgErArmee(); return a ? neighbors(a.r, a.c).filter(([r, c]) => canStop(S, FG_ICH, r, c) && !fgNebenEngland(r, c)) : []; },
    leiste: ['#a-power'], knopf: () => ['Armee bauen', 'Armee hier bewegen', 'Diese Armee bewegen', '+1 Macht'],
    fertig: () => !fgErArmee() || fgFlankiert(),
    erlaubt: ['armee', 'ziehen', 'macht'],
    darf: a => {
      const e = fgErArmee();
      if (!e) return null;
      if (a.art === 'armee') {
        if (armiesOf(S, FG_ICH).length >= 2) return T('Zwei Armeen reichen.');
        if (!fgErreichtNeben(a.city, e.r, e.c).some(([r, c]) => !fgNebenEngland(r, c)))
          return T('Von dort käme die Armee in diesem Zug nicht zur englischen.');
      }
      if (a.art === 'ziehen') {
        if (!fgNah(e, a.r, a.c)) return T('Zieh die Armee direkt neben die englische.');
        if (fgNebenEngland(a.r, a.c)) return T('Nicht neben Englands Stadt – hier geht es nur um die Armee.');
      }
      if (a.art === 'macht' && flankersOf(S, FG_ICH, e).length < 2)
        return T('Erst beide Armeen in Stellung – sonst fehlen dir womöglich die Münzen für die zweite.');
      return null;
    },
    zugende: () => T('Die englische Armee stünde noch – und griffe wieder an.'),
    gut: () => T('Flankiert wird am Ende deines Zugs – dann ist die Armee weg. Städte lassen sich nicht flankieren, die muss man belagern.'),
    loesung: () => {
      const e = fgErArmee();
      if (!e) return;
      // in Stellung: daneben und nicht in einer Stadt (dort darf keine Armee den Zug beenden)
      const steht = x => fgNah(e, x.r, x.c) && !cityAt(S, x.r, x.c);
      const neben = () => armiesOf(S, FG_ICH).filter(steht);
      const felder = x => [...armyReach(S, x).keys()].map(unkey).filter(([r, c]) => fgNah(e, r, c) && !fgNebenEngland(r, c));
      /* erst die Armeen, die schon da sind, in Stellung, dann eine zweite. Die mit den wenigsten
         Feldern zuerst – sonst nimmt die eine der anderen ihr einziges Feld weg (Zufallsprüfung:
         eine Armee aus einer neuen Stadt erreichte nur 6/6, die aus Runde 3 hätte 6/6 oder 4/6). */
      for (const x of armiesOf(S, FG_ICH).filter(y => !steht(y)).sort((a, b) => felder(a).length - felder(b).length)) {
        const z = felder(x)[0];
        if (z) fgTu({ art: 'ziehen', army: x, r: z[0], c: z[1] }, () => moveArmy(S, x, z[0], z[1]));
      }
      if (neben().length < 2) {
        const stadt = fgStadt2();
        fgTu({ art: 'armee', city: stadt }, () => buildArmy(S, FG_ICH, stadt));
        const neu = armyAt(S, stadt.r, stadt.c);
        const z = [...armyReach(S, neu).keys()].map(unkey).find(([r, c]) => fgNah(e, r, c) && !fgNebenEngland(r, c));
        fgTu({ art: 'ziehen', army: neu, r: z[0], c: z[1] }, () => moveArmy(S, neu, z[0], z[1]));
      }
      let guard = 0;
      while (!fgFlankiert() && guard++ < 6) fgTu({ art: 'macht', n: 1 }, () => buyPower(S, FG_ICH, 1));
    },
  },
  fgRestSchritt(4, {
    id: 'rest4', t: 'Den Sieg vorbereiten',
    tipp: () => fgJe(T('<b>Eisenverarbeitung</b> (Militär): Macht kostet dann 4 🪙 statt 5 – und Macht entscheidet jeden Kampf.'),
      T('<b>Demokratie</b> (Spezial) öffnet das Mittelalter in Spezial – dort liegt die <b>Theologie</b>, die deine Siegschwelle senkt.'),
      T('<b>Papier</b> (Forschung, Mittelalter): +1 🔬 je Grasland – und es öffnet die Industrialisierung in der Forschung.')) + ' ' + T('Fehlt 🔬, zahlen Münzen 2:1. Danach wachsen, bis nichts mehr geht.'),
    gut: () => fgJe(T('Jede Münze bringt dir jetzt mehr Macht.'), fgNeuGewuerfelt(3, 1), fgNeuGewuerfelt(0, 2)),
    vorzug: () => fgJe(['landwirtschaft', 'schrift'], ['landwirtschaft', 'schrift'], ['landwirtschaft', 'universitaet', 'schrift']),
  }),
  {
    id: 'zug4', runde: 4, t: 'Zug beenden', zug: true, sofort: true,
    info: () => T('Am Ende deines Zugs wird flankiert.'),
    ziel: () => T('Beende deinen Zug.'),
    tipp: () => T('Unten rechts: <b>Zug beenden</b>.'),
    leiste: ['#a-end'],
    fertig: () => fgWiederDran(5),
    loesung: () => fgTestZug(),
  },
  /* ---------------------------------------------------------------- ab Runde 5: der Weg
     (gewählt vor der Partie, auf der Seite fgSeite) */
  /* ---------------------------------------------------------------- Militärsieg */
  {
    id: 'm_belagern', pfad: 'militaer', t: 'Militärsieg', zug: true,
    info: () => {
      const l = S.fg.letzter;
      const fehl = l && l.runde < S.round && !(fgKampfHaupt() || {}).zug
        ? ' ' + T('Im letzten Zug reichte es nicht: Angriff %s, Verteidigung %s.', l.a, l.d) : '';
      return T('Eine Stadt fällt, wenn dein Angriff in <b>zwei deiner Züge hintereinander</b> höher ist als ihre Verteidigung. Fällt die Hauptstadt, ist das Spiel sofort vorbei.') + fehl;
    },
    ziel: () => T('Belagere Englands Hauptstadt: Am Ende deines Zugs muss dein Angriff höher sein als ihre Verteidigung.'),
    stand: () => fgStandHaupt(),
    tipp: () => T('<b>Belagerungsmaschinen</b> geben +3 Angriff gegen Städte, und jede Armee neben der Stadt greift mit an. Verteidigung: Bevölkerung + Englands Macht für jede englische Armee daneben.'),
    zeige: () => { const c = fgErCap(); return c ? [[c.r, c.c]] : []; },
    hl: () => { const c = fgErCap(); return c ? neighbors(c.r, c.c).filter(([r, c2]) => canStop(S, FG_ICH, r, c2)) : []; },
    techs: () => ['belagerung'], leiste: ['#a-power'],
    fertig: () => ((fgKampfHaupt() || {}).zug || 0) >= 1 || fgSieg(),
    erlaubt: '*', darf: a => fgNurHauptstadt(a),
    zugende: () => fgZugendeHaupt(),
    gut: () => T('Belagerung 1 von 2. Noch ein Zug, und die Stadt gehört dir.'),
    loesung: () => fgLoesungHaupt(),
  },
  {
    id: 'm_erobern', pfad: 'militaer', t: 'Noch einmal', zug: true, lassen: true,
    info: () => T('England hat nachgerüstet – und deine Macht hat sich halbiert.'),
    ziel: () => T('Sei am Ende dieses Zugs wieder stärker als Englands Hauptstadt.'),
    stand: () => fgStandHaupt(),
    tipp: () => (has(fgP(), 'belagerung') ? T('Angriff je Armee = deine Macht + 3 (Belagerungsmaschinen).') : T('Angriff je Armee = deine Macht – mit Belagerungsmaschinen 3 mehr.')) +
      ' ' + T('Kauf Macht, bis dein Angriff höher ist als die Verteidigung – oder hol eine zweite Armee dazu.'),
    zeige: () => { const c = fgErCap(); return c ? [[c.r, c.c]] : []; },
    leiste: ['#a-power'],
    fertig: () => fgSieg(),
    zurueck: () => !S.over && ((fgKampfHaupt() || {}).zug || 0) === 0 ? 'm_belagern' : null,
    erlaubt: '*', darf: a => fgNurHauptstadt(a),
    zugende: () => fgZugendeHaupt(),
    loesung: () => fgLoesungHaupt(),
  },
  /* ---------------------------------------------------------------- Wirtschaftssieg */
  {
    id: 'w_theologie', pfad: 'wirtschaft', t: 'Wirtschaftssieg', zug: true,
    info: () => T('Am Ende einer Runde brauchst du <b>mehr als %s</b> der Weltbevölkerung – im Duell. Mit <b>Theologie</b> reichen mehr als %s.',
      victoryLabels(true).base, victoryLabels(true).theologie),
    ziel: () => T('Erforsche Theologie.'),
    tipp: () => T('Theologie liegt im Feld Spezial im Mittelalter. Dieses Zeitalter öffnet sich mit einer Technologie der Antike im selben Feld: <b>Demokratie</b>.'),
    techs: () => ['demokratie', 'theologie'], leiste: ['#a-tech'],
    fertig: () => has(fgP(), 'theologie') || fgSieg(),
    erlaubt: '*', darf: a => fgFriedlich(a),
    gut: () => T('Jetzt reichen dir mehr als %s. Deinen Anteil zeigt die Kopfzeile.', victoryLabels(true).theologie),
    loesung: () => {
      for (const k of ['demokratie', 'theologie']) {
        if (has(fgP(), k)) continue;
        if (available(S, FG_ICH, 'sci') < techCost(S, FG_ICH, TECH_BY_KEY[k])) return fgTestZug();   // nächste Runde
        fgTu({ art: 'forschen', k }, () => doResearch(S, FG_ICH, k));
      }
    },
  },
  {
    id: 'w_wachsen', pfad: 'wirtschaft', t: 'Die Mehrheit', zug: true, lassen: true,
    info: () => T('Jede Stadt, die wächst oder neu entsteht, bringt dir Bevölkerung. Geprüft wird am Ende jeder Runde, nach Englands Zug.'),
    ziel: () => T('Hab am Ende einer Runde mehr als %s der Weltbevölkerung.', victoryOption(S, fgP()).label),
    stand: () => {
      const mine = popOf(S, FG_ICH), w = worldPop(S), o = victoryOption(S, fgP());
      return T('Du: <b>%s von %s</b> (%s %) · nötig: mehr als %s %', mine, w, Math.round(100 * mine / Math.max(1, w)), Math.round(100 * o.frac)) +
        fgHaken(mine > w * o.frac);
    },
    tipp: () => T('Lass alle Städte wachsen (<b>Fähigkeiten</b> → <b>Alle Städte wachsen</b>) und gründe neue. Mit <b>Keramik</b> wächst jede Stadt zweimal pro Runde. Wird Nahrung knapp: <b>Landwirtschaft</b>.'),
    leiste: ['#a-abil', '#a-found'], techs: () => ['keramik', 'landwirtschaft'], knopf: () => ['Alle Städte wachsen'],
    fertig: () => fgSieg(),
    erlaubt: '*', darf: a => fgFriedlich(a),
    zugende: () => fgRestFrage(),
    loesung: () => fgLoesungWirtschaft(),
  },
  /* ---------------------------------------------------------------- Forschungssieg */
  {
    id: 's_methode', pfad: 'wissenschaft', t: 'Forschungssieg', zug: true,
    info: () => T('Die <b>Singularität</b> kostet dich %s 🔬 – bezahlt in einem einzigen Zug – und verlangt in <b>jedem der vier Felder</b> eine Technologie der Moderne.', techCost(S, FG_ICH, SINGULARITY)),
    ziel: () => T('Mach Forschung billiger: Erforsche die Wissenschaftliche Methode.'),
    tipp: () => T('Sie liegt in Forschung, Industrialisierung. Dieses Zeitalter öffnet sich mit einer Forschungstechnologie des Mittelalters, etwa <b>Papier</b>. Danach kostet jede Technologie 2 bis 10 weniger.'),
    techs: () => ['papier', 'wiss_methode'], leiste: ['#a-tech'],
    fertig: () => has(fgP(), 'wiss_methode') || fgSieg(),
    erlaubt: '*', darf: a => fgFriedlichForschen(a),
    zugende: () => fgRestFrage(),
    gut: () => T('Ab jetzt ist jede Technologie billiger – die Singularität kostet nur noch %s 🔬.', techCost(S, FG_ICH, SINGULARITY)),
    loesung: () => {
      const kann = k => available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, TECH_BY_KEY[k]);
      if (!has(fgP(), 'papier') && !fgP().avail.wiss_methode) {
        if (!kann('papier')) return fgTestZug();
        fgTu({ art: 'forschen', k: 'papier' }, () => doResearch(S, FG_ICH, 'papier'));
      }
      if (!kann('wiss_methode')) return fgTestZug();                     // nächste Runde
      fgTu({ art: 'forschen', k: 'wiss_methode' }, () => doResearch(S, FG_ICH, 'wiss_methode'));
    },
  },
  {
    id: 's_moderne', pfad: 'wissenschaft', t: 'Bis in die Moderne', zug: true,
    info: () => T('Jedes Zeitalter öffnet das nächste im selben Feld. Je mehr 🔬 du einnimmst, desto schneller geht es.'),
    ziel: () => T('Erforsche in jedem der vier Felder eine Technologie der Moderne.'),
    stand: () => fgModerneFelder().map((ok, f) => `${FIELDS[f]} ${ok ? '✓' : '–'}`).join(' · '),
    tipp: () => T('Erst das Einkommen: <b>Universitätswesen</b> (+2 🔬 je Bevölkerung), <b>Biologie</b> (+2 🔬 je Grasland), neue Städte bei Gebirge und Wald. Dann in jedem Feld Zeitalter für Zeitalter weiter.'),
    techs: () => ['universitaet', 'biologie'], leiste: ['#a-tech'],
    fertig: () => singularityReady(fgP()) || fgSieg(),
    erlaubt: '*', darf: a => fgFriedlichForschen(a),
    zugende: () => fgRestFrage(),
    gut: () => T('Alle vier Felder haben die Moderne erreicht.'),
    loesung: () => fgLoesungWissenschaft(),
  },
  {
    id: 's_singularitaet', pfad: 'wissenschaft', t: 'Die Singularität', zug: true,
    info: () => T('Sparen geht nicht – Wissenschaft verfällt am Zugende. Reicht es nicht, steigere dein Einkommen und versuch es nächste Runde.'),
    ziel: () => T('Erforsche die Singularität.'),
    stand: () => T('Verfügbar: <b>%s</b> von <b>%s</b> 🔬', available(S, FG_ICH, 'sci'), techCost(S, FG_ICH, SINGULARITY)) +
      fgHaken(available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, SINGULARITY)),
    tipp: () => T('Sie steht ganz unten im Technologiebogen. Münzen zählen 2:1 mit.'),
    techs: () => ['singularitaet'], leiste: ['#a-tech'],
    fertig: () => has(fgP(), 'singularitaet') || fgSieg(),
    erlaubt: '*', darf: a => fgFriedlichForschen(a),
    zugende: () => fgRestFrage(),
    gut: () => T('Angemeldet! Ein Forschungssieg zählt erst am Ende der Runde – England zieht noch einmal.'),
    loesung: () => fgLoesungWissenschaft(),
  },
  {
    id: 's_warten', pfad: 'wissenschaft', t: 'Fast geschafft', zug: true, lassen: true,
    ziel: () => T('Beende deinen Zug.'),
    tipp: () => T('Unten rechts: <b>Zug beenden</b>.'),
    leiste: ['#a-end'],
    fertig: () => fgSieg(),
    erlaubt: '*', darf: a => fgFriedlichForschen(a),
    loesung: () => fgTestZug(),
  },
  /* ---------------------------------------------------------------- Ende */
  {
    id: 'ende', t: 'Gewonnen!', lassen: true, ende: true,
    info: () => fgEndeText(),
    fertig: () => false,
    erlaubt: '*',
    loesung: () => {},
  },
];
const FG_BY_ID = {};
FG_STEPS.forEach(st => { FG_BY_ID[st.id] = st; });

/* ------------------------------------------------------------------ Hilfen der Schritte */
const fgGratis = () => researchable(S, FG_ICH).filter(t => t.k !== 'singularitaet' && techCost(S, FG_ICH, t) === 0);
/* Runde 3 und 4 (v93): erst die Technologie des Wegs (fgRestTech), dann alles ausgeben, was
   noch geht. Andere Forschung lehnt die Schiene ab, solange die des Wegs bezahlbar ist –
   gesperrt wird das Zugende nicht (sie könnte unbezahlbar geworden sein), es fragt nur
   einmal nach. `st` bringt id, Titel, Tipp, Rückmeldung und den Vorzug fürs Ausgeben. Eine
   Funktionsdeklaration: FG_STEPS ruft sie schon beim Laden der Datei. */
function fgRestSchritt(runde, st) {
  const k = () => fgRestTech(runde);
  const name = () => TECH_BY_KEY[k()].n;
  return Object.assign({
    runde,
    info: () => T('Übrig: %s.', fgRest()),
    ziel: () => (has(fgP(), k()) ? T('Gib aus, was noch geht – %s hast du schon.', name())
      : T('Erforsche %s – und gib aus, was dann noch geht.', name())),
    stand: () => {
      const w = fgNochWas();
      return name() + fgHaken(has(fgP(), k())) + ' · ' + (w.length ? T('Geht noch: %s', fgNochWasText(w)) : T('Nichts mehr.'));
    },
    leiste: ['#a-tech', '#a-abil'], techs: () => [k()],
    fertig: () => fgZugVorbei(runde) || (has(fgP(), k()) && !fgNochWas().length),
    erlaubt: ['forschen', 'wachsen', 'gruenden', 'strasse', 'macht'],
    darf: a => (a.art === 'forschen' && a.k !== k() && fgKann(k()) ? T('Erst %s – das bringt dich deinem Sieg näher.', name()) : null),
    zugende: () => (fgKann(k()) ? { frage: T('Du hast %s noch nicht erforscht.', name()) } : fgRestFrage()),
    loesung: () => {
      if (fgKann(k())) fgTu({ art: 'forschen', k: k() }, () => doResearch(S, FG_ICH, k()));
      fgAllesAusgeben(st.vorzug());
    },
  }, st);
}
/* Was beim Öffnen eines Zeitalters herauskam – als Rückmeldung (Feld f, Zeitalter a). Noch
   nicht offen (die Technologie des Wegs fehlt): der allgemeine Satz. */
function fgNeuGewuerfelt(f, a) {
  if (!fgOffen(fgP(), f, a)) return T('Was übrig bleibt, verfällt am Zugende.');
  const da = techsIn(f, a, S).filter(t => fgP().avail[t.k] || fgP().techs[t.k]).map(t => t.n);
  return T('Neu ausgewürfelt – %s, %s: %s. Der Rest fehlt in dieser Partie.', FIELDS[f], AGES[a], da.join(', '));
}
// Der gewählte Weg in einem Satz (erster Schritt)
function fgWegSatz() {
  return fgJe(T('Dein Weg: <b>Militärsieg</b> – erobere Englands Hauptstadt.'),
    T('Dein Weg: <b>Wirtschaftssieg</b> – am Ende einer Runde mehr als %s der Weltbevölkerung.', victoryLabels(true).base),
    T('Dein Weg: <b>Forschungssieg</b> – erforsche die Singularität.'));
}
/* Blasse Kachel im Bogen (nur im Ersten Spiel antippbar, techBoardHTML): warum blass?
   Ausgewürfelt und durchgefallen – mit der Augenzahl aus dem Protokoll – oder ihr Zeitalter
   ist in diesem Feld noch gar nicht offen. */
function fgBlassText(k) {
  const t = TECH_BY_KEY[k];
  if (!t) return '';
  if (fgOffen(fgP(), t.f, t.age)) return T('%s gibt es in dieser Partie nicht: Der Würfel zeigte %s, nötig war 4, 5 oder 6.', t.n, fgWurf(FG_ICH, k));
  return T('%s ist noch nicht ausgewürfelt: Das Zeitalter öffnet sich in %s mit deiner ersten Technologie des Zeitalters davor.', t.n, FIELDS[t.f]);
}
function fgPlatzVeto(a, art) {
  const { best } = fgBestePlaetze(art);
  if (canFound(S, FG_ICH, a.r, a.c)) return null;      // geht gar nicht – das sagt die Regel selbst
  const g = settleGain(S, FG_ICH, a.r, a.c)[art];
  if (g >= best) return null;
  return art === 'food' ? T('Hier brächte die Stadt %s 🌾 – es gibt einen Platz mit mehr.', g)
    : T('Hier brächte die Stadt %s 🔬 – es gibt einen Platz mit mehr.', g);
}
function fgGehalten() {
  const k = fgKampfStadt2(), ziel = fgStadt2();
  if (!k || !ziel) return true;
  const armee = armiesOf(S, FG_ICH).some(x => fgNah(ziel, x.r, x.c) && !cityAt(S, x.r, x.c));
  return armee && k.d >= k.a;
}
function fgFlankiert() {
  const e = fgErArmee();
  return !!e && canFlank(S, FG_ICH, e) && powerOf(S, FG_ICH) > powerOf(S, FG_ER);
}
function fgStandHaupt() {
  const k = fgKampfHaupt();
  if (!k) return '';
  return T('Angriff <b>%s</b> · Verteidigung <b>%s</b>', k.a, k.d) + fgHaken(k.n > 0 && k.a > k.d) +
    (k.zug ? ' · ' + T('Belagerung %s/2', k.zug) : '');
}
function fgZugendeHaupt() {
  const k = fgKampfHaupt();
  if (k && !(k.n > 0 && k.a > k.d)) return { frage: T('Dein Angriff reicht noch nicht: Angriff %s, Verteidigung %s.', k.a, k.d) };
  return null;
}
function fgMerkeEinkommen() {
  S.fg.ein = S.fg.ein || {};
  if (!S.fg.ein[S.round]) S.fg.ein[S.round] = income(S, FG_ICH);
}
// Merker aus der Oberfläche: Hauptstadt angetippt, Fähigkeiten geöffnet …
function fgSieht(was, x) {
  if (!S || !S.fg) return;
  const vorher = JSON.stringify(S.fg.flags);
  if (was === 'stadt' && x && x.owner === FG_ICH && x.cap) S.fg.flags.hauptstadt = true;
  if (was === 'faehigkeiten') S.fg.flags.faehigkeiten = true;
  // eine blasse Kachel, die ausgewürfelt und durchgefallen ist – gezählt erst, wenn sie gesucht ist
  if (was === 'blass' && S.fg.schritt === 'wuerfel' && !S.fg.flags.blass && TECH_BY_KEY[x] &&
    fgOffen(fgP(), TECH_BY_KEY[x].f, TECH_BY_KEY[x].age) && !fgP().avail[x] && !fgP().techs[x]) S.fg.flags.blass = x;
  // Ziel erreicht? Das Blatt geht gerade erst auf – kein Neuzeichnen, nur die Prüfung
  if (JSON.stringify(S.fg.flags) !== vorher && typeof fgPruefe === 'function' && typeof document !== 'undefined') fgPruefe();
}
/* Vor dem Zugende festhalten, wie der Kampf um Englands Hauptstadt steht – nach dem
   Kampf nennt der Text, woran es lag. */
function fgZugendeMerken() {
  const k = fgKampfHaupt();
  if (k && S.fg.pfad === 'militaer') S.fg.letzter = { runde: S.round, a: k.a, d: k.d };
}

/* ------------------------------------------------------------------ Ablauf */
function fgSchritt() { return S && S.fg ? FG_BY_ID[S.fg.schritt] || null : null; }
// Die Schritte dieses Durchgangs: gemeinsamer Teil, der gewählte Weg, das Ende
function fgReihe() { return FG_STEPS.filter(st => !st.pfad || st.pfad === S.fg.pfad); }
function fgBetreten() {
  const st = fgSchritt();
  if (!st || S.fg.betreten[st.id]) return;
  S.fg.betreten[st.id] = true;
  if (st.enter) st.enter();
}
function fgGeheZu(id) {
  if (!FG_BY_ID[id] || S.fg.schritt === id) return false;
  S.fg.schritt = id;
  S.fg.tipp = null;
  fgBetreten();
  return true;
}
// Ein Schritt weiter (nur, wenn das Ziel erreicht ist). Die Rückmeldung wandert mit.
function fgVor() {
  const st = fgSchritt();
  if (!st || !st.fertig()) return false;
  let next = st.naechster ? st.naechster() : null;
  if (S.over && st.id !== 'ende') next = 'ende';
  if (!next) {
    const reihe = fgReihe(), i = reihe.indexOf(st);
    next = reihe[i + 1] ? reihe[i + 1].id : null;
  }
  if (!next) return false;
  S.fg.gut = st.gut ? st.id : null;     // gezeichnet wird sie erst im Panel – in der laufenden Sprache
  return fgGeheZu(next);
}
/* Was die Oberfläche nach jeder Aktion nachholt: Sprünge zurück (gebrochene Belagerung) und
   erreichte Ziele. Ohne Zeitgeber – Tests und Schienen rufen es direkt. */
function fgNachholen() {
  let guard = 0;
  for (; ;) {
    const st = fgSchritt();
    if (!st || guard++ > FG_STEPS.length) return;
    const zu = st.zurueck ? st.zurueck() : null;
    if (zu) { S.fg.gut = null; fgGeheZu(zu); continue; }
    if (!fgVor()) return;
  }
}
/* Den Weg nachtragen – nur für Spielstände von v92, in denen er erst in Runde 5 gewählt
   wurde (dort fehlt er noch, oder die Partie steht auf dem alten Schritt „wahl"). Neue
   Partien bekommen ihn schon in fgSetup. */
function fgWaehle(pfad) {
  if (!S || !S.fg || S.fg.pfad || !FG_WEGE.includes(pfad)) return false;
  S.fg.pfad = pfad;
  delete S.fg.wahl;                     // v92: Schnappschuss von Runde 5 – gibt es nicht mehr
  log(S, 'info', T('Erstes Spiel: Weg gewählt – %s.', fgPfadName(pfad)));
  if (!FG_BY_ID[S.fg.schritt]) fgGeheZu(FG_STEPS.find(st => st.pfad === pfad).id);
  fgNachholen();
  return true;
}
const fgPfadName = p => p === 'militaer' ? T('Militärsieg') : p === 'wirtschaft' ? T('Wirtschaftssieg') : T('Forschungssieg');
function fgEndeText() {
  const o = S.over;
  const wie = o ? o.how : '';
  return T('Du hast dein erstes Spiel gewonnen: %s.', wie) + '</p><p>' +
    T('Noch nicht vorgekommen: Eisenbahn, Kontrollzonen, Kopieren von Technologien und die Erweiterungen Ereignisse und Weltwunder (Einstellungen). Alles steht unter <b>Regeln &amp; Technologien</b>.');
}

/* ------------------------------------------------------------------ Aufbau
   `pfad`: der Weg zum Sieg, gewählt auf der Seite vor der Partie (fgSeite). */
function fgSetup(pfad) {
  ui = { sel: null, army: null, mode: null, botTimer: null, fg: { timer: null } };
  // Erst ui.fg, dann newGame – sonst würfelt der Aufbau die Antike frei (fgNextDie)
  S = newGame({
    seed: FG_SEED, map: fgKarte(), duel: true, seatOrder: true, startPlayer: 0,
    players: [
      { civ: 'griechenland', kind: 'human', ability: 'basis' },
      { civ: 'england', kind: 'ki', kiLevel: 'leicht', ability: 'basis' },
    ],
  });
  S.fg = {
    v: 2, schritt: FG_STEPS[0].id, pfad: FG_WEGE.includes(pfad) ? pfad : null, flags: {}, tipp: null, gut: null,
    betreten: {}, ein: {}, angriff: null, letzter: null,
  };
  fgMerkeEinkommen();
  fgBetreten();
  log(S, 'info', T('Erstes Spiel: England zieht nach einem festen Drehbuch, die Technologien sind für diese Partie festgelegt.'));
  if (S.fg.pfad) log(S, 'info', T('Erstes Spiel: Weg gewählt – %s.', fgPfadName(S.fg.pfad)));
}

/* ------------------------------------------------------------------ Musterlösungen
   Für test.js und smoke.js: jede Aktion geht erst durch die Schienen (fgTu) – lehnen sie
   ab, ist das ein Fehler im Schritt, nicht in der Lösung. */
function fgTu(a, fn) {
  const st = fgSchritt();
  if (st && st.fertig()) return null;   // Ziel schon erreicht: der Rest der Lösung entfällt
  const v = fgVeto(a);
  if (v) throw new Error(`Erstes Spiel (${S.fg.schritt}): ${a.art} abgelehnt – ${v}`);
  const e = fn();
  if (typeof e === 'string') throw new Error(`Erstes Spiel (${S.fg.schritt}): ${a.art} – ${e}`);
  return e;
}
/* Zugende ohne Oberfläche: wie endHumanTurn, dann Englands Zug wie runBots/afterAutoTurn. */
function fgTestZug() {
  fgNachholen();
  const r = fgZugendeRegel();
  if (typeof r === 'string') throw new Error(`Erstes Spiel (${S.fg.schritt}): Zugende abgelehnt – ${r}`);
  fgZugendeMerken();
  finishTurn(S); if (S.over) return;
  advanceTurn(S); if (S.over) return;
  fgGegnerZug(S);
  finishTurn(S); if (S.over) return;
  advanceTurn(S);
}
// Alles ausgeben: wachsen (kleinste Städte zuerst), dann forschen – Vorzug zuerst, sonst billig
function fgAllesAusgeben(vorzug) {
  let guard = 0;
  while (fgNochWas().length && guard++ < 40) {
    const stadt = growAllOrder(S, FG_ICH).find(c => !canGrowPaid(S, FG_ICH, c) && !fgVetoRoh({ art: 'wachsen', city: c, mode: 'paid' }));
    if (stadt) { fgTu({ art: 'wachsen', city: stadt, mode: 'paid' }, () => growCity(S, FG_ICH, stadt, 'paid')); continue; }
    const sci = available(S, FG_ICH, 'sci');
    const kann = researchable(S, FG_ICH).filter(t => sci >= techCost(S, FG_ICH, t) && !fgVetoRoh({ art: 'forschen', k: t.k }));
    const t = (vorzug || []).map(k => kann.find(x => x.k === k)).find(Boolean) ||
      kann.sort((a, b) => techCost(S, FG_ICH, a) - techCost(S, FG_ICH, b))[0];
    if (!t) break;
    fgTu({ art: 'forschen', k: t.k }, () => doResearch(S, FG_ICH, t.k));
  }
}
function fgLoesungHaupt() {
  const cap = fgErCap();
  if (!cap) return fgTestZug();
  if (!has(fgP(), 'belagerung') && available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, TECH_BY_KEY.belagerung))
    fgTu({ art: 'forschen', k: 'belagerung' }, () => doResearch(S, FG_ICH, 'belagerung'));
  // weniger als zwei Armeen? Eine neue in der Stadt, die der Hauptstadt am nächsten liegt
  if (armiesOf(S, FG_ICH).length < 2 && available(S, FG_ICH, 'coins') >= armyCost(S, FG_ICH)) {
    const stadt = citiesOf(S, FG_ICH).filter(c => !armyAt(S, c.r, c.c))
      .sort((a, b) => hexDistance(a.r, a.c, cap.r, cap.c) - hexDistance(b.r, b.c, cap.r, cap.c))[0];
    if (stadt && !fgVetoRoh({ art: 'armee', city: stadt })) fgTu({ art: 'armee', city: stadt }, () => buildArmy(S, FG_ICH, stadt));
  }
  // jede Armee neben die Hauptstadt – oder so nah heran wie möglich (auf erlaubte Felder)
  for (const a of armiesOf(S, FG_ICH)) {
    if (fgNah(cap, a.r, a.c) && !cityAt(S, a.r, a.c)) continue;
    const ziele = [...armyReach(S, a).keys()].map(unkey)
      .filter(([r, c]) => !fgVetoRoh({ art: 'ziehen', army: a, r, c }))
      .sort((x, y) => hexDistance(x[0], x[1], cap.r, cap.c) - hexDistance(y[0], y[1], cap.r, cap.c));
    const z = ziele[0];
    if (z && (cityAt(S, a.r, a.c) || hexDistance(z[0], z[1], cap.r, cap.c) < hexDistance(a.r, a.c, cap.r, cap.c)))
      fgTu({ art: 'ziehen', army: a, r: z[0], c: z[1] }, () => moveArmy(S, a, z[0], z[1]));
  }
  let guard = 0;
  while (guard++ < 10) {
    const k = fgKampfHaupt();
    if (!k.n || k.a > k.d) break;
    if (available(S, FG_ICH, 'coins', payOpts(S, FG_ICH)) < powerPrice(S, FG_ICH)) break;
    fgTu({ art: 'macht', n: 1 }, () => buyPower(S, FG_ICH, 1));
  }
  fgAllesAusgeben(['landwirtschaft', 'schrift', 'papier']);
  fgTestZug();
}
function fgLoesungWirtschaft() {
  let guard = 0;
  for (; guard < 20; guard++) {
    if (!has(fgP(), 'keramik') && available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, TECH_BY_KEY.keramik))
      fgTu({ art: 'forschen', k: 'keramik' }, () => doResearch(S, FG_ICH, 'keramik'));
    const stadt = growAllOrder(S, FG_ICH).find(c => !canGrowPaid(S, FG_ICH, c));
    if (stadt) { fgTu({ art: 'wachsen', city: stadt, mode: 'paid' }, () => growCity(S, FG_ICH, stadt, 'paid')); continue; }
    const platz = fgBestePlaetze('food').list[0];
    if (platz) { fgTu({ art: 'gruenden', r: platz[0], c: platz[1] }, () => foundCity(S, FG_ICH, platz[0], platz[1])); continue; }
    break;
  }
  fgAllesAusgeben(['landwirtschaft', 'keramik', 'segeln']);
  fgTestZug();
}
const FG_FORSCHUNG_VORZUG = ['wiss_methode', 'universitaet', 'biologie', 'elektrizitaet', 'buerokratie', 'chemie',
  'papier', 'schrift', 'buchdruck', 'mathematik', 'landwirtschaft'];
function fgLoesungWissenschaft() {
  const p = fgP();
  // Singularität, wenn bezahlbar
  if (singularityReady(p) && !p.techs.singularitaet && available(S, FG_ICH, 'sci') >= techCost(S, FG_ICH, SINGULARITY)) {
    fgTu({ art: 'forschen', k: 'singularitaet' }, () => doResearch(S, FG_ICH, 'singularitaet'));
    return fgTestZug();
  }
  // gründen: bester Wissenschaftsplatz, solange die Schiene es zulässt
  const platz = fgBestePlaetze('sci').list[0];
  if (platz && !fgVetoRoh({ art: 'gruenden', r: platz[0], c: platz[1] }))
    fgTu({ art: 'gruenden', r: platz[0], c: platz[1] }, () => foundCity(S, FG_ICH, platz[0], platz[1]));
  // wachsen, wo es geht
  for (const c of growAllOrder(S, FG_ICH))
    if (!canGrowPaid(S, FG_ICH, c) && !fgVetoRoh({ art: 'wachsen', city: c, mode: 'paid' }))
      fgTu({ art: 'wachsen', city: c, mode: 'paid' }, () => growCity(S, FG_ICH, c, 'paid'));
  // forschen: Einkommen zuerst, dann Feld für Feld in Richtung Moderne
  let guard = 0;
  while (guard++ < 40) {
    const sci = available(S, FG_ICH, 'sci');
    const kann = researchable(S, FG_ICH).filter(t => t.k !== 'singularitaet' && sci >= techCost(S, FG_ICH, t) &&
      !fgVetoRoh({ art: 'forschen', k: t.k }));
    if (!kann.length) break;
    const hoch = f => Math.max(-1, ...TECHS.filter(t => t.f === f && p.techs[t.k]).map(t => t.age));
    const wahl = FG_FORSCHUNG_VORZUG.map(k => kann.find(t => t.k === k)).find(Boolean) ||
      kann.filter(t => t.age === hoch(t.f) + 1 && hoch(t.f) < 3).sort((a, b) => a.age - b.age || techCost(S, FG_ICH, a) - techCost(S, FG_ICH, b))[0] ||
      kann.sort((a, b) => techCost(S, FG_ICH, a) - techCost(S, FG_ICH, b))[0];
    fgTu({ art: 'forschen', k: wahl.k }, () => doResearch(S, FG_ICH, wahl.k));
    if (singularityReady(p)) break;      // den Rest für die Singularität? Sie muss in einem Zug gehen
  }
  fgTestZug();
}

/* ------------------------------------------------------------------ Oberfläche
   Das Panel ist das des Tutorials (#tut-panel): Kopf, Titel, Text, Ziel, Leiste. Im Ersten
   Spiel trägt die Leiste nur „💡 Tipp" (und am Ende „Zum Menü"); weiter geht es von selbst,
   sobald das Ziel erreicht ist. Knöpfe bleiben alle frei – abgelehnt wird beim Tippen. */
/* Die Seite vor der Partie (v93, Wunsch des Autors): wer man ist, worum es geht – und gleich
   die Wahl des Wegs. Ein Fenster über dem Menü (oder über dem Spielende: „Anderen Weg
   ausprobieren"). Wer es schließt, steht wieder, wo er war – angefangen ist noch nichts. */
function fgSeite() {
  modal(T('Erstes Spiel'), `<div class="fg-seite">
    <p class="fg-auftakt">${T('Du führst eine einzige Stadt in der Steinzeit. Dein Ziel: eine Zivilisation, die die Zeiten überdauert.')}</p>
    <p>${T('Es gibt viele Wege zu einem blühenden Reich – und deshalb mehr als einen Weg zum Sieg. Welchen gehst du?')}</p>
    ${fgWahlHtml(fgGeschafft())}
    <p class="hint">${T('Du spielst Griechenland gegen England, 1 gegen 1 auf einer kleinen Karte. Jeder Schritt nennt ein Ziel – wer festhängt, holt sich einen Tipp.')}</p>
  </div>`);
  $('ov-body').querySelectorAll('[data-pfad]').forEach(b => b.onclick = () => fgStart(b.dataset.pfad));
}
// Ohne Weg geht es erst auf die Seite – gespielt wird nur mit gewähltem Weg
function fgStart(pfad) {
  if (!FG_WEGE.includes(pfad)) return fgSeite();
  endTutorialPanel();                   // nichts vom alten Spiel bleibt stehen
  $('sheet').classList.remove('locked');
  closeModal(); closeSheet();
  const schnipsel = $('confetti'); if (schnipsel) schnipsel.remove();
  fgSetup(pfad);
  fgPanelAn();
  startGameScreen();
}
// Gewonnene Wege merkt sich das Gerät – die Seite hakt sie ab
function fgGeschafft() {
  const o = (typeof load === 'function' && load(FG_KEY)) || {};
  return Array.isArray(o.geschafft) ? o.geschafft.filter(p => FG_WEGE.includes(p)) : [];
}
function fgGeschafftMerken(pfad) {
  const alt = fgGeschafft();
  if (typeof store === 'function' && FG_WEGE.includes(pfad) && !alt.includes(pfad)) store(FG_KEY, { geschafft: alt.concat(pfad) });
}
function fgPanelAn() {
  $('tut-panel').hidden = false;
  document.body.classList.add('tut', 'fg');
}
/* Ein gespeichertes Erstes Spiel fortsetzen (Menü „Spiel fortsetzen", „Spielstand laden").
   Ein Spielstand von v92 kann noch ohne Weg sein – dann zeigt das Panel zuerst die Wahl. */
function fgFortsetzen() {
  if (!S || !S.fg) return false;
  ui.fg = { timer: null };
  fgPanelAn();
  return true;
}
// Blasse Kachel im Bogen angetippt (techModal): warum blass – und vielleicht das gesuchte Ziel
function fgBlass(k) {
  if (!fgAn()) return;
  toast(fgBlassText(k));
  fgSieht('blass', k);
}
// Was die Oberfläche vor jeder Aktion fragt: true = los, false = abgelehnt (Toast sagt warum)
function fgErlaubt(a) {
  if (!fgAn()) return true;
  const vorher = S.fg.schritt;
  const v = fgVeto(a);
  ui.fg.frage = false;
  if (S.fg.schritt !== vorher) redraw();
  if (v) { toast(v); return false; }
  return true;
}
// Zugende: abgelehnt, einmal nachgefragt oder frei
function fgZugendeOk() {
  if (!fgAn() || S.over) return true;
  const vorher = S.fg.schritt;
  fgNachholen();
  if (S.fg.schritt !== vorher) redraw();
  const r = fgZugendeRegel();
  if (r && typeof r === 'string') { toast(r); return false; }
  if (r && !ui.fg.frage) {
    ui.fg.frage = true;
    toast(r.frage + ' ' + T('Nochmal tippen zum Beenden.'));
    return false;
  }
  ui.fg.frage = false;
  fgZugendeMerken();
  return true;
}
function fgHighlight() {
  const st = fgSchritt();
  if (!st || !fgAn()) return null;
  const out = [];
  if (st.zeige) out.push(...st.zeige());
  if (S.fg.tipp === st.id && st.hl) out.push(...st.hl());
  return out.filter(Boolean);
}
// Knöpfe, die der offene Tipp meint, golden hervorheben – Leiste, Blatt, Technologiebogen
function fgMarkUi() {
  document.querySelectorAll('.fg-hl').forEach(el => el.classList.remove('fg-hl'));
  const st = fgSchritt();
  if (!fgAn() || !st || S.fg.tipp !== st.id || S.cur !== FG_ICH) return;
  (st.leiste || []).forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.add('fg-hl')));
  (st.knopf ? st.knopf() : []).forEach(l => document.querySelectorAll('#sheet-body .opt').forEach(el => {
    if (el.dataset.label === l) el.classList.add('fg-hl');
  }));
  (st.techs ? st.techs() : []).forEach(k => document.querySelectorAll('#ov-body [data-tech], #ov-body [data-blass]').forEach(el => {
    if ((el.dataset.tech || el.dataset.blass) === k) el.classList.add('fg-hl');
  }));
}
function fgTippZeigen() {
  const st = fgSchritt();
  if (!fgAn() || !st || !st.tipp) return;
  S.fg.tipp = st.id;
  redraw();
  // Ziel oben, der Tipp gleich darunter – im kleinen Panel (Telefon) rutschte sonst das Ziel weg
  const sc = $('tut-panel').querySelector('.tut-scroll'), ziel = $('tut-body').querySelector('.fg-ziel');
  if (sc && ziel) sc.scrollTop = Math.max(0, ziel.offsetTop - sc.offsetTop - 4);
}
// Der eine Knopf der Leiste: Tipp – am Ende „Zum Menü"
function fgNavKnopf() {
  const st = fgSchritt();
  if (st && st.ende) { store('hochciv.save', null); location.reload(); return; }
  fgTippZeigen();
}
// Die drei Wege als Knöpfe – auf der Seite vor der Partie (gewonnene abgehakt)
function fgWahlHtml(fertig) {
  const wege = [
    ['militaer', '⚔︎ ' + T('Militärsieg'), T('Erobere Englands Hauptstadt – das Spiel endet sofort.')],
    ['wirtschaft', '🌾 ' + T('Wirtschaftssieg'), T('Hab am Ende einer Runde mehr als %s der Weltbevölkerung.', victoryLabels(true).base)],
    ['wissenschaft', '🔬 ' + T('Forschungssieg'), T('Erforsche die Singularität.')],
  ];
  return `<div class="fg-wahl">${wege.map(([k, n, e]) =>
    `<button class="btn" data-pfad="${k}"><span>${n}${(fertig || []).includes(k) ? ' <span class="fg-ja">✓</span>' : ''}</span><small>${e}</small></button>`).join('')}</div>`;
}
function fgEndeKnoepfe() {
  return `<button class="btn primary wide" data-fg="anders">${T('Anderen Weg ausprobieren')}</button>` +
    `<button class="btn wide" data-fg="neu">${T('Neues Spiel')}</button>`;
}
function fgKnoepfeVerdrahten(box) {
  // nur im Panel eines Spielstands von v92 ohne Weg: die Wahl gilt dieser Partie
  box.querySelectorAll('[data-pfad]').forEach(b => b.onclick = () => { if (fgWaehle(b.dataset.pfad)) { saveGame(); redraw(); } });
  box.querySelectorAll('[data-fg="anders"]').forEach(b => b.onclick = fgAnders);
  box.querySelectorAll('[data-fg="neu"]').forEach(b => b.onclick = () => {
    closeModal();
    store('hochciv.save', null);
    $('m-continue').hidden = true;
    endTutorialPanel();
    show('screen-setup'); setupScreen();
  });
}
// Nach dem Sieg: die Seite noch einmal – ein anderer Weg ist eine neue Partie
function fgAnders() {
  closeModal();
  fgSeite();
}
/* Spielstand von v92, der Weg noch nicht gewählt (dort kam die Wahl erst in Runde 5): das
   Panel zeigt zuerst die drei Wege. Gilt nur dieser Partie (fgWaehle). */
function fgRenderWahl() {
  fgPanelAn();
  $('tut-panel').querySelector('.tut-sub').textContent = T('Erstes Spiel · Runde %s', S.round);
  $('tut-quit').textContent = T('Beenden');
  $('tut-title').textContent = T('Wie willst du gewinnen?');
  $('tut-body').innerHTML = `<p class="tut-task fg-ziel"><b>${T('Ziel:')}</b> ${T('Wähle deinen Weg zum Sieg.')}</p>` + fgWahlHtml(fgGeschafft());
  fgKnoepfeVerdrahten($('tut-body'));
  $('tut-task').hidden = true;
  $('tut-prev').hidden = true;
  $('tut-count').textContent = '';
  const nx = $('tut-next');
  nx.textContent = '💡 ' + T('Tipp anzeigen');
  nx.disabled = true;
  nx.classList.remove('primary');
  fgMarkUi();
}
function fgRenderPanel() {
  if (S.fg && !S.fg.pfad && !S.over) return fgRenderWahl();
  const st = fgSchritt();
  if (!st) return;
  fgPanelAn();
  const reihe = fgReihe(), i = Math.max(0, reihe.indexOf(st));
  const england = S.cur !== FG_ICH && !S.over;
  // Kopf: der gewählte Weg und die Runde („Militärsieg · Runde 3") – das Ziel der ganzen Partie
  $('tut-panel').querySelector('.tut-sub').textContent = T('%s · Runde %s', fgPfadName(S.fg.pfad), S.round);
  $('tut-quit').textContent = T('Beenden');
  $('tut-title').textContent = england ? T('England ist am Zug') : T(st.t);
  /* Reihenfolge: erst die Rückmeldung zum erreichten Ziel, dann das neue Ziel samt Stand,
     gleich darunter – auf Wunsch – der Tipp, dann die Lage. Das Ziel steht im Textbereich
     (nicht in der Aufgabenzeile des Tutorials über der Leiste): gleich unter dem Titel liest
     man es zuerst, und der Tipp steht direkt dabei – auch auf dem Telefon, wo das Panel klein
     ist und ein Tipp weiter unten das Ziel aus dem Bild schöbe. */
  const teile = [];
  const gut = S.fg.gut && FG_BY_ID[S.fg.gut] && FG_BY_ID[S.fg.gut].gut;
  if (gut && !england) teile.push(`<div class="fg-gut"><b>✓</b> ${gut()}</div>`);
  const ziel = england ? (fgAnimAn() ? T('Schau auf der Karte zu, was England tut.') : T('Lies, was England getan hat, und tippe dann auf Weiter.'))
    : st.ziel ? st.ziel() : '';
  const stand = !england && st.stand ? st.stand() : '';
  if (ziel) teile.push(`<p class="tut-task fg-ziel"><b>${T('Ziel:')}</b> ${ziel}${stand ? `<span class="fg-stand">${stand}</span>` : ''}</p>`);
  if (!england && S.fg.tipp === st.id && st.tipp) teile.push(`<div class="fg-tipp"><b>💡 ${T('So geht es')}</b>${st.tipp()}</div>`);
  const info = england ? (fgAnimAn() ? T('Ein Tipp auf die Karte überspringt. Alles steht auch im Protokoll.') : T('Im Blatt steht, was England tut.'))
    : st.info ? st.info() : '';
  if (info) teile.push(`<p>${info}</p>`);
  if (st.ende) teile.push(fgEndeKnoepfe());
  $('tut-body').innerHTML = teile.join('');
  fgKnoepfeVerdrahten($('tut-body'));
  $('tut-task').hidden = true;
  $('tut-prev').hidden = true;
  $('tut-count').textContent = `${i + 1}/${reihe.length}`;
  $('tut-bar-fill').style.width = Math.round(((i + 1) / reihe.length) * 100) + '%';
  const nx = $('tut-next');
  if (st.ende) { nx.textContent = T('Zum Menü'); nx.disabled = false; nx.classList.remove('primary'); }
  else {
    nx.textContent = '💡 ' + T('Tipp anzeigen');
    nx.disabled = england || !st.tipp || S.fg.tipp === st.id;
    nx.classList.remove('primary');
  }
  fgMarkUi();
  fgPruefe();
}
/* Ziel erreicht → nach kurzer Pause weiter (damit man das Ergebnis der eigenen Aktion noch
   sieht). Nicht, solange ein Bot-Blatt offen ist oder ein Kampf nachgespielt wird. Offene
   Blätter und Fenster gehen dabei zu – sonst stünde das neue Ziel verdeckt darunter –,
   außer der Schritt will sie stehen lassen (`lassen`) oder das Spiel ist vorbei. */
function fgPruefe() {
  if (!fgAn()) return;
  const st = fgSchritt();
  if (!st) return;
  if (st.zurueck && st.zurueck()) { fgNachholen(); return redraw(); }
  if (!st.fertig() || ui.botLock || ui.combat || ui.anim || ui.fg.timer) return;
  const id = st.id;
  const go = () => {
    ui.fg.timer = null;
    if (!fgAn() || S.fg.schritt !== id) return;
    const jetzt = fgSchritt();
    if (!jetzt.fertig() || ui.botLock || ui.combat || ui.anim) return;
    if (!jetzt.lassen && !S.over) { closeSheet(); closeModal(); }
    fgVor();
    redraw();
    const sc = $('tut-panel').querySelector('.tut-scroll');
    if (sc) sc.scrollTop = 0;
  };
  if (FG_AUTO_MS > 0 && !st.sofort && typeof setTimeout === 'function') ui.fg.timer = setTimeout(go, FG_AUTO_MS);
  else go();
}
// Spielende im Ersten Spiel: Sieg, was man gelernt hat, und wie es weitergeht
function fgSpielende() {
  const o = S.over, w = o.winner;
  const sieg = (o.winners || [w]).includes(FG_ICH);
  if (sieg) fgGeschafftMerken(S.fg.pfad);
  const titel = sieg ? T('Gewonnen!') : T('%s gewinnt.', civOf(S.players[w]).n);
  modal(T('Spielende'), `<p style="font-family:var(--serif);font-size:22px;margin:0 0 6px">${titel}</p>
    <p class="sub">${o.how}</p>
    <p class="sub">${T('Du kennst jetzt alles, was eine Partie braucht: gründen, wachsen, forschen samt Würfel, Handelsrouten, Armeen, Macht, Belagern und Flankieren – und einen der drei Wege zum Sieg.')}</p>
    ${fgEndeKnoepfe()}
    <button class="btn wide" id="go-menu">${T('Zurück zum Menü')}</button>`);
  fgKnoepfeVerdrahten($('ov-body'));
  $('go-menu').onclick = () => { store('hochciv.save', null); location.reload(); };
  confetti(civOf(S.players[w]).color);
}
// „Beenden" im Panel: erst fragen – danach läuft die Partie ohne Führung weiter
function fgBeenden() {
  if (S && S.over) { store('hochciv.save', null); location.reload(); return; }
  modal(T('Erstes Spiel beenden?'), `<p class="sub">${T('Die Partie läuft dann ohne Führung weiter, England spielt als KI.')}</p>
    <button class="btn primary wide" id="fg-bleiben">${T('Weiterspielen')}</button>
    <button class="btn wide" id="fg-aus">${T('Erstes Spiel beenden')}</button>`);
  $('fg-bleiben').onclick = closeModal;
  $('fg-aus').onclick = () => { closeModal(); fgAus(); };
}
function fgAus() {
  if (ui.fg && ui.fg.timer) clearTimeout(ui.fg.timer);
  ui.fg = null;
  if (S) delete S.fg;
  $('tut-panel').hidden = true;
  document.body.classList.remove('tut', 'fg');
  document.querySelectorAll('.fg-hl').forEach(el => el.classList.remove('fg-hl'));
  redraw();
  toast(T('Erstes Spiel beendet – die Partie läuft weiter.'));
}
