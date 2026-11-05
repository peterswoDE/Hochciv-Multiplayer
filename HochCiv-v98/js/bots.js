/* Bot-Züge nach den Bot-Regeln des Regelhefts.
   Bots zahlen keine Ressourcen – alles läuft über Würfelproben gegen den
   Schwierigkeitsgrad. Ihr Machtwert ist immer ihre Gesamtbevölkerung. */

function botMin(p) { return (DIFFICULTIES.find(d => d.k === p.diff) || DIFFICULTIES[2]).min; }
function botTry(S, p, why) {
  const need = botMin(p);
  const v = d6(S, `${why} (${need}+)`);
  return v >= need;
}
/* Bots siedeln nach genau denselben Regeln wie Menschen (canFound), nur ohne
   Kostenprüfung – Bots zahlen nichts. */
function settleable(S, pi, r, c) {
  const t = terrainAt(S, r, c);
  if (!t || !TERRAIN[t].land || TERRAIN[t].block) return false;   // kein Meer, kein Vulkan
  if (armyAt(S, r, c)) return false;
  if (enemyArmyAdjacent(S, pi, r, c)) return false;               // nicht neben fremden Armeen
  return !S.cities.some(x => hexDistance(x.r, x.c, r, c) < 3);
}
// Bots bewegen sich nach genau denselben Regeln wie Menschen: überall canPass (engine.js).

/* Der Bot-Siedler zieht nach den Bewegungsregeln (canPass) – zusätzlich sperrt ihn
   gegnerisches Territorium. Das ist eine Siedelregel und gilt für Bots wie für Menschen,
   sonst wäre die neue Sperre ein einseitiger Nachteil des Menschen (v63). Die Luftwaffe
   hebt beides auf. `fremd` wird einmal je Suche berechnet und mitgegeben, nicht je Feld. */
function botSettlerPass(S, pi, r, c, fremd) {
  if (!canPass(S, pi, r, c)) return false;
  if (has(S.players[pi], 'luftwaffe')) return true;
  return !(fremd || foreignTerritory(S, pi)).has(key(r, c));
}

function botTurn(S, pi) {
  const p = S.players[pi];
  const capital = capitalOf(S, pi) || citiesOf(S, pi)[0];

  // 1 Bevölkerungswachstum
  for (const city of citiesOf(S, pi))
    if (botTry(S, p, 'Wachstum')) { city.pop++; log(S, 'act', T('%s: Stadt wächst auf %s.', civOf(p).n, city.pop)); }

  // 2 Siedeln
  if (capital && botTry(S, p, 'Siedeln')) botSettle(S, pi, capital);

  // 2b Weltwunder (nur mit Erweiterung): Probe, dann ein zufälliges baubares Wunder.
  botWonderStep(S, pi);

  // 3 Armee bauen
  if (capital && botTry(S, p, T('Armee bauen')) && !armyAt(S, capital.r, capital.c)) {
    S.armies.push({ id: S.nextId++, owner: pi, r: capital.r, c: capital.c, mp: 0, born: S.round });
    log(S, 'act', T('%s: neue Armee in der Hauptstadt.', civOf(p).n));
  }

  // 4 Armeen bewegen: erst die abgestimmten Prioritäten 1–6, dann jede übrige für sich
  for (const army of armiesOf(S, pi)) { army.mp = moveAllowance(S, pi); delete army.botDone; delete army.halted; }
  botPlanArmies(S, pi);
  for (const army of armiesOf(S, pi)) {
    if (!army.botDone) botMoveArmy(S, pi, army);
    delete army.botDone;                       // Merker nicht im Spielstand hinterlassen
  }

  // 5 Forschen: der Bot würfelt zweimal, ob er forscht; bei zwei Erfolgen
  // erforscht er in zwei unterschiedlichen Technologiefeldern.
  if (BOT_RESEARCH_TWICE) {
    const usedFields = [];
    for (let i = 0; i < 2; i++) {
      if (S.over) break;
      if (!botTry(S, p, 'Forschen ' + (i + 1))) continue;
      const f = botResearch(S, pi, usedFields);
      if (f != null) usedFields.push(f);
    }
  } else {
    if (botTry(S, p, 'Forschen')) botResearch(S, pi);
  }

  // Schritt 6 (Kampf) und 7 (Sieg) laufen in finishTurn – für alle gleich.
}

/* ---------------------------------------------------- Siedler (Zufallswanderung) */
/* Siedlerbewegung nach den Bot-Regeln des Regelhefts (Schritte 1–7):
   Der Siedler zieht auf das durch Bewegung erreichbare siedelbare Feld, das der
   Hauptstadt am nächsten liegt; bei mehreren gleich nahen wird ausgewürfelt. Steht er
   auf einem siedelbaren Feld, würfelt er: bei 3+ siedelt er, sonst zieht er ein Feld in
   eine ausgewürfelte Richtung und prüft erneut. Er geht nie direkt zurück, betritt Meer
   nur mit passender Technologie, und trifft er auf eine eigene Stadt, beginnt er wieder
   beim Zug zum nächstgelegenen siedelbaren Feld. */
function settleDistances(S, pi, fromR, fromC) {
  // Geländedistanz vom Startfeld aus, mit den Wegregeln des Siedlers
  const fremd = foreignTerritory(S, pi);
  const dist = new Map([[key(fromR, fromC), 0]]);
  let front = [[fromR, fromC]];
  while (front.length) {
    const next = [];
    for (const [r, c] of front) {
      const d = dist.get(key(r, c));
      for (const [nr, nc] of neighbors(r, c)) {
        const k = key(nr, nc);
        if (dist.has(k)) continue;
        if (!botSettlerPass(S, pi, nr, nc, fremd)) continue;
        dist.set(k, d + 1);
        next.push([nr, nc]);
      }
    }
    front = next;
  }
  return dist;
}
/* Die erreichbaren siedelbaren Felder mit der kleinsten Distanz zur Hauptstadt. */
function nearestSettleSpots(S, pi, capital) {
  const dist = settleDistances(S, pi, capital.r, capital.c);
  let best = Infinity, out = [];
  for (const [k, d] of dist) {
    const [r, c] = unkey(k);
    if (!settleable(S, pi, r, c)) continue;
    if (d < best) { best = d; out = [[r, c]]; }
    else if (d === best) out.push([r, c]);
  }
  return out;
}
function botSettle(S, pi, capital) {
  const p = S.players[pi];
  const fremd = foreignTerritory(S, pi);      // ändert sich während der Wanderung nicht
  let r = capital.r, c = capital.c, prev = null;
  // Schritte 2–3: zum nächstgelegenen siedelbaren Feld, Gleichstände auswürfeln
  const goToNearest = () => {
    const spots = nearestSettleSpots(S, pi, capital);
    if (!spots.length) return false;
    let pick = spots[0];
    if (spots.length > 1) {
      let idx = 0;
      do { idx = d6(S, T('Siedlerziel auswürfeln (1–%s)', Math.min(spots.length, 6))); } while (idx > spots.length);
      pick = spots[idx - 1];
    }
    r = pick[0]; c = pick[1]; prev = null;
    log(S, 'info', T('%s: Siedler zieht auf %s/%s (nächstes siedelbares Feld).', civOf(p).n, r, c));
    return true;
  };
  if (!goToNearest()) { log(S, 'info', `${civOf(p).n}: Siedler findet keinen Platz.`); return; }
  for (let step = 0; step < 40; step++) {
    // Schritt 5: auf siedelbarem Feld würfeln, bei 3+ siedeln
    if (settleable(S, pi, r, c)) {
      if (d6(S, 'Siedeln? (3+)') >= 3) {
        const pop = isAbil(p, 'siedler') ? 2 : 1;
        S.cities.push({ id: S.nextId++, owner: pi, r, c, pop, cap: false, grown: 0, born: S.round });
        log(S, 'act', T('%s: Siedler gründet Stadt auf %s/%s.', civOf(p).n, r, c));
        return;
      }
    }
    // Schritt 6: ein Feld in ausgewürfelter Richtung
    const dir = d6(S, 'Richtung ' + DIR_NAMES.map((n, i) => (i + 1) + '=' + n[0] + n[1].toLowerCase()).join(' ')) - 1;
    const [nr, nc] = neighbor(r, c, dir);
    const own = cityAt(S, nr, nc);
    if (own && own.owner === pi) {                       // Schritt 4: eigene Stadt → von vorn
      if (!goToNearest()) break;
      continue;
    }
    if (prev && prev[0] === nr && prev[1] === nc) continue;   // Schritt 7: nie direkt zurück
    if (!botSettlerPass(S, pi, nr, nc, fremd)) continue;
    prev = [r, c]; r = nr; c = nc;
  }
  log(S, 'info', `${civOf(p).n}: Siedler findet keinen Platz.`);
}

/* ---------------------------------------------------- Armeebewegung nach Prioritäten
   1. Gegnerische HAUPTSTADT erobern, die im letzten Zug erfolgreich belagert wurde
   2. Armee flankieren, die die eigene Hauptstadt angreift
   3. Eigene Hauptstadt verteidigen (möglichst neben dem Angreifer)
   4. Armee flankieren, die eine andere eigene Stadt angreift
   5. Andere eigene Stadt verteidigen
   6. Gegnerische Stadt erobern, die im letzten Zug erfolgreich belagert wurde
   7. Gegnerische Stadt angreifen
   8. Gegnerische Armee flankieren
   9. An den Reichsrand, am nächsten zum Gegner

   1–6 brauchen Absprache zwischen den Armeen (wie viele reichen für die Eroberung? wer
   verteidigt welche Stadt?) und laufen deshalb in botPlanArmies über alle Armeen
   gemeinsam. 7–9 entscheidet jede übrige Armee für sich in botMoveArmy.
   Verteidigung geht vor Eroberung; innerhalb einer Stufe zählt die größere Stadt zuerst. */

/* Eine Armee bleibt nicht in einer eigenen Stadt stehen: dort blockiert sie den Bauplatz
   für die nächste und schützt schlechter als auf einem Feld daneben (in der Stadt zählt
   sie zwar zur Verteidigung, kann aber nicht flankieren und nicht abfangen). Erlaubt ist
   es nur, wenn es gar keinen anderen Halteplatz gibt – etwa auf einer vollen Insel. */
function botOutOfCity(S, pi, tiles) {
  const frei = tiles.filter(([r, c]) => { const ct = cityAt(S, r, c); return !ct || ct.owner !== pi; });
  return frei.length ? frei : tiles;
}
/* Erreichbare Halteplätze einer Armee, mit Wegkosten.
   Das eigene Feld gehört dazu: reachable() liefert es nicht mit (es gilt als besetzt),
   aber „stehen bleiben" muss eine Option sein – sonst räumt eine Armee, die schon
   genau richtig steht, ihren Platz und verschlechtert die Lage. */
function botReach(S, pi, army) {
  const reach = reachable(army.r, army.c, moveBudget(army),
    (r, c) => canPass(S, pi, r, c) ? (zocStop(S, pi, r, c) ? 'stop' : true) : false,
    (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2));
  const tiles = botOutOfCity(S, pi,
    [...reach.keys()].map(unkey).filter(([r, c]) => canStop(S, pi, r, c)));
  const hier = key(army.r, army.c);
  if (!reach.has(hier)) { tiles.push([army.r, army.c]); reach.set(hier, 0); }
  return { tiles: botOutOfCity(S, pi, tiles), cost: t => reach.get(key(t[0], t[1])) };
}
function botStep(S, pi, army, goal, why) {
  if (goal[0] === army.r && goal[1] === army.c) return true;   // steht schon richtig
  const { cost } = botReach(S, pi, army);
  const c = cost(goal);
  if (c == null) return false;
  arriveAt(S, army, goal[0], goal[1], c);          // Kontrollzone: dort endet die Bewegung
  log(S, 'act', T('%s: Armee %s → %s/%s.', civOf(S.players[pi]).n, why, goal[0], goal[1]));
  return true;
}
/* Eine Stadt gilt als belagert, wenn der letzte Zugkampf gewonnen wurde – der nächste
   Erfolg erobert sie (S.sieges zählt bis 2). */
function siegeReady(S, pi, city) { return (S.sieges[pi + '|' + city.id] || 0) >= 1; }
/* Wie viele eigene Armeen in Reichweite nötig wären, damit der Angriff durchkommt.
   null, wenn es auch mit allen nicht reicht. */
function attackersNeeded(S, pi, city, maxN) {
  const d = defenseValue(S, city);
  for (let n = 1; n <= maxN; n++) if (attackValue(S, pi, n) > d) return n;
  return null;
}
/* Kann diese Armee von t aus die feindliche Armee e flankieren? Dieselbe Rechnung wie
   in der Kampfphase: gegenüberliegend, mit Taktik von zwei beliebigen Seiten; mit
   Burgenbau zählen auch die eigenen Städte als Partnerposition. */
function botFlankOk(S, pi, army, e, t) {
  const p = S.players[pi], rng = attackRange(S, pi);
  const d = hexDistance(e.r, e.c, t[0], t[1]);
  if (d < 1 || d > rng) return false;
  const partners = armiesOf(S, pi).filter(a => a !== army).map(a => [a.r, a.c])
    .concat(has(p, 'burgenbau') ? citiesOf(S, pi).map(c => [c.r, c.c]) : [])
    .filter(([r, c]) => { const dd = hexDistance(r, c, e.r, e.c); return dd >= 1 && dd <= rng; });
  if (has(p, 'taktik')) return partners.length >= 1;
  // gegenüber, am Gegner gespiegelt – in Würfelkoordinaten (v75, vorher Zeile/Spalte)
  return partners.some(([r, c]) => hexOpposite(e.r, e.c, t[0], t[1], r, c));
}
/* Feindliche Armeen, die diese eigene Stadt bedrohen.
   Maßstab ist keine Kraftrechnung, sondern die **laufende Belagerung**: Erst wenn ein
   Gegner den ersten Kampf gewonnen hat (Zähler 1/2), wird verteidigt.
   Das genügt, weil eine Eroberung zwei erfolgreiche Züge in Folge braucht. Zieht man
   Verteidiger ab und beginnt dadurch überhaupt erst eine Belagerung, bleibt immer noch
   eine volle Runde, um sie zurückzuholen – dieselbe Vorwarnzeit, die auch der Mensch hat. */
function threateningArmies(S, pi, city) {
  const out = [];
  for (let i = 0; i < S.players.length; i++) {
    if (i === pi) continue;
    if ((S.sieges[i + '|' + city.id] || 0) < 1) continue;      // noch kein Treffer
    for (const a of S.armies)
      if (a.owner === i && hexDistance(a.r, a.c, city.r, city.c) <= attackRange(S, i))
        out.push(a);
  }
  return out;
}
function botPlanArmies(S, pi) {
  const rng = attackRange(S, pi);
  const offen = () => armiesOf(S, pi).filter(a => a.mp > 0 && !a.botDone);
  const belege = a => { a.botDone = true; };

  /* Prio 1 und 6: eine begonnene Belagerung abschließen.
     Prio 1 nimmt ALLE erreichbaren Armeen (die Hauptstadt ist es wert), Prio 6 nur so
     viele, wie für den Durchbruch nötig sind – der Rest wird anderswo gebraucht.
     Zugewiesen wird nacheinander, nicht gleichzeitig: sonst wählen mehrere Armeen
     dasselbe Feld, und alle bis auf eine bleiben stehen. */
  const inRangeOf = city => armiesOf(S, pi)
    .filter(a => hexDistance(a.r, a.c, city.r, city.c) <= rng);
  const bestesFeld = (a, city) => {
    const { tiles, cost } = botReach(S, pi, a);
    const spots = tiles.filter(t => hexDistance(city.r, city.c, t[0], t[1]) <= rng);
    if (!spots.length) return null;
    const t = spots.reduce((x, y) => cost(y) < cost(x) ? y : x);
    return { t, c: cost(t) };
  };
  const finishSiege = (city, alle) => {
    const schon = inRangeOf(city);
    // Optimistische Vorprüfung: wie viele könnten überhaupt hinkommen?
    const koennen = offen().filter(a => !schon.includes(a) && bestesFeld(a, city));
    const noetig = attackersNeeded(S, pi, city, schon.length + koennen.length);
    if (noetig == null || schon.length + koennen.length < noetig) return false;
    for (const a of schon) if (!a.botDone) belege(a);        // gut stehende bleiben stehen
    let offenZiel = alle ? Infinity : Math.max(0, noetig - schon.length);
    const why = alle ? T('stürmt die belagerte Hauptstadt') : T('schließt die Belagerung ab');
    while (offenZiel > 0) {
      let best = null;
      for (const a of offen()) {
        const b = bestesFeld(a, city);
        if (b && (!best || b.c < best.c)) best = { a, t: b.t, c: b.c };
      }
      if (!best) break;
      if (!botStep(S, pi, best.a, best.t, why)) break;
      belege(best.a); offenZiel--;
    }
    return true;
  };

  const feindStaedte = () => S.cities.filter(c => c.owner !== pi);
  // Prio 1: belagerte gegnerische HAUPTSTADT
  for (const city of feindStaedte().filter(c => c.cap && siegeReady(S, pi, c)))
    finishSiege(city, true);

  /* Prio 2–5: eigene Städte schützen. Erst die Hauptstadt, dann die übrigen nach Größe.
     Je Stadt zuerst flankieren (das entfernt den Angreifer ganz), dann verteidigen. */
  const eigene = citiesOf(S, pi).slice().sort((a, b) =>
    (b.cap ? 1 : 0) - (a.cap ? 1 : 0) || b.pop - a.pop);
  for (const city of eigene) {
    const feinde = threateningArmies(S, pi, city);
    if (!feinde.length) continue;
    const label = city.cap ? T('die Hauptstadt') : T('eine Stadt');
    // (a) flankieren – schlägt die angreifende Armee ganz aus dem Spiel
    for (const a of offen()) {
      const { tiles, cost } = botReach(S, pi, a);
      let bestT = null, bestC = Infinity;
      for (const e of feinde)
        for (const t of tiles)
          if (botFlankOk(S, pi, a, e, t) && cost(t) < bestC) { bestT = t; bestC = cost(t); }
      if (bestT && botStep(S, pi, a, bestT, T('flankiert einen Angreifer auf %s', label))) belege(a);
    }
    // (b) verteidigen: in Reichweite der Stadt, möglichst dicht am Angreifer
    for (const a of offen()) {
      const { tiles, cost } = botReach(S, pi, a);
      const spots = tiles.filter(t => hexDistance(city.r, city.c, t[0], t[1]) <= projectRange(S, pi));
      if (!spots.length) continue;
      const naehe = t => Math.min(...feinde.map(e => hexDistance(e.r, e.c, t[0], t[1])));
      const best = spots.reduce((x, y) =>
        (naehe(y) * 100 + cost(y)) < (naehe(x) * 100 + cost(x)) ? y : x);
      if (botStep(S, pi, a, best, `verteidigt ${label}`)) belege(a);
    }
  }

  // Prio 6: übrige belagerte gegnerische Städte – nur so viele Armeen wie nötig,
  // größte Stadt zuerst.
  const reif = feindStaedte().filter(c => !c.cap && siegeReady(S, pi, c))
    .sort((a, b) => b.pop - a.pop);
  for (const city of reif) finishSiege(city, false);
}
function botMoveArmy(S, pi, army) {
  const p = S.players[pi];
  const reach = reachable(army.r, army.c, moveBudget(army),
    (r, c) => canPass(S, pi, r, c) ? (zocStop(S, pi, r, c) ? 'stop' : true) : false,
    (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2));
  // Zielfelder: nur solche, auf denen die Armee auch anhalten darf (kein Meer ohne
  // Panzerschiff/Luftwaffe). Meer bleibt als Durchgangsfeld erlaubt.
  const tiles = botOutOfCity(S, pi,
    [...reach.keys()].map(unkey).filter(([r, c]) => canStop(S, pi, r, c)));
  if (!tiles.length) return;
  const cost = t => reach.get(key(t[0], t[1]));
  const rng = attackRange(S, pi);

  // wählt aus bewerteten Zielen das beste (kleinster score); Gleichstände auswürfeln
  const chooseBy = (cands, scoreFn) => {
    if (!cands.length) return null;
    const scored = cands.map(t => ({ t, s: scoreFn(t) }));
    const best = Math.min(...scored.map(x => x.s));
    const top = scored.filter(x => Math.abs(x.s - best) < 1e-9).map(x => x.t);
    if (top.length === 1) return top[0];
    let idx = 0;
    do { idx = d6(S, `mehrere gleich gute Ziele (1–${Math.min(top.length, 6)})`); } while (idx > top.length);
    return top[idx - 1];
  };

  let goal = null, why = '';

  // Verteidigung und Belagerungsabschluss sind vorher in botPlanArmies abgehandelt.
  // Hier bleiben die Prioritäten 7–9: angreifen, flankieren, an den Rand.

  // Priorität 7: gegnerische Stadt angreifen – schwächster Gegner, Hauptstadt bevorzugt
  if (!goal) {
    const enemyCities = S.cities.filter(x => x.owner !== pi);
    const spots = tiles.filter(t => enemyCities.some(c => hexDistance(c.r, c.c, t[0], t[1]) <= rng));
    goal = chooseBy(spots, t => {
      const targets = enemyCities.filter(c => hexDistance(c.r, c.c, t[0], t[1]) <= rng);
      const best = Math.min(...targets.map(c =>
        powerOf(S, c.owner) * 10 + (c.cap ? -5 : 0)));   // schwächster Gegner, Hauptstadt −5
      return best * 100 + cost(t);
    });
    if (goal) why = T('greift eine gegnerische Stadt an');
  }

  // Priorität 8: gegnerische Armee flankieren – schwächste zuerst
  if (!goal) {
    const mine = armiesOf(S, pi).filter(a => a !== army);
    const castle = has(p, 'burgenbau') ? citiesOf(S, pi).map(c => [c.r, c.c]) : [];
    const partnersFor = e => mine.map(a => [a.r, a.c]).concat(castle)
      .filter(([r, c]) => { const d = hexDistance(r, c, e.r, e.c); return d >= 1 && d <= rng; });
    const flankSpot = (e, t) => {
      if (hexDistance(e.r, e.c, t[0], t[1]) < 1 || hexDistance(e.r, e.c, t[0], t[1]) > rng) return false;
      if (has(p, 'taktik')) return partnersFor(e).length >= 1;
      return partnersFor(e).some(([r, c]) => hexOpposite(e.r, e.c, t[0], t[1], r, c));
    };
    const candidates = [];
    for (const e of S.armies) {
      if (e.owner === pi || powerOf(S, pi) <= powerOf(S, e.owner)) continue;
      for (const t of tiles) if (flankSpot(e, t)) candidates.push({ t, e });
    }
    goal = chooseBy(candidates.map(x => x.t), t => {
      const e = candidates.find(x => x.t[0] === t[0] && x.t[1] === t[1]).e;
      return powerOf(S, e.owner) * 100 + cost(t);
    });
    if (goal) why = T('flankiert eine gegnerische Armee');
  }

  // Priorität 9: innerhalb des eigenen Reiches an den Rand ziehen, dem eine gegnerische
  // Stadt am nächsten liegt. Der Bot verlässt sein Territorium hier NICHT.
  // Tiebreaker: gleiche Distanz → geringster Verteidigungswert der Stadt → auswürfeln.
  if (!goal) {
    const own = controlledTiles(S, pi);
    for (const c of citiesOf(S, pi)) own.add(key(c.r, c.c));   // eigene Städte gehören dazu
    // nur erreichbare Felder im eigenen Reich
    const inRealm = tiles.filter(t => own.has(key(t[0], t[1])));
    const insideNow = own.has(key(army.r, army.c));
    if (!inRealm.length && !insideNow) {
      // Armee steht außerhalb und erreicht ihr Reich diese Runde nicht → dorthin zurück
      const realmCells = [...own].map(unkey);
      goal = chooseBy(tiles, t =>
        Math.min(...realmCells.map(rc => hexDistance(rc[0], rc[1], t[0], t[1]))) * 10 + cost(t));
      if (goal && (goal[0] !== army.r || goal[1] !== army.c)) why = T('kehrt ins eigene Reich zurück');
      else goal = null;
    } else {
    const rim = inRealm.filter(t =>
      neighbors(t[0], t[1]).some(([r, c]) => !own.has(key(r, c))));
    const list = rim.length ? rim : (inRealm.length ? inRealm : [[army.r, army.c]]);
    const enemyCities = S.cities.filter(x => x.owner !== pi);
    if (enemyCities.length) {
      // Distanz über tatsächlich passierbares Gelände (nicht Luftlinie): der Bot kann
      // ohne die passende Technologie nicht über Meer, muss also außenherum.
      const passable = (r, c) => {
        const t = terrainAt(S, r, c);
        if (!t) return false;
        if (cityAt(S, r, c)) return false;      // Städte blockieren den Weg
        return TERRAIN[t].land || has(p, 'navigation') || has(p, 'panzerschiff') || has(p, 'luftwaffe');
      };
      const distTo = (c, t) => {
        const d = pathSteps(t[0], t[1], c.r, c.c, passable);
        return d == null ? 9999 : d;            // unerreichbar (z. B. andere Insel) ganz hinten
      };
      goal = chooseBy(list, t => {
        let bestDist = Infinity, bestDef = Infinity;
        for (const c of enemyCities) {
          const d = distTo(c, t);
          const def = defenseValue(S, c);
          if (d < bestDist || (d === bestDist && def < bestDef)) { bestDist = d; bestDef = def; }
        }
        return bestDist * 1000 + bestDef;     // Distanz dominiert, Verteidigung als Tiebreaker
      });
    } else {
      goal = chooseBy(list, () => 0);         // keine Gegnerstädte: irgendein Randfeld
    }
    if (goal && (goal[0] !== army.r || goal[1] !== army.c)) why = 'zieht an den Reichsrand';
    else goal = null;                         // schon am besten Randfeld: stehen bleiben
    }
  }

  if (goal) {
    arriveAt(S, army, goal[0], goal[1], cost(goal));
    log(S, 'act', T('%s: Armee %s → %s/%s.', civOf(p).n, why, goal[0], goal[1]));
  }
}

/* ---------------------------------------------------- Forschung */
function botResearch(S, pi, avoidFields = []) {
  const p = S.players[pi];
  let f, field, guard = 0;
  do {
    do { f = d6(S, 'Technologiefeld (1–4)'); } while (f > 4);
    field = f - 1;
  } while (avoidFields.includes(field) && ++guard < 20);  // v2: anderes Feld als beim ersten Mal
  // Singularität, sobald ein Feld der Moderne schon beforscht ist
  if (techPool(S).some(t => t.f === field && t.age === 3 && p.techs[t.k])) {
    p.techs.singularitaet = true;
    log(S, 'act', T('%s erforscht die Singularität!', civOf(p).n));
    claimVictory(S, pi, T('Forschungssieg (Singularität)'));   // fällt am Rundenende
    return field;
  }
  // höchstes erforschbares Zeitalter in diesem Feld
  let age = 0;
  for (let a = 1; a <= 3; a++) if (techPool(S).some(t => t.f === field && t.age === a - 1 && p.techs[t.k])) age = a;
  while (age >= 0 && !techsIn(field, age, S).some(t => !p.techs[t.k])) age--;
  if (age < 0) { log(S, 'info', `${civOf(p).n}: nichts mehr zu forschen in ${FIELDS[field]}.`); return field; }
  const list = techsIn(field, age, S);
  let idx;
  for (let guard = 0; guard < 30; guard++) {
    idx = d6(S, `Technologie in ${FIELDS[field]} / ${AGES[age]} (1–${list.length})`);
    if (idx <= list.length && !p.techs[list[idx - 1].k]) break;
    idx = 0;
  }
  let tech = idx ? list[idx - 1] : list.find(t => !p.techs[t.k]);
  // Im Tutorial darf ein Feld vorgegeben sein. Gewürfelt wird trotzdem ganz normal –
  // nur das Ergebnis wird getauscht, damit die feste Würfelfolge unberührt bleibt.
  if (typeof tutBotTech === 'function') tech = tutBotTech(S, pi, field) || tech;
  p.techs[tech.k] = true;
  log(S, 'act', T('%s erforscht %s.', civOf(p).n, tech.n));
  return field;   // Bots bestimmen ihr Zeitalter aus den erforschten Techs, kein avail nötig
}
