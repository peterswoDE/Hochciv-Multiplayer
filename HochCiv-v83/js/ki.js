/* Hochzeivilization – KI: ein Gegner, der nach den Regeln für Menschen spielt.

   Bots (js/bots.js) spielen nach eigenen Regeln: sie zahlen nichts, würfeln gegen den
   Schwierigkeitsgrad, ihr Machtwert ist ihre Bevölkerung. Die KI dagegen ist ein Reich wie
   jedes menschliche: Einkommen, Kosten, Machtverlust, Zivilisationsfähigkeit, Ereignisse,
   Wunderwirkungen – alles gilt, weil sie nur die Aktionen benutzt, die auch die Oberfläche
   benutzt (foundCity, growCity, doResearch, buyPower, moveArmy …). Sie kann gar nicht
   schummeln: die Regelmaschine rechnet ihr jeden Preis ab wie einem Menschen.

   Wie sie entscheidet (Einzelheiten an den Funktionen):
   1. Lage einschätzen (kiContext): Restrunden, Bedrohung jeder eigenen Stadt durch jeden
      Gegner (größtmöglicher Angriff am Ende seines nächsten Zuges, exakt mit attackValue,
      defenseValue und den Reichweiten der Regelmaschine), Siegrennen.
   2. Zug planen (kiPlan): aus allen möglichen Aktionen Kandidaten bilden, jeden auf einer
      KOPIE des Spielstands mit der echten Regelmaschine ausführen, den Kampf am Zugende
      mitrechnen und das Ergebnis bewerten (kiValue). Die beste Aktion je eingesetzter
      Ressource wird wirklich ausgeführt, dann wird neu geplant – so lange, bis nichts
      Lohnendes mehr übrig ist. Ressourcen verfallen am Zugende, also wird nicht gespart.
   3. Armeen aufstellen (kiPositionArmies): was nicht verplant ist, schützt die Hauptstadt,
      steht an der Grenze oder rückt auf ein Angriffsziel vor.

   Fair: Die KI liest nie den Würfelstrom der Partie. Kopien bekommen einen eigenen
   Zufallswert, künftige Würfe kennt sie also so wenig wie ein Mensch. Das vorgewürfelte
   Ereignis der nächsten Runde (S.evNext) liest sie nicht – auch nicht mit dem Orakel, das
   ihr ohnehin nur eine Anzeige wäre. Beim Legen der Startplättchen sieht sie nur, was ein
   Mensch an ihrem Platz sähe. Öffentlich sind Karte, Städte, Armeen, Macht, Technologien
   und Verfügbarkeiten – das darf sie, wie jeder am Tisch, verwenden.

   Stufen (KI_LEVELS in data.js, Werte in KI_PARAMS): dieselben Regeln auf jeder Stufe.
   Leichtere Stufen übersehen Möglichkeiten, rechnen ungenauer (Rauschen in der
   Bewertung), vergreifen sich öfter und nehmen Gefahr und Angriffschancen weniger ernst. */

/* ------------------------------------------------------------------ Stufen */
/* Was die Stufen unterscheidet – alles Denkfehler, keine Regeln und keine Ressourcen:
   · see    Anteil der möglichen Aktionen, die sie je Planungsschritt überhaupt erwägt
            (jedes Mal neu gezogen – sie übersieht mal dies, mal das)
   · noise  Rauschen auf den Nutzen jeder Aktion (1,0: Faktor zwischen 0 und 2)
   · slip   Wahrscheinlichkeit, statt der besten eine der nächsten vier zu nehmen
   · defend / strike  wie ernst sie Gefahr für die eigenen Städte bzw. eine begonnene
            Belagerung nimmt
   · evals  Budget an Bewertungen je Zug (nur Tempo, kaum Stärke)
   Abgestimmt per Selbstspiel (gepaart) und gegen die Bot-Stufen, Zahlen in ANNAHMEN.md.
   Ziel: Leicht etwa wie ein Prinz-Bot, Mittel wie König, Schwer die volle Stärke; Leicht
   gibt dabei aus, was es hat – es wählt nur schlechter. Verworfen: weniger Schritte je Zug
   (ließ bis zu zwei Drittel der Ressourcen liegen) und ein kürzerer Horizont (wirkungslos). */
const KI_PARAMS = {
  leicht: { see: 0.25, noise: 1.0, slip: 0.5, defend: 0.25, strike: 0.2, evals: 600 },
  mittel: { see: 0.5, noise: 0.5, slip: 0.2, defend: 0.8, strike: 0.7, evals: 1000 },
  schwer: { see: 1, noise: 0, slip: 0, defend: 1, strike: 1, evals: 1000 },
};
const kiLevelOf = p => (p && KI_PARAMS[p.kiLevel]) ? p.kiLevel : KI_DEFAULT_LEVEL;

/* ------------------------------------------------------------------ Gewichte
   Alles wird in einer Einheit bewertet: „eine Wissenschaft Einkommen für eine Runde".
   Ein dauerhafter Einkommenszuwachs zählt über den Horizont (abgezinste Restrunden).
   Die Zahlen sind Startwerte; abgestimmt werden sie per Selbstspiel (siehe ANNAHMEN.md). */
const KI_W = {
  sci: 1.0, food: 1.05, coins: 0.8,   // Wert je Einkommenseinheit und Runde
  gamma: 0.86,                        // Abzinsung je Runde
  endRound: 11,                       // grobe Erwartung, wann eine Partie endet
  pop: 1.2,                           // Punkte, Siegschwelle, Verteidigung je Bevölkerung
  city: 3.0,                          // Wachstumsplatz je Stadt (Einkommen zählt extra)
  tech: 0.8,                          // Punkt je Technologie
  age: 2.2,                           // je erschlossenem Zeitalter eines Feldes
  army: 1.5,                          // Grundwert einer Armee (Abschreckung, Flanke)
  game: 2500,                         // Wert von Sieg bzw. Niederlage
  sciReserve: 3,                      // Wissenschaft außerhalb der Forschung zählt so viel mehr (kiPlan)
  preFloor: 0.02,                     // Rest-Gefahr, wenn sie nach einem ersten Treffer noch antworten kann (kiRisk)
  defPerm: 8,                         // je dauerhaftem Verteidigungspunkt im Ernstfall (kiDefPerm)
  // Preise für den Ressourcenverbrauch einer Aktion (Verhältnis Nutzen/Kosten)
  price: { sci: 1.0, food: 1.4, coins: 0.75 },
};

/* ------------------------------------------------------------------ Zufall
   Die KI hat einen eigenen Zufall (Rauschen der leichten Stufen, Gleichstände). Er steht
   im Spielstand (p.kiRng), damit eine geladene Partie genauso weiterläuft. Mit dem
   Würfelstrom der Partie (S.seed) hat er nichts zu tun. */
function kiRandom(p) {
  let s = (p.kiRng >>> 0) || 0x9E3779B9;
  s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  p.kiRng = s;
  return s / 4294967296;
}
function kiSeedRng(S, pi) {
  const p = S.players[pi];
  if (p.kiRng) return;
  // aus Dingen, die jede Partie anders macht, aber nichts über künftige Würfe verraten
  let h = 2166136261 ^ (pi + 1) * 16777619;
  const txt = S.map.rows.join('') + p.civ + Object.keys(p.avail).join('') + S.startIdx;
  for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619);
  p.kiRng = (h >>> 0) || 1;
}

/* ------------------------------------------------------------------ Kopien
   Eine Kopie des Spielstands zum Durchrechnen. Das Protokoll bleibt leer (spart Zeit), die
   Kartenzeilen sind Zeichenketten und werden nur flach kopiert. `seed` ist ein eigener
   Wert: würfelt die Regelmaschine in der Kopie (Verfügbarkeit nach einer Forschung), sind
   das nicht die Würfe, die in der echten Partie kämen. */
function kiCopy(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = kiCopy(v[i]); return a; }
  const o = {};
  for (const k in v) o[k] = kiCopy(v[k]);
  return o;
}
function kiClone(S, seed) {
  const C = {};
  for (const k in S) {
    if (k === 'log') C.log = [];
    else if (k === 'recipe') C.recipe = null;
    // Das vorgewürfelte Ereignis der nächsten Runde bleibt draußen: die KI liest es nie
    // (test.js prüft das mit einem Feld, das beim Lesen einen Fehler wirft)
    else if (k === 'evNext') C.evNext = null;
    else if (k === 'map') C.map = Object.assign({}, S.map, { rows: S.map.rows.slice() });
    else C[k] = kiCopy(S[k]);
  }
  C.seed = seed | 0;
  C.kiSim = true;          // Wegwerfkopie der Planung (siehe kiMove)
  return C;
}
const kiCity = (S, id) => S.cities.find(c => c.id === id);
/* Zug einer Armee. Auf dem echten Spielstand immer über moveArmy – die Regelmaschine prüft
   die Reichweite. Auf einer Wegwerfkopie der Planung wird direkt gesetzt, mit den Kosten
   aus der Reichweite, die für diesen Planungsschritt schon berechnet ist: moveArmy rechnete
   sie noch einmal aus, und mit Luftwaffe und Eisenbahn kostet das gut 0,5 ms je Zug – in
   einem gemessenen Zug über 7000-mal. */
function kiMove(X, a, r, c, cost) {
  if (!X.kiSim) return moveArmy(X, a, r, c);
  if (armyAt(X, r, c) || cityAt(X, r, c)) return 'Feld besetzt.';
  arriveAt(X, a, r, c, cost);          // wie moveArmy: in einer Kontrollzone endet die Bewegung
  spawnFreeArmies(X, a.owner);
  return null;
}
// Erstes freies Feld der Liste, auf das die Armee ziehen kann (Liste: [r, c, Kosten])
function kiMoveToFirst(X, a, tiles) {
  for (const t of tiles) {
    if (armyAt(X, t[0], t[1])) continue;
    if (!kiMove(X, a, t[0], t[1], t[2])) return true;
  }
  return false;
}
const kiArmy = (S, id) => S.armies.find(a => a.id === id);

/* ------------------------------------------------------------------ Kleine Rechnungen */
// Zahl der Wege, eine Einheit Macht zu verlieren: 1/2, mit Stahl 1/3, mit Panzer 1/4
const kiDecayDiv = p => has(p, 'panzer') ? 4 : has(p, 'stahl') ? 3 : 2;
// gekaufte Macht nach dem Machtverlust zu Beginn des nächsten eigenen Zuges
function kiPowerAfterDecay(S, pi) {
  const p = S.players[pi];
  if (p.kind === 'bot') return 0;
  const loss = Math.min(p.power, Math.ceil(powerOf(S, pi) / kiDecayDiv(p)));
  return p.power - loss;
}
// Machtzuschlag (Kriegerkultur, Zeusstatue) bei n Armeen – mit Burgenbau zählen bei
// Kriegerkultur auch die Städte (warriorUnits, wie powerBonus)
function kiPowerBonus(S, pi, n) {
  const p = S.players[pi];
  let b = 0;
  if (isAbil(p, 'armeemacht')) b += 2 * warriorUnits(S, pi, n);
  if (hasWonder(S, pi, 'zeus')) b += 3;
  return b;
}
// Kosten der k-ten weiteren Armee (k = 1 ist die nächste), wie armyCost
function kiArmyCostNth(S, pi, k) {
  const p = S.players[pi];
  let n = armiesOf(S, pi).length + k;
  if (hasAbil(p, 'wikinger', 'basis')) n = Math.max(0, n - 1);
  const mult = has(p, 'nationalismus') ? 2 : has(p, 'demokratie') ? 4 : 5;
  return mult * n;
}
/* Was ein GEGNER im nächsten Zug höchstens in Münzen (also in Macht und Armeen) stecken
   kann – wie kiCoinBudget, aber mit dem, was er in diesem Zug erst freischalten kann:
   Alchemie (Wissenschaft 1:1 in Münzen) erforscht er, wenn sie verfügbar ist, und tauscht
   im selben Zug. Bis v77 fehlte das: gemessen sprang das Budget Griechenlands so von 18 auf
   51 Münzen, und England hielt seine Hauptstadt mit Verteidigung 2 für sicher. Gilt nur für
   den entschlossenen Angreifer (kiDetermined). */
function kiThreatBudget(S, e) {
  const p = S.players[e];
  const inc = income(S, e);
  let b = kiCoinBudget(S, e, inc);
  const alch = TECH_BY_KEY.alchemie;
  if (alch && !has(p, 'alchemie') && p.avail.alchemie && !evActive(S, e, 'dunkles_zeitalter')) {
    const cost = techCost(S, e, alch);
    if (inc.sci >= cost) {
      const r = rates(S, e);
      const schon = r.sciToCoins !== Infinity ? Math.floor(Math.max(0, inc.sci) / r.sciToCoins) : 0;
      b += Math.max(0, inc.sci - cost) - schon;
    }
  }
  return b;
}
/* Münzbudget eines Reiches im nächsten Zug: sein Einkommen, samt dem, was sich über die
   Kurse in Münzen tauschen lässt (Alchemie, Handelsreich/Pyramiden). Obergrenze – wer
   alles in Macht steckt, gibt nichts anderes aus. */
function kiCoinBudget(S, pi, inc) {
  inc = inc || income(S, pi);
  const r = rates(S, pi);
  let b = Math.max(0, inc.coins);
  if (r.sciToCoins !== Infinity) b += Math.floor(Math.max(0, inc.sci) / r.sciToCoins);
  if (r.foodToCoins !== Infinity) b += Math.floor(Math.max(0, inc.food) / r.foodToCoins);
  return b;
}
// Angriffswert je Armee bei gegebenem Machtwert
function kiAttackPer(S, pi, power) {
  const p = S.players[pi];
  let per = power;
  if (has(p, 'belagerung')) per += 5;
  if (has(p, 'dynamit')) per *= 2;
  return per;
}
// Felder im Umkreis n (inklusive Mitte), nur echte Kartenfelder
function kiDisk(S, r, c, n) {
  const out = [[r, c]];
  for (const [rr, cc] of within(r, c, n)) {
    const t = terrainAt(S, rr, cc);
    if (t && !isOff(t)) out.push([rr, cc]);
  }
  return out;
}
/* Wohin kann eine Armee dieses Reiches von (r, c) aus mit mp Bewegung ziehen? Dieselbe
   Rechnung wie armyReach (Kontrollzonen, Anhalten, Straßen), aber für eine gedachte Armee –
   für die Frage „was kann der Gegner im nächsten Zug erreichen". Das Startfeld zählt mit,
   stehen bleiben ist ja erlaubt. */
function kiReachKeys(S, pi, r, c, mp) {
  const raw = reachable(r, c, mp,
    (rr, cc) => canPass(S, pi, rr, cc) ? (zocStop(S, pi, rr, cc) ? 'stop' : true) : false,
    (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2));
  const out = new Set();
  for (const k of raw.keys()) { const [rr, cc] = unkey(k); if (canStop(S, pi, rr, cc)) out.add(k); }
  if (!cityAt(S, r, c)) out.add(key(r, c));
  return out;
}

/* ------------------------------------------------------------------ Lage einschätzen */
/* Wie viele Runden bleiben voraussichtlich? Grundlage ist eine grobe Erwartung (KI_W.endRound),
   verkürzt, wenn irgendwer der Singularität nahe ist oder ein Sieg angemeldet wurde. */
function kiSingularityTurns(S, pi) {
  const p = S.players[pi];
  if (p.dead) return 99;
  if (p.kind === 'bot') {
    // Bots forschen zweimal je Runde auf gut Glück; grob: Zahl der fehlenden Zeitalter
    let miss = 0;
    for (let f = 0; f < 4; f++) {
      let a = -1;
      for (const t of techPool(S)) if (t.f === f && p.techs[t.k] && t.age > a) a = t.age;
      miss += 3 - a;
    }
    return 2 + miss * 1.2;
  }
  let need = 0;
  for (let f = 0; f < 4; f++) {
    let a = -1;
    for (const t of techPool(S)) if (t.f === f && p.techs[t.k] && t.age > a) a = t.age;
    for (let age = a + 1; age <= 3; age++) {
      const list = techsIn(f, age, S);
      if (!list.length) continue;
      const av = list.filter(t => p.avail[t.k] && !p.techs[t.k]);
      const pool = av.length ? av : list;
      need += Math.min(...pool.map(t => techCost(S, pi, t)));
    }
  }
  if (!p.techs.singularitaet) need += techCost(S, pi, SINGULARITY);
  else return 0;
  const inc = income(S, pi);
  const r = rates(S, pi);
  let perTurn = Math.max(1, inc.sci + Math.max(0, inc.coins) / r.coinsToSci * 0.6);
  // Einkommen wächst: grob 12 % je Runde
  let t = 0, sum = 0;
  while (sum < need && t < 40) { t++; sum += perTurn; perTurn *= 1.12; }
  return t;
}
function kiRemaining(S, pi) {
  let R = KI_W.endRound - S.round + 1;
  let fastest = 99;
  S.players.forEach((p, i) => { if (!p.dead && p.kind !== 'barbar') fastest = Math.min(fastest, kiSingularityTurns(S, i)); });
  R = Math.min(R, fastest + 1);
  if (S.endRound != null) R = 1;
  return Math.max(1, Math.min(12, R));
}
const kiHorizon = (R, g) => { let h = 0, f = 1; for (let t = 0; t < R; t++) { h += f; f *= g; } return h; };

/* Vorbereitung je Gegner für die Bedrohungsrechnung: wo seine Armeen im nächsten Zug stehen
   können, aus welchen Städten neue Armeen kämen, wie viel Macht er kaufen könnte. Einmal je
   Zug gerechnet – seine Lage ändert sich während des eigenen Zuges nur durch Flankieren und
   Eroberung, und beides sieht die Bewertung über S (die Armee ist dann einfach weg).
   Die Reichweiten gelten OHNE die Armeen der KI (pi) und ohne seine eigenen (v79): die der KI
   ziehen in ihrem Zug ja noch, und welche Felder sie am Ende besetzt, zählt erst die
   Bewertung (kiAttackSlots); seine eigenen machen einander im Zug Platz. Fremde Armeen
   Dritter bleiben stehen. Das überschätzt ihn eher – Sperren durch Kontrollzonen und Wege
   um eine Armee der KI herum sieht die Rechnung nicht. */
function kiEnemyInfo(S, e, pi) {
  const ep = S.players[e];
  const mp = moveAllowance(S, e);
  const info = {
    e, bot: ep.kind === 'bot', human: ep.kind === 'human',
    rng: attackRange(S, e), reach: new Map(), cityReach: [], armies: [],
    hits: new Map(),        // je Stadtfeld: welche Armeen und Städte herankommen (kiAttackPotential)
  };
  // S mit anderen Armeen, ohne etwas zu kopieren (und ohne S.evNext auch nur zu berühren)
  const S0 = Object.create(S, { armies: { value: S.armies.filter(a => a.owner !== pi && a.owner !== e) } });
  for (const a of armiesOf(S, e)) {
    info.reach.set(a.id, kiReachKeys(S0, e, a.r, a.c, mp));
    info.armies.push({ id: a.id, r: a.r, c: a.c });
  }
  for (const ct of citiesOf(S, e)) {
    if (armyAt(S, ct.r, ct.c)) continue;
    // Bots bauen nur in der Hauptstadt, und nur mit Glück
    if (info.bot && !ct.cap) continue;
    info.cityReach.push({ id: ct.id, r: ct.r, c: ct.c, keys: kiReachKeys(S0, e, ct.r, ct.c, mp) });
  }
  if (info.bot) {
    info.powerNow = powerOf(S, e);
    info.power = powerOf(S, e) + Math.ceil(citiesOf(S, e).length / 2);   // Bots wachsen
    info.newArmies = 1;
  } else {
    info.afterDecay = kiPowerAfterDecay(S, e);
    // zwei Budgets: das gewöhnliche (Einkommen, Umtausch mit den Technologien von jetzt) und
    // das eines entschlossenen Angreifers, der dafür noch Alchemie erforscht (kiDetermined)
    info.budget = kiCoinBudget(S, e);
    info.budgetHard = kiThreatBudget(S, e);
    info.price = powerPrice(S, e);
    info.powerNow = powerOf(S, e);
  }
  return info;
}
/* Größtmöglicher Angriff eines Gegners auf eine Stadt am Ende seines nächsten Zuges.
   Obergrenze: er steckt sein ganzes Münzbudget in Macht und neue Armeen. */
/* Wer kommt an eine Stadt heran – welche Armeen (schon in Reichweite oder im nächsten Zug)
   und aus welchen Städten eine neue Armee, und auf welche Felder in Reichweite der Stadt
   (`ring`)? Hängt nur an der Lage der Stadt und an den Lagen und Reichweiten zu Zugbeginn
   (info.armies, info.cityReach), also je Feld einmal gerechnet und gemerkt – und zwar nicht
   aus S: der erste Aufruf kann auf einer Kopie kommen, in der schon eine Armee fehlt.
   Gezählt wird danach auf S (kiAttackSlots); was dort wegflankiert, erobert oder von der
   KI besetzt ist, zählt nicht mit. (Vorher je Bewertung neu gerechnet – ein Zehntel der
   Rechenzeit.) */
function kiHits(S, info, city) {
  const ck = key(city.r, city.c);
  let hit = info.hits.get(ck);
  if (hit) return hit;
  const ring = kiDisk(S, city.r, city.c, info.rng).filter(([r, c]) => r !== city.r || c !== city.c).map(([r, c]) => ({ k: key(r, c), r, c }));
  const armies = new Map(), cities = new Map();
  for (const a of info.armies) {
    const ks = info.reach.get(a.id), tiles = ring.filter(t => ks.has(t.k)).map(t => t.k);
    if (tiles.length) armies.set(a.id, tiles);
  }
  for (const cr of info.cityReach) {
    const tiles = ring.filter(t => cr.keys.has(t.k)).map(t => t.k);
    if (tiles.length) cities.set(cr.id, tiles);
  }
  hit = { armies, cities, ring };
  info.hits.set(ck, hit);
  return hit;
}
/* Wie viele seiner Armeen passen an die Stadt (v79)? Armeen stapeln sich nicht: jede braucht
   ein eigenes Feld in Reichweite, und Felder mit fremden Armeen – auch denen der KI – oder
   Städten sind besetzt. Größte Paarung Armee ↔ freies Feld (augmentierende Wege, höchstens 18
   Felder): m0 mit den Armeen, die schon da sind, mAll mit neuen aus jeder Stadt dazu, die
   herankommt; `free` zählt die Felder, die ihm überhaupt offenstehen.
   Bis v78 zählte jede Armee, die irgendein Feld in Reichweite erreicht, als Angreifer – auch
   die fünfte an einer Stadt mit vier freien Nachbarfeldern. Dass eigene Armeen rund um die
   Stadt Plätze wegnehmen, sah die KI nicht; nachgestellt hielt sie eine Hauptstadt nur dann,
   wenn sie zufällig ein Nachbarfeld besetzt hatte und der Mensch mit einer Armee weniger kam. */
function kiAttackSlots(S, e, hit) {
  if (!hit.armies.size && !hit.cities.size) return { m0: 0, mAll: 0, nC: 0, free: 0 };
  const free = new Set();
  for (const t of hit.ring) {
    if (cityAt(S, t.r, t.c)) continue;
    const a = armyAt(S, t.r, t.c);
    if (a && a.owner !== e) continue;
    free.add(t.k);
  }
  const owner = new Map();   // Feld → Knoten (Armee oder Stadt), der es belegt
  const place = (node, seen) => {
    for (const k of node.tiles) {
      if (!free.has(k) || seen.has(k)) continue;
      seen.add(k);
      const o = owner.get(k);
      if (!o || place(o, seen)) { owner.set(k, node); return true; }
    }
    return false;
  };
  let m0 = 0;
  for (const [id, tiles] of hit.armies) {
    const a = kiArmy(S, id);
    if (a && a.owner === e && place({ tiles }, new Set())) m0++;
  }
  let mAll = m0, nC = 0;
  for (const [id, tiles] of hit.cities) {
    const ct = kiCity(S, id);
    if (!ct || ct.owner !== e) continue;
    nC++;
    if (place({ tiles }, new Set())) mAll++;
  }
  return { m0, mAll, nC, free: free.size };
}
function kiAttackPotential(S, info, city, hard) { return kiAttackWaves(S, info, city, hard).a1; }
/* Rechnet die KI mit einem entschlossenen Angreifer? Gegen Menschen ja: sie sehen eine
   schwache Hauptstadt und werfen alles hinein, auch Wissenschaft über Alchemie. Seit v79 gilt
   das nur noch im Ernstfall, bei laufender Belagerung (kiRisk) – vorher rechnet die KI auch
   gegen Menschen mild, sonst steckte sie zu viel in Vorsorge (Rückmeldung des Autors). Gegen
   KI und Bots gilt immer die mildere Schätzung: mit der harten gegen alle spielte sie zu
   viert deutlich schlechter (17 : 31; sie gab Städte zu früh verloren und verteidigte, wo
   niemand angriff), und ab laufender Belagerung änderte sie gegen die KI keine Partie
   (ANNAHMEN.md „Abwehr gegen Vorstöße"). */
const kiDetermined = (S, info, city) => info.human;
/* Die beiden Wellen eines Angriffs, jeweils das Höchste, was der Gegner aufbringen kann:
   a1 am Ende seines nächsten Zuges (erster Treffer), a2 am Ende des übernächsten – dann
   kommt zu der Macht, die ihm vom ersten Mal nach dem Machtverlust bleibt, ein zweites
   Budget dazu, und eine Armee mehr kann heran sein. So rechnet die KI beim entschlossenen
   Angreifer (hard, kiDetermined); sonst bleibt es bei der Schätzung bis v77, a2 = 1,3 × a1 + 2.
   Wer zweimal alles in Macht steckt, kommt auf gut das Anderthalbfache – mit der groben
   Schätzung verließ sich die KI auf eine Antwort nach dem ersten Treffer, die es nicht gab
   (ANNAHMEN.md „Abwehr gegen Vorstöße"). */
function kiAttackWaves(S, info, city, hard) {
  const e = info.e;
  const sl = kiAttackSlots(S, e, kiHits(S, info, city));
  const nE = sl.m0, nC = sl.nC;
  // Angreifer mit m neuen Armeen – höchstens so viele, wie Felder frei sind
  const fit = m => Math.min(nE + m, sl.mAll);
  if (info.bot) {
    const n = fit(Math.min(nC, info.newArmies));
    const a1 = n ? kiAttackPer(S, e, info.power) * n : 0;
    return { a1, a2: a1 ? a1 + 2 : 0, n1: n };
  }
  const ep = S.players[e], div = kiDecayDiv(ep), nOwn = armiesOf(S, e).length;
  const budget = hard ? info.budgetHard : info.budget;
  let a1 = 0, a2 = 0, n1 = 0, armyCost = 0;
  for (let m = 0; m <= nC; m++) {
    if (m > 0) armyCost += kiArmyCostNth(S, e, m);
    if (armyCost > budget) break;
    const n = fit(m);
    if (!n) continue;
    if (m > 0 && n === fit(m - 1)) break;   // kein Platz mehr: eine weitere Armee kostet nur
    const bonus = kiPowerBonus(S, e, nOwn + m);
    const bought = info.afterDecay + Math.floor((budget - armyCost) / info.price);   // gekaufte Macht nach Welle 1
    const x = kiAttackPer(S, e, bought + bonus) * n;
    if (x > a1) { a1 = x; n1 = n; }
    // Welle 2: Machtverlust zu Beginn seines übernächsten Zuges, dann ein neues Budget –
    // wahlweise mit einer weiteren Armee
    const keep = bought - Math.min(bought, Math.ceil((bought + bonus) / div));
    for (let k = 0; k <= 1; k++) {
      if (k && n + 1 > sl.free) break;         // auch in zwei Zügen nur so viele, wie Felder frei sind
      const cost2 = k ? kiArmyCostNth(S, e, m + 1) : 0;
      if (cost2 > budget) break;
      const pw2 = keep + Math.floor((budget - cost2) / info.price) + kiPowerBonus(S, e, nOwn + m + k);
      a2 = Math.max(a2, kiAttackPer(S, e, pw2) * (n + k));
    }
  }
  return { a1, a2: hard ? a2 : (a1 ? a1 * 1.3 + 2 : 0), n1 };
}
/* Größtmögliche Verteidigung, die ein Reich in seinem nächsten Zug an einer Stadt aufbauen
   kann: Macht kaufen (zählt je Armee in Reichweite und mit Burgenbau einmal mehr), eine
   neue Armee in der Stadt selbst, Wachstum. Obergrenze – wie oben. `room` (v79): wie viele
   eigene Armeen dann überhaupt in Reichweite Platz haben – nach einem ersten Treffer stehen
   dort ja seine Angreifer (kiRingRoom). */
function kiDefensePotential(S, oi, city, budgetIn, room) {
  const o = S.players[oi];
  if (o.kind === 'barbar') return city.pop;
  const d0 = defenseValue(S, city);
  if (o.kind === 'bot') return d0 + 2;                    // Bots kaufen nichts, wachsen aber
  const rng = projectRange(S, oi);
  let helpers = 0;
  for (const a of armiesOf(S, oi)) if (hexDistance(a.r, a.c, city.r, city.c) <= rng) helpers++;
  // Armeen, die in einem Zug in Reichweite kommen könnten
  let comers = 0;
  const mp = moveAllowance(S, oi);
  for (const a of armiesOf(S, oi)) {
    const d = hexDistance(a.r, a.c, city.r, city.c);
    if (d > rng && d <= mp + rng) comers++;
  }
  const castle = has(o, 'burgenbau') ? 1 : 0;
  const budget = budgetIn != null ? budgetIn : kiCoinBudget(S, oi);
  const price = powerPrice(S, oi);
  const afterDecay = kiPowerAfterDecay(S, oi);
  const pNow = powerOf(S, oi);
  let best = d0;
  for (let m = 0; m <= 1; m++) {
    const cost = m ? kiArmyCostNth(S, oi, 1) : 0;
    if (cost > budget) break;
    const x = Math.floor((budget - cost) / price);
    const pw = afterDecay + x + kiPowerBonus(S, oi, armiesOf(S, oi).length + m);
    let arm = helpers + comers + m;
    if (room != null) arm = Math.max(helpers, Math.min(arm, room));
    const mult = arm + castle;
    // d0 enthält die jetzige Macht bereits; ersetzen durch die neue
    const base = d0 - pNow * (helpers + castle);
    best = Math.max(best, base + pw * mult + (growLimits(S, oi).paid) * (has(o, 'maschinengewehr') ? 3 : 1));
  }
  return best;
}

/* Felder in Reichweite der eigenen Stadt, auf denen eine Armee stehen kann (Land, keine
   Stadt, keine Armee eines Dritten) – Platz für eigene Helfer und seine Angreifer zusammen. */
function kiRingRoom(S, pi, city, e) {
  let n = 0;
  for (const [r, c] of within(city.r, city.c, projectRange(S, pi))) {
    if (r === city.r && c === city.c) continue;
    const t = terrainAt(S, r, c);
    if (!t || isOff(t) || !TERRAIN[t].land || TERRAIN[t].block || cityAt(S, r, c)) continue;
    const a = armyAt(S, r, c);
    if (a && a.owner !== pi && a.owner !== e) continue;
    n++;
  }
  return n;
}
function kiContext(S, pi) {
  const p = S.players[pi];
  const K = { pi, lvl: KI_PARAMS[kiLevelOf(p)], w: KI_W };
  K.R = kiRemaining(S, pi);
  K.H = kiHorizon(K.R, KI_W.gamma);
  K.enemies = S.players.map((q, i) => i).filter(i => i !== pi && !S.players[i].dead && S.players[i].kind !== 'barbar');
  K.info = new Map();
  K.budget = new Map();
  for (const e of K.enemies) { K.info.set(e, kiEnemyInfo(S, e, pi)); K.budget.set(e, kiCoinBudget(S, e)); }
  // Ernstfall: eine eigene Stadt wird schon belagert (der erste Treffer saß)
  K.besieged = citiesOf(S, pi).filter(c => K.enemies.some(e => (S.sieges[e + '|' + c.id] || 0) >= 1));
  K.emergency = K.besieged.length > 0;
  // Wert des Spiels: groß gegen alles andere, aber endlich – eine sichere Stadt ist nicht
  // unendlich viel Macht wert
  K.vGame = KI_W.game;
  return K;
}

/* ------------------------------------------------------------------ Bewertung */
/* Wert, den eine Technologie über ihre Ertragswirkung hinaus hat (die Erträge selbst stecken
   schon im Einkommen). Grobe, lesbare Schätzungen je Wirkung – abgestimmt per Selbstspiel. */
function kiTechBonus(S, pi, k, K, y) {
  const p = S.players[pi];
  const cities = citiesOf(S, pi).length;
  const H = K.H;
  switch (k) {
    case 'keramik': return 0.5 * H * Math.min(cities, 6);
    case 'verbundwerkstoffe': return cities * H * Math.max(1, H) / 3;
    case 'dampfmaschine': return 0.35 * H * cities * Math.max(1, popOf(S, pi) / Math.max(1, cities));
    case 'rad': return 1.2 * H * Math.max(0, cities - 1) + 2;
    case 'eisenbahn': return 1.0 * H * Math.max(0, cities - 1) + 2;
    case 'navigation': return 5;
    case 'kartografie': return 1.5 * Math.max(0, 7 - cities) + 1;
    case 'alchemie': return 0.12 * H * Math.max(0, y.sci) + 2;
    case 'gilden': return 0.12 * H * Math.max(0, y.coins) + 2;
    case 'computertechnik': return 0.2 * H * Math.max(0, y.coins) + 3;
    case 'wiss_methode': return 18 + 4 * Math.min(4, H);
    case 'philosophie': return 3 + 0.6 * H;
    case 'theologie': case 'un': return 3;
    case 'sklaverei': return 2;
    case 'kolonialismus': return 4;
    case 'demokratie': return 2 + armiesOf(S, pi).length;
    case 'nationalismus': return 3 + 1.5 * armiesOf(S, pi).length;
    case 'eisenverarbeitung': return 3;
    case 'gewehre': return 4;
    case 'stahl': case 'panzer': return 1 + 0.25 * p.power;
    // Im Ernstfall zählt dazu, dass sie bleiben (kiDefPerm) – gekaufte Macht verfällt
    case 'stadtmauern': return 4 + 1.5 * cities + kiDefPerm(K, () => 5);
    // Kriegerkultur (v83): mit Burgenbau gibt jede Stadt dauerhaft +2 Macht
    case 'burgenbau': return 4 + cities + (isAbil(p, 'armeemacht') ? 1.5 * cities : 0) +
      kiDefPerm(K, () => Math.max(2, p.power + (isAbil(p, 'armeemacht') ? 2 * cities : 0)));
    case 'maschinengewehr': return 3 + cities + kiDefPerm(K, c => 2 * c.pop);
    case 'schiesspulver': return 3;
    case 'taktik': return 3;
    case 'belagerung': return 4;
    case 'dynamit': return 3;
    case 'raketentechnik': return 3;
    case 'panzerschiff': return 3;
    case 'luftwaffe': return 4;
    case 'atomwaffen': return 3;
    case 'militaerlogistik': return 1;
    case 'rittertum': case 'militaergericht': return 1;
    case 'kundschafterei': case 'spionage': return 2 + 0.5 * Math.min(8, kiCopyCount(S, pi));
    case 'internet': return 3 + 0.3 * H * Math.min(3, kiCopyCount(S, pi));
    case 'massenmedien': case 'gentechnik': return 0.3 * H * Math.min(popOf(S, pi), 20) / 2 + 3;
    case 'wallfahrt': case 'baukraene': case 'raumfahrt': return S.wo ? 3 : 0;
    default: return 0;
  }
}
/* Verteidigung, die bleibt (v79): Stadtmauern, Burgenbau und Maschinengewehr stärken eine
   belagerte Stadt auch in den Zügen danach, gekaufte Macht verfällt zur Hälfte. Die Bewertung
   schaut aber nur auf den nächsten Angriff – hielt dafür schon Macht, war die Technologie
   nichts mehr wert, und die KI erforschte im Ernstfall kaum Verteidigung (nachgestellt: in
   13 von 18 Fällen blieb eine bezahlbare liegen). Deshalb im Ernstfall je dauerhaftem Punkt
   an der stärksten belagerten Stadt KI_W.defPerm dazu. `gain(Stadt)` = Punkte für diese Stadt. */
function kiDefPerm(K, gain) {
  if (!K.besieged || !K.besieged.length) return 0;
  return KI_W.defPerm * Math.max(...K.besieged.map(gain));
}
function kiCopyCount(S, pi) {
  const p = S.players[pi], seen = new Set();
  S.players.forEach((o, i) => { if (i !== pi) for (const k in o.techs) if (o.techs[k] && !p.techs[k] && TECH_BY_KEY[k]) seen.add(k); });
  return seen.size;
}
// Wert der Zeitalter: je Feld das höchste erreichte Zeitalter, mit wachsendem Zuschlag
const KI_AGE_VALUE = [0, 1, 2.3, 3.8, 5.6];
function kiProgress(S, pi, K) {
  const p = S.players[pi];
  let v = 0, ready = 0;
  for (let f = 0; f < 4; f++) {
    let a = -1;
    for (const t of techPool(S)) if (t.f === f && p.techs[t.k] && t.age > a) a = t.age;
    v += KI_AGE_VALUE[a + 1];
    if (a === 3) ready++;
  }
  // späte Partie: Zeitalter zählen mehr, die Singularität rückt näher
  const late = Math.min(1.8, 0.6 + S.round / 10);
  return K.w.age * v * late + (ready === 4 ? 25 : 0);
}
/* Wie viel bringt eine Stadt? Ihr Anteil am Einkommen (Umland, das keine andere eigene Stadt
   berührt, und die Bevölkerung) über den Horizont, dazu die Bevölkerung selbst. */
function kiCityValue(S, pi, city, K) {
  const y = cityPopYield(S, pi);
  let v = (y[0] * K.w.sci + y[1] * K.w.food + y[2] * K.w.coins) * city.pop;
  for (const [r, c] of neighbors(city.r, city.c)) {
    const t = terrainAt(S, r, c);
    if (!t || isOff(t) || cityAt(S, r, c)) continue;
    const ty = tileYield(S, pi, t);
    v += ty[0] * K.w.sci + ty[1] * K.w.food + ty[2] * K.w.coins;
  }
  return Math.max(2, v * K.H + city.pop * K.w.pop + K.w.city);
}
/* Bedrohung der eigenen Städte. Je Stadt und Gegner zwei Zahlen für den Angriff am Ende
   seines nächsten Zuges: das Mindeste (Armeen, die ohnehin hinkommen, mit der Macht, die
   ihm nach dem Machtverlust bleibt) und das Höchste (dazu neue Armeen und sein ganzes
   Münzbudget in Macht) – beide mit so vielen Angreifern, wie Felder an der Stadt frei sind
   (kiAttackSlots). Liegt die eigene Verteidigung dazwischen, sinkt die Gefahr mit jedem
   Punkt.
   · Läuft schon eine Belagerung (Zähler 1), wäre der nächste Treffer die Eroberung: der
     Ernstfall, siehe kiSiegeChance.
   · Sonst wäre es erst der erste Treffer; gefährlich wird er, wenn man im eigenen Zug
     danach nicht genug nachlegen kann (kiDefensePotential gegen seinen zweiten Angriff).
     Kann man es, bleibt nur eine kleine Rest-Gefahr (KI_W.preFloor). */
const kiSig = x => 1 / (1 + Math.exp(-x));
function kiAttackMin(S, info, city) {
  const e = info.e;
  const n = kiAttackSlots(S, e, kiHits(S, info, city)).m0;
  if (!n) return 0;
  const pw = info.bot ? info.powerNow : info.afterDecay + kiPowerBonus(S, e, armiesOf(S, e).length);
  return kiAttackPer(S, e, pw) * n;
}
function kiCaptureChance(aMax, aMin, d) {
  if (aMax <= d) return 0;
  const s = Math.max(1.5, 0.12 * aMax);
  // unterhalb des Mindestangriffs sicher, darüber steil zum Höchstwert hin
  return aMin > d ? 1 : kiSig((aMax - d) / s - 1.2);
}
/* Läuft die Belagerung schon (der erste Treffer saß), rechnet die KI anders (v79): wie stark
   der zweite Angriff wird, ist offen – irgendwo zwischen dem, was ohne einen Kauf ohnehin
   kommt (aMin), und allem, was der Angreifer aufbringen kann (aMax). Gleich verteilt
   angenommen, senkt jeder Punkt Verteidigung und jede weggeflankte Armee die Gefahr. Mit
   der steilen Kurve oben sah die KI eine Lage, die sie nicht ganz halten konnte, als
   verloren an und tat zu wenig (Rückmeldung des Autors). */
function kiSiegeChance(aMax, aMin, d) {
  if (aMax <= d) return 0;
  if (aMin > d) return 1;
  return Math.min(1, (aMax - d) / Math.max(1, aMax - aMin));
}
/* Liefert zweierlei: `cities` – was an den übrigen Städten auf dem Spiel steht (Wert ×
   Wahrscheinlichkeit) – und `pCap`, die Wahrscheinlichkeit, die Hauptstadt zu verlieren
   (fällt sie, ist die Partie verloren; kiValue rechnet sie mit dem Wert des Spiels). */
function kiRisk(S, pi, K, myBudget) {
  let risk = 0, pCap = 0;
  for (const city of citiesOf(S, pi)) {
    const d = defenseValue(S, city);
    let pCity = 0;
    for (const e of K.enemies) {
      const info = K.info.get(e);
      if (!info || S.players[e].dead) continue;
      const siege = (S.sieges[e + '|' + city.id] || 0) >= 1;
      let pc;
      if (siege) {
        // Ernstfall: der zweite Treffer entscheidet. Gegen Menschen mit dem entschlossenen
        // Angreifer gerechnet, gleich verteilt zwischen aMin und aMax (kiSiegeChance)
        const w = kiAttackWaves(S, info, city, kiDetermined(S, info, city));
        pc = w.a1 <= d ? 0 : kiSiegeChance(w.a1, kiAttackMin(S, info, city), d);
      } else {
        // Vorher (v79): für alle die milde Schätzung wie bis v77. Mit der harten gegen
        // Menschen (v78) steckte die KI zu viel in Vorsorge, solange nur gedroht wurde.
        const w = kiAttackWaves(S, info, city, false);
        if (w.a1 <= d) continue;
        const pNow = kiCaptureChance(w.a1, kiAttackMin(S, info, city), d);
        // erster Treffer: danach bleibt ein Zug zum Nachlegen – gegen seine zweite Welle, und
        // die Felder, auf denen dann seine Angreifer stehen, sind für eigene Helfer verloren
        const resp = kiDefensePotential(S, pi, city, myBudget, kiRingRoom(S, pi, city, e) - w.n1);
        const pNoResp = w.a2 <= resp ? K.w.preFloor : kiSig((w.a2 - resp) / Math.max(1.5, 0.12 * w.a2) - 0.5);
        pc = pNow * pNoResp * (city.cap ? 0.8 : 0.5);
      }
      if (!pc) continue;
      pCity = 1 - (1 - pCity) * (1 - pc);
    }
    if (!pCity) continue;
    if (city.cap) pCap = 1 - (1 - pCap) * (1 - pCity);
    else risk += kiCityValue(S, pi, city, K) * K.lvl.defend * pCity;
  }
  return { cities: risk, pCap: Math.min(1, pCap * K.lvl.defend) };
}
/* Angriff: Städte, an denen nach dem Kampf dieses Zuges der eigene Belagerungszähler auf 1
   steht. Wie viel das wert ist, hängt daran, ob der zweite Treffer im nächsten Zug kommt –
   gegen die beste Antwort des Gegners (kiDefensePotential) und mit dem, was man selbst im
   nächsten Zug aufbringen kann. Eroberungen selbst sieht die Bewertung direkt: die Stadt
   gehört dann einem, oder das Spiel ist gewonnen. */
function kiOffense(S, pi, K, myBudget) {
  let v = 0;
  const me = S.players[pi];
  if (me.dead) return 0;
  for (const city of S.cities) {
    if (city.owner === pi) continue;
    const sk = S.sieges[pi + '|' + city.id] || 0;
    if (sk < 1) continue;
    const atk = attackersOn(S, pi, city).length;
    if (!atk) continue;
    const owner = S.players[city.owner];
    const dMax = kiDefensePotential(S, city.owner, city, K.budget.has(city.owner) ? K.budget.get(city.owner) : null);
    const pw = kiPowerAfterDecay(S, pi) + Math.floor(myBudget / powerPrice(S, pi)) + kiPowerBonus(S, pi, armiesOf(S, pi).length);
    let aMax = kiAttackPer(S, pi, pw) * atk;
    // Flankenrisiko: kann der Gegner meine Belagerer mit mehr Macht wegflankieren? Dann
    // fällt im schlimmsten Fall ein Angreifer weg.
    if (owner.kind !== 'bot' && owner.kind !== 'barbar') {
      const theirMax = kiPowerAfterDecay(S, city.owner) + Math.floor((K.budget.get(city.owner) || 0) / powerPrice(S, city.owner));
      if (theirMax > powerOf(S, pi) && atk > 0) aMax = kiAttackPer(S, pi, pw) * (atk - 1);
    }
    const pCap = aMax <= 0 ? 0 : kiSig((aMax - dMax) / Math.max(1.5, 0.12 * Math.max(aMax, dMax)) + 0.3);
    const value = city.cap && owner.kind !== 'barbar' ? K.vGame : kiCityValue(S, pi, city, K) * 0.8;
    v += pCap * value * K.lvl.strike;
  }
  return v;
}
/* Sieg: angemeldete Ansprüche, Anteil an der Weltbevölkerung, Wunder der Stufe 3. */
function kiVictory(S, pi, K) {
  const p = S.players[pi];
  if (S.over) {
    const w = S.over.winners || [S.over.winner];
    return w.includes(pi) ? K.vGame * (w.length > 1 ? 0.6 : 1) : -K.vGame;
  }
  let v = 0;
  if ((S.claims || []).some(c => c.pi === pi)) v += K.vGame * 0.7;
  // Wirtschaftssieg: Anteil an der Schwelle, steil zum Ende hin. Geprüft wird zu Beginn
  // der nächsten Runde (v83); der aktuelle Anteil ist dafür die beste Schätzung.
  const w = worldPop(S);
  if (w > 0) {
    const o = victoryOption(S, p);
    const share = popOf(S, pi) / w;
    const q = Math.min(1.2, share / o.frac);
    v += 40 * Math.pow(q, 6);
  }
  // Kultursieg: Stufe 3 gebaut
  if (S.wo && p.cultureWin != null) v += K.vGame * 0.5;
  return v;
}
/* Der Wert eines Spielstands für Reich pi. Nicht enthalten: übrige Ressourcen – sie verfallen
   am Zugende und sind nur so viel wert, wie man mit ihnen noch anfängt. */
function kiValue(S, pi, K) {
  const p = S.players[pi];
  if (p.dead || !citiesOf(S, pi).length) return -K.vGame;
  const y = baseIncome(S, pi);
  const food = canFeed(p) ? Math.max(0, y.food) : y.food;
  let v = K.H * (K.w.sci * y.sci + K.w.food * food + K.w.coins * y.coins);
  const cities = citiesOf(S, pi);
  v += K.w.pop * popOf(S, pi) + K.w.city * cities.length;
  let nt = 0;
  for (const k in p.techs) if (p.techs[k]) { nt++; v += kiTechBonus(S, pi, k, K, y); }
  v += K.w.tech * nt;
  v += kiProgress(S, pi, K);
  v += K.w.army * Math.min(armiesOf(S, pi).length, 2 + cities.length);
  const myBudget = kiCoinBudget(S, pi, y);
  const risk = kiRisk(S, pi, K, myBudget);
  // Die Hauptstadt zählt mit dem Wert des Spiels. Gemessen und verworfen (v78): alles andere
  // nur mit der Wahrscheinlichkeit zu zählen, dass sie steht – „wer die Hauptstadt verliert,
  // dem nützt keine neue Stadt". Gegen Menschen half das kaum (21 statt 20 gefallene
  // Hauptstädte in 187 Stellungen), gegen die KI verlor sie damit deutlich öfter (Duell
  // gepaart 25 : 35) – vermutlich, weil auch eigene Angriffe nur noch mit dieser
  // Wahrscheinlichkeit zählten, solange die eigene Hauptstadt bedroht war.
  v -= risk.cities + risk.pCap * K.vGame;
  v += kiOffense(S, pi, K, myBudget);
  v += kiVictory(S, pi, K);
  if (S.wo) v += kiWonderValue(S, pi, K);
  return v;
}
function kiWonderValue(S, pi, K) {
  let v = 0;
  const p = S.players[pi];
  for (const w of wondersOf(S, pi)) {
    v += 2;                                         // ein Punkt im Vergleich
    switch (w.k) {
      case 'mauer': v += 4 + citiesOf(S, pi).length; break;
      case 'orakel': v += 1; break;
      case 'stonehenge': v += 2; break;
      case 'palast': v += S.ev ? 8 : 0; break;
      case 'himeji': v += 3; break;
      case 'zeus': v += 4; break;
      case 'kreml': v += 2; break;
      default: break;
    }
  }
  // Fortschritt zur Pyramide für den Kultursieg
  const c = wonderCounts(S, pi);
  v += 3 * Math.min(c[1], 3) + 6 * Math.min(c[2], 2);
  if (p.kind === 'ki' && c[3] > 0) v += 30;
  return v;
}

/* Bewertung nach dem Zug: auf einer Wegwerfkopie die Kampfphase durchrechnen
   (Belagerungen, Flankieren, Wirtschaftssieg), dann kiValue. So sieht die Bewertung, was
   eine Aktion am Zugende auslöst. X wird dabei verändert – nur mit Kopien aufrufen. */
function kiScore(X, pi, K) {
  if (!X.over) combatPhase(X, pi);      // Wirtschaftssieg: erst zu Rundenbeginn (v83)
  return kiValue(X, pi, K);
}
const kiValueAfterCombat = (S, pi, K, seed) => kiScore(kiClone(S, seed), pi, K);

/* ------------------------------------------------------------------ Kandidaten */
/* Jeder Kandidat ist eine kleine Folge von Aktionen der Regelmaschine. `run(S)` führt sie
   aus – auf einer Kopie zum Bewerten und danach, falls gewählt, auf dem echten Spielstand.
   Städte und Armeen werden deshalb über ihre id angesprochen, nie über das Objekt. */
/* `billig`: nur, was der Planer nach aufgebrauchtem Budget noch erwägt (KI_BATCH und
   Gründungen) – Militär, Wunder und Sklaverei werden dann gar nicht erst gebildet. */
function kiCandidates(S, pi, K, memo, billig) {
  const p = S.players[pi];
  const out = [];
  const add = (label, run, tag) => out.push({ label, run, tag });

  // --- Forschung (auch die Singularität), kostenlose Techs
  if (!evActive(S, pi, 'dunkles_zeitalter')) {
    const sci = available(S, pi, 'sci');
    for (const t of researchable(S, pi))
      if (techCost(S, pi, t) <= sci)
        add(() => T('forscht %s', t.n), X => doResearch(X, pi, t.k), 'tech:' + t.k);
  }
  for (const t of freeTechOptions(S, pi))
    add(() => T('Freie Forschung: %s', t.n), X => useFreeTech(X, pi, t.k), 'free:' + t.k);
  for (const t of backPickOptions(S, pi))
    add(() => T('Rückschau: %s', t.n), X => useBackPick(X, pi, t.k), 'back:' + t.k);
  for (const t of freePickOptions(S, pi))
    add(() => T('gratis: %s', t.n), X => useFreePick(X, pi, t.k), 'pick:' + t.k);
  // --- Kopieren
  for (const o of copyableTechs(S, pi)) {
    if (o.freeOk) add(() => T('kopiert %s', o.tech.n), X => copyTech(X, pi, o.tech.k, 'free'), 'copyf:' + o.tech.k);
    if (o.paidCoins != null && available(S, pi, 'coins') >= o.paidCoins)
      add(() => T('kopiert %s', o.tech.n), X => copyTech(X, pi, o.tech.k, 'paid'), 'copyp:' + o.tech.k);
  }
  // --- Wachstum
  for (const city of citiesOf(S, pi)) {
    const id = city.id;
    if (freeGrowthAvailable(S, pi, city) && !growBlockReason(S, pi, city))
      add(() => T('Stadt wächst kostenlos'), X => growCity(X, pi, kiCity(X, id), 'free'), 'gfree:' + id);
    if (!canGrowPaid(S, pi, city))
      add(() => T('Stadt wächst'), X => growCity(X, pi, kiCity(X, id), 'paid'), 'grow:' + id);
    else if (canFeed(p) && paidGrowthAvailable(S, pi, city) && !growBlockReason(S, pi, city))
      add(() => T('Stadt wächst'), X => { kiFeedFor(X, pi, growPrice(X, pi, kiCity(X, id)).food); return growCity(X, pi, kiCity(X, id), 'paid'); }, 'grow:' + id);
  }
  // --- Städte gründen: die besten erreichbaren Plätze
  for (const s of kiSites(S, pi, K, memo).slice(0, 6)) {
    add(() => T('gründet eine Stadt auf %s/%s', s.r, s.c), X => {
      if (canFeed(X.players[pi])) kiFeedFor(X, pi, foundCost(X, pi, s.r, s.c));
      return foundCity(X, pi, s.r, s.c);
    }, 'found:' + s.r + ',' + s.c);
  }
  // --- Straßen: Handelsrouten zur Hauptstadt
  if (canBuildRoads(p)) for (const plan of kiRoadPlans(S, pi).slice(0, 4))
    add(plan.label, X => kiBuildRoadPlan(X, pi, plan), plan.tag);
  // --- Sklaverei: Bevölkerung gegen 10 Münzen
  if (!billig && slaveryUsable(p)) for (const city of citiesOf(S, pi))
    if (city.pop >= 2 && city.sacrificed !== S.round) {
      const id = city.id;
      add(() => T('opfert Bevölkerung'), X => sacrifice(X, pi, kiCity(X, id)), 'slave:' + id);
    }
  // --- Kolonialismus: herrenlose Felder mit gutem Ertrag
  if (has(p, 'kolonialismus') && available(S, pi, 'coins') >= COLONY_COST)
    for (const t of kiColonySpots(S, pi).slice(0, 3))
      add(() => T('kauft Feld %s/%s', t[0], t[1]), X => buyTile(X, pi, t[0], t[1]), 'col:' + t[0] + ',' + t[1]);
  // --- Weltwunder
  if (S.wo && !billig) for (const w of availableWonders(S)) {
    const city = kiWonderCity(S, pi, w.k);
    if (city && !canBuildWonder(S, pi, city, w.k)) {
      const id = city.id;
      add(() => T('baut %s', w.n), X => buildWonder(X, pi, kiCity(X, id), w.k), 'wonder:' + w.k);
    }
  }
  // --- Militär: Verteidigung, Angriff, Flankieren, Macht
  if (!billig) for (const m of kiMilitaryCandidates(S, pi, K, memo)) out.push(m);
  return out;
}
/* Mit Massenmedien (1 Münze ernährt 3) oder Gentechnik (1 Wissenschaft ernährt 1) Nahrung
   freimachen, bevor Nahrung gebraucht wird. Massenmedien ist fast immer der bessere Kurs
   als der normale Tausch (2 Münzen = 1 Nahrung). */
function kiFeedFor(S, pi, need) {
  const p = ensureFoodState(S, pi);
  let short = need - p.res.food;
  if (short <= 0) return;
  if (has(p, 'massenmedien') && popOpen(p) > 0 && p.res.coins > 0)
    coverPop(S, pi, 'coins', Math.ceil(short / FEED_COIN_RATE));
  short = need - p.res.food;
  if (short > 0 && has(p, 'gentechnik') && popOpen(p) > 0 && p.res.sci > 0)
    coverPop(S, pi, 'sci', short);
}

/* Siedelplätze: alle Felder, auf denen gegründet werden darf, mit ihrem Ertrag (settleGain)
   und ihren Kosten. Die Wege werden in EINER Breitensuche von der Hauptstadt aus gezählt –
   dieselbe Regel wie foundDistance (Zielfeld selbst muss nicht passierbar sein). */
function kiSites(S, pi, K, memo) {
  const foodAvail = available(S, pi, 'food');
  const key0 = kiSiteKey(S, pi);
  let all = memo && memo.sitesKey === key0 ? memo.sites : null;
  if (!all) {
    all = kiSitesAll(S, pi, K);
    if (memo) { memo.sites = all; memo.sitesKey = key0; }
  }
  return all.filter(s => s.cost <= foodAvail && !armyAt(S, s.r, s.c));
}
function kiSitesAll(S, pi, K) {
  const p = S.players[pi];
  const cap = capitalOf(S, pi) || citiesOf(S, pi)[0];
  if (!cap) return [];
  const fremd = foreignTerritory(S, pi);
  const dist = new Map([[key(cap.r, cap.c), 0]]);
  let front = [[cap.r, cap.c]], d = 0;
  while (front.length && d < 60) {
    d++;
    const next = [];
    for (const [r, c] of front) for (const [nr, nc] of neighbors(r, c)) {
      const k = key(nr, nc);
      if (dist.has(k)) continue;
      dist.set(k, d);
      if (foundPassable(S, pi, nr, nc, { fremd })) next.push([nr, nc]);
    }
    front = next;
  }
  const n = citiesOf(S, pi).length;
  const base = n * (n + 1) / 2;
  const out = [];
  const vorher = income(S, pi);           // für jeden Platz dasselbe (v83, Tempo)
  for (const [k, dd] of dist) {
    const [r, c] = unkey(k);
    const t = terrainAt(S, r, c);
    if (!t || isOff(t) || !TERRAIN[t].land || TERRAIN[t].block) continue;
    if (enemyArmyAdjacent(S, pi, r, c)) continue;
    { const a = armyAt(S, r, c); if (a && a.owner !== pi) continue; }
    if (S.cities.some(ct => hexDistance(ct.r, ct.c, r, c) < 3)) continue;
    // Kosten wie foundCost
    const ohneStadt = isAbil(p, 'gruenden'), ohneWeg = has(p, 'kartografie');
    let cost = ohneStadt && ohneWeg ? Math.min(base, dd) : ohneStadt ? dd : ohneWeg ? base : base + dd;
    cost = Math.max(1, cost);
    const g = settleGain(S, pi, r, c, vorher);
    // Nutzen: Ertrag über den Horizont
    const v = K.H * (K.w.sci * g.sci + K.w.food * Math.max(g.food, -1) + K.w.coins * g.coins);
    out.push({ r, c, cost, v });
  }
  out.sort((a, b) => (b.v - b.cost * 1.2) - (a.v - a.cost * 1.2));
  return out;
}
// Siedelplätze ändern sich mit Städten, Armeen, Techs und Straßen – nicht mit den Ressourcen
const kiSiteKey = (S, pi) => S.cities.length + '|' +
  S.armies.filter(a => a.owner !== pi).map(a => a.r + ',' + a.c).join(';') + '|' +
  Object.keys(S.players[pi].techs).length + '|' + Object.keys(S.roads).length;
/* Straßenpläne: für jede eigene Stadt ohne Handelsroute der billigste Weg zum Straßennetz
   der Hauptstadt (Dijkstra, Kosten = Felder ohne Straße). Nur auf eigenem oder neutralem
   Land, nie auf Meer – so wie buildRoad es erlaubt. Mit Eisenbahn zusätzlich der Ausbau
   einer bestehenden Verbindung. */
/* Warteschlange des Straßenplans (v83, Tempo). Bis v82 stand dort ein Feld, das vor jeder
   Entnahme stabil nach Entfernung sortiert wurde (q.sort, dann q.shift). Diese Schlange gibt
   die Felder in GENAU derselben Reihenfolge heraus – auch bei gleicher Entfernung –, damit
   die KI dieselben Wege baut, nur ohne jedes Mal alles zu sortieren:
   · Fächer je Entfernung, jedes in der Reihenfolge, die das sortierte Feld hätte.
   · Sinkt die Entfernung eines wartenden Feldes, rückt es beim nächsten „Sortieren" hinter
     die Felder, die schon in seinem neuen Fach liegen – unter mehreren solchen zuerst die aus
     dem niedrigeren alten Fach (sie standen im sortierten Feld weiter vorn).
   · Neu entdeckte Felder kommen danach, in der Reihenfolge ihres Eintreffens.
   Doppelte Einträge, die das alte Feld beim Senken mitschleppte, entfallen: sie kamen erst
   nach dem ersten heraus und änderten nichts mehr. test.js prüft die Gleichheit mit dem
   sortierten Feld an Zufallsfolgen und über ganze Partien. */
function kiRoadQueue(dist) {
  const fach = [];
  let gesenkt = new Map(), neu = [];
  const f = d => fach[d] || (fach[d] = { a: [], h: 0 });
  return {
    start(keys) { for (const k of keys) f(dist.get(k)).a.push(k); },
    add(k) { neu.push(k); },
    lower(k, alt) { gesenkt.set(k, alt); },
    pop() {
      if (gesenkt.size) {
        const alte = [...new Set(gesenkt.values())].sort((x, y) => x - y);
        const nach = new Map();
        for (const e of alte) {
          const b = fach[e], bleibt = [];
          for (let i = b.h; i < b.a.length; i++) {
            const k = b.a[i];
            if (gesenkt.get(k) === e) {
              const d = dist.get(k);
              if (!nach.has(d)) nach.set(d, []);
              nach.get(d).push(k);
            } else bleibt.push(k);
          }
          b.a = bleibt; b.h = 0;
        }
        for (const [d, ks] of nach) for (const k of ks) f(d).a.push(k);
        gesenkt = new Map();
      }
      for (const k of neu) f(dist.get(k)).a.push(k);
      neu = [];
      for (let d = 0; d < fach.length; d++) {
        const b = fach[d];
        if (b && b.h < b.a.length) return b.a[b.h++];
      }
      return undefined;
    },
  };
}
function kiRoadPlans(S, pi) {
  const p = S.players[pi];
  const cap = capitalOf(S, pi);
  if (!cap) return [];
  const mine = controlledTiles(S, pi);
  const others = new Set();
  S.players.forEach((_, i) => { if (i !== pi) controlledTiles(S, i).forEach(k => others.add(k)); });
  const buildable = (r, c) => {
    const t = terrainAt(S, r, c);
    if (!t || isOff(t) || !TERRAIN[t].land) return false;
    const k = key(r, c);
    return mine.has(k) || !others.has(k);
  };
  const plans = [];
  const tr = tradeRoutes(S, pi);
  const target = has(p, 'eisenbahn') ? 2 : 1;
  /* Tempo (v83, große Karten mit vielen Städten): Städte einmal in eine Tabelle (statt je
     Feld cityAt über alle Städte), Wegstufe je Feld einmal (wie effectiveRoad), und die
     Warteschlange des Dijkstra in Fächern statt sortiert (`kiRoadQueue`). Alles liefert
     dasselbe wie vorher – auch bei gleicher Entfernung dieselbe Reihenfolge, also dieselben
     Wege. */
  const stadtAt = new Map();
  for (const ct of S.cities) { const k = key(ct.r, ct.c); if (!stadtAt.has(k)) stadtAt.set(k, ct); }
  const stufe = new Map();
  const weg = (r, c, k) => {
    let l = stufe.get(k);
    if (l !== undefined) return l;
    l = S.roads[k] || 0;
    if (stadtAt.has(k)) for (const [nr, nc] of neighbors(r, c)) l = Math.max(l, roadLevel(S, nr, nc));
    stufe.set(k, l);
    return l;
  };
  for (const lvl of target === 2 ? [1, 2] : [1]) {
    // Netz der Hauptstadt auf dieser Stufe
    const net = new Set();
    {
      const st = [[cap.r, cap.c]]; net.add(key(cap.r, cap.c));
      while (st.length) {
        const [r, c] = st.pop();
        for (const [nr, nc] of neighbors(r, c)) {
          const k = key(nr, nc);
          if (net.has(k) || !terrainAt(S, nr, nc)) continue;
          if (weg(nr, nc, k) < lvl) continue;
          const ct = stadtAt.get(k);
          if (ct && ct.owner !== pi) continue;
          net.add(k); st.push([nr, nc]);
        }
      }
    }
    for (const city of citiesOf(S, pi)) {
      if (city.cap || net.has(key(city.r, city.c))) continue;
      // Dijkstra vom Netz aus: Feld kostet (lvl − vorhandene Stufe), Städte sind frei
      const dist = new Map(), prev = new Map(), q = kiRoadQueue(dist), start = [];
      for (const k of net) { dist.set(k, 0); start.push(k); }
      if (!net.size) { dist.set(key(cap.r, cap.c), 0); start.push(key(cap.r, cap.c)); }
      q.start(start);
      const goal = key(city.r, city.c);
      let found = null;
      for (let k = q.pop(); k !== undefined; k = q.pop()) {
        const dk = dist.get(k);
        if (k === goal) { found = dk; break; }
        if (dk > 8) break;
        const [r, c] = unkey(k);
        for (const [nr, nc] of neighbors(r, c)) {
          const nk = key(nr, nc);
          const ct = stadtAt.get(nk);
          let step;
          if (ct) { if (ct.owner !== pi) continue; step = 0; }
          else if (!buildable(nr, nc)) continue;
          else step = Math.max(0, lvl - roadLevel(S, nr, nc)) > 0 ? (lvl === 2 && roadLevel(S, nr, nc) === 0 ? 2 : 1) : 0;
          const nd = dk + step;
          if (!dist.has(nk)) { dist.set(nk, nd); prev.set(nk, k); q.add(nk); }
          else if (nd < dist.get(nk)) { q.lower(nk, dist.get(nk)); dist.set(nk, nd); prev.set(nk, k); }
        }
      }
      if (found == null || found === 0) continue;
      const tiles = [];
      let k = goal;
      while (prev.has(k)) { k = prev.get(k); if (!cityAt(S, ...unkey(k)) && roadLevel(S, ...unkey(k)) < lvl) tiles.push(unkey(k)); }
      if (!tiles.length) continue;
      plans.push({
        label: lvl === 2 ? () => T('baut Eisenbahn zur Stadt auf %s/%s', city.r, city.c) : () => T('baut Straße zur Stadt auf %s/%s', city.r, city.c),
        tag: 'road' + lvl + ':' + city.id, tiles, lvl, cost: found,
      });
    }
  }
  // Ein Ausbau zur Eisenbahn lohnt erst, wenn die Straße liegt
  plans.sort((a, b) => a.cost - b.cost);
  return plans.filter(pl => pl.lvl === 1 || tr.count > 0);
}
function kiBuildRoadPlan(S, pi, plan) {
  for (const [r, c] of plan.tiles) {
    if (roadLevel(S, r, c) >= plan.lvl) continue;
    const e = buildRoad(S, pi, r, c, plan.lvl);
    if (e) return e;
  }
  return null;
}
/* Herrenlose Felder mit dem besten Ertrag (Kolonialismus). */
function kiColonySpots(S, pi) {
  const owned = new Set();
  S.players.forEach((_, i) => controlledTiles(S, i).forEach(k => owned.add(k)));
  const out = [];
  for (let r = 0; r < S.map.rows.length; r++) for (let c = 0; c < S.map.rows[r].length; c++) {
    const t = terrainAt(S, r, c);
    if (!t || isOff(t) || TERRAIN[t].block || cityAt(S, r, c) || owned.has(key(r, c))) continue;
    const y = tileYield(S, pi, t);
    const v = y[0] + y[1] + y[2];
    if (v >= 2) out.push([r, c, v]);
  }
  return out.sort((a, b) => b[2] - a[2]);
}
/* In welcher Stadt ein Wunder am meisten bringt: Angkor Wat in der Stadt mit den meisten
   Nahrungsreserven (sie wächst um 9), der Koloss an der Grenze (dort erscheinen die
   Armeen), sonst die Hauptstadt – solange dort Platz für ein Wunder ist. */
function kiWonderCity(S, pi, wk) {
  const cities = citiesOf(S, pi).filter(c => wondersInCity(S, c).length < 2);
  if (!cities.length) return null;
  if (wk === 'koloss' && cities.length > 1) {
    let best = null, bd = Infinity;
    for (const c of cities) {
      const d = Math.min(...S.cities.filter(x => x.owner !== pi).map(x => hexDistance(x.r, x.c, c.r, c.c)), 99);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  return cities.find(c => c.cap) || cities.reduce((a, b) => b.pop > a.pop ? b : a);
}

/* ------------------------------------------------------------------ Militär
   Kandidaten, die Armeen und Macht betreffen. Jeder ist ein Paket aus mehreren Aktionen:
   Armeen hinziehen, neue bauen, Macht kaufen – bewertet wird wie alles andere über kiValue
   nach dem Kampf (kiValueAfterCombat): eine Eroberung, ein erster Treffer, eine gerettete
   Stadt oder eine flankierte Armee zeigen sich dort unmittelbar. */
function kiMilitaryCandidates(S, pi, K, memo) {
  const out = [];
  const p = S.players[pi];
  const coins = available(S, pi, 'coins', payOpts(S, pi));
  const price = powerPrice(S, pi);
  // 1 Macht kaufen: Verteidigung (mit Armeen in Reichweite oder Burgenbau) und Angriff
  if (coins >= price) {
    const steps = [1, 2, 3, 5, 8, 12, 20].filter(n => n * price <= coins);
    for (const n of steps)
      out.push({ label: () => T('kauft %s Macht', n), run: X => buyPower(X, pi, n), tag: 'power:' + n });
  }
  // 2 Angriff auf gegnerische Städte: Armeen in Reichweite ziehen, dazu neue Armeen.
  //   Nur Ziele, die eine eigene Armee oder eine neue aus einer eigenen Stadt überhaupt
  //   erreichen kann (Luftlinie als schnelle Vorprüfung, Straßen großzügig eingerechnet).
  const mp = moveAllowance(S, pi), rng = attackRange(S, pi);
  const roads = Object.keys(S.roads).length ? 4 : 0;
  const origins = armiesOf(S, pi).map(a => [a.r, a.c]).concat(citiesOf(S, pi).map(c => [c.r, c.c]));
  for (const city of S.cities) {
    if (city.owner === pi) continue;
    const owner = S.players[city.owner];
    if (owner.dead && owner.kind !== 'barbar') continue;
    if (!origins.some(([r, c]) => hexDistance(r, c, city.r, city.c) <= mp + rng + roads)) continue;
    const plan = kiStrikePlan(S, pi, city, K, memo);
    if (!plan) continue;
    for (const variant of plan) out.push(variant);
  }
  // 3 Verteidigung bedrohter Städte: Armeen heranziehen, eine neue bauen
  for (const city of citiesOf(S, pi)) {
    const plans = kiDefensePlan(S, pi, city, K, memo);
    if (plans) out.push(...plans);
  }
  // 4 Flankieren: gegnerische Armee zwischen zwei eigene Positionen nehmen
  for (const f of kiFlankPlans(S, pi, K, memo)) out.push(f);
  return out;
}
/* Zwischenspeicher je Planungsschritt: erreichbare Felder jeder eigenen Armee und die
   Reichweite einer neuen Armee aus jeder eigenen Stadt. Innerhalb eines Schritts gehen alle
   Kandidaten vom selben Spielstand aus; nach dem Schritt wird neu gerechnet. */
/* Reichweiten gelten, solange sich nichts ändert, wovon armyReach abhängt: Armeen (Lage,
   Bewegung), Städte, Straßen, eigene Technologien (Navigation, Luftwaffe …) und Wunder
   (Militärlogistik). Die Fremden ändern sich im eigenen Zug nicht. Bleibt das alles gleich,
   rechnet der nächste Planungsschritt mit den gemerkten Reichweiten weiter – sonst fing
   jeder Schritt von vorn an (bei Luftwaffe ein Fünftel eines langen Zuges). */
const kiMoveSig = (S, pi) => {
  let r = 0, n = 0;
  for (const k in S.roads) { n++; r += S.roads[k]; }
  return S.armies.map(a => a.id + ':' + a.r + ',' + a.c + ',' + a.mp + (a.halted ? 'h' : '')).join(';') + '|' +
    S.cities.map(c => c.id + ':' + c.r + ',' + c.c + ',' + c.owner).join(';') + '|' + n + ',' + r + '|' +
    Object.keys(S.players[pi].techs).length + '|' + (S.wonders ? S.wonders.length : 0);
};
function kiStepMemo(memo, S, pi) {
  const sig = S ? kiMoveSig(S, pi) : null;
  if (sig == null || memo.moveSig !== sig) {
    memo.armyTiles = new Map();
    memo.newReach = new Map();
    memo.moveSig = sig;
  }
  if (!memo.committed) memo.committed = new Set();
  return memo;
}
/* Armeen, die in diesem Zug schon eine Aufgabe haben (verteidigen, angreifen, flankieren),
   ziehen nicht mehr um. Sonst konnte ein späteres Angriffspaket den eben aufgestellten
   Verteidiger wieder abziehen – gesehen in einer Partie zu viert: England stellte eine Armee
   neben die belagerte Stadt und schickte sie im selben Zug gegen die Wikinger. */
const kiFree = (a, memo) => !(memo && memo.committed && memo.committed.has(a.id));
function kiTilesOf(S, army, memo) {
  if (!memo || !memo.armyTiles) return kiArmyTiles(S, army);
  let t = memo.armyTiles.get(army.id);
  if (!t) { t = kiArmyTiles(S, army); memo.armyTiles.set(army.id, t); }
  return t;
}
function kiNewReach(S, pi, city, memo) {
  if (memo && memo.newReach && memo.newReach.has(city.id)) return memo.newReach.get(city.id);
  const keys = kiReachKeys(S, pi, city.r, city.c, moveAllowance(S, pi));
  if (memo && memo.newReach) memo.newReach.set(city.id, keys);
  return keys;
}
/* Die Felder, die eine eigene Armee diese Runde erreichen kann (mit Kosten), als Liste. */
function kiArmyTiles(S, army) {
  const reach = armyReach(S, army);
  const out = [];
  for (const [k, v] of reach) { const [r, c] = unkey(k); if (!cityAt(S, r, c)) out.push([r, c, v]); }
  if (!cityAt(S, army.r, army.c)) out.push([army.r, army.c, 0]);
  return out;
}
/* Wie gefährdet ist eine eigene Armee auf (r, c) gegen Flankieren? Zahl der freien
   Nachbarfelder, auf die der Gegner ziehen könnte – grob, aber billig. */
function kiExposure(S, pi, r, c) {
  let open = 0;
  for (const [nr, nc] of neighbors(r, c)) {
    const t = terrainAt(S, nr, nc);
    if (!t || isOff(t) || !TERRAIN[t].land || TERRAIN[t].block) continue;
    const a = armyAt(S, nr, nc);
    if (a && a.owner === pi) continue;
    const ct = cityAt(S, nr, nc);
    if (ct && ct.owner === pi) continue;
    open++;
  }
  return open;
}
/* Angriffspaket gegen eine Stadt: welche Armeen kommen diese Runde in Reichweite (bestes
   Feld: wenig offene Flanken), welche Städte können eine neue Armee schicken, wie viel
   Macht braucht es dann, um die Verteidigung zu übertreffen? Geliefert werden zwei
   Fassungen: mit so wenigen Armeen wie nötig und mit allen. */
function kiStrikePlan(S, pi, city, K, memo) {
  const rng = attackRange(S, pi);
  const d = defenseValue(S, city);
  const moves = [];
  const used = new Set();
  // Armeen, die schon in Reichweite stehen, bleiben stehen
  const inRange = armiesOf(S, pi).filter(a => hexDistance(a.r, a.c, city.r, city.c) <= rng && !cityAt(S, a.r, a.c));
  inRange.forEach(a => used.add(key(a.r, a.c)));
  const cand = [];
  for (const a of armiesOf(S, pi)) {
    if (inRange.includes(a) || a.mp <= 0 || !kiFree(a, memo)) continue;
    if (hexDistance(a.r, a.c, city.r, city.c) > a.mp + rng + (Object.keys(S.roads).length ? 4 : 0)) continue;
    const tiles = kiTilesOf(S, a, memo).filter(([r, c]) => hexDistance(r, c, city.r, city.c) <= rng);
    if (!tiles.length) continue;
    tiles.sort((x, y) => kiExposure(S, pi, x[0], x[1]) - kiExposure(S, pi, y[0], y[1]) || x[2] - y[2]);
    cand.push({ a, tiles });
  }
  // neue Armeen aus eigenen Städten, die in Reichweite ziehen könnten
  const newFrom = [];
  for (const ct of citiesOf(S, pi)) {
    if (armyAt(S, ct.r, ct.c)) continue;
    if (hexDistance(ct.r, ct.c, city.r, city.c) > moveAllowance(S, pi) + rng + (Object.keys(S.roads).length ? 4 : 0)) continue;
    const keys = kiNewReach(S, pi, ct, memo);
    const tiles = [...keys].map(unkey).filter(([r, c]) => hexDistance(r, c, city.r, city.c) <= rng && !cityAt(S, r, c));
    if (tiles.length) newFrom.push({ ct, tiles });
  }
  const total = inRange.length + cand.length + newFrom.length;
  if (!total) return null;
  const coins = available(S, pi, 'coins', payOpts(S, pi));
  const price = powerPrice(S, pi);
  const variants = [];
  const make = (nMove, nNew) => {
    const n = inRange.length + nMove + nNew;
    if (!n) return null;
    let armyCost = 0;
    for (let j = 1; j <= nNew; j++) armyCost += kiArmyCostNth(S, pi, j);
    // Macht, die für Angriff > Verteidigung nötig ist
    const bonusN = kiPowerBonus(S, pi, armiesOf(S, pi).length + nNew);
    let need = 0;
    while (kiAttackPer(S, pi, S.players[pi].power + need + bonusN) * n <= d && need < 200) need++;
    // etwas Reserve, wenn es billig ist
    const cost = armyCost + need * price;
    if (cost > coins) return null;
    const moveList = cand.slice(0, nMove).map(x => ({ id: x.a.id, tiles: x.tiles }));
    const newList = newFrom.slice(0, nNew).map(x => ({ cityId: x.ct.id, tiles: x.tiles }));
    const target = city.id;
    return {
      label: () => T('greift die Stadt auf %s/%s an', city.r, city.c), tag: 'strike:' + city.id + ':' + n,
      run: X => kiRunStrike(X, pi, target, moveList, newList, need),
    };
  };
  const tried = new Set();
  for (let nNew = 0; nNew <= newFrom.length; nNew++) {
    for (const nMove of [0, 1, 2, cand.length]) {
      if (nMove > cand.length) continue;
      const kk = nMove + '|' + nNew;
      if (tried.has(kk)) continue;
      tried.add(kk);
      const v = make(nMove, nNew);
      if (v) variants.push(v);
    }
    if (variants.length >= 4) break;
  }
  return variants.length ? variants : null;
}
function kiRunStrike(X, pi, targetId, moveList, newList, power) {
  const city = kiCity(X, targetId);
  if (!city || city.owner === pi) return 'Ziel gibt es nicht mehr.';
  const rng = attackRange(X, pi);
  for (const m of moveList) {
    const a = kiArmy(X, m.id);
    if (!a) continue;
    if (hexDistance(a.r, a.c, city.r, city.c) <= rng && !cityAt(X, a.r, a.c)) continue;
    kiMoveToFirst(X, a, m.tiles);
  }
  for (const nw of newList) {
    const ct = kiCity(X, nw.cityId);
    if (!ct || armyAt(X, ct.r, ct.c)) continue;
    if (buildArmy(X, pi, ct)) break;
    const a = armyAt(X, ct.r, ct.c);
    if (!kiMoveToFirst(X, a, nw.tiles)) kiLeaveCity(X, pi, a);
  }
  if (power > 0) {
    const e = buyPower(X, pi, power);
    if (e) return e;
  }
  return null;
}
/* Verteidigungspaket: Armeen in Reichweite der Stadt ziehen (wer nicht schon woanders
   gebraucht wird), und eine neue Armee in der Stadt bauen, die auf ein Nachbarfeld tritt.
   Die Macht dazu kauft der Planer als eigenen Kandidaten – je Armee in Reichweite zählt sie
   einmal zur Verteidigung. */
function kiDefensePlan(S, pi, city, K, memo) {
  let worst = 0;
  let belagert = false;
  for (const e of K.enemies) {
    const info = K.info.get(e);
    if (!info) continue;
    const siege = (S.sieges[e + '|' + city.id] || 0) >= 1;
    if (siege) belagert = true;
    worst = Math.max(worst, kiAttackPotential(S, info, city, siege && kiDetermined(S, info, city)));
  }
  if (!worst || worst <= defenseValue(S, city)) return null;
  const rng = projectRange(S, pi);
  /* Welche Felder zuerst? Die, auf die ein Gegner ziehen könnte (v79): jede eigene Armee dort
     nimmt ihm einen Platz für einen Angreifer (kiAttackSlots), und neben der Stadt hilft sie
     ohnehin. Danach möglichst wenig offene Flanken. */
  const block = new Map();
  for (const e of K.enemies) {
    const info = K.info.get(e);
    if (!info) continue;
    const hit = kiHits(S, info, city);
    for (const list of [hit.armies, hit.cities]) for (const tiles of list.values())
      for (const k of tiles) block.set(k, (block.get(k) || 0) + 1);
  }
  const order = (x, y) => (block.get(key(y[0], y[1])) || 0) - (block.get(key(x[0], x[1])) || 0) ||
    kiExposure(S, pi, x[0], x[1]) - kiExposure(S, pi, y[0], y[1]);
  const movers = [];
  for (const a of armiesOf(S, pi)) {
    if (hexDistance(a.r, a.c, city.r, city.c) <= rng && !cityAt(S, a.r, a.c)) continue;
    if (a.mp <= 0 || !kiFree(a, memo)) continue;
    if (hexDistance(a.r, a.c, city.r, city.c) > a.mp + rng + (Object.keys(S.roads).length ? 4 : 0)) continue;
    const tiles = kiTilesOf(S, a, memo).filter(([r, c]) => hexDistance(r, c, city.r, city.c) <= rng);
    if (tiles.length) movers.push({ id: a.id, tiles: tiles.sort(order) });
  }
  const canBuild = !armyAt(S, city.r, city.c) &&
    available(S, pi, 'coins', payOpts(S, pi)) >= armyCost(S, pi);
  // Felder, auf die eine neue Armee aus der Stadt treten kann: in Reichweite der Stadt
  const newTiles = canBuild ? [...kiNewReach(S, pi, city, memo)].map(unkey)
    .filter(([r, c]) => !cityAt(S, r, c) && hexDistance(r, c, city.r, city.c) <= rng)
    .sort(order)
    .map(([r, c]) => [r, c, 1]) : [];
  // Armeen, die schon helfen (in Reichweite, nicht in einer Stadt), und Burgenbau: dann
  // wirkt gekaufte Macht auch ohne Umzug
  const helpNow = armiesOf(S, pi).some(a => hexDistance(a.r, a.c, city.r, city.c) <= rng && !cityAt(S, a.r, a.c)) ||
    has(S.players[pi], 'burgenbau');
  if (!movers.length && !canBuild && !helpNow) return null;
  const id = city.id;
  /* Macht gehört ins Paket (v78): Armeen neben der Stadt helfen nur mit Macht, und Macht
     hilft nur mit Armeen daneben. Einzeln bringt keins von beiden etwas, und der Planer
     nahm dann keins – die KI baute Armeen ohne Macht oder gar nichts. `macht`: 0 = keine,
     'ziel' = so viel, dass die Verteidigung den stärksten Angriff seines nächsten Zuges
     erreicht, 'alles' = was die Münzen hergeben. */
  const mk = (builds, macht, alch) => ({
    label: () => T('verteidigt die Stadt auf %s/%s', city.r, city.c),
    tag: 'defend:' + id + ':' + builds + (macht ? ':' + macht : '') + (alch ? '+a' : ''),
    run: X => {
      const ct = kiCity(X, id);
      if (!ct) return 'Stadt verloren.';
      let did = false;
      for (const m of movers) {
        const a = kiArmy(X, m.id);
        if (a && kiMoveToFirst(X, a, m.tiles)) did = true;
      }
      for (let n = 0; n < builds && canBuild && !armyAt(X, ct.r, ct.c); n++) {
        if (buildArmy(X, pi, ct)) break;
        did = true;
        const a = armyAt(X, ct.r, ct.c);
        if (!kiMoveToFirst(X, a, newTiles)) { kiLeaveCity(X, pi, a); break; }
      }
      // Alchemie zuerst: dann zahlt die Wissenschaft mit (1:1 in Münzen). Einzeln brächte die
      // Technologie gegen den Angriff nichts, also gehört sie wie die Macht ins Paket.
      if (alch && !has(X.players[pi], 'alchemie')) doResearch(X, pi, 'alchemie');
      if (macht) {
        const price = powerPrice(X, pi);
        const can = Math.floor(available(X, pi, 'coins', payOpts(X, pi)) / price);
        let n = can;
        if (macht === 'ziel') {
          const per = armiesOf(X, pi).filter(a => hexDistance(a.r, a.c, ct.r, ct.c) <= rng && !cityAt(X, a.r, a.c)).length +
            (has(X.players[pi], 'burgenbau') ? 1 : 0);
          const gap = worst - defenseValue(X, ct);
          n = per && gap > 0 ? Math.min(can, Math.ceil(gap / per)) : 0;
        }
        if (n > 0 && !buyPower(X, pi, n)) did = true;
      }
      return did ? null : 'Nichts zu tun.';
    },
  });
  const out = [];
  const p = S.players[pi];
  // Alchemie fürs Paket nur im Ernstfall: sonst gehört die Wissenschaft der Forschung
  const alchOk = belagert && !has(p, 'alchemie') && researchable(S, pi).some(t => t.k === 'alchemie') &&
    available(S, pi, 'sci') >= techCost(S, pi, TECH_BY_KEY.alchemie) + powerPrice(S, pi);
  for (const builds of [0, 1, 2]) {
    if (builds === 0 ? !(movers.length || helpNow) : !canBuild) continue;
    if (builds > 0 || movers.length) out.push(mk(builds, 0));
    out.push(mk(builds, 'ziel'), mk(builds, 'alles'));
    if (alchOk) out.push(mk(builds, 'ziel', true), mk(builds, 'alles', true));
  }
  return out;
}
/* Flankieren: eine gegnerische Armee zwischen zwei eigene Positionen nehmen – gegenüber-
   liegend (hexOpposite, dieselbe Regel wie canFlank im Kampf), mit Taktik zwei beliebige; mit
   Burgenbau zählt die eigene Stadt als Position. Besetzt werden die Felder mit Armeen, die
   hinkommen, oder mit neuen aus eigenen Städten (auch zwei hintereinander aus derselben
   Stadt – die erste zieht ja heraus). Dazu so viel Macht, dass sie am Zugende größer ist
   als seine. Gerade gegen eine Belagerung ist das oft die billigste Antwort: die Armee ist
   dann weg, und mit ihr der Angriff. */
function kiFlankPlans(S, pi, K, memo) {
  const p = S.players[pi];
  const rng = projectRange(S, pi);
  const out = [];
  const taktik = has(p, 'taktik');
  const castle = has(p, 'burgenbau');
  const price = powerPrice(S, pi);
  const coins = available(S, pi, 'coins', payOpts(S, pi));
  const mp = moveAllowance(S, pi);
  for (const e of S.armies) {
    if (e.owner === pi || S.players[e.owner].kind === 'barbar') continue;
    const inRng = (r, c) => { const dd = hexDistance(r, c, e.r, e.c); return dd >= 1 && dd <= rng; };
    // schnelle Vorprüfung: irgendetwas Eigenes in der Nähe?
    const nearMine = armiesOf(S, pi).some(a => hexDistance(a.r, a.c, e.r, e.c) <= mp + rng + 1) ||
      citiesOf(S, pi).some(c => hexDistance(c.r, c.c, e.r, e.c) <= mp + rng);
    if (!nearMine) continue;
    // Wie lässt sich ein Feld t besetzen? 0 = steht schon, sonst Umzug oder Neubau
    const fills = new Map();
    for (const [r, c] of kiDisk(S, e.r, e.c, rng)) {
      if (!inRng(r, c)) continue;
      const k = key(r, c), list = [];
      const a = armyAt(S, r, c), ct = cityAt(S, r, c);
      if (a && a.owner === pi) list.push({ kind: 'spot' });
      else if (ct && ct.owner === pi && castle) list.push({ kind: 'spot' });
      else if (!a && !ct) {
        for (const m of armiesOf(S, pi)) {
          if (m.mp <= 0 || inRng(m.r, m.c) || !kiFree(m, memo)) continue;
          if (hexDistance(m.r, m.c, r, c) > m.mp + 4) continue;
          const hit = kiTilesOf(S, m, memo).find(([tr, tc]) => tr === r && tc === c);
          if (hit) list.push({ kind: 'move', id: m.id, cost: hit[2] });
        }
        for (const ct2 of citiesOf(S, pi)) {
          if (armyAt(S, ct2.r, ct2.c)) continue;
          if (hexDistance(ct2.r, ct2.c, r, c) > mp + 4) continue;
          if (kiNewReach(S, pi, ct2, memo).has(k)) list.push({ kind: 'build', cityId: ct2.id });
        }
      }
      if (list.length) fills.set(k, list);
    }
    // Paare bilden. „Gegenüber" fragt die Regel des Kampfes selbst (hexOpposite, am Gegner
    // gespiegelt in Würfelkoordinaten) – höchstens 18 Felder, also billig genug für alle Paare.
    const pairs = [];
    const ks = [...fills.keys()];
    for (let i = 0; i < ks.length; i++) {
      const [r1, c1] = unkey(ks[i]);
      for (let j = i + 1; j < ks.length; j++) {
        const [r2, c2] = unkey(ks[j]);
        if (taktik || hexOpposite(e.r, e.c, r1, c1, r2, c2)) pairs.push([ks[i], ks[j]]);
      }
    }
    let best = null;
    for (const [k1, k2] of pairs) {
      // billigste Besetzung: Stellung vor Umzug vor Neubau, keine Armee doppelt
      const choose = (k, taken) => {
        const list = fills.get(k);
        return list.find(f => f.kind === 'spot') ||
          list.find(f => f.kind === 'move' && !taken.has('a' + f.id)) ||
          list.find(f => f.kind === 'build' && (taken.get ? true : true));
      };
      const taken = new Set();
      const f1 = choose(k1, taken); if (!f1) continue;
      if (f1.kind === 'move') taken.add('a' + f1.id);
      const f2 = choose(k2, taken); if (!f2) continue;
      const builds = [f1, f2].filter(f => f.kind === 'build').length;
      let cost = 0;
      for (let j = 1; j <= builds; j++) cost += kiArmyCostNth(S, pi, j);
      const need = Math.max(0, powerOf(S, e.owner) + 1 - (p.power + kiPowerBonus(S, pi, armiesOf(S, pi).length + builds)));
      cost += need * price;
      if (cost > coins) continue;
      if (f1.kind === 'spot' && f2.kind === 'spot' && need === 0) continue;   // läuft ohnehin
      if (!best || cost < best.cost) best = { cost, steps: [[k1, f1], [k2, f2]] };
    }
    if (!best) continue;
    const eid = e.id, steps = best.steps;
    out.push({
      label: () => T('flankiert eine Armee auf %s/%s', e.r, e.c), tag: 'flank:' + eid,
      run: X => {
        for (const [k, f] of steps) {
          const [r, c] = unkey(k);
          if (f.kind === 'spot') continue;
          let a;
          if (f.kind === 'move') a = kiArmy(X, f.id);
          else {
            const ct = kiCity(X, f.cityId);
            if (!ct || armyAt(X, ct.r, ct.c)) return 'Stadt besetzt.';
            const err = buildArmy(X, pi, ct);
            if (err) return err;
            a = armyAt(X, ct.r, ct.c);
          }
          if (!a) return 'Armee fehlt.';
          const err = kiMove(X, a, r, c, f.cost || 1);
          if (err) return err;
        }
        const en = kiArmy(X, eid);
        if (!en) return null;
        const need = powerOf(X, en.owner) + 1 - powerOf(X, pi);
        return need > 0 ? buyPower(X, pi, need) : null;
      },
    });
  }
  return out;
}
/* Eine Armee, die in einer Stadt steht, auf ein Nachbarfeld stellen (Pflicht zum Zugende). */
function kiLeaveCity(S, pi, a) {
  if (!a || !cityAt(S, a.r, a.c)) return;
  const reach = armyReach(S, a);
  let best = null;
  for (const [k, cost] of reach) {
    const [r, c] = unkey(k);
    if (cityAt(S, r, c)) continue;
    const d = hexDistance(r, c, a.r, a.c);
    const ex = kiExposure(S, pi, r, c);
    const s = d * 2 + ex;
    if (!best || s < best.s) best = { r, c, s };
  }
  if (best) moveArmy(S, a, best.r, best.c);
}

/* ------------------------------------------------------------------ Planer */
/* Ressourcenverbrauch einer Aktion in einer Zahl (für Nutzen je Kosten). */
function kiSpent(before, after, sciFactor) {
  const P = KI_W.price;
  return P.sci * (sciFactor || 1) * (before.sci - after.sci) + P.food * (before.food - after.food) + P.coins * (before.coins - after.coins);
}
/* Wissenschaft gehört der Forschung (v79). Mit Alchemie oder Gentechnik kann sie auch
   Münzen und Nahrung ersetzen; der Planer bezahlte damit Wachstum, Macht und Armeen, und die
   KI forschte viel zu langsam (Rückmeldung des Autors; gemessen ging in späteren Runden
   zuweilen mehr als die Hälfte der Wissenschaft daran vorbei). Deshalb zählt Wissenschaft für
   alles außer Forschung und Kopieren dreifach (KI_W.sciReserve) – erst wird geforscht, was
   sich lohnt, der Rest darf danach in Münzen. Im Ernstfall (eine eigene Stadt belagert) gilt
   das nicht. */
const KI_RESEARCH_TAG = /^(tech|free|back|pick|copyf|copyp):/;
/* Wählt Schritt für Schritt die beste Aktion (Nutzen je eingesetzter Ressource, mit einem
   Sockel, damit fast kostenlose Aktionen nicht unendlich gut aussehen) und führt sie auf
   dem echten Spielstand aus. Nach jeder Aktion wird neu bewertet: die Würfel nach einer
   Forschung, die neuen Preise nach einem Wachstum – alles fließt in den nächsten Schritt.
   Zwei Beschleuniger, damit ein großes Reich nicht minutenlang rechnet:
   · Voneinander unabhängige Aktionen (Wachstum verschiedener Städte, Forschung, Straßen)
     werden in einem Schritt gebündelt ausgeführt, solange sie fast so gut sind wie die
     beste – sie würden ohnehin nacheinander drankommen.
   · Je Zug gibt es ein Budget an Bewertungen (KI_PARAMS.evals). Ist es aufgebraucht,
     bleiben nur noch die billigen Kandidaten; das hält auch Züge mit Luftwaffe und
     zwanzig Armeen im Rahmen. Gezählt wird, nicht gestoppt – das Ergebnis hängt also nicht
     davon ab, wie schnell das Gerät ist. */
const KI_BATCH = /^(grow|gfree|tech|free|back|pick|copyf|copyp|road|col):/;
function kiPlan(S, pi, K, notes, memo) {
  const p = S.players[pi];
  const lvl = K.lvl;
  memo = memo || {};
  const seedOf = () => Math.floor(kiRandom(p) * 2147483647);
  const failed = new Set();
  const budget = lvl.evals || 2000;
  let evals = 0;
  for (let step = 0; step < 60 && !S.over; step++) {
    kiStepMemo(memo, S, pi);
    const base = kiValueAfterCombat(S, pi, K, seedOf());
    let cands = kiCandidates(S, pi, K, memo, evals > budget).filter(c => !failed.has(c.tag));
    if (evals > budget) cands = cands.filter(c => KI_BATCH.test(c.tag) || /^found:/.test(c.tag));
    if (evals > 2 * budget) break;
    const scored = [];
    const score = list => {
      for (const c of list) {
        const X = kiClone(S, seedOf());
        let err;
        try { err = c.run(X); } catch (e) { err = String(e && e.message || e); }
        evals++;
        if (err) continue;
        const v = kiScore(X, pi, K);
        let dv = v - base;
        if (lvl.noise) dv *= 1 + (kiRandom(p) * 2 - 1) * lvl.noise;
        if (!(dv > 0.05)) continue;
        const spent = kiSpent(S.players[pi].res, X.players[pi].res,
          K.emergency || KI_RESEARCH_TAG.test(c.tag) ? 1 : KI_W.sciReserve);
        scored.push({ c, dv, spent, ratio: dv / (Math.max(0, spent) + 2) });
      }
    };
    // Leichtere Stufen übersehen etwas: jeder Kandidat wird nur mit Wahrscheinlichkeit
    // `see` erwogen, in jedem Schritt neu gezogen. Taugt nichts davon, schaut sie ein
    // zweites Mal auf den Rest – übersehen heißt nicht, den Zug mit vollen Taschen zu beenden.
    if (lvl.see != null && lvl.see < 1) {
      const seen = new Set(cands.filter(() => kiRandom(p) < lvl.see));
      score([...seen]);
      if (!scored.length) score(cands.filter(c => !seen.has(c)));
    } else score(cands);
    if (!scored.length) break;
    scored.sort((a, b) => b.ratio - a.ratio);
    let pick = scored[0];
    // Große Brocken: bringt die absolut beste Aktion deutlich mehr, nimm sie, wenn das
    // Verhältnis nicht viel schlechter ist (sonst verbaut Kleinkram eine Stadtgründung).
    const top = scored.reduce((a, b) => b.dv > a.dv ? b : a);
    if (top !== pick && top.dv > pick.dv * 2.5 && top.ratio > pick.ratio * 0.45) pick = top;
    // Leichte Stufen vergreifen sich gelegentlich
    if (lvl.slip && scored.length > 1 && kiRandom(p) < lvl.slip)
      pick = scored[Math.min(scored.length - 1, 1 + Math.floor(kiRandom(p) * Math.min(4, scored.length - 1)))];
    const military = /^(strike|defend|flank)/.test(pick.c.tag);
    const before = military ? new Map(armiesOf(S, pi).map(a => [a.id, a.r + ',' + a.c])) : null;
    const err = pick.c.run(S);
    if (err) { failed.add(pick.c.tag); continue; }
    if (military) {
      for (const a of armiesOf(S, pi)) if (before.get(a.id) !== a.r + ',' + a.c) memo.committed.add(a.id);
      // wer schon am Ziel stand und stehen bleiben sollte, bleibt auch stehen
      if (/^(strike|defend)/.test(pick.c.tag)) {
        const id = +pick.c.tag.split(':')[1];
        const target = kiCity(S, id);
        if (target) for (const a of armiesOf(S, pi))
          if (hexDistance(a.r, a.c, target.r, target.c) <= attackRange(S, pi) && !cityAt(S, a.r, a.c)) memo.committed.add(a.id);
      }
    }
    if (notes && military) notes.push(pick.c.label());
    // Bündeln: weitere unabhängige Aktionen gleich hinterher
    if (KI_BATCH.test(pick.c.tag)) {
      for (const x of scored) {
        if (x === pick || !KI_BATCH.test(x.c.tag) || x.ratio < pick.ratio * 0.6) continue;
        if (S.over) break;
        x.c.run(S);
      }
    }
  }
}

/* ------------------------------------------------------------------ Armeen aufstellen
   Was nach dem Planen noch ziehen kann: Armeen in Städten müssen heraus; sonst steht jede
   Armee dort, wo sie am meisten nützt – bewertet mit kiValue (Schutz der Städte), dazu ein
   Zug zur Grenze Richtung nächster gegnerischer Stadt, damit ein späterer Angriff nicht
   bei null anfängt. */
function kiPositionArmies(S, pi, K, memo) {
  const p = S.players[pi];
  const seedOf = () => Math.floor(kiRandom(p) * 2147483647);
  const own = controlledTiles(S, pi);
  for (const c of citiesOf(S, pi)) own.add(key(c.r, c.c));
  const enemyCities = S.cities.filter(c => c.owner !== pi && S.players[c.owner].kind !== 'barbar');
  const cap = capitalOf(S, pi);
  for (const a0 of armiesOf(S, pi).slice()) {
    const a = kiArmy(S, a0.id);
    if (!a || a.mp <= 0) continue;
    // schon verplant (Verteidigung, Angriff, Flanke): stehen lassen – außer in einer Stadt
    if (!kiFree(a, memo) && !cityAt(S, a.r, a.c)) continue;
    let tiles = kiArmyTiles(S, a);
    if (!tiles.length) continue;
    // Vorauswahl: nur Felder, die irgendetwas taugen können – nahe eigener Städte, nahe
    // gegnerischer Städte oder Armeen, oder das jetzige. Mit Luftwaffe wären es sonst
    // hundert Felder, und jedes kostet eine volle Bewertung.
    const focus = citiesOf(S, pi).map(c => [c.r, c.c, 1])
      .concat(S.cities.filter(c => c.owner !== pi).map(c => [c.r, c.c, 2]))
      .concat(S.armies.filter(x => x.owner !== pi).map(x => [x.r, x.c, 2]));
    const near = ([r, c]) => Math.min(...focus.map(([fr, fc]) => hexDistance(fr, fc, r, c)), 9);
    if (tiles.length > 18) {
      tiles = tiles.map(t => ({ t, d: near(t) + (t[0] === a.r && t[1] === a.c ? -9 : 0) }))
        .sort((x, y) => x.d - y.d).slice(0, 18).map(x => x.t);
    }
    const base = kiValueAfterCombat(S, pi, K, seedOf());
    let best = null;
    const inCity = !!cityAt(S, a.r, a.c);
    for (const [r, c, cost] of tiles) {
      let v;
      if (r === a.r && c === a.c) v = base;
      else {
        const X = kiClone(S, seedOf());
        const xa = kiArmy(X, a.id);
        if (kiMove(X, xa, r, c, cost)) continue;
        v = kiScore(X, pi, K);
      }
      // Lage: nahe der eigenen Hauptstadt (Verteidigung) oder am Rand Richtung Gegner
      let pos = 0;
      if (cap && hexDistance(r, c, cap.r, cap.c) <= projectRange(S, pi)) pos += 3;
      if (own.has(key(r, c))) pos += 1;
      if (enemyCities.length) {
        const dmin = Math.min(...enemyCities.map(e => hexDistance(e.r, e.c, r, c)));
        pos += Math.max(0, 6 - dmin) * 0.4;
        if (dmin <= 1) pos -= 2.5 * kiExposure(S, pi, r, c) / 6;   // ungedeckt vor der Mauer
      }
      pos -= 0.3 * kiExposure(S, pi, r, c);
      const s = v + pos;
      if (!best || s > best.s) best = { r, c, s };
    }
    if (best && (best.r !== a.r || best.c !== a.c)) moveArmy(S, a, best.r, best.c);
    else if (inCity) kiLeaveCity(S, pi, a);
  }
  // Pflicht: keine Armee bleibt in einer Stadt stehen, wenn sie heraus kann
  for (const a of armiesOf(S, pi)) if (cityAt(S, a.r, a.c) && a.mp > 0) kiLeaveCity(S, pi, a);
}

/* ------------------------------------------------------------------ Zug */
/* Ein ganzer Zug der KI. Aufgerufen wie botTurn: danach folgt finishTurn (Kampf, Sieg) an
   genau einer Stelle für alle. `notes` sammelt die wichtigsten Gründe fürs Protokoll. */
function kiTurn(S, pi) {
  const p = S.players[pi];
  kiSeedRng(S, pi);
  if (p.dead || S.over) return;
  const notes = [];
  const K = kiContext(S, pi);
  const memo = {};
  kiPlan(S, pi, K, notes, memo);
  if (!S.over) kiPositionArmies(S, pi, K, memo);
  // Gratis-Ansprüche, die noch offen sind (sie verfallen sonst zum Zugende)
  kiUsePicks(S, pi, K);
  if (notes.length) log(S, 'info', T('KI: %s', notes.slice(0, 3).join(' · ')));
}
function kiUsePicks(S, pi, K) {
  for (let guard = 0; guard < 8; guard++) {
    const opts = freePickOptions(S, pi).length ? freePickOptions(S, pi)
      : backPickOptions(S, pi);
    if (!opts.length) break;
    const byFree = freePickOptions(S, pi).length > 0;
    let best = null;
    for (const t of opts) {
      const X = kiClone(S, 1);
      const err = byFree ? useFreePick(X, pi, t.k) : useBackPick(X, pi, t.k);
      if (err) continue;
      const v = kiValue(X, pi, K);
      if (!best || v > best.v) best = { t, v };
    }
    if (!best) break;
    const err = byFree ? useFreePick(S, pi, best.t.k) : useBackPick(S, pi, best.t.k);
    if (err) break;
  }
}

/* ------------------------------------------------------------------ Startplättchen
   Die KI legt ihr Startdreieck wie ein Mensch: sie sieht die offenen Plättchen und ihr
   eigenes, nicht die der anderen. Bewertet wird jede erlaubte Lage × Hauptstadt mit dem
   Ertrag im ersten Zug (placeYieldAt – dieselbe Zahl wie in der Ertragsübersicht) und mit
   dem Platz zum Siedeln: die besten Gründungsplätze in Reichweite auf der sichtbaren Karte. */
function kiPlaceSeat(plan, seat, player, setup) {
  const best = [];
  for (let o = 0; o < 3; o++) {
    const ok = placeOptions(plan, seat, o);
    ok.forEach((v, cell) => {
      if (!v) return;
      const y = placeYieldAt(plan, seat, o, cell, player);
      if (!y) return;
      best.push({ o, cell, y, s: 1.0 * y.sci + 1.1 * y.food + 0.8 * y.coins });
    });
  }
  if (!best.length) return 'Kein Platz.';
  best.sort((a, b) => b.s - a.s);
  // die besten Kandidaten genauer: Siedelplätze auf der sichtbaren Karte
  const top = best.slice(0, 8);
  for (const cand of top) cand.s += kiPlaceExpansion(plan, seat, cand.o, cand.cell, player, setup);
  top.sort((a, b) => b.s - a.s);
  return placeSeat(plan, seat, top[0].o, top[0].cell);
}
function kiPlaceExpansion(plan, seat, o, cell, player, setup) {
  const shape = planShape(plan);
  const shown = shape.slots.map((_, i) => i).filter(i => !isSeatSlot(plan, i) || i === seat.slot);
  const map = tileMap(plan, { show: shown, seat, o, cell, caps: [seat.idx] });
  map.capitals = map.capitals[seat.idx] ? [map.capitals[seat.idx]] : [];
  const G = newGame({
    seed: 1, map, players: [{ civ: player.civ, kind: 'human', ability: player.ability }],
    avail: setup && setup.avail ? [setup.avail[seat.idx]] : undefined,
  });
  if (!G.cities.length) return -99;
  const K = { pi: 0, lvl: KI_PARAMS.schwer, w: KI_W, R: 8, H: kiHorizon(8, KI_W.gamma), enemies: [], info: new Map(), vGame: KI_W.game };
  G.players[0].res = { sci: 0, food: 99, coins: 0 };
  const sites = kiSites(G, 0, K, null);
  // die drei besten Plätze zählen, der erste voll, die weiteren weniger
  const vals = sites.map(s => s.v - s.cost * 1.5).sort((a, b) => b - a).slice(0, 3);
  return 0.12 * ((vals[0] || -20) + 0.6 * (vals[1] || -20) + 0.35 * (vals[2] || -20));
}
