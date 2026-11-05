/* Hochzeivilization – Züge der KI und der Bots nachspielen (v94, Wunsch des Autors).

   „Animationen wie beim Kampf, aber für alles, was KI und Bots tun – damit man leichter folgen
   kann. Kein Blatt mehr zum Durchtippen; im Protokoll bleibt alles. Nach dem eigenen Zugende
   laufen alle Züge von KI und Bots durch, bis wieder ein Mensch dran ist. Die alte Fassung
   bleibt über „Keine Animationen" in den Einstellungen." Seit v95 dort als Auswahl
   „Animationen": Langsam (ab Werk), Schnell (der Takt von v94), Keine.

   Dieser Teil kennt keine Oberfläche (test.js lädt ihn): Er nimmt einen Zug auf und macht
   daraus Szenen. Gezeichnet und abgespielt wird in js/ui.js (playAnim, animMarks).

   Aufnahme (animAufnahme): Jede Aktion schreibt ins Protokoll, Klasse 'act' – forschen,
   gründen, wachsen, Armee bauen oder ziehen, Macht kaufen, Straßen … Genau dann wird der
   Kartenstand festgehalten (animSnap, über LOG_HOOK in engine.js), und zwar nur auf dem
   echten Spielstand, nicht auf den Wegwerfkopien, mit denen die KI plant (kiClone). Jede
   Aktion ändert den Stand, bevor sie ins Protokoll schreibt – das Bild zeigt also ihr
   Ergebnis.

   Szenen (animSzenen, seit v95): Jede Aktion ist eine Szene, so wie ein Mensch sie ausführt –
   jede gegründete Stadt, jede Technologie, jede gezogene Armee, jedes Straßenfeld für sich, in
   der Reihenfolge des Zugs (v94 fasste Gleiches zusammen; dem Autor war das zu viel auf
   einmal). Was die Aktion war, sagt der Unterschied zum Stand davor (animUnterschied) – oder,
   wo der täuschen würde, die Aktion selbst: `log(S, 'act', satz, art)` (eine Armee des Kolosses
   ist nicht „gebaut", das Pentagon „kauft" keine Macht). Gezeigt wird alles, was die Aktion
   geändert hat (animDetails): eine gezogene Armee gleitet vom Feld davor aufs neue. Was sich
   nicht zuordnen lässt, zeigt den Satz aus dem Protokoll. */

let ANIM_MS = 900;                     // Takt einer Szene bei „Schnell" (Langsam: × 1,5, ui.js); Tests: 0 = nichts abspielen

// Der Kartenstand, den eine Szene braucht: was gezeichnet wird und woran man Aktionen erkennt.
// Seit v96 mit dem Vorrat jedes Reichs (`res` kopiert – bis v95 teilten sich alle Bilder den
// lebenden Vorrat), für den laufenden Stand in der Kopfzeile (animKopf).
function animSnap(S) {
  const bought = {};
  for (const k in (S.bought || {})) bought[k] = (S.bought[k] || []).slice();
  return {
    cities: S.cities.map(c => Object.assign({}, c)),
    armies: S.armies.map(a => Object.assign({}, a)),
    roads: Object.assign({}, S.roads),
    bought,
    wonders: (S.wonders || []).map(w => Object.assign({}, w)),
    players: S.players.map(p => Object.assign({}, p, { techs: Object.assign({}, p.techs), res: Object.assign({}, p.res) })),
  };
}
/* Was die Kopfzeile während einer Szene zeigt (v96, Wunsch des Autors): „nicht nur das
   Einkommen, sondern einen laufenden Stand – mit einem −x, wann immer sie etwas tun". Also der
   Stand des Reichs NACH der Aktion – Vorrat, Macht, Bevölkerung (für die Zeile darunter) – und
   was sich gegenüber dem Stand davor geändert hat (`delta`: nur, was sich geändert hat; Gründen
   für 10 Nahrung mit 8 im Vorrat: { food: −8, coins: −4 }). Die Macht wie in der Kopfzeile
   (powerOf, mit Zuschlägen; bei Bots die Bevölkerung). Gerechnet aus den Bildern der Szene, der
   Spielstand selbst ist da längst am Ende des Zugs. */
const ANIM_KOPF = ['sci', 'food', 'coins', 'power'];
function animKopf(S, s) {
  const A = Object.assign({}, S, s.vor), B = Object.assign({}, S, s.nach);
  const wert = X => {
    const q = X.players[s.pi];
    return { sci: q.res.sci, food: q.res.food, coins: q.res.coins, power: powerOf(X, s.pi), deficit: q.foodDeficit || 0 };
  };
  const vor = wert(A), nach = wert(B), delta = {};
  for (const k of ANIM_KOPF) if (nach[k] !== vor[k]) delta[k] = nach[k] - vor[k];
  return { vor, nach, delta, pop: popOf(B, s.pi), welt: worldPop(B) };
}
/* `fn` ausführen und dabei aufnehmen: { vor, bilder: [{ m: Satz, art, snap }] }. Ein Fehler in
   `fn` geht weiter nach oben (runBots fängt ihn), der Haken ist dann trotzdem wieder ab. */
function animAufnahme(S, fn) {
  const rec = { vor: animSnap(S), bilder: [] };
  const alt = LOG_HOOK;
  LOG_HOOK = (S2, e) => { if (S2 === S && e.c === 'act') rec.bilder.push({ m: e.m, art: e.art, snap: animSnap(S) }); };
  try { fn(); } finally { LOG_HOOK = alt; }
  return rec;
}

const animKarten = list => new Map(list.map(x => [x.id, x]));
const animNeueStrassen = (A, B) => Object.keys(B.roads).filter(k => (B.roads[k] || 0) > (A.roads[k] || 0));
const animGekauft = (A, B, pi) => (B.bought[pi] || []).filter(k => !(A.bought[pi] || []).includes(k));
const animNeueWunder = (A, B) => B.wonders.filter(w => !A.wonders.some(x => x.k === w.k && x.lvl === w.lvl && x.owner === w.owner));
const animNeueTechs = (A, B, pi) => Object.keys(B.players[pi].techs).filter(k => B.players[pi].techs[k] && !A.players[pi].techs[k]);
/* Woran sich eine Aktion erkennen lässt – die erste Art, die zutrifft. */
function animUnterschied(A, B, pi) {
  const stA = animKarten(A.cities), arA = animKarten(A.armies), arB = animKarten(B.armies);
  if (B.cities.some(c => !stA.has(c.id))) return 'gruenden';
  if (B.armies.some(a => !arA.has(a.id))) return 'armee';
  if (B.armies.some(a => arA.has(a.id) && (arA.get(a.id).r !== a.r || arA.get(a.id).c !== a.c))) return 'zug';
  if (A.armies.some(a => !arB.has(a.id))) return 'atom';
  if (B.cities.some(c => stA.has(c.id) && c.pop > stA.get(c.id).pop)) return 'wachsen';
  if (B.cities.some(c => stA.has(c.id) && c.pop < stA.get(c.id).pop)) return 'opfer';
  if (animNeueStrassen(A, B).length) return 'strasse';
  if (animGekauft(A, B, pi).length) return 'feld';
  if (animNeueWunder(A, B).length) return 'wunder';
  if (animNeueTechs(A, B, pi).length) return 'forschen';
  if (B.players[pi].power !== A.players[pi].power) return 'macht';
  return 'sonst';
}
// Aus der Aufnahme eines Zugs (Reich pi) die Szenen: je Aktion eine, in der Reihenfolge des Zugs
function animSzenen(rec, pi) {
  let vor = rec.vor;
  return rec.bilder.map(b => {
    const s = { art: b.art || animUnterschied(vor, b.snap, pi), pi, vor, nach: b.snap, bild: b.snap, texte: [b.m] };
    animDetails(s);
    vor = b.snap;
    return s;
  });
}
/* Was eine Szene zeigt – alles, was die Aktion geändert hat: `felder` golden, `ringe` um Neues
   (Stadt, Armee, Wunder), `zuege` gleiten (von → nach), `marken` an Städten (+1, −1); dazu,
   was der Satz braucht (n, techs, wunder, macht, bahn). */
function animDetails(s) {
  const A = s.vor, B = s.nach, pi = s.pi;
  const stA = animKarten(A.cities), arA = animKarten(A.armies), arB = animKarten(B.armies);
  s.felder = []; s.zuege = []; s.marken = []; s.ringe = [];
  const feld = (r, c) => s.felder.push([r, c]);
  const neu = (r, c) => { feld(r, c); s.ringe.push([r, c]); };
  const staedte = B.cities.filter(c => !stA.has(c.id));
  staedte.forEach(c => neu(c.r, c.c));
  const armeen = B.armies.filter(a => !arA.has(a.id));
  armeen.forEach(a => neu(a.r, a.c));
  B.armies.forEach(a => {
    const o = arA.get(a.id);
    if (o && (o.r !== a.r || o.c !== a.c)) { s.zuege.push({ id: a.id, owner: a.owner, von: [o.r, o.c], nach: [a.r, a.c] }); feld(a.r, a.c); }
  });
  A.armies.filter(a => !arB.has(a.id)).forEach(a => feld(a.r, a.c));       // Atomschlag
  B.cities.forEach(c => {
    const o = stA.get(c.id);
    if (!o || o.pop === c.pop) return;
    feld(c.r, c.c);
    s.marken.push({ r: c.r, c: c.c, text: (c.pop > o.pop ? '+' : '−') + Math.abs(c.pop - o.pop) });
  });
  const strassen = animNeueStrassen(A, B);
  strassen.forEach(k => { const [r, c] = unkey(k); feld(r, c); });
  s.bahn = strassen.some(k => B.roads[k] >= 2);
  animGekauft(A, B, pi).forEach(k => { const [r, c] = unkey(k); feld(r, c); });
  s.wunder = animNeueWunder(A, B);
  s.wunder.forEach(w => neu(w.r, w.c));
  s.techs = animNeueTechs(A, B, pi);
  s.macht = [A.players[pi].power, B.players[pi].power];
  // ein Feld nur einmal
  const einmal = l => l.filter((x, i) => l.findIndex(y => y[0] === x[0] && y[1] === x[1]) === i);
  s.felder = einmal(s.felder); s.ringe = einmal(s.ringe);
  s.n = s.art === 'gruenden' ? staedte.length : s.art === 'armee' || s.art === 'gratisarmee' ? armeen.length
    : s.art === 'zug' ? s.zuege.length : s.art === 'wachsen' || s.art === 'opfer' ? s.marken.length
      : s.art === 'strasse' ? strassen.length : s.felder.length;
}
const animTechNamen = s => s.techs.map(k => (k === 'singularitaet' ? SINGULARITY : TECH_BY_KEY[k] || { n: k }).n).join(', ');
/* Der Satz zur Szene – erst beim Zeigen übersetzt (die Sprache kann wechseln). `wer` ist der
   Name samt „(KI)"/„(Bot)". */
function animText(s, wer) {
  const n = s.n;
  switch (s.art) {
    case 'gruenden': return n > 1 ? T('%s gründet %s Städte', wer, n) : T('%s gründet eine Stadt', wer);
    case 'armee': return n > 1 ? T('%s baut %s Armeen', wer, n) : T('%s baut eine Armee', wer);
    case 'gratisarmee': return T('%s erhält eine kostenlose Armee', wer);
    case 'zug': return n > 1 ? T('%s zieht %s Armeen', wer, n) : T('%s zieht eine Armee', wer);
    case 'wachsen': return n > 1 ? T('%s lässt %s Städte wachsen', wer, n) : T('%s lässt eine Stadt wachsen', wer);
    case 'opfer': return T('%s opfert Bevölkerung', wer);
    case 'strasse': return s.bahn ? T('%s baut Eisenbahn', wer) : n > 1 ? T('%s baut Straßen', wer) : T('%s baut eine Straße', wer);
    case 'feld': return T('%s kauft Land', wer);
    case 'wunder': return T('%s baut %s', wer, s.wunder.map(w => (WONDER_BY_KEY[w.k] || { n: w.k }).n).join(', '));
    case 'forschen': return T('%s erforscht %s', wer, animTechNamen(s));
    case 'kopieren': return T('%s kopiert %s', wer, animTechNamen(s));
    case 'macht': return T('%s kauft Macht – jetzt %s', wer, s.macht[1]);
    case 'atom': return T('%s zündet einen Atomschlag', wer);
    default: return s.texte[0];
  }
}
