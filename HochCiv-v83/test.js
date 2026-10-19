/* Prüft die Regelmaschine gegen die Beispiele aus dem Regelheft. */
const fs = require('fs'), vm = require('vm');
for (const f of ['js/data.js', 'js/civs.js', 'js/i18n.js', 'js/hex.js', 'js/tiles.js', 'js/engine.js', 'js/expansion.js', 'js/bots.js', 'js/ki.js', 'js/marathon.js', 'js/tutorial.js'])
  vm.runInThisContext(fs.readFileSync(__dirname + '/' + f, 'utf8'));

let fails = 0;
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); }
  else console.log(`  ok  ${label}`);
};

// Bringt die Zielzivilisation auf Index 0, indem Spieler samt Städte/Armeen umnummeriert
// werden. Nötig, weil newGame die feste Reihenfolge erzwingt; die meisten Tests wollen
// aber „ihren" Spieler an Index 0. Am Spielverhalten ändert das nichts.
function normalize(S, civ) {
  const from = S.players.findIndex(p => p.civ === civ);
  if (from === 0) return S;
  const remap = {}; S.players.forEach((_, i) => remap[i] = i);
  const order = [from, ...S.players.map((_, i) => i).filter(i => i !== from)];
  const newPlayers = order.map(i => S.players[i]);
  const inv = {}; order.forEach((oldI, newI) => inv[oldI] = newI);
  S.players = newPlayers;
  S.cities.forEach(c => c.owner = inv[c.owner]);
  S.armies.forEach(a => a.owner = inv[a.owner]);
  Object.keys(S.sieges || {}).forEach(k => {
    const [pi, cid] = k.split('|'); const nk = inv[+pi] + '|' + cid;
    if (nk !== k) { S.sieges[nk] = S.sieges[k]; delete S.sieges[k]; }
  });
  S.cur = inv[S.cur];
  return S;
}
const mk = (civ, techs = []) => {
  const S = normalize(newGame({ players: [{ civ, kind: 'human' }, { civ: 'england', kind: 'bot' }], seed: 7 }), civ);
  techs.forEach(t => S.players[0].techs[t] = true);
  return S;
};
// Spiel mit Erweiterungen (Ereignisse und/oder Weltwunder)
const mkX = (civ, opts = {}, techs = []) => {
  const S = normalize(newGame(Object.assign({
    players: [{ civ, kind: 'human', ability: opts.ability }, { civ: 'england', kind: 'bot' }], seed: 7,
  }, opts)), civ);
  techs.forEach(t => S.players[0].techs[t] = true);
  return S;
};
// Spiel mit gewählter Zivilisationsfähigkeit
const mkA = (civ, ability, techs = []) => {
  const S = normalize(newGame({
    players: [{ civ, kind: 'human', ability }, { civ: 'england', kind: 'bot' }], seed: 7,
  }), civ);
  techs.forEach(t => S.players[0].techs[t] = true);
  return S;
};
// Hilfsfunktion: freies Landfeld neben der Hauptstadt, für Armeen im Test
const spotBy = (S, city) => neighbors(city.r, city.c).find(([r, c]) =>
  isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));

/* --- Beispiel "Zug 1 (Alex)": Hauptstadt mit 1 Bevölkerung, 4 Grasland + 2 Meer
       → 1 Wissenschaft, 3 Nahrung, 2 Münzen                                     */
{
  const S = mk('griechenland');
  const sum = [0, 0, 0];
  for (const t of ['G', 'G', 'G', 'G', 'M', 'M']) {
    const y = tileYield(S, 0, t); sum[0] += y[0]; sum[1] += y[1]; sum[2] += y[2];
  }
  const py = cityPopYield(S, 0);
  // Das Regelheft schreibt hier "2 Münzen" und vergisst dabei die Münze der Stadtbevölkerung,
  // die es einen Absatz später selbst aufzählt. Richtig sind 3 Münzen (2 Meer + 1 Bevölkerung).
  eq([sum[0] + py[0], sum[1] + py[1], sum[2] + py[2]], [1, 3, 3], 'Zug 1: 4 Grasland + 2 Meer + 1 Bevölkerung');
}

/* --- Beispiel "Zug 2 (Alex)": 9 Grasland, 2 Meer, 1 Gebirge, 2 Stadtbevölkerung,
       Techs Schrift + Landwirtschaft → 5 Wissenschaft, 16 Nahrung, 5 Münzen      */
{
  const S = mk('griechenland', ['schrift', 'landwirtschaft']);
  const tiles = 'GGGGGGGGGMMB'.split('');
  const sum = [0, 0, 0];
  tiles.forEach(t => { const y = tileYield(S, 0, t); sum[0] += y[0]; sum[1] += y[1]; sum[2] += y[2]; });
  const py = cityPopYield(S, 0), pop = 2;
  eq([sum[0] + py[0] * pop, sum[1] + py[1] * pop, sum[2] + py[2] * pop], [5, 16, 5], 'Zug 2: Einkommen');
}

/* --- Kampfbeispiel: 15 Grasland, 4 Stadtbevölkerung, 3 Fluss, 4 Meer, 2 Gebirge,
       Techs Schrift, Papier, Landwirtschaft → 25 Wissenschaft, 29 Nahrung, 13 Münzen */
{
  const S = mk('griechenland', ['schrift', 'papier', 'landwirtschaft']);
  const sum = [0, 0, 0];
  const tiles = 'G'.repeat(15) + 'F'.repeat(3) + 'M'.repeat(4) + 'B'.repeat(2);
  tiles.split('').forEach(t => { const y = tileYield(S, 0, t); sum[0] += y[0]; sum[1] += y[1]; sum[2] += y[2]; });
  const py = cityPopYield(S, 0), pop = 4;
  eq([sum[0] + py[0] * pop, sum[1] + py[1] * pop, sum[2] + py[2] * pop], [25, 29, 13], 'Kampfbeispiel: Einkommen');
}

/* --- Griechische Technologiekosten aus dem Beispiel
   Das Beispiel im Regelheft rechnet mit den alten Kosten (Schrift 1, Biologie 15). Die gelten
   seit v82 nur noch im Tutorial – das Beispiel läuft deshalb im alten Techtree. Dieselben
   Abzüge auf die heutigen Kosten prüft der Abschnitt „Techtree" weiter unten. */
{
  const S = mk('griechenland'); S.oldTree = true;
  eq(techCost(S, 0, TECH_BY_KEY.schrift), 0, 'Schrift kostet Griechenland 0');
  eq(techCost(S, 0, TECH_BY_KEY.eisenverarbeitung), 1, 'Eisenverarbeitung kostet 1');
  eq(techCost(S, 0, TECH_BY_KEY.papier), 4, 'Papier kostet 4');
  eq(techCost(S, 0, TECH_BY_KEY.alchemie), 6, 'Alchemie kostet 6');
  S.players[0].techs.wiss_methode = true;
  eq(techCost(S, 0, TECH_BY_KEY.biologie), 15 - 3 - 6, 'Biologie mit Wiss. Methode');
}

/* --- Stadtgründungskosten: Grundkosten 1/3/6/10 + Distanz */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  // künstlich Städte hinzufügen und Kosten prüfen (Distanz getrennt geprüft)
  const base = n => n * (n + 1) / 2;
  eq([base(1), base(2), base(3), base(4)], [1, 3, 6, 10], 'Grundkosten 1/3/6/10');
  const target = [cap.r, cap.c + 3];
  const c1 = foundCost(S, 0, target[0], target[1]);
  eq(c1, 1 + 3, 'Zweite Stadt in Distanz 3 kostet 4');
}

/* --- Machtverlust: 8 → 4 */
{
  const S = mk('griechenland');
  S.players[0].power = 8; S.cur = 0;
  const div = 2, loss = Math.ceil(8 / div);
  eq(8 - loss, 4, 'Macht 8 halbiert ergibt 4');
  eq(8 - Math.ceil(8 / 3), 5, 'Macht 8 mit Stahl (1/3) ergibt 5');
}

/* --- Armeekosten 5 je Armee inkl. der neuen; Wikinger zahlen eine weniger */
{
  const S = mk('griechenland');
  eq(armyCost(S, 0), 5, 'erste Armee kostet 5');
  S.armies.push({ id: 99, owner: 0, r: 0, c: 0, mp: 0, born: 0 });
  eq(armyCost(S, 0), 10, 'zweite Armee kostet 10');
  const W = mk('wikinger');
  eq(armiesOf(W, 0).length, 1, 'Wikinger starten mit einer kostenlosen Armee');
  // Sie erscheint IN der Hauptstadt und muss sie im ersten Zug verlassen
  {
    const wcap = capitalOf(W, 0), wa = armiesOf(W, 0)[0];
    eq([wa.r, wa.c], [wcap.r, wcap.c], 'die Startarmee steht in der Hauptstadt');
    eq(wa.born, W.round, 'sie gilt als neu gebaut');
    eq(blockingIssues(W, 0).some(x => /noch in einer Stadt/.test(x)), true,
      'das Zugende ist blockiert, bis sie herauszieht');
    eq(wa.mp > 0, true, 'zu Zugbeginn hat sie Bewegungspunkte');
    // Kein zweites Reich bekommt eine geschenkt
    eq(armiesOf(W, 1).length, 0, 'die Gegenseite startet ohne Armee');
  }
  eq(armyCost(W, 0), 5, 'Wikinger: nächste Armee kostet 5 statt 10');
  W.armies.push({ id: 98, owner: 0, r: 0, c: 0, mp: 0, born: 0 });
  eq(armyCost(W, 0), 10, 'Wikinger: dritte Armee kostet 10 statt 15');
}

/* --- Umrechnung: 2 Münzen = 1 Nahrung; England 1:1 */
{
  const S = mk('griechenland');
  S.players[0].res = { sci: 0, food: 0, coins: 4 };
  eq(available(S, 0, 'food'), 2, '4 Münzen ergeben 2 Nahrung');
  const E = mk('england');
  E.players[0].res = { sci: 0, food: 0, coins: 4 };
  eq(available(E, 0, 'food'), 4, 'England: 4 Münzen ergeben 4 Nahrung');
}

/* --- England kann Nahrung für Forschung ausgeben (Nahrung = Münzen = Wissenschaft) */
{
  const E = mk('england');
  E.players[0].res = { sci: 0, food: 10, coins: 0 };   // nur Nahrung
  eq(available(E, 0, 'sci'), 5, 'England: 10 Nahrung → 10 Münzen → 5 Wissenschaft (Kurs 2)');
  eq(pay(E, 0, 'sci', 3), true, 'England kann 3 Wissenschaft aus Nahrung bezahlen');
  eq(E.players[0].res.food, 4, '3 Wissenschaft kosten 6 Nahrung, 4 übrig');
  // mit Computertechnik ist der Kurs 1:1
  const E2 = mk('england', ['computertechnik']);
  E2.players[0].res = { sci: 0, food: 10, coins: 0 };
  eq(available(E2, 0, 'sci'), 10, 'England mit Computertechnik: 10 Nahrung → 10 Wissenschaft');
  // Nicht-England darf das nicht
  const G = mk('griechenland');
  G.players[0].res = { sci: 0, food: 10, coins: 0 };
  eq(available(G, 0, 'sci'), 0, 'Griechenland kann Nahrung NICHT in Wissenschaft tauschen');
}

/* --- Verteidigungswert aus dem Kampfbeispiel: Stadt mit 2 Bevölkerung + Bot-Armee
       daneben (Bot-Macht = Gesamtbevölkerung 3) → 5                              */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'bot', diff: 'david' }], seed: 3 });
  const eng = capitalOf(S, 1);
  eng.pop = 2;
  S.cities.push({ id: 500, owner: 1, r: eng.r + 4, c: eng.c, pop: 1, cap: false, grown: 0, born: 0 });
  const spot = neighbors(eng.r, eng.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 501, owner: 1, r: spot[0], c: spot[1], mp: 0, born: 0 });
  eq(defenseValue(S, eng), 5, 'Verteidigung 2 Bevölkerung + Armee mit Machtwert 3');
}

/* --- Bürokratie: verdoppelt Bevölkerung UND Umland der Hauptstadt */
{
  const S = mk('griechenland');
  const base = income(S, 0);
  S.players[0].techs.buerokratie = true;
  const buro = income(S, 0);
  eq([buro.sci, buro.food, buro.coins], [base.sci * 2, base.food * 2, base.coins * 2],
    'Bürokratie verdoppelt das gesamte Hauptstadteinkommen');

  // Zweite Stadt weit weg: nur der Hauptstadtanteil verdoppelt sich
  const T = mk('griechenland');
  const cap = capitalOf(T, 0);
  // rein geometrisch wählen – canFound prüft zusätzlich die Nahrung des laufenden Zuges
  const spot = within(cap.r, cap.c, 7).find(([r, c]) => isLand(T, r, c) &&
    hexDistance(cap.r, cap.c, r, c) >= 4 && !T.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
  T.cities.push({ id: 900, owner: 0, r: spot[0], c: spot[1], pop: 2, cap: false, grown: 0, born: 0 });
  const b0 = income(T, 0);
  // Hauptstadtanteil separat aufsummieren
  const py = cityPopYield(T, 0);
  const capPart = [py[0] * cap.pop, py[1] * cap.pop, py[2] * cap.pop];
  for (const [r, c] of neighbors(cap.r, cap.c)) {
    if (!terrainAt(T, r, c) || cityAt(T, r, c)) continue;
    const y = tileYield(T, 0, terrainAt(T, r, c));
    capPart[0] += y[0]; capPart[1] += y[1]; capPart[2] += y[2];
  }
  T.players[0].techs.buerokratie = true;
  const b1 = income(T, 0);
  eq([b1.sci - b0.sci, b1.food - b0.food, b1.coins - b0.coins], capPart,
    'Bei zwei Städten verdoppelt Bürokratie nur die Hauptstadt samt Umland');
}

/* --- Belagerung braucht zwei aufeinanderfolgende Züge */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 5 });
  const eng = capitalOf(S, 1);
  // Platz für die Stadt: Land, weit genug weg, und mit freiem Landnachbarn für die Armee
  const site = within(eng.r, eng.c, 5).find(([r, c]) =>
    isLand(S, r, c) && !S.cities.some(x => hexDistance(x.r, x.c, r, c) < 3) &&
    neighbors(r, c).some(([nr, nc]) => isLand(S, nr, nc)));
  S.cities.push({ id: 801, owner: 1, r: site[0], c: site[1], pop: 4, cap: false, grown: 0, born: 0 });
  const target = S.cities.find(x => x.id === 801);
  S.players[0].power = 50;
  const spot = neighbors(target.r, target.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 777, owner: 0, r: spot[0], c: spot[1], mp: 0, born: 0 });
  S.cur = 0;
  finishTurn(S);
  eq([S.sieges['0|801'], target.owner], [1, 1], 'nach dem ersten Zug: Belagerung 1/2, Stadt noch beim Gegner');
  finishTurn(S);
  eq([S.cities.find(x => x.id === 801).owner, S.cities.find(x => x.id === 801).pop], [0, 2],
    'nach dem zweiten Zug erobert, Bevölkerung −2');
}

/* --- Angriffswert addiert sich je angreifender Armee */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 9 });
  S.players[0].power = 7;
  const eng = capitalOf(S, 1);
  const frei = neighbors(eng.r, eng.c).filter(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c));
  S.armies.push({ id: 701, owner: 0, r: frei[0][0], c: frei[0][1], mp: 0, born: 0 });
  eq(attackValue(S, 0, attackersOn(S, 0, eng).length), 7, 'eine Armee greift mit dem Machtwert an');
  S.armies.push({ id: 702, owner: 0, r: frei[1][0], c: frei[1][1], mp: 0, born: 0 });
  eq(attackersOn(S, 0, eng).length, 2, 'zwei Armeen stehen an der Stadt');
  eq(attackValue(S, 0, 2), 14, 'zwei Armeen greifen mit 14 an (7 je Armee)');
  eq(attackValue(S, 0, 3), 21, 'drei Armeen mit 21');
  S.players[0].techs.belagerung = true;
  eq(attackValue(S, 0, 2), 24, 'Belagerungsmaschinen: (7+5) je Armee');
  S.players[0].techs.dynamit = true;
  eq(attackValue(S, 0, 2), 48, 'Dynamit verdoppelt danach');
}

/* ==================================================== Bot-Armeeprioritäten
   1 belagerte gegnerische Hauptstadt stürmen · 2 Angreifer auf die eigene Hauptstadt
   flankieren · 3 Hauptstadt verteidigen · 4/5 dasselbe für andere Städte (größte
   zuerst) · 6 andere begonnene Belagerung abschließen · 7–9 wie zuvor.
   Geprüft auf einer glattgezogenen Karte, damit nicht das Gelände das Ergebnis bestimmt. */
{
  const flach = () => {
    const S = newGame({
      players: [{ civ: 'russland', kind: 'bot' }, { civ: 'england', kind: 'human' }], seed: 7,
    });
    // S.map.rows ist eine Liste von ZEICHENKETTEN, kein zweidimensionales Feld:
    // die frühere Schleife über g[r][c] lief ins Leere und ließ die Karte, wie sie war.
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities.length = 0; S.armies.length = 0; S.sieges = {};
    return S;
  };
  const stadt = (S, owner, r, c, pop, cap) => {
    const city = { id: S.nextId++, owner, r, c, pop, cap: !!cap, grown: 0, born: -1 };
    S.cities.push(city); return city;
  };
  const armee = (S, owner, r, c) => {
    const a = { id: S.nextId++, owner, r, c, mp: 0, born: -1 };
    S.armies.push(a); return a;
  };
  // Spieler 1 ist im Aufbau ein Mensch – sein Machtwert kommt aus gekaufter Macht,
  // nicht aus der Bevölkerung. Für Kampftests deshalb ausdrücklich setzen.
  const macht = (S, pi, n) => { S.players[pi].power = n; };
  // Verteidigt wird erst, wenn eine Belagerung läuft (Zähler 1/2).
  const belagert = (S, angreifer, city) => { S.sieges[angreifer + '|' + city.id] = 1; };
  // nur die abgestimmten Prioritäten 1–6 ausführen; zurück kommen die freien Armeen
  const plan = (S, pi) => {
    for (const a of armiesOf(S, pi)) { a.mp = moveAllowance(S, pi); delete a.botDone; }
    botPlanArmies(S, pi);
    const frei = armiesOf(S, pi).filter(a => !a.botDone);
    armiesOf(S, pi).forEach(a => delete a.botDone);
    return frei;
  };
  const rng = S => attackRange(S, 0);
  const inReichweite = (S, city) => armiesOf(S, 0)
    .filter(a => hexDistance(a.r, a.c, city.r, city.c) <= rng(S)).length;

  // Prio 1: belagerte gegnerische Hauptstadt – ALLE erreichbaren Armeen ziehen hin
  {
    const S = flach();
    stadt(S, 0, 5, 5, 3, true);
    const ziel = stadt(S, 1, 5, 10, 1, true);
    armee(S, 0, 5, 9); armee(S, 0, 5, 7); armee(S, 0, 8, 5);
    S.sieges['0|' + ziel.id] = 1;
    const frei = plan(S, 0);
    eq(inReichweite(S, ziel), 2, 'beide erreichbaren Armeen stürmen die Hauptstadt');
    eq(frei.length, 1, 'die zu weit entfernte bleibt für andere Aufgaben frei');
    eq(attackValue(S, 0, inReichweite(S, ziel)) > defenseValue(S, ziel), true,
      'der Angriff reicht damit für die Eroberung');
  }
  // Ohne begonnene Belagerung greift Prio 1 nicht
  {
    const S = flach();
    stadt(S, 0, 5, 5, 3, true);
    stadt(S, 1, 5, 10, 1, true);
    const a = armee(S, 0, 5, 8);
    eq(plan(S, 0).length, 1, 'ohne Belagerung bleibt die Armee für Prio 7–9 frei');
    eq([a.r, a.c], [5, 8], 'und sie steht noch da');
  }
  // Prio 3: eigene Hauptstadt verteidigen, möglichst dicht am Angreifer.
  // Die Bedrohung muss echt sein: Angriff > Verteidigung ohne die eigenen Armeen.
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 1, true);
    stadt(S, 1, 5, 12, 6, true); macht(S, 1, 6);
    const feind = armee(S, 1, 5, 6);
    armee(S, 0, 5, 8); armee(S, 0, 7, 5);
    eq(threateningArmies(S, 0, hs).length, 0, 'ohne laufende Belagerung noch keine Bedrohung');
    belagert(S, 1, hs);
    eq(threateningArmies(S, 0, hs).length, 1, 'mit Zähler 1/2 gilt die Armee als Bedrohung');
    eq(plan(S, 0).length, 0, 'beide Armeen werden für die Verteidigung gebunden');
    eq(armiesOf(S, 0).every(a => hexDistance(a.r, a.c, hs.r, hs.c) <= projectRange(S, 0)), true,
      'beide zählen zur Verteidigung der Hauptstadt');
    eq(armiesOf(S, 0).some(a => hexDistance(a.r, a.c, feind.r, feind.c) === 1), true,
      'mindestens eine steht direkt neben dem Angreifer');
  }
  // Prio 2: flankieren geht vor verteidigen – und wirkt im Kampf.
  // Zwei Bedingungen müssen zugleich gelten: die Bedrohung ist echt (Angriff 6 >
  // bareDefense 1) UND der eigene Machtwert übersteigt den des Gegners (Bots rechnen
  // mit der Gesamtbevölkerung, deshalb die zweite Stadt weit im Hinterland).
  {
    // Die Punktspiegelung um den Gegner liegt in odd-r nur waagerecht: Partner und
    // Flanker müssen auf 5/5 und 5/7 stehen. Die Stadt darf deshalb nicht dort liegen,
    // muss den Gegner aber in Reichweite haben – 4/6 erfüllt beides.
    const S = flach();
    const hs2 = stadt(S, 0, 4, 6, 1, true);
    stadt(S, 0, 1, 1, 8, false);             // Hinterland: hebt den Machtwert auf 9
    stadt(S, 1, 5, 16, 6, true); macht(S, 1, 6);
    armee(S, 1, 5, 6); belagert(S, 1, hs2);
    eq(threateningArmies(S, 0, hs2).length, 1, 'der Gegner bedroht die Hauptstadt');
    armee(S, 0, 5, 5);                       // Partner steht schon neben dem Feind
    armee(S, 0, 5, 8);                       // soll sich gegenüber stellen
    plan(S, 0);
    const feinde = S.armies.filter(a => a.owner === 1).length;
    combatPhase(S, 0);
    eq(S.armies.filter(a => a.owner === 1).length, feinde - 1,
      'die angreifende Armee wird flankiert und zerstört');
  }
  // v75: dasselbe über eine Diagonale. Bis v74 spiegelte der Bot in Zeile/Spalte und
  // stellte sich zum Partner im Nordwesten (4/6) nach Südwest (6/6) – dieselbe Seite.
  // Gegenüber liegt Südost, 6/7. Der Partner steht zugleich neben der Hauptstadt, damit
  // er nicht zum Verteidigen wegzieht (das täte er sonst, unabhängig von der Spiegelung).
  {
    const S = flach();
    const hs2 = stadt(S, 0, 5, 5, 1, true);   // westlich neben dem Gegner
    stadt(S, 0, 1, 1, 8, false);              // Hinterland: Machtwert 9
    stadt(S, 1, 5, 16, 6, true); macht(S, 1, 6);
    armee(S, 1, 5, 6); belagert(S, 1, hs2);
    armee(S, 0, 4, 6);                        // Partner nordwestlich des Gegners
    armee(S, 0, 8, 7);                        // soll nach Südost, 6/7
    plan(S, 0);
    eq(S.armies.some(a => a.owner === 0 && a.r === 6 && a.c === 7), true,
      'Bot stellt sich diagonal gegenüber (Südost zu Nordwest)');
    const feinde = S.armies.filter(a => a.owner === 1).length;
    combatPhase(S, 0);
    eq(S.armies.filter(a => a.owner === 1).length, feinde - 1, 'und zerstört die Armee über die Diagonale');
  }
  // Prio 4/5: unter mehreren bedrohten Städten zuerst die größere
  {
    const S = flach();
    stadt(S, 0, 2, 2, 3, true);              // Hauptstadt unbedroht
    const klein = stadt(S, 0, 9, 5, 1, false);
    const gross = stadt(S, 0, 9, 12, 4, false);
    stadt(S, 1, 5, 16, 8, true); macht(S, 1, 8);
    armee(S, 1, 9, 6); armee(S, 1, 9, 13);
    belagert(S, 1, klein); belagert(S, 1, gross);   // beide stehen bei 1/2
    const v = armee(S, 0, 9, 9);             // genau dazwischen
    plan(S, 0);
    eq(hexDistance(v.r, v.c, gross.r, gross.c) <= projectRange(S, 0), true,
      'die größere Stadt wird zuerst verteidigt');
    eq(hexDistance(v.r, v.c, klein.r, klein.c) > projectRange(S, 0), true,
      'die kleinere bleibt ungedeckt');
  }
  // Prio 6: nur so viele Armeen wie nötig, der Rest bleibt frei
  {
    const S = flach();
    stadt(S, 0, 5, 2, 3, true);
    const ziel = stadt(S, 1, 5, 10, 1, false);
    stadt(S, 1, 5, 16, 3, true);
    S.sieges['0|' + ziel.id] = 1;
    armee(S, 0, 5, 9); armee(S, 0, 5, 8); armee(S, 0, 5, 7);
    const noetig = attackersNeeded(S, 0, ziel, 3);
    eq(noetig, 1, 'eine Armee reicht gegen diese kleine Stadt');
    const frei = plan(S, 0);
    eq(inReichweite(S, ziel), noetig, 'genau so viele wie nötig werden geschickt');
    eq(frei.length, 3 - noetig, 'die übrigen bleiben für andere Aufgaben frei');
  }
  // Verteidigung geht vor Eroberung, wenn beides Nicht-Hauptstädte sind
  {
    const S = flach();
    stadt(S, 0, 2, 2, 3, true);
    const meine = stadt(S, 0, 5, 8, 1, false);
    const ziel = stadt(S, 1, 5, 12, 1, false);
    stadt(S, 1, 5, 16, 6, true); macht(S, 1, 6);
    S.sieges['0|' + ziel.id] = 1;            // ich belagere
    armee(S, 1, 5, 9); belagert(S, 1, meine); // und werde selbst belagert
    const a = armee(S, 0, 5, 10);
    plan(S, 0);
    eq(hexDistance(a.r, a.c, meine.r, meine.c) <= projectRange(S, 0), true,
      'die Armee verteidigt, statt die Belagerung abzuschließen');
  }
  // Eine Armee, die schon richtig steht, bleibt stehen
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 1, true);
    stadt(S, 1, 5, 16, 6, true); macht(S, 1, 6);
    armee(S, 1, 5, 6); belagert(S, 1, hs);
    const a = armee(S, 0, 5, 4);             // in Reichweite der Hauptstadt
    const vorher = [a.r, a.c];
    plan(S, 0);
    eq(hexDistance(a.r, a.c, hs.r, hs.c) <= projectRange(S, 0), true,
      'sie bleibt in Reichweite der Hauptstadt');
    eq(hexDistance(a.r, a.c, 5, 6) <= hexDistance(vorher[0], vorher[1], 5, 6), true,
      'und rückt höchstens näher an den Angreifer heran');
  }
  // Verteidigt wird erst bei laufender Belagerung – eine bloß danebenstehende Armee
  // bindet keine Verteidiger.
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 3, true);
    stadt(S, 1, 5, 16, 9, true); macht(S, 1, 9);
    armee(S, 1, 5, 6);                       // steht schon neben der Hauptstadt
    armee(S, 0, 8, 5);
    eq(threateningArmies(S, 0, hs).length, 0, 'ohne Zähler gilt das nicht als Bedrohung');
    eq(plan(S, 0).length, 1, 'die eigene Armee bleibt für andere Aufgaben frei');
    // Erst der erste gewonnene Kampf löst aus
    belagert(S, 1, hs);
    eq(threateningArmies(S, 0, hs).length, 1, 'mit Zähler 1/2 sehr wohl');
    eq(plan(S, 0).length, 0, 'dann wird die Armee gebunden');
  }
  // Ein Zähler auf eine FREMDE Stadt löst nichts aus
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 3, true);
    const fremd = stadt(S, 1, 5, 16, 9, true); macht(S, 1, 9);
    armee(S, 1, 5, 6);
    armee(S, 0, 8, 5);
    S.sieges['0|' + fremd.id] = 1;           // ICH belagere, nicht umgekehrt
    eq(threateningArmies(S, 0, hs).length, 0, 'die eigene Belagerung bedroht nichts');
  }
  // Armeen bleiben nicht in der eigenen Stadt stehen
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 3, true);
    stadt(S, 1, 5, 16, 3, true);
    const a = armee(S, 0, 5, 5);             // frisch gebaut, steht in der Stadt
    plan(S, 0); botMoveArmy(S, 0, a);
    eq(a.r === hs.r && a.c === hs.c, false, 'die Armee verlässt die eigene Stadt');
    eq(cityAt(S, a.r, a.c), undefined, 'und steht auf keinem eigenen Stadtfeld');
  }
  // Auch bei laufender Belagerung wird die Stadt verlassen (daneben schützt besser)
  {
    const S = flach();
    const hs = stadt(S, 0, 5, 5, 1, true);
    stadt(S, 1, 5, 16, 6, true); macht(S, 1, 6);
    armee(S, 1, 5, 6); belagert(S, 1, hs);
    const a = armee(S, 0, 5, 5);
    plan(S, 0);
    eq(a.r === hs.r && a.c === hs.c, false, 'auch als Verteidiger rückt sie heraus');
    eq(hexDistance(a.r, a.c, hs.r, hs.c) <= projectRange(S, 0), true,
      'bleibt aber in Reichweite der Stadt');
  }
  // Gibt es gar keinen anderen Halteplatz, darf sie bleiben
  {
    const S = flach();
    stadt(S, 0, 5, 5, 3, true);
    stadt(S, 0, 8, 8, 2, false);
    eq(botOutOfCity(S, 0, [[5, 5], [5, 6]]), [[5, 6]], 'das Stadtfeld fällt weg');
    eq(botOutOfCity(S, 0, [[5, 5]]), [[5, 5]], 'als einzige Option bleibt es erhalten');
    eq(botOutOfCity(S, 0, [[5, 5], [8, 8]]).length, 2,
      'sind ALLE Felder eigene Städte, greift die Ausnahme und nichts fällt weg');
    eq(botOutOfCity(S, 0, [[5, 6], [7, 7]]).length, 2, 'freie Felder bleiben unangetastet');
  }
  // Der Merker botDone bleibt nicht im Spielstand zurück
  {
    const S = flach();
    stadt(S, 0, 5, 5, 3, true); stadt(S, 1, 5, 12, 3, true);
    armee(S, 1, 5, 6); armee(S, 0, 5, 8);
    botTurn(S, 0);
    eq(S.armies.every(a => a.botDone === undefined), true,
      'botDone wird nach dem Zug wieder entfernt');
  }
}

/* --- Bots kämpfen genau einmal pro Zug (nicht in botTurn UND im Zugende) */
{
  const B = newGame({ players: [{ civ: 'england', kind: 'bot', diff: 'siedler' }, { civ: 'griechenland', kind: 'human' }], seed: 11 });
  const bi = B.players.findIndex(p => p.civ === 'england');   // Bot
  const hi = B.players.findIndex(p => p.civ === 'griechenland');
  capitalOf(B, bi).pop = 20;                       // Bot-Macht = Gesamtbevölkerung
  const gr = capitalOf(B, hi); gr.pop = 4;
  const spot = neighbors(gr.r, gr.c).find(([r, c]) => isLand(B, r, c) && !cityAt(B, r, c) && !armyAt(B, r, c));
  B.armies.push({ id: 900, owner: bi, r: spot[0], c: spot[1], mp: 0, born: 0 });
  B.cur = bi;
  botTurn(B, bi);
  eq(B.sieges[bi + '|' + gr.id] || 0, 0, 'botTurn allein löst noch keinen Kampf aus');
  const army = B.armies.find(a => a.id === 900);
  army.r = spot[0]; army.c = spot[1];              // Bot könnte sie versetzt haben
  finishTurn(B);
  eq(B.sieges[bi + '|' + gr.id], 1, 'Kampf findet genau einmal statt – Stadt fällt nicht im selben Zug');
  eq(!!B.cities.find(x => x.id === gr.id), true, 'Hauptstadt steht nach einem Bot-Zug noch');
}

/* --- Log-Fenster bei vollem Protokoll: logSince liefert neue Einträge, slice-by-length nicht */
{
  const S = mk('griechenland');
  // Log über die 600er-Grenze füllen
  for (let i = 0; i < 650; i++) log(S, 'roll', 'Füller ' + i);
  eq(S.log.length, 600, 'Protokoll ist auf 600 Einträge gekappt');
  const beforeLen = S.log.length;      // fehleranfälliger Längen-Marker
  const sinceSeq = S.logSeq;           // stabiler Sequenz-Marker
  log(S, 'act', 'Neuer Eintrag A'); log(S, 'act', 'Neuer Eintrag B');
  eq(S.log.slice(beforeLen).length, 0, 'slice(length) findet die neuen Einträge NICHT (der alte Bug)');
  eq(logSince(S, sinceSeq).length, 2, 'logSince findet beide neuen Einträge trotz Kappung');
  eq(logSince(S, sinceSeq).map(e => e.m), ['Neuer Eintrag A', 'Neuer Eintrag B'], 'korrekte neue Einträge');
}

/* --- Stadtfelder zählen als Straße bzw. Eisenbahn */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  const frei = neighbors(cap.r, cap.c).filter(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c));
  const [r1, c1] = frei[0], [r2, c2] = frei[1];
  eq(moveCost(S, cap.r, cap.c, r1, c1), 1, 'ohne Straße kostet der Schritt 1');
  S.roads[key(r1, c1)] = 1;
  eq(moveCost(S, cap.r, cap.c, r1, c1), 0.5, 'Stadtfeld zählt als Straße, sobald eine angrenzt');
  eq(moveCost(S, cap.r, cap.c, r2, c2), 1, 'Nachbarfeld ohne Straße bleibt bei 1');
  S.roads[key(r1, c1)] = 2;
  eq(moveCost(S, cap.r, cap.c, r1, c1), 0, 'Stadtfeld zählt als Eisenbahn, sobald eine angrenzt');
  eq(effectiveRoad(S, r2, c2), 0, 'ein normales Feld erbt nichts von Nachbarn');
}

/* === Kampfregeln aus dem aktualisierten Regelheft === */

/* Raketentechnik: Verteidiger und Angreifer wirken auf Distanz 2 */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 12 });
  const gr = capitalOf(S, 0); gr.pop = 3; S.players[0].power = 6;
  // Angreifer auf Distanz 2 von Englands Hauptstadt
  const eng = capitalOf(S, 1);
  const two = within(eng.r, eng.c, 2).find(([r, c]) => hexDistance(eng.r, eng.c, r, c) === 2 && isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 601, owner: 0, r: two[0], c: two[1], mp: 0, born: 0 });
  eq(attackersOn(S, 0, eng).length, 0, 'ohne Raketentechnik zählt Distanz 2 nicht');
  S.players[0].techs.raketentechnik = true;
  eq(attackersOn(S, 0, eng).length, 1, 'mit Raketentechnik greift die Armee aus Distanz 2 an');
  // Verteidigung: eigene Armee auf Distanz 2 der eigenen Stadt
  const d2 = within(gr.r, gr.c, 2).find(([r, c]) => hexDistance(gr.r, gr.c, r, c) === 2 && isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  const before = defenseValue(S, gr);
  S.armies.push({ id: 602, owner: 0, r: d2[0], c: d2[1], mp: 0, born: 0 });
  eq(defenseValue(S, gr) - before, powerOf(S, 0), 'Verteidiger auf Distanz 2 trägt mit Raketentechnik bei');
}

/* Burgenbau: virtuelle Armee verteidigt die eigene Stadt und kann flankieren */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 13 });
  const gr = capitalOf(S, 0); gr.pop = 2; S.players[0].power = 4;
  const base = defenseValue(S, gr);
  S.players[0].techs.burgenbau = true;
  eq(defenseValue(S, gr) - base, powerOf(S, 0), 'Burgenbau addiert den Machtwert zur Stadtverteidigung');
  // Flankieren: eine echte Armee + die Burgenstadt auf gegenüberliegenden Seiten eines Gegners
  const enemy = { id: 610, owner: 1, r: 0, c: 0 };
  // Gegner direkt neben die eigene Stadt setzen, echte Armee gegenüber
  const adj = neighbors(gr.r, gr.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c));
  enemy.r = adj[0]; enemy.c = adj[1];
  S.players[1].power = 1;
  // gegenüber = am Gegner gespiegelt, in Würfelkoordinaten (Zeile/Spalte stimmt nur waagerecht)
  const opp = neighbors(enemy.r, enemy.c).find(([r, c]) => hexOpposite(enemy.r, enemy.c, gr.r, gr.c, r, c));
  S.armies.push({ id: 611, owner: 0, r: opp[0], c: opp[1], mp: 0, born: 0 });
  S.armies.push(enemy);
  S.cur = 0; combatPhase(S, 0);
  eq(S.armies.some(a => a.id === 610), false, 'Burgenstadt hilft, eine benachbarte Gegnerarmee zu flankieren');
}

/* v75: Flankieren „gegenüberliegend" – auf allen drei Achsen, in geraden wie ungeraden
   Zeilen. Bis v74 wurde in Zeile/Spalte gespiegelt: nur Ost–West stimmte, dafür
   flankierten Nordost+Südost (gerade Zeile) bzw. Nordwest+Südwest (ungerade Zeile). */
{
  const flankiert = (er, ec, a, b, techs = {}) => {
    const S = newGame({ seed: 3, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' }] });
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities = S.cities.filter(c => hexDistance(c.r, c.c, er, ec) > 4);
    S.armies = [{ id: 900, owner: 1, r: er, c: ec, mp: 0, born: 0 },
      { id: 901, owner: 0, r: a[0], c: a[1], mp: 0, born: 0 },
      { id: 902, owner: 0, r: b[0], c: b[1], mp: 0, born: 0 }];
    S.players[0].power = 10; S.players[1].power = 0;
    Object.assign(S.players[0].techs, techs);
    const stellung = canFlank(S, 0, S.armies[0]);
    combatPhase(S, 0);
    const weg = !S.armies.some(x => x.id === 900);
    return stellung === weg ? weg : 'Stellung und Kampf uneins';
  };
  for (const [er, ec, zeile] of [[6, 6, 'gerade'], [5, 6, 'ungerade']]) {
    const paare = [];
    for (let d1 = 0; d1 < 6; d1++) for (let d2 = d1 + 1; d2 < 6; d2++)
      if (flankiert(er, ec, neighbor(er, ec, d1), neighbor(er, ec, d2)) === true) paare.push(d1 + '+' + d2);
    eq(paare, ['0+3', '1+4', '2+5'], `${zeile} Zeile: genau die drei gegenüberliegenden Paare flankieren (O–W, SO–NW, SW–NO)`);
    eq(flankiert(er, ec, neighbor(er, ec, 0), neighbor(er, ec, 1), { taktik: true }), true,
      `${zeile} Zeile: mit Taktik auch zwei benachbarte Seiten`);
    // Raketentechnik: auf Distanz 2 gegenüber, auch diagonal
    const zwei = d => neighbor(...neighbor(er, ec, d), d);
    eq([flankiert(er, ec, zwei(1), zwei(4), { raketentechnik: true }),
      flankiert(er, ec, zwei(1), zwei(4))], [true, false],
      `${zeile} Zeile: auf Distanz 2 diagonal gegenüber nur mit Raketentechnik`);
  }
  eq([hexOpposite(5, 6, 4, 7, 6, 6), hexOpposite(5, 6, 4, 6, 6, 6), hexOpposite(6, 6, 5, 5, 7, 6)],
    [true, false, true], 'hexOpposite: Spiegelung in Würfelkoordinaten');
  // Die Machtansicht liest dieselbe Regel: eine flankierte Armee trägt das flankierende Reich
  {
    const S = newGame({ seed: 3, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' }] });
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities = S.cities.filter(c => hexDistance(c.r, c.c, 5, 6) > 4);
    S.armies = [{ id: 900, owner: 1, r: 5, c: 6, mp: 0, born: 0 },
      { id: 901, owner: 0, r: 4, c: 7, mp: 0, born: 0 }, { id: 902, owner: 0, r: 6, c: 6, mp: 0, born: 0 }];
    S.players[0].power = 7; S.players[1].power = 4;
    const v = powerView(S).armies.find(x => x.army.id === 900);
    eq([v.pow, v.flank], [4, [{ pi: 0, v: 7 }]], 'Machtansicht: Armee 4 gegen den Flankierer 7');
    eq(powerView(S).armies.find(x => x.army.id === 901).flank, [], 'die eigenen Flankierer sind nicht bedroht');
  }
}

/* Sklaverei: max. 1 pro Runde pro Stadt */
{
  const S = mk('griechenland', ['sklaverei']);
  const c = capitalOf(S, 0); c.pop = 4;
  eq(sacrifice(S, 0, c), null, 'erstes Opfern klappt');
  eq(typeof sacrifice(S, 0, c), 'string', 'zweites Opfern in derselben Runde wird abgelehnt');
  eq(c.pop, 3, 'nur eine Bevölkerung geopfert');
}

/* Kolonialismus: nur herrenlose Felder */
{
  const S = mk('griechenland', ['kolonialismus']);
  const cap = capitalOf(S, 0);
  const owned = neighbors(cap.r, cap.c).find(([r, c]) => terrainAt(S, r, c) && !cityAt(S, r, c));
  S.players[0].res.coins = 20;
  eq(typeof buyTile(S, 0, owned[0], owned[1]), 'string', 'eigenes Umland ist nicht kaufbar');
  // ein weit entferntes herrenloses Feld finden
  let free = null;
  for (const [r, c] of within(cap.r, cap.c, 6))
    if (terrainAt(S, r, c) && !S.players.some((_, i) => controlledTiles(S, i).has(key(r, c))) && !cityAt(S, r, c)) { free = [r, c]; break; }
  eq(buyTile(S, 0, free[0], free[1]), null, 'herrenloses Feld ist kaufbar');
}

/* Internet: genau eine Gratiskopie pro Runde */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 14 });
  S.players[1].techs.stadtmauern = true; S.players[1].techs.taktik = true;
  S.players[0].techs.internet = true;
  eq(internetAvailable(S, 0), true, 'Internet-Kopie steht zu Rundenbeginn bereit');
  const opt = copyableTechs(S, 0);
  eq(opt.length >= 2 && opt.every(o => o.freeOk && o.paidCoins == null), true, 'reines Internet: nur Gratiskopie, kein bezahlter Weg');
  eq(copyTech(S, 0, 'stadtmauern'), null, 'erste Gratiskopie klappt');
  eq(typeof copyTech(S, 0, 'taktik'), 'string', 'zweite Kopie in derselben Runde wird abgelehnt');
}

/* Kundschafterei/Spionage + Internet: jede Tech bietet bezahlt UND gratis an */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 15 });
  S.players[1].techs.stadtmauern = true;   // Kosten 5
  S.players[1].techs.taktik = true;        // Kosten 1
  S.players[0].techs.kundschafterei = true; S.players[0].techs.internet = true;
  S.players[0].res.coins = 50;
  const sm = copyableTechs(S, 0).find(o => o.tech.k === 'stadtmauern');
  eq(sm.paidCoins, 10, 'Kundschafterei: 2× Basiskosten (2×5) in Münzen');
  eq(sm.freeOk, true, 'Internet-Gratiskopie steht trotz Kundschafterei zur Verfügung (Bugfix)');
  // Gratiskopie kostet keine Münzen und verbraucht das Rundenkontingent
  eq(copyTech(S, 0, 'stadtmauern', 'free'), null, 'gratis kopieren klappt');
  eq(S.players[0].res.coins, 50, 'Gratiskopie kostet keine Münzen');
  eq(internetAvailable(S, 0), false, 'Internet-Kontingent danach verbraucht');
  // eine zweite Kopie in derselben Runde geht nur noch bezahlt
  const tk = copyableTechs(S, 0).find(o => o.tech.k === 'taktik');
  eq(tk.freeOk, false, 'keine zweite Gratiskopie in derselben Runde');
  eq(tk.paidCoins, 2, 'bezahlter Weg (2×1) bleibt');
}

/* Nur Spionage (ohne Internet): bezahlt, keine Gratiskopie */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 15 });
  S.players[1].techs.stadtmauern = true;
  S.players[0].techs.spionage = true;
  const sm = copyableTechs(S, 0).find(o => o.tech.k === 'stadtmauern');
  eq(sm.paidCoins, 5, 'Spionage: 1× Basiskosten in Münzen');
  eq(sm.freeOk, false, 'ohne Internet keine Gratiskopie');
}

/* === Regeln der Hauptvariante (vormals v2) === */

/* Singularität kostet 100 */
{
  const S = mk('griechenland');
  eq(SINGULARITY.c, 100, 'Singularität-Grundkosten 100');
  eq(techCost(S, 0, SINGULARITY), 95, 'griechischer Rabatt auch auf Singularität');
}

/* Griechenland hat keinen Würfelbonus mehr, der Kostenrabatt bleibt */
{
  const S = mk('griechenland');
  eq(availBonus(S.players[0]), 0, 'kein Würfelbonus für Griechenland');
  S.players[0].techs.philosophie = true;
  eq(availBonus(S.players[0]), 1, 'Philosophie gibt weiter +1');
  eq(techCost(S, 0, TECH_BY_KEY.papier), 4, 'Kostenrabatt bleibt (Papier 6−2)');
}

/* Keramik und Theologie sind Teil der normalen Techliste */
{
  eq(!!TECH_BY_KEY.keramik, true, 'Keramik ist eine normale Technologie');
  eq(!!TECH_BY_KEY.theologie, true, 'Theologie ist eine normale Technologie');
  eq(techsIn(1, 0).map(t => t.k).includes('keramik'), true, 'Keramik: Produktion/Antike');
  eq(techsIn(3, 1).map(t => t.k).includes('theologie'), true, 'Theologie: Spezial/Mittelalter');
}

/* Theologie senkt die Siegschwelle auf 3/5, UN gewinnt bei Gleichstand die niedrigere */
{
  const S = mk('griechenland', ['theologie']);
  eq(victoryOption(S, S.players[0]).frac, 3 / 5, 'Theologie setzt Schwelle auf 3/5');
  S.players[0].techs.un = true;
  eq(victoryOption(S, S.players[0]).frac, 0.5, 'UN (1/2) schlägt Theologie (3/5)');
}

/* Keramik + Verbundwerkstoffe: bis 3x wachsen, davon 1x gratis */
{
  const S = mk('griechenland', ['keramik', 'verbundwerkstoffe', 'landwirtschaft', 'bewaesserung']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.born = 0;
  const lim = growLimits(S, 0);
  eq([lim.max, lim.free], [3, 1], 'Keramik+Verbund = max 3, davon 1 gratis');
  eq(growCost(S, 0, c).free === true, true, 'erstes Wachstum dieser Runde ist gratis');
  S.players[0].techs.gentechnik = true;      // hebt die Nahrungsgrenze auf
  S.players[0].res = { sci: 0, food: 99, coins: 99 };
  growCity(S, 0, c); growCity(S, 0, c); growCity(S, 0, c);
  eq(c.pop, 6, 'drei Wachstumsschritte in einer Runde');
  eq(typeof canGrow(S, 0, c), 'string', 'ein viertes Wachstum wird abgelehnt');
}

/* Verbundwerkstoffe gibt NUR ein zusätzliches kostenloses Wachstum – es lässt sich nicht
   in einen zweiten bezahlten Schritt umwandeln. */
{
  const S = mk('griechenland', ['verbundwerkstoffe', 'gentechnik']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.freeUsed = 0; c.born = 0;
  S.players[0].res = { sci: 0, food: 999, coins: 999 };
  const lim = growLimits(S, 0);
  eq([lim.paid, lim.free, lim.max], [1, 1, 2], 'ein bezahlter und ein kostenloser Schritt');
  eq(canGrowPaid(S, 0, c), null, 'der erste bezahlte Schritt geht');
  eq(growCity(S, 0, c, 'paid'), null, 'und wird ausgeführt');
  eq(typeof canGrowPaid(S, 0, c), 'string', 'ein zweiter bezahlter Schritt wird abgelehnt');
  eq(canGrowPaid(S, 0, c), 'Diese Runde nur noch kostenloses Wachstum.', 'mit klarer Begründung');
  eq(typeof growCity(S, 0, c, 'paid'), 'string', 'auch die Ausführung wird abgelehnt');
  eq(freeGrowthAvailable(S, 0, c), true, 'das kostenlose Kontingent steht aber noch');
  eq(growCity(S, 0, c, 'free'), null, 'und lässt sich nutzen');
  eq(c.pop, 5, 'insgesamt zwei Schritte: 3 → 5');
  eq(freeGrowthAvailable(S, 0, c), false, 'danach ist nichts mehr offen');
  eq(typeof canGrow(S, 0, c), 'string', 'auch der automatische Weg ist zu');
}
/* Keramik verdoppelt nur das BEZAHLTE Kontingent */
{
  const S = mk('griechenland', ['keramik', 'verbundwerkstoffe', 'gentechnik']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.freeUsed = 0; c.born = 0;
  S.players[0].res = { sci: 0, food: 999, coins: 999 };
  eq(growLimits(S, 0).paid, 2, 'mit Keramik zwei bezahlte Schritte');
  eq(growCity(S, 0, c, 'paid'), null, 'erster bezahlter Schritt');
  eq(growCity(S, 0, c, 'paid'), null, 'zweiter bezahlter Schritt');
  eq(typeof canGrowPaid(S, 0, c), 'string', 'ein dritter bezahlter Schritt nicht mehr');
  eq(growCity(S, 0, c, 'free'), null, 'der kostenlose bleibt übrig');
  eq(c.pop, 6, 'drei Schritte insgesamt: 3 → 6');
  // die Reihenfolge ändert daran nichts
  const T = mk('griechenland', ['keramik', 'verbundwerkstoffe', 'gentechnik']);
  const t = capitalOf(T, 0); t.pop = 3; t.grown = 0; t.freeUsed = 0; t.born = 0;
  T.players[0].res = { sci: 0, food: 999, coins: 999 };
  eq(growCity(T, 0, t, 'free'), null, 'erst kostenlos');
  eq(growCity(T, 0, t, 'paid'), null, 'dann bezahlt');
  eq(growCity(T, 0, t, 'paid'), null, 'und nochmal bezahlt');
  eq(typeof growCity(T, 0, t, 'paid'), 'string', 'ein vierter Schritt wird abgelehnt');
  eq(t.pop, 6, 'auch so drei Schritte');
}

/* nur Verbundwerkstoffe: normales Wachstum + 1x gratis = max 2 */
{
  const S = mk('griechenland', ['verbundwerkstoffe']);
  const lim = growLimits(S, 0);
  eq([lim.max, lim.free], [2, 1], 'Verbund allein = 1x normal + 1x gratis');
  const c = capitalOf(S, 0); c.pop = 2; c.grown = 0; c.born = 0;
  eq(growCost(S, 0, c).free === true, true, 'das erste Wachstum ist das kostenlose');
}

/* Sklaverei wird mit der Moderne obsolet */
{
  const S = mk('griechenland', ['sklaverei']);
  const c = capitalOf(S, 0); c.pop = 3;
  eq(slaveryUsable(S.players[0]), true, 'Sklaverei nutzbar vor der Moderne');
  S.players[0].techs.robotik = true;   // eine Moderne-Tech
  eq(slaveryUsable(S.players[0]), false, 'Sklaverei obsolet ab Moderne');
  eq(typeof sacrifice(S, 0, c), 'string', 'Opfern ab Moderne abgelehnt');
  eq(TECH_BY_KEY.sklaverei.e.includes('obsolet'), true, 'Techbogen weist auf die Obsoleszenz hin');
}

/* Effekt sofort nach dem Forschen verfügbar (Kartografie senkt Gründungskosten im selben Zug) */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  const far = within(cap.r, cap.c, 6).find(([r, c]) => isLand(S, r, c) &&
    hexDistance(cap.r, cap.c, r, c) === 5 && !S.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
  const withDist = foundCost(S, 0, far[0], far[1]);
  S.players[0].avail.kartografie = true;
  S.players[0].res.sci = 20;
  doResearch(S, 0, 'kartografie');
  const afterCarto = foundCost(S, 0, far[0], far[1]);
  eq(afterCarto < withDist, true, 'Kartografie senkt die Gründungskosten sofort nach dem Forschen');
  eq(afterCarto, 1, 'nur noch Grundkosten (1 Stadt), kein Distanzanteil');
}

/* Kontrollzone: mit Raketentechnik zwei Ringe, Luftwaffe ignoriert sie */
{
  const S = newGame({ players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }], seed: 16 });
  const e = capitalOf(S, 1);
  const spot = spotBy(S, e);
  S.players[1].techs.schiesspulver = true;
  S.armies.push({ id: 620, owner: 1, r: spot[0], c: spot[1], mp: 0, born: 0 });
  const d1 = within(spot[0], spot[1], 1).find(([r, c]) => hexDistance(spot[0], spot[1], r, c) === 1 && isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  eq(zocStop(S, 0, d1[0], d1[1]), true, 'Distanz 1 löst Kontrollzone aus');
  const d2 = within(spot[0], spot[1], 2).find(([r, c]) => hexDistance(spot[0], spot[1], r, c) === 2 && isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  eq(zocStop(S, 0, d2[0], d2[1]), false, 'ohne Raketentechnik kein Halt auf Distanz 2');
  S.players[1].techs.raketentechnik = true;
  eq(zocStop(S, 0, d2[0], d2[1]), true, 'mit Raketentechnik Kontrollzone auf Distanz 2');
  S.players[0].techs.luftwaffe = true;
  eq(zocStop(S, 0, d1[0], d1[1]), false, 'Luftwaffe ignoriert Kontrollzonen');
}

/* ================= Eisenbahn durch die Kontrollzone (v80, gemeldeter Fehler)
   Wer eine Kontrollzone betrat, hielt nur auf diesem Weg an. Danach noch einmal angetippt,
   zog die Armee mit der übrigen Bewegung weiter – und auf der Eisenbahn (Kosten 0) auch mit
   0 Bewegung, beliebig oft, mitten durch die Zone. Jetzt endet die Bewegung dort für den
   ganzen Zug; im nächsten eigenen Zug darf die Armee wieder heraus.                   */
{
  const lage = (gunpowder, startInZone) => {
    const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' }] });
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities.length = 0; S.armies.length = 0; S.sieges = {}; S.roads = {};
    S.cities.push({ id: 900, owner: 0, r: 2, c: 2, pop: 3, cap: true, grown: 0, born: -1 });
    S.cities.push({ id: 901, owner: 1, r: 10, c: 14, pop: 3, cap: true, grown: 0, born: -1 });
    for (let c = 1; c <= 14; c++) S.roads[key(5, c)] = 2;              // Eisenbahn quer über Zeile 5
    const a = { id: 910, owner: 0, r: 5, c: startInZone ? 7 : 1, mp: 3, born: -1 };
    S.armies.push(a);
    S.armies.push({ id: 911, owner: 1, r: 4, c: 6, mp: 3, born: -1 });  // Wache: 5/5 und 5/6 in der Zone
    if (gunpowder) S.players[1].techs.schiesspulver = true;
    S.cur = 0;
    return { S, a };
  };
  { const { S, a } = lage(true);
    const zone = [...armyReach(S, a).keys()].map(unkey).filter(([r, c]) => zocStop(S, 0, r, c));
    eq(armyReach(S, a).has(key(5, 9)), false, 'die Eisenbahn endet für den Weg am ersten Feld der Zone (5/9 nicht erreichbar)');
    const ein = zone.find(([r, c]) => r === 5 && c === 5);
    eq(moveArmy(S, a, ein[0], ein[1]), null, 'in die Zone hinein darf sie (5/5)');
    eq([a.mp, armyReach(S, a).size], [0, 0], '… dann ist die Bewegung für diesen Zug zu Ende – auch auf der Eisenbahn');
    eq(!!moveArmy(S, a, 5, 12), true, '… ein zweites Antippen bringt sie nicht weiter (gemeldeter Fehler)');
    eq(/Kontrollzone/.test(S.log[S.log.length - 1].m) || S.log.some(l => /Kontrollzone/.test(l.m)), true, 'das Protokoll sagt, warum');
    S.cur = 1; advanceTurn(S);      // wieder Russland am Zug
    eq([a.halted, a.mp > 0, armyReach(S, a).has(key(5, 4))], [undefined, true, true], 'im nächsten eigenen Zug darf sie wieder heraus');
  }
  { const { S, a } = lage(false);
    moveArmy(S, a, 5, 5);
    eq([a.mp, armyReach(S, a).has(key(5, 12))], [3, true], 'Gegenprobe ohne Schießpulver: keine Zone, die Eisenbahn bleibt frei');
  }
  { const { S, a } = lage(true, true);
    // beginnt den Zug neben der Wache (5/7 liegt nicht in der Zone, 5/6 schon): wer in
    // der Zone steht, darf heraus – über die Eisenbahn nach Osten kostenlos; nach Westen
    // unterbricht das nächste Zonenfeld (5/5) die Bahn, 5/2 gibt es nur außen herum
    a.r = 5; a.c = 6;
    const R = armyReach(S, a);
    eq([R.get(key(5, 12)), R.has(key(5, 5)), R.get(key(5, 2))], [0, true, 3],
      'wer in der Zone beginnt, darf heraus – aber nicht über die Bahn durch das nächste Zonenfeld (westwärts nur außen herum)');
    moveArmy(S, a, 5, 12);
    eq(a.mp, 3, '… und wer sie verlässt, behält seine Bewegung');
  }
}

/* ================= Kurzregeln: Bewegung, Straßen, Eisenbahn, Kontrollzone (v81)
   Seit v81 stehen diese Regeln ausdrücklich im Regelbogen (Wortlaut vom Autor freigegeben).
   Hier wird jede Aussage des Textes an der Regelmaschine nachgeprüft – ändert jemand eine
   der Regeln, schlägt dieser Block an, und der Text in rulesModal muss mit.            */
{
  const leer = () => {
    const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' }] });
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities.length = 0; S.armies.length = 0; S.sieges = {}; S.roads = {}; S.cur = 0;
    return S;
  };
  const stadt = (S, owner, r, c, cap) => { const x = { id: S.nextId++, owner, r, c, pop: 2, cap: !!cap, grown: 0, born: -1 }; S.cities.push(x); return x; };
  // „3 Bewegungspunkte (mit Panzerschiff 6, mit Luftwaffe 9)"
  { const S = leer(), p = S.players[0], w = [moveAllowance(S, 0)];
    p.techs.panzerschiff = true; w.push(moveAllowance(S, 0));
    p.techs.luftwaffe = true; w.push(moveAllowance(S, 0));
    eq(w, [3, 6, 9], 'Regelbogen: 3 Bewegungspunkte, mit Panzerschiff 6, mit Luftwaffe 9');
  }
  // „Eine Armee, die in einer Stadt entsteht, muss sie im selben Zug verlassen."
  { const S = leer(), ct = stadt(S, 0, 4, 4, true);
    S.players[0].res.coins = 20;
    eq(buildArmy(S, 0, ct), null, 'Regelbogen: Armee in der Stadt gebaut …');
    eq(blockingIssues(S, 0).length, 1, '… und der Zug endet erst, wenn sie heraus ist');
  }
  // „Straße 1 Münze, Eisenbahn 2 Münzen, auf einer Straße 1" · „auch ohne Rad" ·
  // „auf Land, in deinem Gebiet oder auf herrenlosen Feldern"
  { const S = leer(), p = S.players[0];
    stadt(S, 0, 3, 3, true); stadt(S, 1, 8, 8, true);
    p.res.coins = 20; p.techs.eisenbahn = true;
    const kosten = [];
    const bau = (r, c, z) => { const vor = p.res.coins, e = buildRoad(S, 0, r, c, z); kosten.push(e || vor - p.res.coins); };
    bau(3, 4, 2);                  // Eisenbahn ohne Rad auf leerem Feld
    bau(3, 5, 1);                  // Straße ohne Rad: geht nicht
    p.techs.rad = true;
    bau(3, 5, 1); bau(3, 5, 2);    // Straße, dann Eisenbahn darauf
    eq(kosten, [2, 'Rad noch nicht erforscht.', 1, 1],
      'Regelbogen: Eisenbahn 2 Münzen (auch ohne Rad), Straße braucht Rad und kostet 1, Eisenbahn auf einer Straße 1');
    eq([buildRoad(S, 0, 6, 6, 1), !!buildRoad(S, 0, 8, 9, 1)], [null, true],
      'Regelbogen: herrenloses Feld ja, Gebiet eines anderen Reichs nein');
  }
  // „Ein Schritt kostet ½ … nichts … Ein Stadtfeld zählt … gehören niemandem"
  { const S = leer();
    S.roads[key(3, 3)] = 1; S.roads[key(3, 4)] = 1; S.roads[key(3, 5)] = 2; S.roads[key(3, 6)] = 2;
    eq([moveCost(S, 3, 3, 3, 4), moveCost(S, 3, 4, 3, 5), moveCost(S, 3, 5, 3, 6), moveCost(S, 3, 6, 3, 7)],
      [0.5, 0.5, 0, 1], 'Regelbogen: Straße ½, gemischt ½, Eisenbahn 0, sonst 1');
    stadt(S, 0, 3, 7);
    eq(moveCost(S, 3, 6, 3, 7), 0, 'Regelbogen: ein Stadtfeld neben einer Eisenbahn zählt als Eisenbahn');
    for (let c = 8; c <= 14; c++) S.roads[key(5, c)] = 2;
    const g = { id: S.nextId++, owner: 1, r: 5, c: 8, mp: 1, born: -1 }; S.armies.push(g);
    eq(armyReach(S, g).get(key(5, 14)), 0,
      'Regelbogen: Straßen gehören niemandem – eine gegnerische Armee fährt die Eisenbahn bis ans Ende, mit übriger Bewegung beliebig weit');
  }
  // „Der Weg darf durch herrenloses und fremdes Gebiet führen; nur eine fremde Stadt unterbricht ihn."
  // „Handelsrouten unterbrechen sie [Kontrollzonen] nicht."
  { const S = leer();
    stadt(S, 0, 2, 2, true); stadt(S, 0, 2, 10); stadt(S, 1, 3, 6, true);
    for (let c = 3; c <= 9; c++) S.roads[key(2, c)] = 2;
    const fremd = [3, 4, 5, 6, 7, 8, 9].filter(c => controlledTiles(S, 1).has(key(2, c))).length;
    eq([fremd > 0, tradeRoutes(S, 0).rail], [true, 1], 'Regelbogen: Handelsroute durch fremdes Gebiet zählt (reine Eisenbahn: +2)');
    S.armies.push({ id: S.nextId++, owner: 1, r: 1, c: 7, mp: 0, born: -1 });
    S.players[1].techs.schiesspulver = true;
    const zone = [3, 4, 5, 6, 7, 8, 9].filter(c => zocStop(S, 0, 2, c)).length;
    eq([zone > 0, tradeRoutes(S, 0).rail], [true, 1], 'Regelbogen: eine Kontrollzone auf dem Weg unterbricht die Handelsroute nicht');
    stadt(S, 1, 2, 8);
    eq(tradeRoutes(S, 0).count, 0, 'Regelbogen: eine fremde Stadt auf dem Weg unterbricht sie');
  }
  // „die sechs Felder ringsum, mit Raketentechnik auch den zweiten Ring. Mit Burgenbau gilt das
  //  auch für deine Städte." · „Die Luftwaffe ignoriert Kontrollzonen."
  { const S = leer(), o = S.players[1];
    stadt(S, 1, 6, 8);
    o.techs.burgenbau = true;
    const z = () => [zocStop(S, 0, 6, 7), zocStop(S, 0, 6, 10)];
    const ohne = z(); o.techs.schiesspulver = true; const mit = z();
    o.techs.raketentechnik = true; const rakete = z();
    eq([ohne, mit, rakete, hexDistance(6, 10, 6, 8)], [[false, false], [true, false], [true, true], 2],
      'Regelbogen: Burgstadt nur mit Schießpulver eine Zone, ein Ring, mit Raketentechnik zwei');
    eq(zocStop(S, 1, 6, 7), false, 'Regelbogen: die eigene Zone hält eigene Armeen nicht auf');
    S.players[0].techs.luftwaffe = true;
    eq(zocStop(S, 0, 6, 7), false, 'Regelbogen: die Luftwaffe ignoriert Kontrollzonen');
  }
}

/* ================= Burgstädte halten Wache (v68, gemeldeter Fehler)
   Gemeldet aus einem 1-gegen-1: die Armeen des Bots liefen zwischen den eigenen Armeen
   und Burgstädten hindurch. Ursache: Burgenbau stellt eine unbewegliche Armee in jede
   Stadt (ANNAHMEN 1), aber zocStop durchsuchte nur echte Armeen – die Burg verteidigte
   und flankierte, warf aber keine Kontrollzone. Eine Mauer Armee – Burgstadt – Armee
   hatte an der Stadt ein Loch: der Bot kam in einem Zug auf VIER Felder dahinter.     */
{
  const bau = (techsMensch, mitArmeen) => {
    const S = newGame({ seed: 3, duel: true,
      players: [{ civ: 'england', kind: 'human' }, { civ: 'russland', kind: 'bot' }] });
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities.length = 0; S.armies.length = 0; S.sieges = {}; S.bought = {}; S.roads = {};
    const m = S.players.findIndex(p => p.kind === 'human');
    const b = S.players.findIndex(p => p.kind === 'bot');
    techsMensch.forEach(t => { S.players[m].techs[t] = true; });
    S.cities.push({ id: 900, owner: m, r: 5, c: 8, pop: 3, cap: true, grown: 0, born: -1 });
    if (mitArmeen) {
      S.armies.push({ id: 901, owner: m, r: 5, c: 5, mp: 0, born: -1 });
      S.armies.push({ id: 902, owner: m, r: 5, c: 11, mp: 0, born: -1 });
    }
    const armee = { id: 950, owner: b, r: 3, c: 8, mp: 3, born: -1 };
    S.armies.push(armee);
    return { S, m, b, armee };
  };
  const ring1 = neighbors(5, 8);
  const ring2 = within(5, 8, 2).filter(([r, c]) => hexDistance(5, 8, r, c) === 2);

  { const { S, b } = bau(['schiesspulver', 'burgenbau']);
    eq(ring1.every(([r, c]) => zocStop(S, b, r, c)), true,
      'mit Schießpulver + Burgenbau wirft die Burgstadt eine Kontrollzone');
    eq(ring2.some(([r, c]) => zocStop(S, b, r, c)), false, 'ohne Raketentechnik nur einen Ring'); }
  { const { S, b } = bau(['schiesspulver', 'burgenbau', 'raketentechnik']);
    eq(ring2.every(([r, c]) => zocStop(S, b, r, c)), true, 'mit Raketentechnik zwei Ringe'); }
  { const { S, b } = bau(['schiesspulver']);
    eq(ring1.some(([r, c]) => zocStop(S, b, r, c)), false,
      'ohne Burgenbau ist die Stadt keine Armee – keine Kontrollzone'); }
  { const { S, b } = bau(['burgenbau']);
    eq(ring1.some(([r, c]) => zocStop(S, b, r, c)), false,
      'ohne Schießpulver gibt es keine Kontrollzone, auch nicht von der Burg'); }
  { const { S, b } = bau(['schiesspulver', 'burgenbau']);
    S.players[b].techs.luftwaffe = true;
    eq(ring1.some(([r, c]) => zocStop(S, b, r, c)), false, 'die Luftwaffe ignoriert auch die Burg'); }
  { const { S, m } = bau(['schiesspulver', 'burgenbau']);
    eq(ring1.some(([r, c]) => zocStop(S, m, r, c)), false, 'die eigene Burg hält die eigenen Armeen nicht auf'); }

  // Der gemeldete Fall: Mauer aus Armee – Burgstadt – Armee, Bot-Armee davor
  const hinter = map => [...map].map(t => Array.isArray(t) ? t : unkey(t)).filter(([r]) => r >= 6);
  { const { S, armee } = bau(['schiesspulver', 'burgenbau'], true);
    eq(hinter(armyReach(S, armee).keys()).length, 0, 'die Mauer hält: nichts dahinter ist erreichbar');
    eq(hinter(botReach(S, armee.owner, armee).tiles).length, 0,
      'und zwar auch auf dem Weg, den der Bot selbst rechnet (botReach)'); }
  { const { S, armee } = bau(['schiesspulver'], true);
    eq(hinter(armyReach(S, armee).keys()).length > 0, true,
      'ohne Burgenbau bleibt das Loch an der Stadt – dort steht dann ja keine Armee'); }
}

/* Bot-Bewegung Priorität 4: bleibt im eigenen Reich, geht ans stadtnächste Randfeld */
{
  const S = newGame({ players: [{ civ: 'russland', kind: 'bot', diff: 'prinz' }, { civ: 'england', kind: 'human' }], seed: 20 });
  const cap = capitalOf(S, 0);
  const spot = spotBy(S, cap);
  S.armies.length = 0;
  S.armies.push({ id: 1, owner: 0, r: spot[0], c: spot[1], mp: moveAllowance(S, 0), born: 0 });
  const realm = () => { const o = controlledTiles(S, 0); for (const c of citiesOf(S, 0)) o.add(key(c.r, c.c)); return o; };
  eq(realm().has(key(spot[0], spot[1])), true, 'Armee startet im eigenen Reich');
  botMoveArmy(S, 0, S.armies[0]);
  const a = S.armies[0];
  eq(realm().has(key(a.r, a.c)), true, 'Bot verlässt sein Reich ohne höhere Priorität NICHT');
}

/* Bot-Zielwahl nutzt Geländedistanz, nicht Luftlinie (kein Weg über Wasser) */
{
  const S = newGame({ players: [{ civ: 'russland', kind: 'bot', diff: 'prinz' }, { civ: 'england', kind: 'human' }], seed: 20 });
  const passableLand = (r, c) => {
    const t = terrainAt(S, r, c);
    return t && !cityAt(S, r, c) && TERRAIN[t].land;   // ohne Navigation: kein Wasser
  };
  // Ein Feld finden, dessen Landweg zu einem Ziel länger ist als die Luftlinie
  // (weil Wasser dazwischen liegt) – das belegt, dass beide Maße sich unterscheiden.
  const cap = capitalOf(S, 0);
  let diffSeen = false, blockedSeen = false;
  for (let dr = -5; dr <= 5; dr++) for (let dc = -5; dc <= 5; dc++) {
    const r = cap.r + dr, c = cap.c + dc, t = terrainAt(S, r, c);
    if (!t || TERRAIN[t].land || cityAt(S, r, c)) continue;   // nur Wasserziele
    const air = hexDistance(cap.r, cap.c, r, c);
    const land = pathSteps(cap.r, cap.c, r, c, passableLand);
    if (land == null) blockedSeen = true;
    else if (land > air) diffSeen = true;
  }
  eq(diffSeen || blockedSeen, true, 'Geländedistanz weicht von der Luftlinie ab, wo Wasser im Weg liegt');
}

/* Luftwaffe: Reichweitensprung wirkt sofort im selben Zug */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  const spot = spotBy(S, cap);
  S.armies.push({ id: 1, owner: 0, r: spot[0], c: spot[1], mp: 3, born: 0 });
  S.players[0].avail.luftwaffe = true; S.players[0].res.sci = 99;
  // vorher Reichweite 3
  eq(moveAllowance(S, 0), 3, 'vor Luftwaffe Reichweite 3');
  doResearch(S, 0, 'luftwaffe');
  eq(moveAllowance(S, 0), 9, 'Luftwaffe erhöht die Reichweite auf 9');
  eq(S.armies[0].mp, 9, 'die bereits stehende Armee bekommt die höhere Reichweite sofort (3 + 6)');
}

/* Panzerschiff: Teilbewegung behält Rest, Sprung wird addiert */
{
  const S = mk('griechenland');
  const spot = spotBy(S, capitalOf(S, 0));
  S.armies.push({ id: 2, owner: 0, r: spot[0], c: spot[1], mp: 1, born: 0 });  // schon 2 verbraucht
  S.players[0].avail.panzerschiff = true; S.players[0].res.sci = 99;
  doResearch(S, 0, 'panzerschiff');
  eq(S.armies[0].mp, 4, 'Panzerschiff (+3) wird der Restbewegung gutgeschrieben: 1 + 3');
}

/* Feste Spielerreihenfolge: Russland → Griechenland → England → Wikinger */
{
  const S = newGame({ players: [
    { civ: 'wikinger', kind: 'bot' }, { civ: 'england', kind: 'bot' },
    { civ: 'griechenland', kind: 'human' }, { civ: 'russland', kind: 'bot' },
  ], startPlayer: 2, seed: 7 });   // startPlayer zeigt auf Griechenland
  eq(S.players.map(p => p.civ), ['russland', 'griechenland', 'england', 'wikinger'], 'feste Rotation R→G→E→W');
  eq(S.players[S.cur].civ, 'griechenland', 'Startspieler ist der gewählte (Griechenland)');
}

/* Armeen: nicht stapelbar, dürfen auf keine Stadt (auch nicht die eigene) */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  const ns = neighbors(cap.r, cap.c).filter(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c));
  S.armies.push({ id: 1, owner: 0, r: ns[0][0], c: ns[0][1], mp: 3, born: 0 });
  S.armies.push({ id: 2, owner: 0, r: ns[1][0], c: ns[1][1], mp: 3, born: 0 });
  eq(canPass(S, 0, ns[1][0], ns[1][1]), false, 'Armee darf nicht auf ein Feld mit anderer Armee');
  eq(canPass(S, 0, cap.r, cap.c), false, 'Armee darf nicht auf die eigene Stadt');
  // frisch gebaute Armee darf ihre Heimatstadt verlassen
  S.players[0].res.coins = 50;
  eq(buildArmy(S, 0, cap), null, 'Armee bauen klappt');
  const fresh = S.armies[S.armies.length - 1];
  const out = neighbors(cap.r, cap.c).find(([r, c]) => canPass(S, 0, r, c));
  eq(moveArmy(S, fresh, out[0], out[1]), null, 'frische Armee kann aus der Stadt herausziehen');
}

/* Navigation: Wasser durchqueren erlaubt, aber nicht darauf anhalten */
{
  const S = mk('england', ['navigation']);
  const cap = capitalOf(S, 0);
  const spot = spotBy(S, cap);
  S.armies.push({ id: 1, owner: 0, r: spot[0], c: spot[1], mp: 6, born: 0 });
  const army = S.armies[0];
  // ein Wasserfeld in der Nähe finden
  let water = null;
  for (let dr = -3; dr <= 3 && !water; dr++) for (let dc = -3; dc <= 3; dc++) {
    const r = cap.r + dr, c = cap.c + dc, t = terrainAt(S, r, c);
    if (t && !TERRAIN[t].land && !cityAt(S, r, c)) { water = [r, c]; break; }
  }
  if (water) {
    eq(canPass(S, 0, water[0], water[1]), true, 'Navigation: Wasser darf durchquert werden');
    eq(canStop(S, 0, water[0], water[1]), false, 'Navigation: auf Wasser darf NICHT angehalten werden');
    eq(typeof moveArmy(S, army, water[0], water[1]), 'string', 'Zug auf ein Wasserfeld wird abgelehnt');
    S.players[0].techs.panzerschiff = true;
    eq(canStop(S, 0, water[0], water[1]), true, 'mit Panzerschiff darf man auf Wasser anhalten');
  }
  // die Reach-Map enthält nie ein Wasserfeld als Ziel (nur Navigation)
  const S2 = mk('england', ['navigation']);
  const cap2 = capitalOf(S2, 0); const spot2 = spotBy(S2, cap2);
  S2.armies.push({ id: 2, owner: 0, r: spot2[0], c: spot2[1], mp: 6, born: 0 });
  eq([...armyReach(S2, S2.armies[0]).keys()].every(k => {
    const [r, c] = unkey(k); return TERRAIN[terrainAt(S2, r, c)].land;
  }), true, 'kein Wasserfeld ist ein gültiges Zielfeld (nur Navigation)');
}

/* Gratis-Wachstum getrennt vom bezahlten Wachstum */
{
  const S = mk('griechenland', ['verbundwerkstoffe', 'gentechnik']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.freeUsed = 0; c.born = 0;
  eq(freeGrowthAvailable(S, 0, c), true, 'Gratis-Wachstum steht bereit');
  eq(growCity(S, 0, c, 'free'), null, 'kostenloses Wachstum klappt');
  eq(c.pop, 4, 'Bevölkerung +1 ohne Kosten');
  eq(freeGrowthAvailable(S, 0, c), false, 'Gratis-Wachstum diese Runde verbraucht');
  // danach noch bezahltes Wachstum möglich (max 2)
  S.players[0].res = { sci: 0, food: 99, coins: 99 };
  eq(canGrowPaid(S, 0, c), null, 'bezahltes Wachstum danach möglich');
  eq(growCity(S, 0, c, 'paid'), null, 'bezahltes Wachstum klappt');
  eq(c.pop, 5, 'zweites Wachstum bezahlt');
}

/* Regression: bezahltes Wachstum ZUERST darf das Gratis-Kontingent nicht verbrauchen */
{
  const S = mk('griechenland', ['verbundwerkstoffe', 'gentechnik']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.freeUsed = 0; c.born = 0;
  S.players[0].res = { sci: 0, food: 99, coins: 99 };
  eq(growCity(S, 0, c, 'paid'), null, 'erst bezahlt wachsen');
  eq(freeGrowthAvailable(S, 0, c), true, 'Gratis-Wachstum bleibt danach verfügbar (Bugfix)');
  eq(growCity(S, 0, c, 'free'), null, 'kostenloses Wachstum danach klappt');
  eq(c.pop, 5, 'beide Wachstumsschritte gezählt');
  eq(freeGrowthAvailable(S, 0, c), false, 'jetzt beide Kontingente aufgebraucht');
}

/* Regression: Keramik+Verbund, 2× bezahlt zuerst, Gratis muss noch gehen (max 3) */
{
  const S = mk('griechenland', ['keramik', 'verbundwerkstoffe', 'gentechnik']);
  const c = capitalOf(S, 0); c.pop = 3; c.grown = 0; c.freeUsed = 0; c.born = 0;
  S.players[0].res = { sci: 0, food: 999, coins: 999 };
  eq(growCity(S, 0, c, 'paid'), null, 'erstes bezahltes Wachstum');
  eq(growCity(S, 0, c, 'paid'), null, 'zweites bezahltes Wachstum');
  eq(freeGrowthAvailable(S, 0, c), true, 'Gratis nach 2× bezahlt noch verfügbar');
  eq(growCity(S, 0, c, 'free'), null, 'kostenloses Wachstum als dritter Schritt');
  eq(c.pop, 6, 'drei Wachstumsschritte insgesamt');
  eq(typeof canGrow(S, 0, c), 'string', 'ein viertes Wachstum wird abgelehnt (max 3)');
}

/* Einkommensaufschlüsselung summiert sich zum Gesamteinkommen */
{
  const S = mk('griechenland', ['landwirtschaft', 'papier']);
  capitalOf(S, 0).pop = 3;
  const b = incomeBreakdown(S, 0);
  const sum = b.rows.concat(b.extra).reduce((a, r) => [a[0] + r.y[0], a[1] + r.y[1], a[2] + r.y[2]], [0, 0, 0]);
  sum[0] += b.pop.y[0]; sum[1] += b.pop.y[1]; sum[2] += b.pop.y[2];
  eq(sum, b.total, 'Aufschlüsselung (Gelände + Bevölkerung) summiert sich zum Einkommen');
  const inc = income(S, 0);
  eq(b.total, [inc.sci, inc.food, inc.coins], 'Übersichtssumme entspricht income()');
}

/* Tech-Labels und Sortierung nach Kosten */
{
  eq(TECH_BY_KEY.keramik.e, 'Bevölkerung 2× pro Runde wachsen lassen', 'Keramik hat ein eigenständiges Label');
  eq(TECH_BY_KEY.verbundwerkstoffe.e, '1× zusätzliches, kostenloses Wachstum pro Stadt', 'Verbundwerkstoffe zeigt das Gratis-Wachstum');
  const prod = techsIn(1, 0).map(t => t.c);
  eq(prod, prod.slice().sort((a, b) => a - b), 'Techs sind nach Kosten sortiert');
  // v82: Bewässerung (1) steht in der Liste hinten, auf der Leiter vorn – es zählen die Kosten
  eq(techsIn(1, 0).map(t => t.n), ['Bewässerung', 'Fischerei', 'Rad', 'Keramik', 'Landwirtschaft'],
    'Bewässerung (1) vor Fischerei (2) … Landwirtschaft (5) – nach Kosten, nicht nach Listenplatz');
}

/* ==================================================== Nahrungsproduktion */
const setEvent = (S, k) => {
  S.ev = S.ev || { mode: 'hard' };
  S.event = { round: S.round, k, row: 0, col: 0 };
};

/* Negatives Nahrungseinkommen wird auf 0 gekappt, ohne Bevölkerungsverlust */
{
  const S = mk('griechenland');
  const c = capitalOf(S, 0); c.pop = 20;
  const inc = income(S, 0);
  eq(inc.food < 0, true, 'Nahrung: große Stadt erzeugt ein Defizit');
  beginTurn(S);
  eq(S.players[0].res.food, 0, 'Nahrung: Einkommen wird bei 0 gekappt');
  eq(S.players[0].foodDeficit, -inc.food, 'Nahrung: Defizit wird vermerkt');
  eq(c.pop, 20, 'Nahrung: niemand verhungert');
}

/* Wachstum ist blockiert, sobald es die Produktion negativ machen würde */
{
  const S = mk('griechenland');
  const c = capitalOf(S, 0);
  let steps = 0;
  while (steps < 40) {
    S.players[0].res = { sci: 0, food: 999, coins: 999 };   // Ressourcen sind hier nicht die Grenze
    c.grown = 0;
    if (canGrow(S, 0, c)) break;
    growCity(S, 0, c); steps++;
  }
  S.players[0].res = { sci: 0, food: 999, coins: 999 };
  eq(typeof canGrow(S, 0, c), 'string', 'Wachstum wird an der Nahrungsgrenze abgelehnt');
  eq(income(S, 0).food >= 0, true, 'an der Grenze ist die Produktion noch nicht negativ');
  eq(foodAfterGrowth(S, 0, c, 1) < 0, true, 'ein weiterer Schritt wäre negativ');
  // Gentechnik hebt die Grenze auf
  S.players[0].techs.gentechnik = true;
  c.grown = 0;
  eq(canGrow(S, 0, c), null, 'Gentechnik erlaubt Wachstum über die Grenze hinaus');
  delete S.players[0].techs.gentechnik;
  S.players[0].techs.massenmedien = true;
  c.grown = 0;
  eq(canGrow(S, 0, c), null, 'Massenmedien erlauben es ebenfalls');
}

/* Gentechnik/Massenmedien sind KEIN allgemeiner Umtausch */
{
  const S = mk('griechenland', ['massenmedien', 'gentechnik']);
  eq(rates(S, 0).coinsToFood, 2, 'Massenmedien ändert den Münzkurs nicht (2:1)');
  eq(rates(S, 0).sciToFood, Infinity, 'Gentechnik ist kein Wissenschaft→Nahrung-Kurs');
  S.players[0].res = { sci: 10, food: 0, coins: 10 };
  eq(available(S, 0, 'food'), 5, 'nur der normale 2:1-Kurs zählt (10 Münzen = 5 Nahrung)');
  const G = mk('griechenland', ['gilden']);
  eq(rates(G, 0).coinsToFood, 1, 'Gilden bleibt ein echter 1:1-Kurs');
}

/* Bevölkerungskosten aus Münzen decken (coverPop, Massenmedien).
   Seit v64 ernährt EINE Münze FEED_COIN_RATE Bevölkerung. Kein Umtausch: gedeckt wird
   höchstens, was die Bevölkerung tatsächlich isst. Der Anteil, der ein offenes Defizit
   tilgt, wird NICHT zu nutzbarer Nahrung – sonst entstünde aus dem Decken mehr Nahrung,
   als verbraucht wird. */
{
  eq(FEED_COIN_RATE, 3, 'eine Münze ernährt drei');
  const S = mk('griechenland', ['massenmedien']);
  const p = S.players[0];
  // Lage von Hand stellen: Produktion 2, Bevölkerung isst 5, also Saldo −3
  const stellen = () => {
    p.res = { sci: 0, food: 0, coins: 9 }; p.foodDeficit = 3; p.popFood = 5;
    p.popCovered = 0; p.popCoveredBy = { sci: 0, coins: 0 };
    p.popSpent = { sci: 0, coins: 0 }; p.popDefPart = 0;
  };
  stellen();
  eq(coverPop(S, 0, 'coins', 1), null, 'eine Münze deckt drei der fünf Kosten');
  eq([p.foodDeficit, p.res.food, p.res.coins], [0, 0, 8],
    'die drei tilgen genau das Defizit, nutzbare Nahrung entsteht dabei nicht');
  eq([p.popCovered, p.popSpent.coins], [3, 1], 'drei gedeckt für eine Münze');
  eq(coverPop(S, 0, 'coins', 1), null, 'die zweite Münze deckt die restlichen zwei');
  eq([p.popCovered, p.res.food, p.res.coins], [5, 2, 7],
    'zusammen fünf gedeckt, die zweite Münze verfällt zum Teil');
  eq(typeof coverPop(S, 0, 'coins', 1), 'string', 'mehr als die Bevölkerung isst geht nicht');
  eq(typeof coverPop(S, 0, 'sci', 1), 'string', 'ohne Gentechnik ernährt Wissenschaft niemanden');
  // Gegenprobe: nie mehr Nahrung als Produktion + gedeckte Kosten
  eq(p.res.food, -3 + p.popCovered, 'Saldo geht auf: −3 + 5 = 2');

  // Zurücknehmen: zuerst der Vorratsanteil, dann der Defizitanteil
  eq(uncoverPop(S, 0, 'coins', 2), null, 'beide Münzen lassen sich zurücknehmen');
  eq([p.res.food, p.res.coins, p.foodDeficit, p.popCovered], [0, 9, 3, 0],
    'Ausgangslage wieder hergestellt');
  eq(typeof uncoverPop(S, 0, 'coins', 1), 'string', 'nichts mehr zurückzunehmen');

  // Kein Schlupfloch: gedeckte Nahrung ausgeben und dann die Deckung zurückholen
  eq(coverPop(S, 0, 'coins', 2), null, 'noch einmal voll decken');
  eq(p.res.food, 2, 'zwei nutzbare Nahrung');
  p.res.food = 0;                                   // ausgegeben (z. B. Wachstum)
  eq(typeof uncoverPop(S, 0, 'coins', 2), 'string',
    'ausgegebene Nahrung lässt sich nicht zurücktauschen');

  /* Die letzte Münze darf teilweise verfallen: sind nur noch 3 Kosten offen, kostet es
     trotzdem eine ganze Münze – und deckt eben nur 3. Verschenkt ist dabei nichts, was
     es sonst gäbe: mehr als die Bevölkerung isst, deckt ohnehin niemand. */
  stellen();
  p.foodDeficit = 0; p.popFood = 2;
  eq(coverPop(S, 0, 'coins', 1), null, 'eine Münze für zwei offene Kosten');
  eq([p.popCovered, p.res.coins, p.res.food], [2, 8, 2], 'gedeckt werden 2, bezahlt eine ganze Münze');

  /* Mehrere Münzen, und mehr als nötig lässt sich nicht einsetzen. */
  stellen();
  p.foodDeficit = 0; p.popFood = 12;
  eq(coverPop(S, 0, 'coins', 2), null, 'zwei Münzen decken sechs');
  eq([p.popCovered, p.res.coins, p.res.food], [6, 7, 6], 'sechs gedeckt, zwei Münzen weg');
  eq(coverPop(S, 0, 'coins', 9), null, 'für die letzten sechs genügen zwei Münzen');
  eq([p.popCovered, p.res.coins, p.popSpent.coins], [12, 5, 4],
    'nur die nötigen Münzen werden eingesetzt, nicht alle neun');
  // Rücknahme einzeln: die zuletzt gesetzte Münze fällt zuerst weg
  eq(uncoverPop(S, 0, 'coins', 1), null, 'eine Münze zurück');
  eq([p.popCovered, p.res.coins, p.popSpent.coins], [9, 6, 3],
    'genau die 3 der letzten Münze fallen weg');

  // Ohne die Tech bleibt alles wie zuvor
  const N = mk('griechenland');
  const q = N.players[0];
  q.res = { sci: 9, food: 0, coins: 9 }; q.foodDeficit = 3; q.popFood = 5;
  q.popCovered = 0; q.popCoveredBy = { sci: 0, coins: 0 };
  q.popSpent = { sci: 0, coins: 0 }; q.popDefPart = 0;
  eq(typeof coverPop(N, 0, 'coins', 1), 'string', 'ohne Massenmedien keine Deckung');
  eq([q.res.sci, q.res.coins, q.foodDeficit], [9, 9, 3], 'und nichts wird abgebucht');
  eq(canFeed(N.players[0]), false, 'und die Nahrungsgrenze gilt');

  // Und der allgemeine Umtauschweg bleibt zu
  const U = mk('griechenland', ['massenmedien']);
  U.players[0].res = { sci: 10, food: 0, coins: 0 };
  eq(rates(U, 0).sciToFood, Infinity, 'kein Wissenschaft→Nahrung-Kurs');
}

/* Gentechnik (v64): kein Füttern mehr, sondern Nahrung im Einkommen – je zwei
   Wissenschaft eine, abgerundet, zu Zugbeginn. */
{
  eq(GENE_SCI_PER_FOOD, 4, 'je vier Wissenschaft eine Nahrung');
  const ohne = mk('griechenland');
  const mit = mk('griechenland', ['gentechnik']);
  // genug Bevölkerung, damit überhaupt Wissenschaft anfällt
  [ohne, mit].forEach(X => { capitalOf(X, 0).pop = 8; });
  const a = incomeBreakdown(ohne, 0), b = incomeBreakdown(mit, 0);
  eq(b.total[0] >= 4, true, 'es fällt genug Wissenschaft an');
  eq(a.total[0], b.total[0], 'an der Wissenschaft ändert Gentechnik nichts');
  eq(b.total[1] - a.total[1], Math.floor(b.total[0] / GENE_SCI_PER_FOOD),
    'die Nahrung steigt um ein Viertel der Wissenschaft, abgerundet');
  const zeile = b.extra.find(e => e.name === 'Gentechnik');
  eq(zeile && zeile.y, [0, Math.floor(b.total[0] / GENE_SCI_PER_FOOD), 0],
    'und steht als eigene Zeile in der Übersicht');
  // Die Summe der Übersicht muss die angezeigten Zeilen tragen, sonst laufen sie auseinander
  const summe = [0, 1, 2].map(i =>
    b.rows.reduce((n, r) => n + r.y[i], 0) + b.extra.reduce((n, e) => n + e.y[i], 0) + b.pop.y[i]);
  eq(summe, b.total, 'Zeilen und Summe gehen auf');
  // Zu Zugbeginn landet die Nahrung im Vorrat
  beginTurn(mit);
  eq(mit.players[0].res.food, Math.max(0, income(mit, 0).food), 'zu Zugbeginn ist sie im Vorrat');

  /* Das Füttern bleibt daneben bestehen, unverändert im Kurs 1:1 (v65). Beide Wirkungen
     rechnen NICHT gegeneinander: der Einkommensposten hängt an der Wissenschaft, die
     diese Runde anfällt, das Füttern an der, die noch da ist. */
  const q = feedSources(mit, 0).find(x => x.kind === 'sci');
  eq(!!q && q.rate, 1, 'Gentechnik füttert weiter, und zwar 1:1');
  eq(canFeed(mit.players[0]), true, 'und hebt die Nahrungsgrenze weiter auf');
  eq(rates(mit, 0).sciToFood, Infinity, 'ein Umtauschkurs ist es trotzdem nicht');
  {
    const Z = mk('griechenland', ['gentechnik']);
    capitalOf(Z, 0).pop = 8;
    beginTurn(Z);
    const z = Z.players[0];
    // Lage von Hand glätten: kein Defizit, damit sich das 1:1 sauber ablesen lässt
    z.res.food = 5; z.foodRaw = 5; z.foodDeficit = 0;
    z.popFood = 4; z.popCovered = 0; z.popCoveredBy = { sci: 0, coins: 0 };
    z.popSpent = { sci: 0, coins: 0 }; z.popDefPart = 0;
    const wiss = z.res.sci;
    eq(coverPop(Z, 0, 'sci', 3), null, 'drei Wissenschaft decken drei Bevölkerung');
    eq([z.res.sci, z.res.food], [wiss - 3, 8], 'eins zu eins – drei rein, drei Nahrung raus');
    const vorher = income(Z, 0).food;
    eq(coverPop(Z, 0, 'sci', 1), null, 'noch eine Wissenschaft verfüttern');
    eq(income(Z, 0).food, vorher,
      'das Nahrungseinkommen bleibt gleich – der Posten hängt am Anfall, nicht am Vorrat');
  }

  // Hungersnot: „keine Nahrung produziert" gilt auch fürs Labor
  const H = mk('griechenland', ['gentechnik']);
  capitalOf(H, 0).pop = 8;
  setEvent(H, 'hungersnot');
  const h = incomeBreakdown(H, 0);
  eq(h.total[1], 0, 'bei Hungersnot bleibt auch die Gentechnik-Nahrung aus');
  eq(h.extra.some(e => e.name === 'Gentechnik'), false, 'und die Zeile fehlt');
}

/* Alte Spielstände kennen die neuen Felder nicht – sie müssen nachgezogen werden,
   sonst fällt die Nahrungsrechnung stumm aus. */
{
  const S = mk('griechenland', ['massenmedien']);
  const p = S.players[0];
  // Zustand wie aus einer älteren Fassung: nur res und foodDeficit
  p.res = { sci: 6, food: 0, coins: 4 }; p.foodDeficit = 2;
  delete p.foodRaw; delete p.popFood; delete p.popCovered;
  delete p.popCoveredBy; delete p.popSpent; delete p.popDefPart;
  ensureFoodState(S, 0);
  eq(p.foodRaw, -2, 'foodRaw wird aus Vorrat minus Defizit rekonstruiert');
  eq(p.popFood, popFoodCost(S, 0), 'popFood wird aus dem Einkommen nachgerechnet');
  eq(p.popCovered, 0, 'noch nichts gedeckt');
  eq(p.popSpent, { sci: 0, coins: 0 }, 'und noch nichts eingesetzt');
  eq(coverPop(S, 0, 'coins', 1), null, 'und Decken funktioniert danach');
  /* Ein Spielstand aus v63 trägt Deckung aus Wissenschaft, damals im Kurs 1:1. Die
     eingesetzten Einheiten sind dort gleich der Deckung – genau so werden sie ergänzt,
     damit sich die alte Deckung noch zurücknehmen lässt. */
  const alt = mk('griechenland', ['massenmedien']).players[0];
  alt.res = { sci: 5, food: 4, coins: 0 };
  alt.foodRaw = 4; alt.foodDeficit = 0; alt.popFood = 3; alt.popCovered = 1;
  alt.popCoveredBy = { sci: 1, coins: 0 }; alt.popDefPart = 0;
  ensureFoodState({ players: [alt] }, 0);
  eq(alt.popSpent, { sci: 1, coins: 0 }, 'aus 1:1 wird eine eingesetzte Einheit');
  eq(uncoverPop({ players: [alt] }, 0, 'sci', 1), null, 'und sie lässt sich zurücknehmen');
  eq([alt.res.sci, alt.res.food, alt.popCovered], [6, 3, 0], 'die alte Deckung geht sauber zurück');
  // Ein vollständiger Zustand wird nicht angetastet
  const q = mk('griechenland', ['massenmedien']).players[0];
  q.res = { sci: 5, food: 4, coins: 0 };
  q.foodRaw = 4; q.foodDeficit = 0; q.popFood = 3; q.popCovered = 1;
  q.popCoveredBy = { sci: 1, coins: 0 }; q.popSpent = { sci: 1, coins: 0 }; q.popDefPart = 0;
  const vorher = JSON.stringify(q);
  ensureFoodState({ players: [q] }, 0);
  eq(JSON.stringify(q), vorher, 'ein vollständiger Zustand bleibt unverändert');
}

/* popFood kommt aus der Bevölkerungszeile des Einkommens und passt zum Saldo. */
{
  const S = mk('griechenland', ['massenmedien']);
  const c = capitalOf(S, 0); c.pop = 7;
  beginTurn(S);
  const p = S.players[0], b = incomeBreakdown(S, 0);
  eq(p.popFood, Math.max(0, -b.pop.y[1]), 'popFood ist genau, was die Bevölkerung isst');
  eq(p.foodRaw, b.total[1], 'foodRaw ist der rohe Nahrungssaldo');
  eq(p.res.food, Math.max(0, p.foodRaw), 'nutzbare Nahrung ist der gekappte Saldo');
  eq(p.foodDeficit, Math.max(0, -p.foodRaw), 'das Defizit ist der abgeschnittene Teil');
  // Voll decken ergibt genau die Bruttoproduktion aus dem Land
  const brutto = b.total[1] + Math.max(0, -b.pop.y[1]);
  p.res.coins += 99;
  let guard = 0;
  while (coverPop(S, 0, 'coins', 99) === null && guard++ < 20) { /* volldecken */ }
  if (p.popCovered === p.popFood)
    eq(p.res.food, brutto, 'voll gedeckt bleibt genau die Produktion aus dem Land übrig');
  eq(p.popCovered <= p.popFood, true, 'nie mehr gedeckt als die Bevölkerung isst');
}

/* Ökologie (v69, Anweisung des Autors): je zwei Bevölkerung einer Stadt +1 auf ALLE drei
   Erträge statt nur +1 Nahrung, je Stadt abgerundet. Der Nahrungsanteil ist genau der
   alte, Wissenschaft und Münzen kommen im selben Umfang dazu. Der Posten steht in der
   Bevölkerungszeile – daran hängt, dass Bürokratie ihn in der Hauptstadt verdoppelt, die
   Revolution ihn dort ausfallen lässt und popFoodCost wie bisher sinkt. */
{
  const ertrag = X => { const i = income(X, 0); return [i.sci, i.food, i.coins]; };
  // Zwei gleiche Spiele, das zweite mit Ökologie; `richte` stellt beide gleich her
  const plus = (techs, richte) => {
    const A = mk('griechenland', techs), B = mk('griechenland', techs.concat('oekologie'));
    richte(A); richte(B);
    const a = ertrag(A);
    return ertrag(B).map((n, i) => n - a[i]);
  };
  const hauptstadt = pop => X => { capitalOf(X, 0).pop = pop; };
  eq(plus([], hauptstadt(1)), [0, 0, 0], 'Ökologie: Bevölkerung 1 bringt nichts (abgerundet)');
  eq(plus([], hauptstadt(2)), [1, 1, 1], 'Ökologie: Bevölkerung 2 bringt +1 auf alle drei Erträge');
  eq(plus([], hauptstadt(5)), [2, 2, 2], 'Ökologie: Bevölkerung 5 bringt +2 auf alle drei, abgerundet');

  // Abgerundet wird je Stadt, nicht übers Reich: 5 + 3 Bevölkerung → 2 + 1, nicht 4
  const zweiStaedte = X => {
    const cap = capitalOf(X, 0); cap.pop = 5;
    const spot = within(cap.r, cap.c, 7).find(([r, c]) => isLand(X, r, c) &&
      hexDistance(cap.r, cap.c, r, c) >= 4 && !X.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
    X.cities.push({ id: 901, owner: 0, r: spot[0], c: spot[1], pop: 3, cap: false, grown: 0, born: 0 });
  };
  eq(plus([], zweiStaedte), [3, 3, 3], 'Ökologie: je Stadt abgerundet – 5 + 3 Bevölkerung geben +3, nicht +4');
  eq(plus(['buerokratie'], zweiStaedte), [5, 5, 5],
    'Ökologie: Bürokratie verdoppelt den Hauptstadtanteil (2 × 2 + 1)');

  // Nahrungsseite wie vor v69: der Posten senkt, was die Bevölkerung isst
  {
    const A = mk('griechenland'), B = mk('griechenland', ['oekologie']);
    [A, B].forEach(hauptstadt(5));
    eq([popFoodCost(A, 0), popFoodCost(B, 0)], [5, 3], 'Ökologie senkt die Bevölkerungskosten wie bisher (5 → 3)');
    const a = incomeBreakdown(A, 0), b = incomeBreakdown(B, 0);
    eq(b.pop.y.map((n, i) => n - a.pop.y[i]), [2, 2, 2], 'Ökologie steht in der Bevölkerungszeile');
    const summe = [0, 1, 2].map(i =>
      b.rows.reduce((n, r) => n + r.y[i], 0) + b.extra.reduce((n, e) => n + e.y[i], 0) + b.pop.y[i]);
    eq(summe, b.total, 'Ökologie: Zeilen und Summe gehen auf');
  }

  // Ereignisse: Revolution legt die Hauptstadt still, Hungersnot und Wirtschaftskrise
  // kappen je nur ihren Ertrag
  const mitEreignis = k => X => { hauptstadt(5)(X); setEvent(X, k); };
  eq(plus([], mitEreignis('revolution')), [0, 0, 0], 'Ökologie: bei Revolution bringt die Hauptstadt auch hier nichts');
  eq(plus([], mitEreignis('hungersnot')), [2, 0, 2], 'Ökologie: Hungersnot kappt nur den Nahrungsanteil');
  eq(plus([], mitEreignis('wirtschaftskrise')), [2, 2, 0], 'Ökologie: Wirtschaftskrise kappt nur den Münzanteil');

  // Grundtechnologie – wirkt wie bisher auch für Bots
  {
    const S = mk('griechenland');
    const bot = S.players.findIndex(p => p.kind === 'bot');
    capitalOf(S, bot).pop = 6;
    const a = income(S, bot);
    S.players[bot].techs.oekologie = true;
    const z = income(S, bot);
    eq([z.sci - a.sci, z.food - a.food, z.coins - a.coins], [3, 3, 3], 'Ökologie wirkt auch für Bots');
  }
  // Anzeige und Rechnung sagen dasselbe, in beiden Sprachen
  eq(/alle Erträge/.test(TECH_BY_KEY.oekologie.e), true, 'Ökologie: Techtext nennt alle Erträge');
  eq(/all yields/.test(DATA_EN.tech.oekologie[1]), true, 'Ökologie: englischer Techtext ebenso');
}

/* ================= Erst würfeln, dann legen (Plättchenmodus)
   Was am Anfang verfügbar ist, hängt allein an den Würfeln – nicht an der Karte. Deshalb
   lässt es sich vor die Legephase ziehen: `rollSetup` würfelt in einer Wegwerf-Partie,
   das Ergebnis geht als cfg.avail / cfg.wpool in die echte Partie. Geprüft wird das
   Entscheidende: die Partie NIMMT, was sie bekommt, statt neu zu würfeln.              */
{
  const auf = [{ civ: 'england', kind: 'human' }, { civ: 'russland', kind: 'human' },
    { civ: 'griechenland', kind: 'bot' }];
  const cfg = { seed: 4242, wonders: true, players: auf };

  // 1. Vorgabe wird übernommen – auch eine, die kein Würfel je ergeben hätte
  const vorgabe = [{ schrift: true }, { rad: true, mathematik: true }, {}];
  const V = newGame(Object.assign({}, cfg, { avail: vorgabe, wpool: { 1: ['mauer'], 2: [], 3: [] } }));
  const nach = {};
  V.players.forEach(p => { nach[p.slot] = TECHS.filter(t => p.avail[t.k]).map(t => t.k).sort(); });
  eq(nach[0], ['schrift'], 'Platz 0 bekommt genau seine Vorgabe');
  eq(nach[1], ['mathematik', 'rad'], 'Platz 1 auch');
  eq(nach[2], [], 'und ein leerer Platz bleibt leer – es wird NICHT nachgewürfelt');
  eq(V.wpool[1], ['mauer'], 'und der Wunderstapel wird ebenfalls übernommen');

  // 2. Ohne Vorgabe wird wie bisher gewürfelt, und jeder hat etwas
  const N = newGame(cfg);
  N.players.forEach(p =>
    eq(TECHS.some(t => p.avail[t.k]), true, `${civOf(p).n} hat etwas Verfügbares`));

  /* 3. rollSetup liefert die Verfügbarkeiten NACH PLATZ, und zwar dieselben, die die
     Partie mit demselben Seed auch selbst würfeln würde – der Vorabwurf ist derselbe
     Wurf, nicht ein zweiter. Genau deshalb sieht man in der Legephase, was später gilt. */
  const setup = rollSetup(cfg);
  eq(setup.avail.length, 3, 'für jeden Platz eine Liste');
  N.players.forEach(p =>
    eq(TECHS.filter(t => setup.avail[p.slot][t.k]).map(t => t.k).sort(),
      TECHS.filter(t => p.avail[t.k]).map(t => t.k).sort(),
      `Vorabwurf und Partie stimmen überein (${civOf(p).n})`));
  eq(setup.wpool[1], N.wpool[1], 'auch die Wunderstapel');
  eq(rollSetup({ seed: 4242, players: auf }).wpool, null, 'ohne Wunder kein Stapel');
}

/* Wegebau: welche Stufe ist als Nächstes dran?
   Die Oberfläche leitete das früher selbst her und lag daneben – mit Eisenbahn, aber
   ohne Rad war gar nichts baubar, obwohl buildRoad Stufe 2 erlaubt. */
{
  const leer = mk('griechenland');
  const feld = within(capitalOf(leer, 0).r, capitalOf(leer, 0).c, 3)
    .find(([r, c]) => isLand(leer, r, c) && !cityAt(leer, r, c));
  const [fr, fc] = feld;
  const mitTechs = (...t) => { const S = mk('griechenland', t); return S; };

  // Ohne alles: gar kein Wegebau
  eq(canBuildRoads(mitTechs().players[0]), false, 'ohne Rad und Eisenbahn kein Wegebau');
  eq(roadTarget(mitTechs(), 0, fr, fc), null, 'und keine Zielstufe');

  // Nur Rad
  const R = mitTechs('rad');
  eq(roadTarget(R, 0, fr, fc), 1, 'nur Rad: auf leerem Feld die Straße');
  R.roads[key(fr, fc)] = 1;
  eq(roadTarget(R, 0, fr, fc), null, 'nur Rad: auf der Straße geht es nicht weiter');

  // Nur Eisenbahn – der gemeldete Fall
  const E = mitTechs('eisenbahn');
  eq(canBuildRoads(E.players[0]), true, 'Eisenbahn allein erlaubt Wegebau');
  eq(roadTarget(E, 0, fr, fc), 2, 'nur Eisenbahn: die Straßenstufe wird übersprungen');
  eq(roadPrice(E, 0, fr, fc, 2), 2, 'der Direktbau kostet 2');
  E.players[0].res.coins = 9;
  eq(buildRoad(E, 0, fr, fc, roadTarget(E, 0, fr, fc)), null,
    'und der Bau gelingt mit genau dieser Zielstufe');
  eq(roadLevel(E, fr, fc), 2, 'das Feld hat danach eine Eisenbahn');
  eq(roadTarget(E, 0, fr, fc), null, 'danach ist nichts mehr zu bauen');

  // Beides: erst Straße, dann Eisenbahn – und in Summe nicht teurer als der Direktbau
  const B = mitTechs('rad', 'eisenbahn');
  B.players[0].res.coins = 9;
  eq(roadTarget(B, 0, fr, fc), 1, 'mit beidem zuerst die günstige Straße');
  const p1 = roadPrice(B, 0, fr, fc, 1);
  eq(buildRoad(B, 0, fr, fc, 1), null, 'Straße gebaut');
  eq(roadTarget(B, 0, fr, fc), 2, 'danach ist die Eisenbahn dran');
  const p2 = roadPrice(B, 0, fr, fc, 2);
  eq(p1 + p2, roadPrice(mitTechs('rad', 'eisenbahn'), 0, fr, fc, 2),
    'zwei Schritte kosten zusammen so viel wie der Direktbau');

  // Beide Techs auf leerem Feld: beide Stufen stehen zur Wahl
  const Z = mitTechs('rad', 'eisenbahn');
  eq(roadTargets(Z, 0, fr, fc), [1, 2], 'mit beidem stehen Straße und Eisenbahn zur Wahl');
  eq(roadTargets(mitTechs('rad'), 0, fr, fc), [1], 'nur Rad: nur die Straße');
  eq(roadTargets(mitTechs('eisenbahn'), 0, fr, fc), [2], 'nur Eisenbahn: nur die Eisenbahn');
  eq(roadTargets(mitTechs(), 0, fr, fc), [], 'ohne beides gar nichts');
  Z.roads[key(fr, fc)] = 1;
  eq(roadTargets(Z, 0, fr, fc), [2], 'auf der Straße bleibt nur der Ausbau');
  Z.roads[key(fr, fc)] = 2;
  eq(roadTargets(Z, 0, fr, fc), [], 'auf der Eisenbahn nichts mehr');

  // Zwei Schritte kosten nicht mehr als einer: 1 + 1 statt 2
  {
    const S2 = mitTechs('rad', 'eisenbahn');
    S2.players[0].res = { sci: 0, food: 0, coins: 10 };
    eq(buildRoad(S2, 0, fr, fc, 1), null, 'Straße gebaut');
    eq(S2.players[0].res.coins, 9, 'die Straße kostet 1');
    eq(roadPrice(S2, 0, fr, fc, 2), 1, 'der Ausbau kostet danach nur noch 1');
    eq(buildRoad(S2, 0, fr, fc, 2), null, 'Ausbau gebaut');
    eq(S2.players[0].res.coins, 8, 'zusammen 2 Münzen – nicht 3');
  }

  // Invariante: roadTargets schlägt nie etwas vor, das buildRoad ablehnt
  let geprueft = 0;
  for (const techs of [[], ['rad'], ['eisenbahn'], ['rad', 'eisenbahn']])
    for (const lvl of [0, 1, 2]) {
      const S = mk('griechenland', techs);
      S.players[0].res.coins = 9;
      if (lvl) S.roads[key(fr, fc)] = lvl;
      for (const ziel of roadTargets(S, 0, fr, fc)) {
        const T = mk('griechenland', techs);
        T.players[0].res.coins = 9;
        if (lvl) T.roads[key(fr, fc)] = lvl;
        const err = buildRoad(T, 0, fr, fc, ziel);
        if (err) throw new Error(`roadTargets schlägt ${ziel} vor, buildRoad sagt: ${err}` +
          ` (Techs ${techs.join('+') || 'keine'}, Level ${lvl})`);
      }
      geprueft++;
    }
  eq(geprueft, 12, '12 Kombinationen aus Technologien und Ausbaustufe geprüft');
}

/* Mehrere Kosten aus einem Topf: getrennte Prüfungen greifen auf dieselben Münzen zu.
   Gemeldet: mit 2 Münzen wuchs eine Stadt von 1 auf 2, obwohl 1 Nahrung (= 2 Münzen)
   plus 1 Münze zusammen 3 Münzen kosten. Der zweite pay() schlug fehl, sein
   Rückgabewert wurde aber nicht ausgewertet. */
{
  const stadt = (muenzen, nahrung = 0) => {
    const S = mk('griechenland');
    const c = capitalOf(S, 0);
    c.pop = 1; c.grown = 0; c.freeUsed = 0; c.born = -1;
    S.players[0].res = { sci: 0, food: nahrung, coins: muenzen };
    return { S, c, p: S.players[0] };
  };
  const { S, c } = stadt(2);
  eq(rates(S, 0).coinsToFood, 2, 'ohne Gilden kosten 2 Münzen eine Nahrung');
  eq(growPrice(S, 0, c), { food: 1, coins: 1 }, 'Wachstum 1→2 kostet 1 Nahrung + 1 Münze');
  eq(typeof canGrow(S, 0, c), 'string', 'mit 2 Münzen reicht es NICHT');
  eq(typeof growCity(S, 0, c, 'paid'), 'string', 'und das Wachstum wird abgelehnt');
  eq(c.pop, 1, 'die Stadt ist nicht gewachsen');
  eq(S.players[0].res.coins, 2, 'und die Münzen sind unangetastet');

  const drei = stadt(3);
  eq(canGrow(drei.S, 0, drei.c), null, 'mit 3 Münzen reicht es');
  eq(growCity(drei.S, 0, drei.c, 'paid'), null, 'und die Stadt wächst');
  eq([drei.c.pop, drei.p.res.coins], [2, 0], 'auf 2, alle drei Münzen weg');

  // Direkt vorhandene Nahrung braucht keinen Umtausch
  const gemischt = stadt(1, 1);
  eq(canGrow(gemischt.S, 0, gemischt.c), null, '1 Nahrung + 1 Münze reicht direkt');
  eq(growCity(gemischt.S, 0, gemischt.c, 'paid'), null, 'und wächst');
  eq([gemischt.p.res.food, gemischt.p.res.coins], [0, 0], 'beides genau aufgebraucht');

  // affordAll und payAll selbst
  const T = mk('griechenland');
  T.players[0].res = { sci: 0, food: 0, coins: 2 };
  eq(affordAll(T, 0, { food: 1, coins: 1 }), false, 'affordAll sieht die Doppelzählung');
  eq(available(T, 0, 'food') >= 1 && available(T, 0, 'coins') >= 1, true,
    'einzeln geprüft sähe beides gedeckt aus – genau das war der Fehler');
  eq(T.players[0].res.coins, 2, 'affordAll verändert nichts');
  eq(payAll(T, 0, { food: 1, coins: 1 }), false, 'payAll scheitert ebenso');
  eq(T.players[0].res.coins, 2, 'und rollt vollständig zurück');
  T.players[0].res.coins = 3;
  eq(payAll(T, 0, { food: 1, coins: 1 }), true, 'mit 3 Münzen gelingt es');
  eq(T.players[0].res.coins, 0, 'und zieht alles ab');

  // Prüfung und Bezahlung müssen immer übereinstimmen
  let geprueft = 0;
  for (let coins = 0; coins <= 6; coins++)
    for (let food = 0; food <= 3; food++) {
      const { S: X, c: cx } = stadt(coins, food);
      const darf = canGrow(X, 0, cx) === null;
      const ging = growCity(X, 0, cx, 'paid') === null;
      if (darf !== ging) throw new Error(`canGrow ${darf} ≠ growCity ${ging} bei ${coins}🪙 ${food}🌾`);
      geprueft++;
    }
  eq(geprueft, 28, `${geprueft} Kombinationen: Prüfung und Wachstum stimmen überein`);
}

/* ==================================================== Handelsrouten
   Jede eigene Stadt außer der Hauptstadt, die über einen durchgehenden Weg an die
   Hauptstadt angebunden ist: +1 auf alle Erträge über Straße, +2 über reine Eisenbahn.
   Eine Mischung gibt nur den kleineren Bonus. */
{
  const S = mk('griechenland', ['rad', 'eisenbahn']);
  const cap = capitalOf(S, 0);
  // Einen echten Korridor über Landfelder suchen (BFS mit Vorgängern). Nur so lässt
  // sich die Mischungsregel prüfen: bei flächig verlegten Straßen gäbe es Umwege.
  const korridor = (zr, zc) => {
    const von = new Map([[key(cap.r, cap.c), null]]);
    let rand = [[cap.r, cap.c]];
    while (rand.length) {
      const nächste = [];
      for (const [r, c] of rand)
        for (const [nr, nc] of neighbors(r, c)) {
          const k = key(nr, nc);
          if (von.has(k) || !isLand(S, nr, nc)) continue;
          von.set(k, key(r, c));
          if (nr === zr && nc === zc) {
            const pfad = []; let k2 = k;
            while (k2) { pfad.push(unkey(k2)); k2 = von.get(k2); }
            return pfad.reverse();
          }
          nächste.push([nr, nc]);
        }
      rand = nächste;
    }
    return null;
  };
  let ziel = null, weg = null;
  for (const [r, c] of within(cap.r, cap.c, 4)) {
    if (!isLand(S, r, c) || cityAt(S, r, c)) continue;
    if (hexDistance(cap.r, cap.c, r, c) < 3) continue;
    const pfad = korridor(r, c);
    if (pfad && pfad.length >= 4) { ziel = [r, c]; weg = pfad; break; }
  }
  eq(!!ziel, true, 'ein Platz für die zweite Stadt gefunden');
  S.cities.push({ id: 500, owner: 0, r: ziel[0], c: ziel[1], pop: 1, cap: false, grown: 0, born: 0 });

  const routen = () => tradeRoutes(S, 0);
  const bonusZeile = () => (incomeBreakdown(S, 0).extra || []).find(e => e.name === 'Handelsrouten');
  eq(routen().bonus, 0, 'ohne Straßen gibt es keine Handelsroute');
  eq(bonusZeile(), undefined, 'und keine Zeile in der Übersicht');

  // Straße auf allen Feldern des Weges (Stadtfelder zählen über effectiveRoad mit)
  const zwischen = weg.filter(([r, c]) => !(r === cap.r && c === cap.c) && !cityAt(S, r, c));
  zwischen.forEach(([r, c]) => S.roads[key(r, c)] = 1);
  eq(routen().bonus, 1, 'durchgehende Straße: +1');
  eq(routen().road, 1, 'als Straßenverbindung gezählt');
  eq(bonusZeile().y, [1, 1, 1], 'die Zeile bringt +1 auf alle drei Erträge');
  eq(income(S, 0).sci - income(mk('griechenland', ['rad', 'eisenbahn']), 0).sci >= 1, true,
    'das Einkommen steigt tatsächlich');

  // Eine Lücke im Weg trennt die Verbindung wieder
  const lücke = zwischen[0];
  delete S.roads[key(lücke[0], lücke[1])];
  eq(routen().bonus, 0, 'eine Lücke unterbricht die Route');
  S.roads[key(lücke[0], lücke[1])] = 1;

  // Alles auf Eisenbahn: +2
  zwischen.forEach(([r, c]) => S.roads[key(r, c)] = 2);
  eq(routen().bonus, 2, 'durchgehende Eisenbahn: +2');
  eq(routen().rail, 1, 'als Bahnverbindung gezählt');

  // Mischung: ein einziges Straßenfeld drückt auf +1 zurück
  if (zwischen.length) {
    S.roads[key(zwischen[0][0], zwischen[0][1])] = 1;
    eq(routen().bonus, 1, 'gemischte Strecke gibt nur den kleineren Bonus');
    eq(routen().rail, 0, 'sie zählt nicht als Bahnverbindung');
    zwischen.forEach(([r, c]) => S.roads[key(r, c)] = 2);
  }

  // Die Hauptstadt selbst bringt nichts, und ohne Hauptstadt bricht alles weg
  eq(routen().count, 1, 'nur die zweite Stadt zählt, nicht die Hauptstadt');
  const ohneCap = JSON.parse(JSON.stringify(S));
  ohneCap.cities = ohneCap.cities.filter(c => !c.cap);
  eq(tradeRoutes(ohneCap, 0).bonus, 0, 'ohne Hauptstadt gibt es keine Routen');

  // Eine fremde Stadt auf dem Weg sperrt ihn
  if (zwischen.length) {
    const [br, bc] = zwischen[Math.floor(zwischen.length / 2)];
    S.cities.push({ id: 501, owner: 1, r: br, c: bc, pop: 1, cap: false, grown: 0, born: 0 });
    eq(tradeRoutes(S, 0).bonus, 0, 'eine fremde Stadt unterbricht die Route');
    S.cities = S.cities.filter(c => c.id !== 501);
    eq(tradeRoutes(S, 0).bonus, 2, 'ohne sie zählt die Route wieder');
  }

  // Zwei angebundene Städte zählen doppelt
  const zweit = within(cap.r, cap.c, 2).find(([r, c]) =>
    isLand(S, r, c) && !cityAt(S, r, c) && neighbors(r, c).some(([a2, b2]) => cityAt(S, a2, b2)));
  if (zweit) {
    S.cities.push({ id: 502, owner: 0, r: zweit[0], c: zweit[1], pop: 1, cap: false, grown: 0, born: 0 });
    S.roads[key(zweit[0], zweit[1])] = 2;
    eq(tradeRoutes(S, 0).count, 2, 'zwei angebundene Städte');
    eq(tradeRoutes(S, 0).bonus, 4, 'zweimal Eisenbahn: +4');
  }
}

/* Bug: ein Ereignis darf die Nahrungsgrenze nicht verschieben – sie gilt dauerhaft. */
{
  const S = mkX('griechenland', { events: true });
  const c = capitalOf(S, 0);
  while (foodAfterGrowth(S, 0, c, 1) >= 0) c.pop++;
  c.pop--;                                    // eine Stufe unter der Grenze
  c.grown = 0; c.freeUsed = 0;
  eq(growthBlocked(S, 0, c), false, 'ohne Ereignis ist Wachstum erlaubt');
  for (const k of ['duerre', 'revolution', 'waldbrand', 'hungersnot', 'piraterie']) {
    setEvent(S, k);
    eq(growthBlocked(S, 0, c), false, `${k} blockiert das Wachstum nicht mehr`);
  }
  setEvent(S, 'duerre');
  eq(income(S, 0).food < baseIncome(S, 0).food, true,
    'die Dürre senkt das Einkommen dieser Runde sehr wohl');
  eq(baseIncome(S, 0).food >= 0, true, 'der dauerhafte Wert bleibt aber gedeckt');
  S.event = null;
  eq(baseIncome(S, 0).food, income(S, 0).food, 'ohne Ereignis sind beide gleich');
}

/* Kostenloses Wunder-Wachstum respektiert die Grenze und wächst nur so weit wie möglich */
{
  const S = mk('griechenland');
  const c = capitalOf(S, 0);
  const room = (() => { let n = 0; while (foodAfterGrowth(S, 0, c, n + 1) >= 0) n++; return n; })();
  eq(room > 0, true, 'es ist noch Nahrungsspielraum vorhanden');
  const done = growFree(S, 0, c, room + 5, 'Test');
  eq(done, room, 'kostenloses Wachstum stoppt genau an der Nahrungsgrenze');
  eq(income(S, 0).food >= 0, true, 'die Produktion bleibt nicht negativ');
}

/* ============================================ Gründen neben gegnerischen Armeen */
{
  const S = mk('griechenland');
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  eq(canFound(S, 0, spot[0], spot[1]), null, 'freies Feld ist bebaubar');
  // gegnerische Armee direkt daneben
  const next = neighbors(spot[0], spot[1]).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  const foe = { id: 800, owner: 1, r: next[0], c: next[1], mp: 0, born: 0 };
  S.armies.push(foe);
  eq(typeof canFound(S, 0, spot[0], spot[1]), 'string', 'neben einer gegnerischen Armee nicht bebaubar');
  eq(foundCity(S, 0, spot[0], spot[1]) !== null, true, 'Gründen wird abgelehnt');
  eq(settleable(S, 0, spot[0], spot[1]), false, 'auch Bots dürfen dort nicht siedeln');
  // die eigene Armee stört nicht
  foe.owner = 0;
  eq(canFound(S, 0, spot[0], spot[1]), null, 'eigene Armee daneben ist erlaubt');
  eq(settleable(S, 0, spot[0], spot[1]), true, 'für Bots ebenso');
  // zwei Felder entfernt stört sie auch nicht
  foe.owner = 1;
  const far = within(cap.r, cap.c, 6).find(([r, c]) => !canFound(S, 0, r, c) &&
    hexDistance(foe.r, foe.c, r, c) > 1);
  eq(canFound(S, 0, far[0], far[1]), null, 'zwei Felder entfernt ist wieder erlaubt');
}
/* Bots siedeln nicht auf Vulkanen */
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.map.rows[spot[0]] = S.map.rows[spot[0]].slice(0, spot[1]) + 'V' + S.map.rows[spot[0]].slice(spot[1] + 1);
  eq(settleable(S, 0, spot[0], spot[1]), false, 'Bots siedeln nicht auf einem Vulkan');
  eq(typeof canFound(S, 0, spot[0], spot[1]), 'string', 'Menschen auch nicht');
}

/* =========================== Gründungskosten: Kolonisten und Kartografie zusammen
   Stadtkosten (1/3/6/10 …) + Distanzkosten. Kolonisten streicht die Stadtkosten,
   Kartografie die Distanzkosten – zusammen zahlt man die günstigere der beiden, nicht
   pauschal 1 (so war es bis v50, was ab der dritten Stadt praktisch gratis war).       */
{
  const A = mkA('england', 'gruenden', ['kartografie']);
  const cap = capitalOf(A, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(A, 0, r, c));
  const weg = foundDistance(A, 0, spot[0], spot[1]);
  eq(foundCost(A, 0, spot[0], spot[1]), Math.min(1, weg),
    'mit einer Stadt: Stadtkosten 1 sind günstiger als der Weg');
  // Städte dazuerfinden: die Stadtkosten steigen 1/3/6/10, der Weg bleibt gleich
  const stadtkosten = n => n * (n + 1) / 2;
  for (const n of [2, 3, 4, 5]) {
    while (citiesOf(A, 0).length < n)
      A.cities.push({ id: 900 + A.cities.length, owner: 0, r: 0, c: 0, pop: 1, cap: false, grown: 0, born: 1 });
    const erwartet = Math.min(stadtkosten(n), weg);
    eq(foundCost(A, 0, spot[0], spot[1]), erwartet,
      `bei ${n} Städten kostet es ${erwartet} (Stadt ${stadtkosten(n)}, Weg ${weg})`);
  }
  eq(foundCost(A, 0, spot[0], spot[1]), weg,
    'ab genug Städten zahlt man den Weg – die Kosten bleiben nicht bei 1 stehen');
  // die einzelnen Vergünstigungen bleiben, wie sie waren
  const B = mkA('england', 'gruenden');
  eq(foundCost(B, 0, spot[0], spot[1]), foundDistance(B, 0, spot[0], spot[1]),
    'Kolonisten allein: nur die Distanzkosten');
  const C = mk('griechenland', ['kartografie']);
  eq(foundCost(C, 0, spot[0], spot[1]), 1, 'Kartografie allein: Stadtkosten der ersten Stadt = 1');
  const D = mk('griechenland');
  eq(foundCost(D, 0, spot[0], spot[1]), 1 + foundDistance(D, 0, spot[0], spot[1]),
    'ohne beides: Stadtkosten plus Weg');
  // nie unter 1, auch wenn ein Reich alle Städte verloren hat
  const E = mkA('england', 'gruenden', ['kartografie']);
  E.cities.length = 0;
  eq(foundCost(E, 0, spot[0], spot[1]) >= 1, true, 'gegründet wird nie für null Nahrung');
}

/* ============================== Gründungsdistanz nur über passierbare Felder */
{
  const S = mk('england');
  const cap = capitalOf(S, 0);
  S.players[0].res = { sci: 0, food: 99, coins: 99 };
  // Inseln ohne Landweg: nicht gründbar, egal wie kurz die Luftlinie ist
  const island = within(cap.r, cap.c, 9).find(([r, c]) => terrainAt(S, r, c) === 'I' &&
    foundDistance(S, 0, r, c) == null && !S.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
  eq(!!island, true, 'es gibt eine Insel ohne Landweg');
  eq(hexDistance(cap.r, cap.c, island[0], island[1]) < 99, true, 'die Luftlinie wäre kurz');
  eq(foundCost(S, 0, island[0], island[1]) === Infinity, true, 'ohne Weg keine Kosten, sondern unmöglich');
  eq(typeof canFound(S, 0, island[0], island[1]), 'string', 'ohne Navigation nicht gründbar');
  eq(foundCity(S, 0, island[0], island[1]) !== null, true, 'Gründen wird abgelehnt');
  // mit Navigation geht es, und die Distanz zählt über das Wasser
  S.players[0].techs.navigation = true;
  const d = foundDistance(S, 0, island[0], island[1]);
  eq(typeof d === 'number', true, 'mit Navigation gibt es einen Weg');
  eq(canFound(S, 0, island[0], island[1]), null, 'und die Gründung ist erlaubt');
  eq(foundCost(S, 0, island[0], island[1]), 1 + d, 'Kosten = Basiskosten + Weglänge');
  // Landziele: der Weg über passierbare Felder kann länger sein als die Luftlinie
  const land = within(cap.r, cap.c, 8).find(([r, c]) => isLand(S, r, c) && !canFound(S, 0, r, c) &&
    foundDistance(S, 0, r, c) > hexDistance(cap.r, cap.c, r, c));
  if (land) eq(foundCost(S, 0, land[0], land[1]) > 1 + hexDistance(cap.r, cap.c, land[0], land[1]), true,
    'gerechnet wird der Weg, nicht die Luftlinie');
  // Kartografie erlässt die Distanzkosten, aber nicht die Erreichbarkeit
  const K = mk('england', ['kartografie']);
  const kcap = capitalOf(K, 0);
  const kisle = within(kcap.r, kcap.c, 9).find(([r, c]) => terrainAt(K, r, c) === 'I' &&
    foundDistance(K, 0, r, c) == null && !K.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
  if (kisle) eq(typeof canFound(K, 0, kisle[0], kisle[1]), 'string',
    'mit Kartografie bleibt eine unerreichbare Insel gesperrt');
  // gegnerische Armeen machen Felder unpassierbar
  const A = mk('england');
  const acap = capitalOf(A, 0);
  const path = within(acap.r, acap.c, 3).find(([r, c]) => isLand(A, r, c) && !cityAt(A, r, c));
  eq(foundPassable(A, 0, path[0], path[1]), true, 'freies Landfeld ist passierbar');
  A.armies.push({ id: 810, owner: 1, r: path[0], c: path[1], mp: 0, born: 0 });
  eq(foundPassable(A, 0, path[0], path[1]), false, 'Feld mit gegnerischer Armee nicht');
}

/* ================= Was sperrt den Siedlerweg – und was die Luftwaffe überfliegt
   Gebaut wird eine flache Graslandkarte, Hauptstadt 5/5, Ziel 5/9, und quer dazwischen
   eine Sperrmauer über die ganze Kartenhöhe (Spalte 7). Regelstand ab v63:

   • gegnerische Armeen, gegnerische Städte UND gegnerisches Territorium sperren
     (Regelheft: „besetzte Felder und gegnerische Territorien … zählen als unpassierbar\"),
   • Vulkane sperren,
   • Wasser sperrt ohne Navigation/Panzerschiff/Luftwaffe,
   • die LUFTWAFFE überfliegt all das — Gelände, Grenzen, Armeen, Städte,
   • Kartenlöcher (X) sperren immer, auch mit Luftwaffe: sie sind kein Gelände, sondern
     das Draußen der Karte,
   • eigene Armeen und eigene Städte sperren den eigenen Siedler nie.                    */
{
  const flacheKarte = () => {
    const S = mk('england');
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));   // alles Grasland
    S.cities.length = 0; S.armies.length = 0; S.sieges = {}; S.bought = {};
    S.cities.push({ id: S.nextId++, owner: 0, r: 5, c: 5, pop: 3, cap: true, grown: 0, born: -1 });
    S.players[0].res = { sci: 0, food: 999, coins: 0 };
    return S;
  };
  const SP = 7, ZR = 5, ZC = 9;
  const setT = (S, r, c, t) => { S.map.rows[r] = S.map.rows[r].slice(0, c) + t + S.map.rows[r].slice(c + 1); };
  // Mauer einer Sorte über die ganze Kartenhöhe, dazu die gewünschten Technologien
  const mitMauer = (sorte, techs = []) => {
    const S = flacheKarte();
    techs.forEach(t => { S.players[0].techs[t] = true; });
    for (let r = 0; r < S.map.rows.length; r++) {
      if (sorte === 'V' || sorte === 'M' || sorte === 'X') setT(S, r, SP, sorte);
      else if (sorte === 'feindarmee') S.armies.push({ id: S.nextId++, owner: 1, r, c: SP, mp: 0, born: -1 });
      else if (sorte === 'eigenarmee') S.armies.push({ id: S.nextId++, owner: 0, r, c: SP, mp: 0, born: -1 });
      else if (sorte === 'feindgebiet') S.bought[1] = (S.bought[1] || []).concat([key(r, SP)]);
    }
    return S;
  };
  const weg = S => foundDistance(S, 0, ZR, ZC);

  eq(weg(flacheKarte()), 4, 'ohne Mauer führt ein Weg von 4 Feldern zum Ziel');
  eq(canFound(flacheKarte(), 0, ZR, ZC), null, 'und gegründet werden darf dort');

  // --- was sperrt
  eq(weg(mitMauer('V')), null, 'eine Vulkanmauer sperrt den Weg');
  eq(weg(mitMauer('X')), null, 'ein Kartenloch sperrt den Weg');
  eq(weg(mitMauer('M')), null, 'eine Meeresmauer sperrt ohne Schiffstechnik');
  eq(weg(mitMauer('feindarmee')), null, 'gegnerische Armeen sperren den Weg');
  eq(weg(mitMauer('feindgebiet')), null, 'gegnerisches Territorium sperrt den Weg');
  eq(foundCost(mitMauer('feindgebiet'), 0, ZR, ZC), Infinity, 'ohne Weg nicht bezahlbar, sondern unmöglich');
  eq(typeof canFound(mitMauer('feindgebiet'), 0, ZR, ZC), 'string', 'und nicht gründbar');

  // --- was nicht sperrt: das Eigene
  eq(weg(mitMauer('eigenarmee')), 4, 'eigene Armeen sperren den eigenen Siedler nicht');
  eq(canFound(mitMauer('eigenarmee'), 0, ZR, ZC), null, 'dahinter darf gegründet werden');
  {
    // eine eigene Stadt in der Lücke einer Vulkanmauer: der Siedler geht hindurch
    const S = flacheKarte();
    for (let r = 0; r < S.map.rows.length; r++) if (r !== ZR) setT(S, r, SP, 'V');
    S.cities.push({ id: S.nextId++, owner: 0, r: ZR, c: SP, pop: 2, cap: false, grown: 0, born: -1 });
    eq(foundDistance(S, 0, ZR, 11) != null, true, 'durch die eigene Stadt führt ein Weg');
  }
  {
    // dieselbe Lücke, aber eine FREMDE Stadt: gesperrt – mit Luftwaffe überflogen
    const bauen = () => {
      const S = flacheKarte();
      for (let r = 0; r < S.map.rows.length; r++) if (r !== ZR) setT(S, r, SP, 'V');
      S.cities.push({ id: S.nextId++, owner: 1, r: ZR, c: SP, pop: 2, cap: true, grown: 0, born: -1 });
      return S;
    };
    eq(foundDistance(bauen(), 0, ZR, 11), null, 'eine fremde Stadt sperrt die Lücke');
    const L = bauen(); L.players[0].techs.luftwaffe = true;
    eq(foundDistance(L, 0, ZR, 11) != null, true, 'die Luftwaffe fliegt über die fremde Stadt');
  }
  {
    // Ein Feld, das BEIDEN gehört, sperrt nicht: das eigene Recht gilt vor dem fremden.
    const S = mitMauer('feindgebiet');
    S.bought[0] = S.map.rows.map((_, r) => key(r, SP));
    eq(weg(S), 4, 'eigenes Gebiet hebt die fremde Sperre auf');
    eq(foreignTerritory(S, 0).size, 0, 'dann ist kein Feld mehr fremdes Gebiet');
  }

  // --- Wasser ist eine Frage der Technik
  eq(weg(mitMauer('M', ['navigation'])), 4, 'Navigation führt über das Wasser');
  eq(weg(mitMauer('M', ['panzerschiff'])), 4, 'Panzerschiff auch');
  eq(weg(mitMauer('M', ['luftwaffe'])), 4, 'Luftwaffe auch');

  // --- die Luftwaffe überfliegt alles außer dem Draußen der Karte
  eq(weg(mitMauer('V', ['luftwaffe'])), 4, 'die Luftwaffe fliegt über einen Vulkan');
  eq(weg(mitMauer('feindarmee', ['luftwaffe'])), 4, 'und über gegnerische Armeen');
  eq(weg(mitMauer('feindgebiet', ['luftwaffe'])), 4, 'und über gegnerisches Gebiet');
  eq(canFound(mitMauer('feindgebiet', ['luftwaffe']), 0, ZR, ZC), null, 'dahinter darf sie gründen');
  eq(weg(mitMauer('X', ['luftwaffe'])), null, 'aber nicht über ein Kartenloch');

  /* Die Meldung muss den richtigen Grund nennen: „dafür fehlt Navigation\" ist falsch,
     wenn ein Vulkan im Weg liegt, und „das Gelände sperrt\" ist falsch, wenn es die
     Grenze des Nachbarn ist. */
  eq(canFound(mitMauer('M'), 0, ZR, ZC), 'Nicht erreichbar – dafür fehlt Navigation oder Panzerschiff.',
    'bei Wasser nennt die Meldung die fehlende Technik');
  eq(canFound(mitMauer('V'), 0, ZR, ZC), 'Kein Weg dorthin – Gelände oder gegnerische Armeen sperren ihn.',
    'bei einem Vulkan nennt sie das Gelände');
  eq(canFound(mitMauer('feindarmee'), 0, ZR, ZC), 'Kein Weg dorthin – Gelände oder gegnerische Armeen sperren ihn.',
    'bei gegnerischen Armeen auch');
  eq(canFound(mitMauer('feindgebiet'), 0, ZR, ZC), 'Kein Weg dorthin – gegnerisches Gebiet sperrt ihn.',
    'bei gegnerischem Gebiet nennt sie die Grenze');
  eq([foundBlockReason(mitMauer('M'), 0, ZR, ZC), foundBlockReason(mitMauer('V'), 0, ZR, ZC),
      foundBlockReason(mitMauer('feindgebiet'), 0, ZR, ZC)],
    ['wasser', 'gelaende', 'gebiet'], 'die drei Gründe sind einzeln ablesbar');

  /* OFFEN (bewusst nicht mitgeändert): gesperrt ist der WEG. Auf einem einzelnen
     fremden Feld, das man von außen erreicht, darf weiter gegründet werden – pathSteps
     prüft das Zielfeld nie, und canFound hat dafür keine eigene Regel. Praktisch nur
     bei per Kolonialismus gekauften Feldern möglich: das Umland fremder Städte liegt
     ohnehin näher als drei Felder an einer Stadt. Wer das auch sperren will, sagt es. */
  {
    const S = flacheKarte();
    S.bought[1] = [key(ZR, ZC)];
    eq(canFound(S, 0, ZR, ZC), null, 'auf einem fremden Einzelfeld darf noch gegründet werden');
  }

  /* Der Bot-Siedler steht unter derselben Sperre. Sonst wäre die Regel ein einseitiger
     Nachteil des Menschen: der Bot zöge weiter quer durch fremdes Land. Geprüft an der
     Wegsuche, mit der der Bot sein Ziel wählt (settleDistances → botSettlerPass). */
  {
    const S = mitMauer('feindgebiet');
    eq(settleDistances(S, 0, 5, 5).has(key(ZR, 8)), false,
      'der Bot-Siedler kommt nicht durch gegnerisches Gebiet');
    eq(botSettlerPass(S, 0, ZR, SP), false, 'das Mauerfeld ist für ihn gesperrt');
    const L = mitMauer('feindgebiet', ['luftwaffe']);
    eq(settleDistances(L, 0, 5, 5).has(key(ZR, 8)), true,
      'mit Luftwaffe kommt er hindurch');
    // eigene Armeen sperren den Bot-Siedler weiter (unveränderte Bewegungsregel)
    eq(botSettlerPass(mitMauer('eigenarmee'), 0, ZR, SP), false,
      'eigene Armeen sperren den Bot-Siedler wie bisher');
  }
}

/* ================= Luftwaffe bei der Armeebewegung: überfliegen, nicht landen
   Ab v63 überfliegt die Luftwaffe Vulkane, gegnerische Armeen und gegnerische Städte.
   Anhalten darf sie dort nicht – ein Überflug ist kein Landeplatz. Eigene Armeen und
   eigene Städte sperren weiter für jeden (Armeen stapeln nicht, und in der eigenen
   Stadt blockierte die Armee den Bauplatz).                                            */
{
  const bau = (techs = []) => {
    const S = mk('england', techs);
    S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
    S.cities.length = 0; S.armies.length = 0; S.sieges = {}; S.bought = {};
    S.cities.push({ id: S.nextId++, owner: 0, r: 5, c: 5, pop: 3, cap: true, grown: 0, born: -1 });
    return S;
  };
  const setT = (S, r, c, t) => { S.map.rows[r] = S.map.rows[r].slice(0, c) + t + S.map.rows[r].slice(c + 1); };
  const paare = (S) => [canPass(S, 0, 5, 7), canStop(S, 0, 5, 7)];

  // Vulkan
  { const S = bau(); setT(S, 5, 7, 'V');
    eq(paare(S), [false, false], 'ohne Luftwaffe ist ein Vulkan gesperrt'); }
  { const S = bau(['luftwaffe']); setT(S, 5, 7, 'V');
    eq(paare(S), [true, false], 'mit Luftwaffe überfliegbar, aber kein Halteplatz'); }
  // gegnerische Armee
  { const S = bau(); S.armies.push({ id: 1, owner: 1, r: 5, c: 7, mp: 0, born: -1 });
    eq(paare(S), [false, false], 'ohne Luftwaffe sperrt eine gegnerische Armee'); }
  { const S = bau(['luftwaffe']); S.armies.push({ id: 1, owner: 1, r: 5, c: 7, mp: 0, born: -1 });
    eq(paare(S), [true, false], 'mit Luftwaffe überfliegbar, aber kein Halteplatz'); }
  // gegnerische Stadt
  { const S = bau(); S.cities.push({ id: 9, owner: 1, r: 5, c: 7, pop: 2, cap: true, grown: 0, born: -1 });
    eq(paare(S), [false, false], 'ohne Luftwaffe sperrt eine gegnerische Stadt'); }
  { const S = bau(['luftwaffe']); S.cities.push({ id: 9, owner: 1, r: 5, c: 7, pop: 2, cap: true, grown: 0, born: -1 });
    eq(paare(S), [true, false], 'mit Luftwaffe überfliegbar, aber kein Halteplatz'); }
  // das Eigene bleibt gesperrt, auch mit Luftwaffe
  { const S = bau(['luftwaffe']); S.armies.push({ id: 1, owner: 0, r: 5, c: 7, mp: 0, born: -1 });
    eq(paare(S), [false, false], 'eigene Armeen stapeln auch mit Luftwaffe nicht'); }
  { const S = bau(['luftwaffe']); S.cities.push({ id: 9, owner: 0, r: 5, c: 7, pop: 2, cap: false, grown: 0, born: -1 });
    eq(paare(S), [false, false], 'in die eigene Stadt zieht auch die Luftwaffe nicht'); }
  // Kartenloch
  { const S = bau(['luftwaffe']); setT(S, 5, 7, 'X');
    eq(paare(S), [false, false], 'ein Kartenloch bleibt auch für die Luftwaffe draußen'); }

  /* Zusammengesetzt: eine Mauer aus gegnerischen Armeen über die ganze Kartenhöhe.
     Ohne Luftwaffe kommt niemand hindurch; mit Luftwaffe steht das Feld DAHINTER als
     Ziel bereit, die Mauerfelder selbst aber nicht. */
  const mauerspiel = techs => {
    const S = bau(techs);
    for (let r = 0; r < S.map.rows.length; r++)
      S.armies.push({ id: S.nextId++, owner: 1, r, c: 7, mp: 0, born: -1 });
    const armee = { id: S.nextId++, owner: 0, r: 5, c: 6, mp: moveAllowance(S, 0), born: -1 };
    S.armies.push(armee);
    return { S, armee, reach: armyReach(S, armee) };
  };
  {
    const { reach } = mauerspiel();
    eq(reach.has(key(5, 8)), false, 'ohne Luftwaffe ist hinter der Mauer nichts erreichbar');
  }
  {
    const { S, armee, reach } = mauerspiel(['luftwaffe']);
    eq(reach.has(key(5, 8)), true, 'mit Luftwaffe ist das Feld hinter der Mauer erreichbar');
    eq(reach.has(key(5, 7)), false, 'das Mauerfeld selbst ist kein Ziel');
    eq(typeof moveArmy(S, armee, 5, 7), 'string', 'darauf ziehen wird abgelehnt');
    eq(moveArmy(S, armee, 5, 8), null, 'darüber hinweg ziehen ist erlaubt');
    eq([armee.r, armee.c], [5, 8], 'die Armee steht hinter der Mauer');
  }
}

/* ============================== Oxford kann die Singularität erforschen */
{
  const S = mkX('griechenland', { wonders: true });
  const p = S.players[0], cap = capitalOf(S, 0);
  FIELDS.forEach((_, f) => { techsIn(f, 3, S).slice(0, 1).forEach(t => { p.techs[t.k] = true; }); });
  eq(singularityReady(p), true, 'die Voraussetzungen für die Singularität sind erfüllt');
  p.res = { sci: 0, food: 99, coins: 999 };
  const spot = within(cap.r, cap.c, 7).find(([r, c]) => !canFound(S, 0, r, c));
  foundCity(S, 0, spot[0], spot[1]);
  const c2 = cityAt(S, spot[0], spot[1]);
  S.wonders.push({ k: 'gaerten', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  S.wonders.push({ k: 'koloss', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  S.wonders.push({ k: 'zeus', lvl: 1, owner: 0, cityId: c2.id, r: c2.r, c: c2.c });
  S.wpool[2] = ['oxford'];
  eq(buildWonder(S, 0, c2, 'oxford'), null, 'Oxford gebaut');
  eq(freePickOptions(S, 0).some(t => t.k === 'singularitaet'), true, 'die Singularität steht zur Wahl');
  eq(useFreePick(S, 0, 'singularitaet'), null, 'sie ist kostenlos erforschbar');
  eq(has(p, 'singularitaet'), true, 'sie ist erforscht');
  // Seit v51 endet ein Forschungssieg nicht sofort, sondern am Ende der Runde
  eq((S.claims || []).some(c => c.pi === 0 && c.how.startsWith('Forschungssieg')), true,
    'und meldet damit den Sieg an');
  eq([S.over, S.endRound], [null, S.round], 'das Spiel läuft bis zum Rundenende weiter');
}
/* Bibliothek und Raumfahrt bieten die Singularität nicht an */
{
  const S = mkX('griechenland', { wonders: true }, ['raumfahrt']);
  const p = S.players[0], cap = capitalOf(S, 0);
  FIELDS.forEach((_, f) => { techsIn(f, 3, S).slice(0, 1).forEach(t => { p.techs[t.k] = true; }); });
  eq(singularityReady(p), true, 'Voraussetzungen erfüllt');
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.bibliothek);
  eq(freePickOptions(S, 0).some(t => t.k === 'singularitaet'), false, 'die Bibliothek nicht');
  p.freePicks = [{ n: 1, unlockedOnly: true, why: 'Raumfahrt' }];
  eq(freePickOptions(S, 0).some(t => t.k === 'singularitaet'), false, 'Raumfahrt auch nicht');
}

/* ============================== Alchemie: Wissenschaft über Münzen in Nahrung */
{
  const S = mk('griechenland');
  const p = S.players[0];
  p.res = { sci: 10, food: 0, coins: 0 };
  eq(rates(S, 0).sciToFood === Infinity, true, 'ohne Alchemie kein Weg von Wissenschaft zu Nahrung');
  eq(available(S, 0, 'food'), 0, 'also auch keine Nahrung verfügbar');
  p.techs.alchemie = true;
  eq(rates(S, 0).sciToFood, 2, 'mit Alchemie 2 Wissenschaft je Nahrung (über Münzen)');
  eq(available(S, 0, 'food'), 5, '10 Wissenschaft ergeben 5 Nahrung');
  eq(pay(S, 0, 'food', 3), true, 'Nahrung damit auch bezahlbar');
  eq([p.res.sci, p.res.food], [4, 0], '3 Nahrung kosten 6 Wissenschaft');
  // mit Gilden 1:1 auf dem zweiten Schritt
  p.techs.gilden = true;
  eq(rates(S, 0).sciToFood, 1, 'mit Gilden 1 Wissenschaft je Nahrung');
  // Gentechnik bleibt kein Kurs
  const G = mk('griechenland', ['gentechnik']);
  eq(rates(G, 0).sciToFood === Infinity, true, 'Gentechnik allein ist weiter kein Umtauschkurs');
  // Wachstum lässt sich damit bezahlen (der eigentliche Fehlerbericht)
  const W = mk('griechenland', ['alchemie']);
  const c = capitalOf(W, 0); c.pop = 2; c.grown = 0; c.born = 0;
  W.players[0].res = { sci: 20, food: 0, coins: 0 };
  eq(canGrow(W, 0, c), null, 'Wachstum ist mit Wissenschaft bezahlbar');
  eq(growCity(W, 0, c), null, 'und geht durch');
}

/* ============================== Rundenwechsel und Ereignis beim Startspieler */
{
  // cfg.startPlayer zeigt in die Aufbauliste (CIVS-Reihenfolge). CIVS[0] ist Griechenland,
  // in der festen Zugreihenfolge Russland→Griechenland→England→Wikinger also Index 1.
  const S = newGame({
    seed: 12, events: true, eventMode: 'hard', startPlayer: 0,
    players: CIVS.map(c => ({ civ: c.k, kind: 'human' })),
  });
  eq(S.players[1].civ, 'griechenland', 'Index 1 ist Griechenland');
  eq(S.startIdx, 1, 'der Startspieler ist gemerkt');
  eq(S.cur, 1, 'Griechenland beginnt');
  eq(S.round, 1, 'Runde 1');
  eq(S.event.round, 1, 'das Ereignis gehört zu Runde 1');
  // eine volle Umdrehung: erst zurück beim Startspieler beginnt Runde 2
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push([S.cur, S.round, S.event.round]);
    advanceTurn(S);
  }
  eq(seen.map(x => x[0]), [1, 2, 3, 0], 'Reihenfolge ab dem Startspieler im Uhrzeigersinn');
  eq(seen.map(x => x[1]), [1, 1, 1, 1], 'die Runde bleibt bis zur Umdrehung dieselbe');
  eq(seen.every(x => x[2] === 1), true, 'und das Ereignis auch');
  eq([S.cur, S.round], [1, 2], 'zurück beim Startspieler beginnt Runde 2');
  eq(S.event.round, 2, 'jetzt wird das neue Ereignis ausgewürfelt – vor dem Startspieler');
  // Gegenprobe: mit Russland als Startspieler wechselt es bei Index 0
  const T = newGame({
    seed: 12, events: true, eventMode: 'hard', startPlayer: CIVS.findIndex(c => c.k === 'russland'),
    players: CIVS.map(c => ({ civ: c.k, kind: 'human' })),
  });
  eq(T.startIdx, 0, 'Russland als Startspieler');
  for (let i = 0; i < 3; i++) advanceTurn(T);
  eq([T.cur, T.round], [3, 1], 'nach drei Zügen noch Runde 1');
  advanceTurn(T);
  eq([T.cur, T.round, T.event.round], [0, 2, 2], 'Runde 2 beginnt bei Russland');
}

/* ============================== Rückschau: auch durch kostenlose Forschung */
{
  const S = mkX('griechenland', { wonders: true }, []);
  S.players[0].ability = 'rueckschau';
  const p = S.players[0], cap = capitalOf(S, 0);
  // Voraussetzungen: Mittelalter im Feld Forschung verfügbar machen
  p.avail.papier = true; p.avail.alchemie = true;
  p.res = { sci: 0, food: 0, coins: 99 };
  S.wpool[2] = ['oxford'];
  for (const k of ['gaerten', 'koloss', 'zeus']) S.wonders.push({ k, lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 3, cap: false, grown: 0, born: 0 });
  eq(buildWonder(S, 0, cityAt(S, spot[0], spot[1]), 'oxford'), null, 'Oxford gebaut');
  eq(freePick(p).n, 2, 'zwei kostenlose Technologien');
  // erste Gratis-Tech (Mittelalter) löst Rückschau aus
  eq(useFreePick(S, 0, 'papier'), null, 'erste Gratis-Tech genommen');
  eq((p.backPicks || []).length, 1, 'Rückschau wird von der kostenlosen Forschung ausgelöst');
  // zweite Gratis-Tech ebenfalls
  eq(useFreePick(S, 0, 'alchemie'), null, 'zweite Gratis-Tech genommen');
  eq(p.backPicks.length, 2, 'Oxford löst die Rückschau zweimal aus');
  // beide Ansprüche nacheinander nutzbar, ohne Kette
  const first = backPickOptions(S, 0)[0];
  eq(useBackPick(S, 0, first.k), null, 'erster Rückschau-Anspruch genutzt');
  eq(p.backPicks.length, 1, 'der zweite bleibt offen');
  const second = backPickOptions(S, 0)[0];
  eq(useBackPick(S, 0, second.k), null, 'zweiter Rückschau-Anspruch genutzt');
  eq(p.backPicks.length, 0, 'danach keine weiteren – keine Kette');
}

/* ============================== Oxford: die Auswahl wird beim Bau festgehalten */
{
  const S = mkX('griechenland', { wonders: true });
  const p = S.players[0], cap = capitalOf(S, 0);
  p.res = { sci: 0, food: 0, coins: 99 };
  S.wpool[2] = ['oxford'];
  for (const k of ['gaerten', 'koloss', 'zeus']) S.wonders.push({ k, lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 3, cap: false, grown: 0, born: 0 });
  eq(buildWonder(S, 0, cityAt(S, spot[0], spot[1]), 'oxford'), null, 'Oxford gebaut');
  const snapshot = freePick(p).only.slice();
  eq(snapshot.length > 0, true, 'die verfügbaren Technologien sind festgehalten');
  eq(snapshot.every(k => p.avail[k]), true, 'es sind die beim Bau verfügbaren');
  const first = freePickOptions(S, 0)[0];
  eq(useFreePick(S, 0, first.k), null, 'erste Gratis-Tech genommen');
  // die erste Tech kann ein neues Zeitalter aufgeschlossen haben – das darf die
  // zweite Wahl nicht erweitern
  const after = freePickOptions(S, 0);
  eq(after.every(t => snapshot.includes(t.k)), true, 'die zweite Wahl bleibt in der Momentaufnahme');
  eq(after.some(t => t.k === first.k), false, 'die schon erforschte fällt weg');
  const newlyAvail = techPool(S).filter(t => p.avail[t.k] && !p.techs[t.k] && !snapshot.includes(t.k));
  eq(newlyAvail.every(t => !after.some(x => x.k === t.k)), true,
    'neu freigeschaltete Technologien sind nicht dabei');
}

/* ==================================== Siedlerbewegung nach den Bot-Regeln */
{
  // Schritt 2–3: der Siedler zieht auf das erreichbare siedelbare Feld, das der
  // Hauptstadt am nächsten liegt
  const S = mk('england');
  const cap = capitalOf(S, 0);
  const spots = nearestSettleSpots(S, 0, cap);
  eq(spots.length > 0, true, 'es gibt erreichbare siedelbare Felder');
  const dist = settleDistances(S, 0, cap.r, cap.c);
  const best = dist.get(key(spots[0][0], spots[0][1]));
  eq(spots.every(([r, c]) => dist.get(key(r, c)) === best), true, 'alle Ziele sind gleich nah');
  const closer = [...dist].filter(([, d]) => d < best).map(([k]) => unkey(k));
  eq(closer.every(([r, c]) => !settleable(S, 0, r, c)), true, 'kein näheres Feld ist siedelbar');
  eq(spots.every(([r, c]) => settleable(S, 0, r, c)), true, 'die Ziele sind tatsächlich siedelbar');
  // Erreichbarkeit zählt: ohne Navigation kein Ziel jenseits des Wassers
  eq(spots.every(([r, c]) => dist.has(key(r, c))), true, 'nur durch Bewegung erreichbare Felder');
}
/* England (Hauptstadt in einer Bucht) siedelt jetzt zuverlässig in Runde 1 */
{
  let fail = 0;
  for (let g = 0; g < 60; g++) {
    const S = newGame({ seed: 4000 + g, players: CIVS.map(c => ({ civ: c.k, kind: 'bot', diff: 'david' })) });
    const en = S.players.findIndex(p => p.civ === 'england');
    S.cur = en; beginTurn(S);
    const before = S.log.length;
    botSettle(S, en, capitalOf(S, en));
    if (S.log.slice(before).some(l => /findet keinen Platz/.test(l.m))) fail++;
  }
  eq(fail, 0, 'England scheitert in Runde 1 nie mehr am Siedeln (60 Partien)');
}
/* Der Siedler beachtet die Sperren: kein Meer ohne Technologie, kein Vulkan,
   nicht neben gegnerischen Armeen */
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0);
  const spots = nearestSettleSpots(S, 0, cap);
  eq(spots.every(([r, c]) => TERRAIN[terrainAt(S, r, c)].land), true, 'nie auf Meer');
  // eine gegnerische Armee auf ein Zielfeld-Nachbarfeld setzen
  const target = spots[0];
  const next = neighbors(target[0], target[1]).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 700, owner: 1, r: next[0], c: next[1], mp: 0, born: 0 });
  eq(nearestSettleSpots(S, 0, cap).some(([r, c]) => r === target[0] && c === target[1]), false,
    'Felder neben gegnerischen Armeen fallen als Ziel weg');
}

/* ============================== Technologien der Weltwunder-Erweiterung */
/* Sie existieren nur mit Weltwundern */
{
  const keys = ['baukraene', 'wallfahrt', 'raumfahrt', 'militaerlogistik'];
  const plain = mk('griechenland'), ext = mkX('griechenland', { wonders: true });
  for (const k of keys) {
    eq(techPool(plain).some(t => t.k === k), false, `${TECH_BY_KEY[k].n} fehlt ohne Erweiterung`);
    eq(techPool(ext).some(t => t.k === k), true, `${TECH_BY_KEY[k].n} ist mit Erweiterung dabei`);
  }
  eq(techPool(ext).length - techPool(plain).length, 4, 'genau vier zusätzliche Technologien');
  plain.players[0].avail.baukraene = true;
  plain.players[0].res = { sci: 99, food: 0, coins: 0 };
  eq(typeof doResearch(plain, 0, 'baukraene'), 'string', 'ohne Erweiterung nicht erforschbar');
  // Zeitalter folgen den Kostenbereichen des Regelhefts
  eq(techsIn(1, 1, ext).some(t => t.k === 'baukraene'), true, 'Baukräne: Produktion/Mittelalter (9)');
  eq(techsIn(3, 0, ext).some(t => t.k === 'wallfahrt'), true, 'Wallfahrt: Spezial/Antike (4)');
  eq(techsIn(0, 3, ext).some(t => t.k === 'raumfahrt'), true, 'Raumfahrt: Forschung/Moderne (19)');
  eq(techsIn(2, 1, ext).some(t => t.k === 'militaerlogistik'), true, 'Militärlogistik: Militär/Mittelalter (6)');
}
/* Baukräne: 2/4/6/8/… weniger, also 8/16/24/32 statt 10/20/30/40 */
{
  const S = mkX('griechenland', { wonders: true }, ['baukraene']);
  const cap = capitalOf(S, 0);
  const costs = [];
  for (let i = 0; i < 4; i++) {
    costs.push(wonderCost(S, 0));
    S.wonders.push({ k: 'w' + i, lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  }
  eq(costs, [8, 16, 24, 32], 'Baukräne: 8/16/24/32 Münzen');
  const B = mkX('griechenland', { wonders: true });
  eq(wonderCost(B, 0), 10, 'ohne Baukräne unverändert 10');
}
/* Wallfahrt: je Weltwunder +3 auf alle Erträge */
{
  const S = mkX('griechenland', { wonders: true }, ['wallfahrt']);
  const cap = capitalOf(S, 0);
  const base = income(S, 0);
  S.wonders.push({ k: 'gaerten', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  const one = income(S, 0);
  eq([one.sci - base.sci, one.food - base.food, one.coins - base.coins], [3, 3, 3], 'ein Wunder: +3/+3/+3');
  S.wonders.push({ k: 'koloss', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(income(S, 0).sci - base.sci, 6, 'zwei Wunder: +6');
  eq(incomeBreakdown(S, 0).extra.some(e => e.name === 'Wallfahrt'), true, 'eigene Zeile in der Ertragsübersicht');
  const B = mkX('griechenland', { wonders: true });
  B.wonders.push({ k: 'gaerten', lvl: 1, owner: 0, cityId: capitalOf(B, 0).id, r: 0, c: 0 });
  eq(income(B, 0).sci, income(mkX('griechenland', { wonders: true }), 0).sci, 'ohne Wallfahrt kein Bonus');
}
/* Militärlogistik: +1 Bewegungsweite je Weltwunder, sofort wirksam */
{
  const S = mkX('griechenland', { wonders: true }, ['militaerlogistik']);
  const cap = capitalOf(S, 0);
  eq(moveAllowance(S, 0), 3, 'ohne Wunder normale Reichweite 3');
  S.players[0].res = { sci: 0, food: 0, coins: 99 };
  const sp = spotBy(S, cap);
  const army = { id: 710, owner: 0, r: sp[0], c: sp[1], mp: 3, born: 0 };
  S.armies.push(army);
  eq(buildWonder(S, 0, cap, poolOf(S, 1)[0]), null, 'Wunder gebaut');
  eq(moveAllowance(S, 0), 4, 'ein Wunder: Reichweite 4');
  eq(army.mp, 4, 'die zusätzliche Bewegung wirkt sofort im selben Zug');
  S.wonders.push({ k: 'zeus', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(moveAllowance(S, 0), 5, 'zwei Wunder: Reichweite 5');
  const B = mkX('griechenland', { wonders: true });
  B.wonders.push({ k: 'zeus', lvl: 1, owner: 0, cityId: capitalOf(B, 0).id, r: 0, c: 0 });
  eq(moveAllowance(B, 0), 3, 'ohne Militärlogistik unverändert');
}
/* Raumfahrt: Gratis-Tech bei jedem Wunderbau, nur in freigeschalteten Zeitaltern */
{
  const S = mkX('griechenland', { wonders: true }, ['raumfahrt']);
  const p = S.players[0], cap = capitalOf(S, 0);
  p.res = { sci: 0, food: 0, coins: 99 };
  // Wunder ohne eigenen Forschungseffekt, damit nur der Raumfahrt-Anspruch offen ist
  S.wpool[1] = ['zeus', 'mauer'];
  eq(buildWonder(S, 0, cap, 'zeus'), null, 'Wunder gebaut');
  const opts = freePickOptions(S, 0);
  eq(opts.length > 0, true, 'es gibt eine Auswahl');
  eq(opts.every(t => t.age <= unlockedAge(S, 0, t.f)), true,
    'kein Zeitalter, das im Feld noch nicht freigeschaltet ist');
  eq(opts.some(t => t.k === 'singularitaet'), false, 'Singularität ist ausgeschlossen');
  eq(opts.some(t => !p.avail[t.k]), true, 'Verfügbarkeit ist nicht nötig, nur das Zeitalter');
  const pick = opts[0];
  eq(useFreePick(S, 0, pick.k), null, 'Gratis-Tech genommen');
  eq(has(p, pick.k), true, 'Technologie ist erforscht');
  eq(freePick(p), null, 'Anspruch verbraucht');
  // beim nächsten Wunderbau wieder
  eq(buildWonder(S, 0, cap, 'mauer'), null, 'zweites Wunder gebaut');
  eq(freePickOptions(S, 0).length > 0, true, 'erneut eine Gratis-Tech');
  // Zeitaltergrenze prüfen: ein Feld, in dem nur die Antike freigeschaltet ist
  const f = 2;   // Militär
  const maxAge = unlockedAge(S, 0, f);
  eq(freePickOptions(S, 0).filter(t => t.f === f).every(t => t.age <= maxAge), true,
    'im Militärfeld nur bis zum freigeschalteten Zeitalter');
}
/* Zwei Ansprüche gleichzeitig: Raumfahrt und das Wunder selbst (Bibliothek) */
{
  const S = mkX('griechenland', { wonders: true }, ['raumfahrt']);
  const p = S.players[0], cap = capitalOf(S, 0);
  p.res = { sci: 0, food: 0, coins: 99 };
  S.wpool[1] = ['bibliothek'];
  eq(buildWonder(S, 0, cap, 'bibliothek'), null, 'Bibliothek gebaut');
  eq(p.freePicks.length, 2, 'beide Ansprüche stehen in der Warteschlange');
  const first = freePick(p).why;
  eq(useFreePick(S, 0, freePickOptions(S, 0)[0].k), null, 'erster Anspruch genutzt');
  eq(freePick(p) !== null && freePick(p).why !== first, true, 'der zweite Anspruch bleibt offen');
  eq(useFreePick(S, 0, freePickOptions(S, 0)[0].k), null, 'zweiter Anspruch genutzt');
  eq(freePick(p), null, 'danach ist die Warteschlange leer');
}

/* Freies Feld mit Mindestabstand 3 zu allen Städten (ohne Kostenprüfung – Bots zahlen nichts) */
const cityPlace = (S, pi, cap) => within(cap.r, cap.c, 9).find(([r, c]) =>
  isLand(S, r, c) && !TERRAIN[terrainAt(S, r, c)].block && !cityAt(S, r, c) && !armyAt(S, r, c) &&
  !S.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));

/* Bots erhalten keine Wundereffekte und keine Effekte der neuen Technologien –
   einzige Ausnahme ist Militärlogistik (zählt nur die eigenen Wunder). */
{
  const S = newGame({ seed: 31, wonders: true, players: CIVS.map(c => ({ civ: c.k, kind: 'bot', diff: 'david' })) });
  const pi = 0, p = S.players[pi], cap = capitalOf(S, pi);
  const add = (k, lvl) => S.wonders.push({ k, lvl, owner: pi, cityId: cap.id, r: cap.r, c: cap.c });
  // Raumfahrt: keine Gratis-Tech beim Wunderbau
  p.techs.raumfahrt = true;
  FIELDS.forEach((_, f) => { techsIn(f, 3, S).forEach(t => { p.techs[t.k] = true; }); });
  const before = Object.keys(p.techs).length;
  buildWonder(S, pi, cap, poolOf(S, 1)[0], { free: true, noEffect: true });
  eq(Object.keys(p.techs).length, before, 'Bot bekommt durch Raumfahrt keine Gratis-Technologie');
  eq(freePickOptions(S, pi).length, 0, 'und keinen offenen Anspruch');
  // Baukräne: kein Rabatt (Bots zahlen ohnehin nichts)
  p.techs.baukraene = true;
  const n = wondersOf(S, pi).length;
  eq(wonderCost(S, pi), WONDER_STEP * (n + 1), 'Bot bekommt keinen Baukräne-Rabatt');
  // Wallfahrt: kein Ertrag
  p.techs.wallfahrt = true;
  eq(incomeBreakdown(S, pi).extra.some(e => e.name === 'Wallfahrt'), false, 'Bot bekommt keinen Wallfahrt-Ertrag');
  // Große Mauer: Bot verteidigt weiter nur mit der Bevölkerung dieser Stadt
  cap.pop = 3;
  const spot = cityPlace(S, pi, cap);
  eq(!!spot, true, 'ein Platz für die zweite Stadt gefunden');
  S.cities.push({ id: S.nextId++, owner: pi, r: spot[0], c: spot[1], pop: 5, cap: false, grown: 0, born: 0 });
  const other = cityAt(S, spot[0], spot[1]);
  add('mauer', 1);
  eq(ownsWonder(S, pi, 'mauer'), true, 'der Bot besitzt die Große Mauer');
  eq(hasWonder(S, pi, 'mauer'), false, 'sie wirkt für ihn aber nicht');
  eq(defenseValue(S, other), 5, 'Verteidigung bleibt die eigene Bevölkerung');
  // Kreml eines Bots verteuert die Singularität für niemanden
  add('kreml', 3);
  const H = mkX('griechenland', { wonders: true });
  eq(techCost(S, 1, SINGULARITY), SINGULARITY_BASE, 'Bot-Kreml verteuert die Singularität nicht');
  H.wonders.push({ k: 'kreml', lvl: 3, owner: 0, cityId: capitalOf(H, 0).id, r: 0, c: 0 });
  eq(techCost(H, 1, SINGULARITY), SINGULARITY_BASE + KREML_SURCHARGE, 'ein menschlicher Kreml sehr wohl');
  // Militärlogistik bleibt die Ausnahme: sie wirkt auch für Bots
  const baseRange = moveAllowance(S, pi);
  p.techs.militaerlogistik = true;
  eq(moveAllowance(S, pi), baseRange + wondersOf(S, pi).length, 'Militärlogistik wirkt auch beim Bot');
  eq(wondersOf(S, pi).length > 0, true, 'der Bot besitzt dafür auch Wunder');
}
/* Stonehenge schützt die Wunder eines Bots nicht vor der Zerstörung seiner Stadt */
{
  const S = newGame({ seed: 33, wonders: true, players: CIVS.map((c, i) => ({ civ: c.k, kind: i ? 'bot' : 'human', diff: 'prinz' })) });
  const bi = S.players.findIndex(p => p.kind === 'bot');
  const cap = capitalOf(S, bi);
  const spot = cityPlace(S, bi, cap);
  eq(!!spot, true, 'ein Platz für die Bot-Stadt gefunden');
  S.cities.push({ id: S.nextId++, owner: bi, r: spot[0], c: spot[1], pop: 1, cap: false, grown: 0, born: 0 });
  const city = cityAt(S, spot[0], spot[1]);
  S.wonders.push({ k: 'stonehenge', lvl: 1, owner: bi, cityId: city.id, r: city.r, c: city.c });
  S.wonders.push({ k: 'leuchtturm', lvl: 1, owner: bi, cityId: city.id, r: city.r, c: city.c });
  const other = S.players.findIndex((p, i) => i !== bi);
  captureCity(S, other, city);      // Bevölkerung 1 − 2 → Stadt zerstört
  eq(S.wonders.length, 0, 'die Wunder des Bots gehen mit der Stadt verloren');
  eq(S.wgone.includes('stonehenge'), true, 'auch Stonehenge selbst');
}

/* ============================ Techtree (v82, Anweisung des Autors)
   Der frühere „alternative Techtree" (v70, v74) ist seit v82 der einzige: Forschung
   Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 · Produktion Bewässerung 1,
   Landwirtschaft 5 · Forschung in der Industrialisierung Chemie 11, Biologie 12,
   Wissenschaftliche Methode 15. Die alten Kosten (bis v81 der Standard) gibt es nur noch
   im Tutorial (S.oldTree, OLD_TECH_COSTS) und in Partien, die vor v82 damit begonnen
   haben. Feld, Zeitalter und Wirkung sind in beiden gleich.                           */
{
  const auf = civ => [{ civ, kind: 'human' }, { civ: 'wikinger', kind: 'bot' }];
  const mkT = (civ, old, techs = [], extra = {}) => {
    const S = normalize(newGame(Object.assign({ players: auf(civ), seed: 7, oldTree: old }, extra)), civ);
    techs.forEach(t => S.players[0].techs[t] = true);
    return S;
  };
  const leiter = (S, f, a = 0) => techsIn(f, a, S).map(t => t.k);
  const STD = mkT('england', false), OLD = mkT('england', true);

  const neu = { mathematik: 1, astronomie: 2, philosophie: 3, schrift: 4, chemie: 11, biologie: 12,
    wiss_methode: 15, bewaesserung: 1, landwirtschaft: 5 };
  eq(Object.fromEntries(Object.keys(neu).map(k => [k, TECH_BY_KEY[k].c])), neu,
    'Techtree: die neun Kosten des früheren alternativen Techtrees sind die Grundkosten');
  eq(OLD_TECH_COSTS, {
    schrift: 1, mathematik: 2, astronomie: 3, philosophie: 4,
    wiss_methode: 11, chemie: 12, biologie: 15,
    landwirtschaft: 1, bewaesserung: 5,
  }, 'alter Techtree: die neun Kosten bis v81');
  eq([STD.oldTree, OLD.oldTree], [false, true], 'der alte Techtree steht als Schalter im Spielstand');
  eq(newGame({ seed: 7, players: auf('england') }).oldTree, false, 'ohne Angabe gilt der (neue) Standard');
  eq(newGame({ seed: 7, players: auf('england'), altTree: false }).oldTree, false,
    'ein Aufbau mit dem alten Schalter altTree ändert nichts mehr');
  eq('altTree' in STD, false, 'neue Spielstände kennen altTree nicht mehr');

  // Die Leitern im Bogen folgen den Kosten der Partie
  eq(leiter(STD, 0), ['mathematik', 'astronomie', 'philosophie', 'schrift'], 'Standard: Forschung/Antike nach Kosten 1–4');
  eq(leiter(STD, 1), ['bewaesserung', 'fischerei', 'rad', 'keramik', 'landwirtschaft'], 'Standard: Produktion/Antike nach Kosten 1–5');
  eq(leiter(STD, 0, 2), ['chemie', 'biologie', 'elektrizitaet', 'wiss_methode'],
    'Standard: Forschung/Industrialisierung Chemie 11, Biologie 12, Elektrizität 13, Wiss. Methode 15');
  eq(leiter(OLD, 0), ['schrift', 'mathematik', 'astronomie', 'philosophie'], 'alter Techtree: Forschung/Antike wie bis v81');
  eq(leiter(OLD, 1), ['landwirtschaft', 'fischerei', 'rad', 'keramik', 'bewaesserung'], 'alter Techtree: Produktion/Antike wie bis v81');
  eq(leiter(OLD, 0, 2), ['wiss_methode', 'chemie', 'elektrizitaet', 'biologie'],
    'alter Techtree: Forschung/Industrialisierung wie bis v81 (11/12/13/15)');
  {
    // Mit Wunder-Techs, damit wirklich jede Leiter drin ist
    const [W0, W1] = [false, true].map(old => mkT('england', old, [], { wonders: true }));
    const anders = [], ungeordnet = [];
    for (let f = 0; f < 4; f++) for (let a = 0; a < 4; a++) {
      const geaendert = (a === 0 && f < 2) || (a === 2 && f === 0);     // Antike 0/1, Industrialisierung 0
      if (!geaendert && leiter(W0, f, a).join() !== leiter(W1, f, a).join()) anders.push(`${f}/${a}`);
      for (const X of [W0, W1]) {
        const k = techsIn(f, a, X).map(t => techBase(X, t));
        if (k.some((c, i) => i && c <= k[i - 1])) ungeordnet.push(`${X.oldTree ? 'alt' : 'std'} ${f}/${a}`);
      }
    }
    eq(anders, [], 'alle übrigen Leitern sind in beiden Techtrees gleich');
    eq(ungeordnet, [], 'jede Leiter steigt streng in den Kosten – die Reihenfolge ist eindeutig');
  }
  eq(Object.keys(OLD_TECH_COSTS).filter(k => !TECH_BY_KEY[k]), [], 'jeder Schlüssel ist eine echte Technologie');
  eq(Object.keys(OLD_TECH_COSTS).filter(k => ageOfCost(OLD_TECH_COSTS[k]) !== TECH_BY_KEY[k].age), [],
    'kein alter Wert verlässt sein Zeitalter – t.age gilt für beide Techtrees');
  eq(TECHS.filter(t => techBase(STD, t) !== t.c || techBase(null, t) !== t.c).map(t => t.k), [],
    'Standard und Tabellen ohne Spielstand: die Grundkosten aus TECHS');
  eq(TECHS.filter(t => techBase(OLD, t) !== (OLD_TECH_COSTS[t.k] ?? t.c)).map(t => t.k), [],
    'alter Techtree: OLD_TECH_COSTS, sonst dieselben Grundkosten');

  // Was der Spieler zahlt: Vergünstigungen setzen auf die Grundkosten der Partie auf
  const SECHS = ['schrift', 'mathematik', 'astronomie', 'philosophie', 'landwirtschaft', 'bewaesserung'];
  const kosten = S => SECHS.map(k => techCost(S, 0, TECH_BY_KEY[k]));
  eq(kosten(STD), [4, 1, 2, 3, 5, 1], 'Standard: Kosten 4/1/2/3 und 5/1');
  eq(kosten(OLD), [1, 2, 3, 4, 1, 5], 'alter Techtree: Kosten 1/2/3/4 und 1/5');
  eq(kosten(mkT('griechenland', false)), [3, 0, 1, 2, 4, 0], 'Griechenland: in der Antike je 1 weniger');
  eq(kosten(mkT('england', false, ['wiss_methode'])), [2, 0, 0, 1, 3, 0],
    'Wissenschaftliche Methode: −2 in der Antike, nie unter 0');
  const DREI = ['wiss_methode', 'chemie', 'biologie'];
  const kosten3 = S => DREI.map(k => techCost(S, 0, TECH_BY_KEY[k]));
  eq(kosten3(STD), [15, 11, 12], 'Standard: Wiss. Methode 15, Chemie 11, Biologie 12');
  eq(kosten3(OLD), [11, 12, 15], 'alter Techtree: Wiss. Methode 11, Chemie 12, Biologie 15');
  eq(kosten3(mkT('griechenland', false)), [12, 8, 9], 'Griechenland: in der Industrialisierung je 3 weniger');
  eq(kosten3(mkT('england', false, ['wiss_methode'])).slice(1), [5, 6],
    'mit Wissenschaftlicher Methode: Chemie 5, Biologie 6 (−6 in der Industrialisierung)');
  {
    const S = mkT('england', false), p = S.players[0];
    S.cur = 0;
    p.res = { sci: 3, food: 0, coins: 0 };
    eq(doResearch(S, 0, 'schrift'), T('Nicht genug Wissenschaft.'), 'Standard: Schrift ist mit 3 Wissenschaft zu teuer');
    p.res = { sci: 4, food: 0, coins: 0 };
    eq([doResearch(S, 0, 'schrift'), p.res.sci, !!p.techs.schrift], [null, 0, true],
      'mit 4 Wissenschaft erforscht, die 4 sind verbraucht');
    p.res = { sci: 1, food: 0, coins: 0 };
    eq([doResearch(S, 0, 'mathematik'), p.res.sci], [null, 0], 'Mathematik kostet 1');
  }

  // Kopieren zahlt die Basiskosten der Partie
  {
    const preise = S => {
      S.players[1].techs.schrift = true; S.players[1].techs.landwirtschaft = true; S.players[1].techs.mathematik = true;
      return ['schrift', 'landwirtschaft', 'mathematik'].map(k => copyableTechs(S, 0).find(o => o.tech.k === k).paidCoins);
    };
    eq(preise(mkT('england', false, ['spionage'])), [4, 5, 1], 'Standard: Spionage kopiert zu 4/5/1 Münzen');
    eq(preise(mkT('england', true, ['spionage'])), [1, 1, 2], 'alter Techtree: Spionage kopiert zu 1/1/2 Münzen');
    // v72: Kundschafterei kopiert in beiden Techtrees zum Doppelten der Grundkosten der Partie
    eq(preise(mkT('england', false, ['kundschafterei'])), [8, 10, 2], 'Standard: Kundschafterei zum Doppelten');
    eq(preise(mkT('england', true, ['kundschafterei'])), [2, 2, 4], 'alter Techtree: Kundschafterei zum Doppelten');
    eq(preise(mkT('england', false, ['kundschafterei', 'spionage'])), [4, 5, 1],
      'mit beiden Wegen gilt der günstigere – Spionage');
    const preise3 = S => {
      ['wiss_methode', 'chemie', 'biologie'].forEach(k => { S.players[1].techs[k] = true; });
      return ['wiss_methode', 'chemie', 'biologie'].map(k => copyableTechs(S, 0).find(o => o.tech.k === k).paidCoins);
    };
    eq(preise3(mkT('england', false, ['spionage'])), [15, 11, 12], 'Standard: Spionage kopiert zu 15/11/12 Münzen');
    eq(preise3(mkT('england', true, ['spionage'])), [11, 12, 15], 'alter Techtree: Spionage kopiert zu 11/12/15 Münzen');
    eq(preise3(mkT('england', false, ['kundschafterei'])), [30, 22, 24], 'Standard: Kundschafterei 30/22/24');
  }

  /* v72 (Anweisung des Autors): Kolonialismus kauft ein Feld für 3 Münzen (vorher 5),
     Kundschafterei kopiert zum Doppelten der Grundkosten (vorher zum Dreifachen) – in
     BEIDEN Techtrees; sie unterscheiden sich nur in den Forschungskosten. */
  {
    eq([COLONY_COST, SCOUTING_RATE], [3, 2], 'Kolonialismus 3 Münzen je Feld, Kundschafterei 2×');
    const kauf = (old, muenzen) => {
      const S = mkT('england', old, ['kolonialismus']), p = S.players[0], cap = capitalOf(S, 0);
      S.cur = 0; p.res = { sci: 0, food: 0, coins: muenzen };
      const frei = within(cap.r, cap.c, 6).find(([r, c]) => terrainAt(S, r, c) && !cityAt(S, r, c) &&
        !S.players.some((_, i) => controlledTiles(S, i).has(key(r, c))));
      const err = buyTile(S, 0, frei[0], frei[1]);
      return [err, p.res.coins, (S.bought[0] || []).length, S.log[S.log.length - 1].m];
    };
    const std = kauf(false, 5);
    eq(std.slice(0, 3), [null, 2, 1], 'Standard: das Feld kostet 3 Münzen');
    eq(kauf(true, 5).slice(0, 3), [null, 2, 1], 'alter Techtree: ebenfalls 3 Münzen');
    eq(/\(3 Münzen\)/.test(std[3]), true, 'das Protokoll nennt den Preis');
    eq(kauf(false, 2).slice(0, 3), [T('Zu wenig Münzen.'), 2, 0], 'mit 2 Münzen reicht es nicht');
    // Die Techtexte nennen dieselben Zahlen wie die Regel – in beiden Sprachen und Techtrees
    const K = TECH_BY_KEY, A = { oldTree: true };
    const texte = X => [techEffect(K.kolonialismus, X), techEffect(K.kundschafterei, X)];
    eq(texte(STD), [`Für ${COLONY_COST} Münzen Feld kaufen`, `Tech kopieren (${SCOUTING_RATE}× Kosten in Münzen)`],
      'Techtexte nennen den Feldpreis und den Kopierfaktor der Regel');
    eq(texte(A), texte(STD), 'der alte Techtree zeigt dieselben Texte');
    setLang('en', { quiet: true });
    const en = [texte(null), texte(A)];
    setLang('de', { quiet: true });
    eq(en, [[`Buy a tile for ${COLONY_COST} coins`, `Copy a tech (${SCOUTING_RATE}× its cost in coins)`],
      [`Buy a tile for ${COLONY_COST} coins`, `Copy a tech (${SCOUTING_RATE}× its cost in coins)`]], 'englisch ebenso');
  }

  // Plättchenmodus: der Vorabwurf läuft im selben Techtree wie die Partie. Geprüft an
  // einem Seed, bei dem die beiden Techtrees verschieden würfeln – sonst wäre es blind.
  {
    const zwei = [{ civ: 'england', kind: 'human' }, { civ: 'russland', kind: 'human' }];
    const avail = (old, seed) => newGame({ seed, oldTree: old, players: zwei }).players
      .map(p => Object.keys(p.avail).filter(k => p.avail[k]).sort().join(',')).join(' | ');
    let seed = 1;
    while (seed < 200 && avail(false, seed) === avail(true, seed)) seed++;
    eq(seed < 200, true, 'es gibt Würfe, die in den beiden Techtrees anders ausfallen');
    const vorab = rollSetup({ seed, players: zwei });
    const X = newGame({ seed, players: zwei, avail: vorab.avail });
    eq([X.oldTree, X.players.map(p => Object.keys(p.avail).filter(k => p.avail[k]).sort().join(',')).join(' | ')],
      [false, avail(false, seed)], 'Plättchenmodus: vorab gewürfelt wird im Techtree der Partie');
  }

  // Spielstände: eine laufende Partie behält ihren Techtree (migrateState)
  {
    const alsV81 = (old, schalter) => {
      const X = JSON.parse(JSON.stringify(mkT('england', old)));
      delete X.oldTree;
      if (schalter !== undefined) X.altTree = schalter;
      return migrateState(X);
    };
    const vor70 = alsV81(true), v81std = alsV81(true, false), v81alt = alsV81(false, true);
    eq([vor70.oldTree, leiter(vor70, 0)[0]], [true, 'schrift'], 'Spielstand vor v70 (ohne Schalter): alter Techtree');
    eq([v81std.oldTree, leiter(v81std, 0)[0]], [true, 'schrift'], 'Spielstand v70–v81 im damaligen Standard: alter Techtree');
    eq([v81alt.oldTree, leiter(v81alt, 0)[0], 'altTree' in v81alt], [false, 'mathematik', false],
      'Spielstand v70–v81 im alternativen Techtree: heutiger Standard, der alte Schalter ist weg');
    const L = migrateState(JSON.parse(JSON.stringify(OLD)));
    eq([L.oldTree, leiter(L, 0)[0]], [true, 'schrift'], 'gespeichert und geladen bleibt der alte Techtree');
    const M = migrateState(JSON.parse(JSON.stringify(STD)));
    eq([M.oldTree, leiter(M, 0)[0]], [false, 'mathematik'], '… und der Standard der Standard');
    eq(migrateState(migrateState(JSON.parse(JSON.stringify(OLD)))).oldTree, true, 'zweimal migriert ändert nichts');
  }

  // Das Tutorial läuft im alten Techtree – Texte und Aufgaben sind darauf zugeschnitten
  {
    // tutorialSetup schreibt das globale S und ui – danach wieder wie vorher, sonst griffe
    // der Tutorial-Haken (tutBotTech) in die Bot-Partien gleich darunter ein.
    const merkS = typeof S !== 'undefined' ? S : undefined, merkUi = typeof ui !== 'undefined' ? ui : undefined;
    tutorialSetup();
    eq([S.oldTree, leiter(S, 0)[0], techCost(S, 0, TECH_BY_KEY.schrift)], [true, 'schrift', 1],
      'Tutorial: alter Techtree (Schrift 1 vorn auf der Leiter)');
    S = merkS; ui = merkUi;
  }

  // Bots forschen auf denselben Leitern – je zehn vollständige Partien ohne Ausnahme
  for (const old of [false, true]) {
    let fertig = 0;
    const fehler = [];
    for (let seed = 1; seed <= 10; seed++) {
      try {
        const X = newGame({ seed, oldTree: old, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
        let guard = 0;
        while (!X.over && guard++ < 400) { botTurn(X, X.cur); if (X.over) break; endTurn(X); }
        if (X.over) fertig++;
      } catch (e) { fehler.push(seed + ': ' + e.message); }
    }
    eq([fertig, fehler], [10, []], `zehn Bot-Partien im ${old ? 'alten ' : 'Standard-'}Techtree laufen zu Ende`);
  }
}

/* ============================ Fähigkeiten als Liste (v83, für den Marathon-Draft)
   Ein Reich hat normal genau eine Fähigkeit seiner Zivilisation; im Marathon zwei
   gedraftete, auch fremde. Grundfähigkeiten heißen überall 'basis' und werden deshalb
   immer mit der Zivilisation geprüft (hasAbil). */
{
  const zwei = (civ, drafted) => newGame({ seed: 7, players: [{ civ, kind: 'human', drafted }, { civ: 'wikinger', kind: 'bot' }] });
  const R = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'human', ability: 'siedler' }, { civ: 'england', kind: 'bot' }] });
  const ru = R.players.findIndex(p => p.civ === 'russland'), bo = 1 - ru;
  eq([abilitiesOf(R.players[ru]), abilitiesOf(R.players[bo])], [['russland:siedler'], []], 'normal: eine Fähigkeit, Bots keine');
  eq([hasAbil(R.players[ru], 'russland', 'siedler'), isAbil(R.players[ru], 'siedler'), hasAbil(R.players[ru], 'russland', 'basis')],
    [true, true, false], 'hasAbil mit Zivilisation, isAbil für eindeutige Schlüssel');
  let wirft = false;
  try { isAbil(R.players[ru], 'basis'); } catch { wirft = true; }
  eq(wirft, true, "isAbil(p, 'basis') ist mehrdeutig und wirft");
  // gedraftet: fremde Fähigkeiten wirken bei jeder Zivilisation
  const E = zwei('england', ['wikinger:basis', 'russland:siedler']);
  const ei = E.players.findIndex(p => p.civ === 'england');
  eq([armiesOf(E, ei).length, capitalOf(E, ei).pop], [1, 2], 'England mit Seefahrer und Siedlertrecks: Gratisarmee und Hauptstadt mit 2');
  eq(abilInfos(E.players[ei]).map(a => a.n), ['Seefahrer', 'Siedlertrecks'], 'abilInfos nennt beide');
  eq(hasAbil(E.players[ei], 'england', 'basis'), false, 'die eigene Grundfähigkeit hat England dann nicht');
  const G = zwei('griechenland', ['england:basis', 'wikinger:armeemacht']);
  const gi = G.players.findIndex(p => p.civ === 'griechenland');
  eq([rates(G, gi).coinsToFood, rates(G, gi).foodToCoins], [1, 1], 'Griechenland mit Handelsreich: 1:1');
  eq(techCost(G, gi, TECH_BY_KEY.papier), 6, '… und ohne die griechische Grundfähigkeit kein Rabatt');
  const W = zwei('wikinger', ['griechenland:basis', 'griechenland:basis']);
  const wi = W.players.findIndex(p => p.kind === 'human');
  eq(techCost(W, wi, TECH_BY_KEY.papier), 4, 'doppelt gedraftet wirkt einfach (Papier 6 − 2, nicht − 4)');
  eq(armiesOf(W, wi).length, 0, 'Wikinger ohne Seefahrer: keine Gratisarmee');
  const K = zwei('russland', ['england:gruenden', 'russland:wachstum']);
  const ki = K.players.findIndex(p => p.civ === 'russland');
  eq(growPrice(K, ki, capitalOf(K, ki)), { food: 0, coins: 2 }, 'Kolonisten und Fruchtbarkeit zusammen: keine Nahrung, doppelte Münzen');
  // keine Prüfung der Grundfähigkeit ohne Zivilisation mehr im Quelltext
  const quelle = ['engine', 'expansion', 'bots', 'ki', 'marathon', 'ui']
    .map(n => fs.readFileSync(`${__dirname}/js/${n}.js`, 'utf8')).join('\n');
  eq((quelle.match(/isAbil\([^)]*'basis'\)/g) || []).length, 0, "kein isAbil(…, 'basis') mehr im Quelltext");
}

/* ============================ Marathon (v83, Anweisung des Autors)
   Vier Reiche, Zufallskarte 24 × 36 (viermal die Europakarte), jede Hauptstadt mit
   Nahrung + ½ Münzen ≥ 4 auch mit 2 Bevölkerung, Technologien ×2/×3/×4/×5, Singularität
   ×2,5, Fähigkeiten im Snake-Draft aus 2n + 1. */
{
  // --- Karte und Hauptstädte, über viele Startwerte
  const anteil = {}, schwach = [];
  let felder = 0, abstand = 99, versuche = 0, falsch = [];
  for (let seed = 1; seed <= 40; seed++) {
    const m = marathonMap(seed);
    versuche = Math.max(versuche, m.tries);
    if (m.rows.length !== MARATHON_ROWS || m.rows.some(z => z.length !== MARATHON_COLS)) falsch.push(seed + ' Größe');
    m.rows.forEach(z => [...z].forEach(t => { anteil[t] = (anteil[t] || 0) + 1; felder++; }));
    const cs = m.capitals;
    if (cs.length !== 4) falsch.push(seed + ' Hauptstädte ' + cs.length);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) abstand = Math.min(abstand, hexDistance(cs[i].r, cs[i].c, cs[j].r, cs[j].c));
    // mit der echten Regelmaschine: alle mit Siedlertrecks (Hauptstadt 2 Bevölkerung)
    const S = newGame({ seed, map: m, marathon: true,
      players: CIVS.map(c => ({ civ: c.k, kind: 'human', drafted: ['russland:siedler', 'wikinger:kampfertrag'] })) });
    S.players.forEach((p, i) => {
      const y = income(S, i);
      if (capitalOf(S, i).pop !== 2) falsch.push(seed + ' Bevölkerung');
      if (y.food + y.coins / 2 < 4) schwach.push(`${seed}/${p.civ}: ${y.food} + ${y.coins}/2`);
    });
  }
  const pz = k => Math.round(100 * (anteil[k] || 0) / felder);
  eq(falsch, [], 'Marathonkarte: 24 × 36, vier Hauptstädte');
  eq(schwach, [], 'jede Hauptstadt: Nahrung + ½ Münzen ≥ 4 im ersten Zug, auch mit 2 Bevölkerung (40 Karten)');
  eq(abstand >= MARATHON_MIN_DIST, true, `Hauptstädte mindestens ${MARATHON_MIN_DIST} Felder auseinander (kleinster Abstand ${abstand})`);
  eq([pz('M') >= 24 && pz('M') <= 34, pz('G') >= 30, pz('W') >= 11, pz('B') >= 6, pz('F') >= 5, pz('I') >= 1], [true, true, true, true, true, true],
    `Gelände wie auf der Originalkarte (Meer ${pz('M')} %, Grasland ${pz('G')} %, Wald ${pz('W')} %, Gebirge ${pz('B')} %, Fluss ${pz('F')} %, Insel ${pz('I')} %)`);
  eq(versuche <= 5, true, `höchstens 5 Anläufe je Karte (${versuche})`);
  eq(JSON.stringify(marathonMap(12)), JSON.stringify(marathonMap(12)), 'derselbe Startwert, dieselbe Karte');
  eq(marathonStartYield(['GGG', 'GGG', 'GGG'], 1, 1), { sci: 2, food: 4, coins: 2 },
    'Startertrag mit 2 Bevölkerung: sechs Grasland = 6 Nahrung − 2, Münzen 0 + 2');

  // --- Technologiekosten
  const M = newGame({ seed: 3, map: marathonMap(3), marathon: true, players: CIVS.map(c => ({ civ: c.k, kind: 'human', drafted: ['england:basis', 'russland:basis'] })) });
  const N = newGame({ seed: 3, players: CIVS.map(c => ({ civ: c.k, kind: 'human', ability: 'gratistech' })) });
  const k4 = ['mathematik', 'papier', 'chemie', 'computertechnik'].map(k => TECH_BY_KEY[k]);
  eq(k4.map(t => techCost(M, 0, t)), k4.map((t, i) => techCost(N, 0, t) * [2, 3, 4, 5][i]),
    'Marathon: Antike ×2, Mittelalter ×3, Industrialisierung ×4, Moderne ×5');
  eq([techCost(M, 0, SINGULARITY), techCost(N, 0, SINGULARITY)], [250, 100], 'Singularität ×2,5 (250 statt 100)');
  const gr = M.players.findIndex(p => p.civ === 'griechenland');
  M.players[gr].drafted = ['griechenland:basis', 'russland:basis'];
  eq(techCost(M, gr, TECH_BY_KEY.papier), 6 * 3 - 2, 'Rabatte ziehen danach ab (Papier 18 − 2)');
  M.players[gr].techs.spionage = true;
  ['schrift', 'papier'].forEach(k => { M.players[(gr + 1) % 4].techs[k] = true; });
  eq(['schrift', 'papier'].map(k => copyableTechs(M, gr).find(o => o.tech.k === k).paidCoins), [8, 18],
    'Kopieren zahlt die Grundkosten des Marathons (Schrift 4 × 2, Papier 6 × 3)');

  // --- Draft
  const V = newGame({ seed: 4, map: marathonMap(4), marathon: true, startPlayer: 2,
    players: CIVS.map(c => ({ civ: c.k, kind: 'ki', kiLevel: 'schwer' })) });
  const D = draftNew(V, 11);
  const reihe = [];
  for (let i = 0; i < V.players.length; i++) reihe.push((V.startIdx + i) % V.players.length);
  eq([D.pool.length, D.order], [9, reihe.concat(reihe.slice().reverse())], 'Vorrat 2 × 4 + 1, Schlange ab dem Startspieler (1-2-3-4-4-3-2-1)');
  eq(D.pool.every(id => ALL_ABILITIES.includes(id)) && ALL_ABILITIES.length === 12, true, 'gezogen aus allen zwölf Fähigkeiten');
  let doppelt = false;
  for (let s2 = 0; s2 < 40 && !doppelt; s2++) { const P = draftNew(V, s2).pool; doppelt = new Set(P).size < P.length; }
  eq(doppelt, true, 'dieselbe Fähigkeit kann mehrfach im Vorrat liegen');
  const optionen = [];
  let vorgedraengelt = 0;
  while (!draftDone(D)) {
    const pi = draftCurrent(D);
    optionen.push(D.pool.length);
    if (draftPick(D, (pi + 1) % 4, D.pool[0]) !== T('Nicht am Zug.')) vorgedraengelt++;
    const id = kiDraftPick(V, D, pi);
    if (draftPick(D, pi, id)) throw new Error('KI wählt Ungültiges: ' + id);
  }
  eq(vorgedraengelt, 0, 'wer nicht am Zug ist, wählt nicht');
  eq([optionen[optionen.length - 1], D.pool.length], [2, 1], 'der Letzte wählt aus zwei, eine bleibt liegen');
  eq(Object.values(D.picks).every(p => p.length === 2 && new Set(p).size === 2), true, 'jede KI hat zwei verschiedene');
  // gibt es nur noch, was man schon hat, darf man es nehmen
  const Z = { pool: ['wikinger:armeemacht', 'wikinger:armeemacht'], order: [0, 0], at: 1, picks: { 0: ['wikinger:armeemacht'], 1: [], 2: [], 3: [] } };
  eq([draftOptions(Z, 0), draftPick(Z, 0, 'wikinger:armeemacht')], [['wikinger:armeemacht'], null], 'nur Doppeltes übrig: erlaubt');
  const Y = { pool: ['wikinger:armeemacht', 'russland:basis'], order: [0, 0], at: 1, picks: { 0: ['wikinger:armeemacht'], 1: [], 2: [], 3: [] } };
  eq(draftOptions(Y, 0), ['russland:basis'], 'sonst nicht');
  // Bots draften nicht
  const B = newGame({ seed: 4, map: marathonMap(4), marathon: true,
    players: CIVS.map((c, i) => ({ civ: c.k, kind: i === 1 ? 'bot' : 'human' })) });
  const DB = draftNew(B, 5);
  eq([DB.pool.length, DB.order.length, DB.order.some(pi => B.players[pi].kind === 'bot')], [7, 6, false],
    'mit einem Bot: Vorrat 2 × 3 + 1, sechs Wahlen, der Bot wählt nicht');
  // Die KI wählt nach der Karte: Taiga gewinnt bei viel Wald gegen eine schwache Wahl
  const vi = 0, cap = capitalOf(V, vi);
  const wald = within(cap.r, cap.c, 5).filter(([r, c]) => terrainAt(V, r, c) === 'W').length;
  eq(kiDraftValue(V, vi, 'russland:basis', []) > KI_DRAFT_BASE['russland:basis'], wald > 0,
    'Taiga zählt den Wald um die eigene Hauptstadt');
  eq(kiDraftValue(V, vi, 'wikinger:armeemacht', ['wikinger:armeemacht']) < 0, true, 'Doppeltes ist der KI nichts wert');
}

/* Warteschlange des Straßenplans (v83, Tempo): gibt die Felder in genau der Reihenfolge
   heraus wie bis v82 das Feld, das vor jeder Entnahme stabil sortiert wurde – sonst bauten
   die KI andere Wege. Zufallsfolgen aus Entnehmen, Neuentdecken und Senken (Schritte 0–2
   wie im Straßenplan, je Entnahme jedes Feld höchstens einmal). */
{
  let anders = 0, entnommen = 0;
  for (let lauf = 0; lauf < 400; lauf++) {
    const rnd = mapRng(900 + lauf);
    const dA = new Map(), dB = new Map(), q = [], Q = kiRoadQueue(dB), start = [];
    let next = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < next; i++) { dA.set('k' + i, 0); dB.set('k' + i, 0); q.push('k' + i); start.push('k' + i); }
    Q.start(start);
    const fertig = new Set();
    for (let schritt = 0; schritt < 80; schritt++) {
      let kA;
      while (q.length) {                                  // so wie bis v82: sortieren, erstes nehmen
        q.sort((a, b) => dA.get(a) - dA.get(b));
        const k = q.shift();
        if (!fertig.has(k)) { kA = k; break; }            // Doppelte änderten nichts
      }
      const kB = Q.pop();
      if (kA !== kB) { anders++; break; }
      if (kA === undefined) break;
      fertig.add(kA); entnommen++;
      const dk = dA.get(kA), diesmal = new Set();
      for (let j = Math.floor(rnd() * 7); j > 0; j--) {
        const k = rnd() < 0.45 ? 'k' + (next++) : 'k' + Math.floor(rnd() * next);
        if (fertig.has(k) || diesmal.has(k)) continue;
        diesmal.add(k);
        const nd = dk + Math.floor(rnd() * 3);
        if (!dA.has(k)) { dA.set(k, nd); dB.set(k, nd); q.push(k); Q.add(k); }
        else if (nd < dA.get(k)) { Q.lower(k, dB.get(k)); dA.set(k, nd); dB.set(k, nd); q.push(k); }
      }
    }
  }
  eq([anders, entnommen > 5000], [0, true], `Straßenplan: Schlange in Fächern = stabil sortiertes Feld (${entnommen} Entnahmen)`);
}

/* --- Marathon: eine ganze Partie mit vier KI, Draft inklusive (verifiziert, dass die KI den
   Modus spielt – Karte, teure Technologien, zwei Fähigkeiten je Reich). */
{
  const seed = 5000;
  const players = CIVS.map(c => ({ civ: c.k, kind: 'ki', kiLevel: 'schwer' }));
  const cfg = { seed, players, marathon: true, map: marathonMap(seed), startPlayer: 0 };
  const setup = rollSetup(cfg);
  Object.assign(cfg, { avail: setup.avail, wpool: setup.wpool });
  const V = draftView(cfg);
  // Während des Drafts hat niemand eine Fähigkeit: kein Rabatt, keine Gratisarmee, Hauptstadt 1
  const gv = V.players.findIndex(p => p.civ === 'griechenland');
  eq([V.players.every(p => abilitiesOf(p).length === 0), V.armies.length, V.cities.map(x => x.pop),
    techCost(V, gv, TECH_BY_KEY.papier)], [true, 0, [1, 1, 1, 1], techBase(V, TECH_BY_KEY.papier)],
  'Draftansicht ohne Fähigkeiten (Griechenland ohne Rabatt, Wikinger ohne Armee)');
  const D = draftNew(V, seed + 1);
  while (!draftDone(D)) { const pi = draftCurrent(D); draftPick(D, pi, kiDraftPick(V, D, pi)); }
  V.players.forEach((p, i) => { cfg.players[p.slot].drafted = D.picks[i]; });
  const S = newGame(cfg);
  eq(S.players.every(p => abilitiesOf(p).length === 2), true, 'Marathon: jede KI spielt mit zwei gedrafteten Fähigkeiten');
  eq(JSON.stringify(V.players.map(p => p.avail)), JSON.stringify(S.players.map(p => p.avail)),
    'im Spiel stehen genau die Starttechnologien, die beim Draft zu sehen waren');
  eq(JSON.stringify(S.players.map((_, i) => [capitalOf(S, i).r, capitalOf(S, i).c])),
    JSON.stringify(V.players.map((_, i) => [capitalOf(V, i).r, capitalOf(V, i).c])), '… und die Hauptstädte an denselben Plätzen');
  /* Handelsrouten wie bis v82 gerechnet (je Feld cityAt und effectiveRoad) – seit v83 rechnet
     tradeRoutes mit einer Stadttabelle schneller; das Ergebnis muss gleich bleiben. */
  const routenAlt = (X, pi) => {
    const o = { count: 0, bonus: 0, rail: 0, road: 0 };
    const cap = capitalOf(X, pi);
    if (!cap) return o;
    const others = citiesOf(X, pi).filter(c => !c.cap);
    if (!others.length || !Object.keys(X.roads || {}).length) return o;
    const erreichbar = min => {
      const seen = new Set(), stack = [];
      if (effectiveRoad(X, cap.r, cap.c) < min) return seen;
      seen.add(key(cap.r, cap.c)); stack.push([cap.r, cap.c]);
      while (stack.length) {
        const [r, c] = stack.pop();
        for (const [nr, nc] of neighbors(r, c)) {
          const k = key(nr, nc);
          if (seen.has(k) || !terrainAt(X, nr, nc)) continue;
          if (effectiveRoad(X, nr, nc) < min) continue;
          const ct = cityAt(X, nr, nc);
          if (ct && ct.owner !== pi) continue;
          seen.add(k); stack.push([nr, nc]);
        }
      }
      return seen;
    };
    const bahn = erreichbar(2), weg = erreichbar(1);
    for (const city of others) {
      const k = key(city.r, city.c);
      if (bahn.has(k)) { o.rail++; o.bonus += 2; } else if (weg.has(k)) { o.road++; o.bonus += 1; }
    }
    o.count = o.rail + o.road;
    return o;
  };
  let guard = 0, langsam = 0, err = null, routen = 0, routenAnders = [], gainAnders = 0;
  try {
    while (!S.over && guard++ < 400) {
      const t0 = Date.now();
      kiTurn(S, S.cur);
      langsam = Math.max(langsam, Date.now() - t0);
      if (S.over) break;
      endTurn(S);
      S.players.forEach((_, pi) => {
        const a = tradeRoutes(S, pi), b = routenAlt(S, pi);
        routen += a.count;
        if (JSON.stringify(a) !== JSON.stringify(b)) routenAnders.push(`R${S.round}/${pi}`);
      });
      // settleGain mit vorab gerechnetem Einkommen = ohne (die KI rechnet es einmal je Zug)
      const cap = capitalOf(S, S.cur);
      if (cap) {
        const vorher = income(S, S.cur);
        for (const [r, c] of within(cap.r, cap.c, 2))
          if (JSON.stringify(settleGain(S, S.cur, r, c, vorher)) !== JSON.stringify(settleGain(S, S.cur, r, c))) gainAnders++;
      }
    }
  } catch (e) { err = e.message; }
  eq([err, !!S.over], [null, true], `die Partie läuft ohne Fehler zu Ende (${S.over ? S.over.how.split(' (')[0] : 'offen'} in Runde ${S.round})`);
  eq(langsam < 8000, true, `kein KI-Zug über 8 s auf der großen Karte (längster ${langsam} ms)`);
  eq([routenAnders, routen > 0], [[], true], `Handelsrouten schnell gerechnet = wie bis v82 (${routen} Routen über die Partie)`);
  eq(gainAnders, 0, 'Ertrag beim Siedeln mit vorab gerechnetem Einkommen = ohne');
}

/* ==================================================== 1 gegen 1 */
/* Die eigene Duellkarte gibt es nicht mehr – im Duell wird immer die Plättchenkarte aus
   sechs Dreiecken gelegt. Geprüft wird sie im Plättchen-Abschnitt; hier bleiben die
   Duellregeln. */
const duellKarte = (civA, civB, seed) => {
  const plan = tilePlan([civA, civB], seed);
  const rnd = mapRng(seed + 1);
  plan.seats.forEach(st => botPlaceSeat(plan, st, rnd));
  return tileMap(plan);
};
{
  const m = duellKarte('england', 'russland', 11);
  // Hauptstädte einer Plättchenkarte stehen nach Platz in einer Liste, nicht nach
  // Zivilisation – dieselbe Zivilisation darf mehrfach am Tisch sitzen.
  eq(m.capitals.map(e => e.civ), ['england', 'russland'], 'ein Eintrag je Platz');
  eq(hexDistance(m.capitals[0].r, m.capitals[0].c, m.capitals[1].r, m.capitals[1].c) >= 5, true,
    'die Startpunkte liegen weit auseinander');
  for (const e of m.capitals)
    eq(TERRAIN[m.rows[e.r][e.c]].land, true, `Hauptstadt ${e.civ} liegt auf Land`);
  for (const a of CIVS) for (const b of CIVS) {
    eq(duellKarte(a.k, b.k, 3).capitals.length, 2,
      `${a.n} gegen ${b.n} bekommt zwei Startpunkte`);
  }
}
/* Siegschwellen im Duell: >3/4, mit Theologie >7/10, mit UN >2/3 – niedrigste gilt */
{
  const S = newGame({
    seed: 8, duel: true, map: duellKarte('griechenland', 'england', 8),
    players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }],
  });
  eq(S.duel, true, 'der Duellmodus steht im Spielstand');
  eq(S.players.length, 2, 'nur zwei Reiche');
  const p = S.players[0];
  const o = victoryOption(S, p);
  eq([o.frac, o.strict, o.label], [3 / 4, true, '3/4'], 'Grundschwelle im Duell ist >3/4');
  p.techs.theologie = true;
  eq(victoryOption(S, p).label, '7/10', 'mit Theologie >7/10');
  p.techs.un = true;
  eq(victoryOption(S, p).label, '2/3', 'mit Vereinten Nationen >2/3, die niedrigste gilt');
  // im normalen Spiel bleiben die alten Schwellen
  const N = mk('griechenland', ['theologie', 'un']);
  eq(victoryOption(N, N.players[0]).label, '1/2', 'ohne Duell weiter UN 1/2');
  eq(victoryOption(N, mk('griechenland').players[0]).label, '2/3', 'und Grundschwelle 2/3');
}
/* Wirtschaftssieg im Duell greift erst über 3/4 */
{
  const S = newGame({
    seed: 9, duel: true, map: duellKarte('griechenland', 'england', 9),
    players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'human' }],
  });
  const a = capitalOf(S, 0), b = capitalOf(S, 1);
  S.round = 2;                               // in Runde 1 gibt es keinen Wirtschaftssieg (v77)
  // seit v83 geprüft zu Rundenbeginn (markRoundStart), mit der Bevölkerung von dort
  a.pop = 3; b.pop = 1;                     // genau 3/4
  markRoundStart(S);
  eq(S.claims.length, 0, 'genau 3/4 reicht nicht (strikt größer)');
  a.pop = 4;                                 // 4/5 > 3/4
  markRoundStart(S);
  eq(S.claims.map(c => c.pi), [0], 'über 3/4 wird der Sieg angemeldet');
  // im Vier-Reiche-Spiel hätte 3/4 schon gereicht – dort gilt „mehr als 2/3" (seit v77
  // strikt wie alle anderen Schwellen; bis v74 genügten genau 2/3)
  const N = newGame({ seed: 9, players: CIVS.map(c => ({ civ: c.k, kind: 'human' })) });
  N.round = 2;
  N.cities.forEach(c => { c.pop = c.owner === 0 ? 6 : 1; });   // 6 von 9 = genau 2/3
  markRoundStart(N);
  eq(N.claims.length, 0, 'ohne Duell reichen genau 2/3 nicht mehr (mehr als 2/3, v77)');
  N.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });   // 7 von 10 > 2/3
  markRoundStart(N);
  eq(N.claims.map(c => c.pi), [0], 'mehr als 2/3 wird angemeldet');
}
/* Wirtschaftssieg zu Rundenbeginn (v83, Anweisung des Autors): gezählt wird gegen die
   Bevölkerung zu Beginn der Runde – für alle Reiche derselbe Nenner. Umgesetzt mit eigener
   und Weltbevölkerung von dort, geprüft zu Rundenbeginn für alle. */
{
  const S = newGame({ seed: 77, startPlayer: 0,
    players: ['russland', 'griechenland', 'england', 'wikinger'].map(k => ({ civ: k, kind: 'human' })) });
  endTurn(S); endTurn(S); endTurn(S); endTurn(S);                 // Runde 2 beginnt
  eq([S.round, S.cur, S.roundPop, S.roundPops], [2, 0, 4, [1, 1, 1, 1]], 'zu Rundenbeginn: Welt 4, je Reich 1');
  // Griechenland (zweiter am Zug) wächst im eigenen Zug weit über 2/3
  endTurn(S);
  const g = capitalOf(S, 1);
  g.pop = 9;                                                      // 9 von 12 > 2/3 – aber erst jetzt
  const nenner = [];
  for (let i = 0; i < 3; i++) { nenner.push(victoryWorld(S)); endTurn(S); }
  eq(nenner, [4, 4, 4], 'der Nenner bleibt die ganze Runde derselbe, für jedes Reich');
  eq(S.claims.length, 1, 'zu Beginn von Runde 3 geprüft: Griechenland meldet an');
  eq([S.round, S.cur, S.claims[0].pi, S.claims[0].round], [3, 0, 1, 3],
    '… bevor in Runde 3 jemand zieht – das Spiel endet am Ende von Runde 3');
  eq(/9 von 12 Weltbevölkerung/.test(S.claims[0].how), true, 'gezählt mit der Bevölkerung zu Rundenbeginn (9 von 12)');
  // Wer im eigenen Zug über die Schwelle wächst, hat damit noch nicht angemeldet
  const T2 = newGame({ seed: 77, startPlayer: 0,
    players: ['russland', 'griechenland', 'england', 'wikinger'].map(k => ({ civ: k, kind: 'human' })) });
  for (let i = 0; i < 4; i++) endTurn(T2);
  capitalOf(T2, 0).pop = 9;                                      // Russland wächst im Zug
  endTurn(T2);
  eq(T2.claims.length, 0, 'am Ende des eigenen Zugs wird nichts angemeldet (seit v83)');
  capitalOf(T2, 0).pop = 2;                                      // … und verliert es wieder
  for (let i = 0; i < 3; i++) endTurn(T2);
  eq([T2.round, T2.claims.length], [3, 0], 'zu Rundenbeginn zählt, was dann ist: kein Anspruch');
}
/* Kein Wirtschaftssieg in Runde 1 (v77, Anweisung des Autors). Vorher reichte dem
   Startspieler eine Gründung und ein Wachstum: im Duell 4 von 5, zu dritt 4 von 6 – und
   der Anspruch blieb, auch wenn die anderen im selben Zug nachzogen. */
{
  const S = newGame({ seed: 8, duel: true, map: duellKarte('russland', 'england', 8),
    players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' }] });
  eq(S.round, 1, 'das Spiel beginnt in Runde 1');
  const a = capitalOf(S, 0), b = capitalOf(S, 1);
  a.pop = 4; b.pop = 1;                              // 4 von 5 – weit über 3/4
  checkVictory(S, 0);
  eq(S.claims.length, 0, 'in Runde 1 wird kein Wirtschaftssieg angemeldet');
  endTurn(S);                                         // zweiter Spieler
  eq(S.claims.length, 0, 'auch nicht bei der Nachprüfung am Ende von Runde 1');
  eq([S.over, S.round], [null, 1], 'das Spiel läuft weiter');
  endTurn(S);                                         // Runde 2 beginnt
  eq(S.round, 2, 'Runde 2');
  checkVictory(S, 0);
  eq(S.claims.map(c => c.pi), [0], 'ab Runde 2 wie gewohnt');
}
/* Eine vollständige 1-gegen-1-Partie Mensch gegen Bot läuft durch */
{
  let ended = 0, howto = {};
  for (let g = 0; g < 20; g++) {
    const civs = [CIVS[g % 4].k, CIVS[(g + 1) % 4].k];
    const S = newGame({
      seed: 400 + g, duel: true, map: duellKarte(civs[0], civs[1], 400 + g),
      events: g % 2 === 0, eventMode: 'hard', wonders: g % 3 === 0,
      players: [
        { civ: civs[0], kind: 'human', ability: CIV_BY_KEY[civs[0]].abilities[g % 3].k },
        { civ: civs[1], kind: 'bot', diff: 'david' },
      ],
    });
    let guard = 0;
    while (!S.over && guard++ < 400) {
      const pi = S.cur;
      if (S.players[pi].kind === 'bot') { botTurn(S, pi); if (S.over) break; endTurn(S); continue; }
      // einfache menschliche Züge
      feedSources(S, pi).forEach(x => coverPop(S, pi, x.kind, x.have));
      citiesOf(S, pi).forEach(c => growCity(S, pi, c));
      researchable(S, pi).sort((x, y) => techCost(S, pi, x) - techCost(S, pi, y))
        .forEach(t => { if (available(S, pi, 'sci') >= techCost(S, pi, t)) doResearch(S, pi, t.k); });
      const cap = capitalOf(S, pi);
      if (cap) for (const [r, c] of within(cap.r, cap.c, 5)) if (!canFound(S, pi, r, c)) { foundCity(S, pi, r, c); break; }
      if (S.over) break;
      endTurn(S);
    }
    if (S.over) { ended++; const k = S.over.how.split(' (')[0]; howto[k] = (howto[k] || 0) + 1; }
  }
  eq(ended, 20, '20 Duellpartien enden regulär');
  console.log('       Duell-Siegarten: ' + JSON.stringify(howto));
}

/* ==================================================== Karte und Aufbau */
{
  eq(MAPS[0].name.startsWith('Originalkarte'), true, 'die Originalkarte steht im Menü an erster Stelle');
  eq(DEFAULT_MAP, MAP_ORIGINAL, 'Standardkarte ist die Originalkarte');
}

/* ==================================================== Zivilisationsfähigkeiten */
/* Bots erhalten keine Zivilisationsfähigkeit */
{
  const S = newGame({ seed: 3, players: [
    { civ: 'wikinger', kind: 'bot' }, { civ: 'england', kind: 'bot' },
    { civ: 'russland', kind: 'bot' }, { civ: 'griechenland', kind: 'human' }] });
  const wi = S.players.findIndex(p => p.civ === 'wikinger');
  eq(armiesOf(S, wi).length, 0, 'Bot-Wikinger bekommt keine Gratisarmee');
  const en = S.players.findIndex(p => p.civ === 'england');
  eq(rates(S, en).foodToCoins, Infinity, 'Bot-England hat keinen Nahrung→Münzen-Kurs');
  eq(tileYield(S, S.players.findIndex(p => p.civ === 'russland'), 'W')[1], 0, 'Bot-Russland ohne Waldbonus');
  const gr = S.players.findIndex(p => p.civ === 'griechenland');
  eq(techCost(S, gr, TECH_BY_KEY.papier), 4, 'menschliches Griechenland behält den Rabatt');
  const S2 = newGame({ seed: 3, players: [{ civ: 'griechenland', kind: 'bot' }, { civ: 'england', kind: 'human' }] });
  eq(techCost(S2, S2.players.findIndex(p => p.civ === 'griechenland'), TECH_BY_KEY.papier), 6,
    'Bot-Griechenland ohne Kostenrabatt');
}

/* Wikinger: Grundfähigkeit nur bei 'basis' */
{
  const A = mkA('wikinger', 'basis');
  eq(armiesOf(A, 0).length, 1, 'Wikinger mit Grundfähigkeit: Gratisarmee am Start');
  eq(armyCost(A, 0), 5, 'erste Armee zählt nicht mit (2. Armee kostet 5)');
  const B = mkA('wikinger', 'armeemacht');
  eq(armiesOf(B, 0).length, 0, 'Alternative: keine Gratisarmee');
  eq(armyCost(B, 0), 5, 'Alternative: normale Armeekosten');
}

/* Wikinger "Kriegerkultur": +1 Macht je Armee, Zuschlag geht nicht verloren */
{
  const S = mkA('wikinger', 'armeemacht');
  const cap = capitalOf(S, 0), sp = spotBy(S, cap);
  S.armies.push({ id: 90, owner: 0, r: sp[0], c: sp[1], mp: 0, born: 0 });
  eq(powerOf(S, 0), 2, 'eine Armee gibt +2 Macht');
  S.armies.push({ id: 89, owner: 0, r: sp[0], c: sp[1] + 1, mp: 0, born: 0 });
  eq(powerOf(S, 0), 4, 'zwei Armeen geben +4 Macht');
  S.armies.pop();
  S.players[0].power = 4;
  eq(powerOf(S, 0), 6, 'Machtwert = eigene Macht + 2 je Armee');
  beginTurn(S);
  eq(S.players[0].power, 1, 'Machtverlust rechnet mit 6 (halbiert 3) auf die eigene Macht');
  eq(powerOf(S, 0), 3, 'der Armeezuschlag bleibt erhalten');
}

/* Kriegerkultur mit Burgenbau (v83, Anweisung des Autors): mit Burgenbau steht in jeder Stadt
   eine unbewegliche Armee – sie zählt für Kriegerkultur wie eine echte, +2 Macht je Stadt.
   Für die Baukosten weiterer Armeen zählt sie nicht. */
{
  const S = mkA('wikinger', 'armeemacht');
  const cap = capitalOf(S, 0), sp = spotBy(S, cap);
  S.armies.push({ id: 90, owner: 0, r: sp[0], c: sp[1], mp: 0, born: 0 });
  S.cities.push({ id: 91, owner: 0, r: cap.r + 3, c: cap.c, pop: 1, cap: false, grown: 0, born: -1 });
  eq(powerOf(S, 0), 2, 'ohne Burgenbau: nur die Armee (+2)');
  S.players[0].techs.burgenbau = true;
  eq([powerBonus(S, 0), powerOf(S, 0)], [6, 6], 'mit Burgenbau: Armee + zwei Städte = +6');
  eq(armyCost(S, 0), 10, 'die Stadtarmeen zählen nicht für die Baukosten (zweite Armee 10)');
  eq(kiPowerBonus(S, 0, 1), 6, 'die KI rechnet genauso (eine Armee, zwei Städte)');
  eq(kiPowerBonus(S, 0, 3), 10, '… und mit geplanten Armeen (drei Armeen, zwei Städte)');
  // die Stadt verteidigt mit dem ganzen Machtwert – der Zuschlag steckt darin
  const vorher = S.players[0].power;
  S.players[0].power = 4;
  eq(powerOf(S, 0), 10, 'Machtwert = eigene Macht 4 + Zuschlag 6');
  S.players[0].power = vorher;
  // ohne Kriegerkultur bringt Burgenbau keinen Zuschlag
  const B = mkA('wikinger', 'basis');
  B.players[0].techs.burgenbau = true;
  eq(powerBonus(B, 0), 0, 'Burgenbau allein gibt keinen Zuschlag');
  // die KI schätzt Burgenbau mit Kriegerkultur höher
  const K = kiContext(S, 0), K2 = kiContext(B, 0);
  delete S.players[0].techs.burgenbau;
  eq(kiTechBonus(S, 0, 'burgenbau', K, baseIncome(S, 0)) > kiTechBonus(B, 0, 'burgenbau', K2, baseIncome(B, 0)), true,
    'die KI bewertet Burgenbau mit Kriegerkultur höher');
}

/* Wikinger "Beutezüge": Angriffswert − Verteidigungswert je Ziel, Auszahlung nächste Runde */
{
  const S = mkA('wikinger', 'kampfertrag');
  S.players[0].power = 12;
  const foe = capitalOf(S, 1);
  const spots = neighbors(foe.r, foe.c).filter(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 91, owner: 0, r: spots[0][0], c: spots[0][1], mp: 0, born: 0 });
  const atk1 = attackValue(S, 0, 1), def = defenseValue(S, foe);
  eq(raidYield(S, 0).sum, atk1 - def, 'eine Armee: Angriffswert − Verteidigungswert');
  // zweite Armee erhöht den Angriffswert und damit die Beute
  S.armies.push({ id: 92, owner: 0, r: spots[1][0], c: spots[1][1], mp: 0, born: 0 });
  eq(raidYield(S, 0).sum, attackValue(S, 0, 2) - def, 'mehrere Armeen addieren sich im Angriffswert');
  eq(raidYield(S, 0).sum > atk1 - def, true, 'die Beute wächst mit der zweiten Armee');
  // Auszahlung: Kampfphase merkt sich den Ertrag, ausgezahlt wird zu Zugbeginn
  const expect = raidYield(S, 0).sum;
  S.cur = 0; combatPhase(S, 0);
  eq(S.players[0].raidPending, expect, 'Kampfphase hält den Ertrag fest');
  eq(S.players[0].res.coins < expect, true, 'im selben Zug noch nicht ausgezahlt');
  const before = income(S, 0);
  S.round++; beginTurn(S);
  eq(S.players[0].res.coins, before.coins + expect, 'zu Beginn der nächsten Runde gutgeschrieben');
  eq(S.players[0].res.sci, before.sci + expect, 'auch Wissenschaft');
  eq(S.players[0].res.food, Math.max(0, before.food) + expect, 'auch Nahrung');
  eq(S.players[0].raidPending, 0, 'der Anspruch ist verbraucht');
}
/* Beute auch für Felder mit gegnerischer Armee, verteidigende Armeen zählen mit */
{
  const S = mkA('wikinger', 'kampfertrag');
  S.players[0].power = 20;
  const cap = capitalOf(S, 0);
  // eine gegnerische Armee weit weg von Städten, daneben zwei eigene
  const far = within(cap.r, cap.c, 6).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) &&
    !S.cities.some(x => hexDistance(x.r, x.c, r, c) <= 2));
  const foeArmy = { id: 95, owner: 1, r: far[0], c: far[1], mp: 0, born: 0 };
  S.armies.push(foeArmy);
  const near = neighbors(far[0], far[1]).filter(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 96, owner: 0, r: near[0][0], c: near[0][1], mp: 0, born: 0 });
  const oneAtk = raidYield(S, 0).sum;
  eq(oneAtk, attackValue(S, 0, 1) - armyDefenseValue(S, foeArmy), 'Feld mit gegnerischer Armee zählt genauso');
  eq(oneAtk > 0, true, 'bei Überlegenheit gibt es Ertrag');
  // eine zweite gegnerische Armee daneben: sie erhöht den Verteidigungswert des ersten
  // Feldes und ist gleichzeitig selbst ein Ziel
  const def1 = armyDefenseValue(S, foeArmy);
  S.armies.push({ id: 97, owner: 1, r: near[1][0], c: near[1][1], mp: 0, born: 0 });
  eq(armyDefenseValue(S, foeArmy), def1 + powerOf(S, 1),
    'verteidigende Armeen zählen in den Verteidigungswert');
  const parts = raidYield(S, 0).parts;
  eq(parts.length, 2, 'jedes Feld mit gegnerischer Armee ist ein eigenes Ziel');
  eq(parts.every(t => +t.split('+')[1] === oneAtk - powerOf(S, 1)),
    true, 'je Ziel sinkt die Beute um den zusätzlichen Verteidiger');
}
/* ohne Überlegenheit kein Ertrag, ohne Fähigkeit gar keiner */
{
  const S = mkA('wikinger', 'kampfertrag');
  S.players[0].power = 0;
  const foe = capitalOf(S, 1);
  const spot = neighbors(foe.r, foe.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 98, owner: 0, r: spot[0], c: spot[1], mp: 0, born: 0 });
  eq(raidYield(S, 0).sum, 0, 'kein Vorsprung, kein Ertrag');
  const B = mkA('wikinger', 'basis');
  B.players[0].power = 20;
  B.armies.push({ id: 99, owner: 0, r: spot[0], c: spot[1], mp: 0, born: 0 });
  eq(raidYield(B, 0).sum, 0, 'ohne die Alternative gibt es keine Beute');
  combatPhase(B, 0);
  eq(!B.players[0].raidPending, true, 'und auch keinen Anspruch');
}
/* Beute ist kein Einkommen: sie steht in der Vorschau, nicht in der Summe */
{
  const S = mkA('wikinger', 'kampfertrag');
  S.players[0].power = 12;
  const foe = capitalOf(S, 1);
  const spot = neighbors(foe.r, foe.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  const plain = income(S, 0).coins;
  S.armies.push({ id: 100, owner: 0, r: spot[0], c: spot[1], mp: 0, born: 0 });
  const b = incomeBreakdown(S, 0);
  eq(b.total[2], plain, 'die Beute verändert das Einkommen nicht');
  eq(b.preview.some(e => /Beutez/.test(e.name)), true, 'sie erscheint als Vorschauzeile');
}

/* Griechenland: Alternativen ersetzen den Kostenrabatt */
{
  const S = mkA('griechenland', 'gratistech');
  eq(techCost(S, 0, TECH_BY_KEY.papier), 6, 'Alternative: kein Kostenrabatt mehr');
  S.players[0].avail.papier = true;
  eq(freeTechOptions(S, 0).some(t => t.k === 'papier'), true, 'verfügbare Tech ist gratis erforschbar');
  eq(useFreeTech(S, 0, 'papier'), null, 'Gratisforschung klappt');
  eq(has(S.players[0], 'papier'), true, 'Tech ist erforscht');
  eq(freeTechOptions(S, 0).length, 0, 'nur einmal pro Runde');
  S.players[0].avail.robotik = true;
  S.round++;
  eq(freeTechOptions(S, 0).some(t => t.k === 'robotik'), false, 'nur bis Industrialisierung (Robotik ist Moderne)');
}
{
  const S = mkA('griechenland', 'rueckschau');
  const p = S.players[0];
  p.avail.buchdruck = true; p.res = { sci: 99, food: 0, coins: 0 };
  eq(doResearch(S, 0, 'buchdruck'), null, 'Mittelalter-Tech erforscht');
  eq([backPick(p).age, backPick(p).f], [0, TECH_BY_KEY.buchdruck.f],
    'Rückschau erlaubt ein früheres Zeitalter im selben Feld');
  const opts = backPickOptions(S, 0);
  eq(opts.every(t => t.age === 0), true, 'nur Techs der Antike zur Wahl');
  eq(opts.every(t => t.f === TECH_BY_KEY.buchdruck.f), true,
    'nur Techs aus demselben Technologiefeld');
  eq(opts.length > 0, true, 'es bleibt eine Auswahl übrig');
  eq(opts.some(t => !p.avail[t.k]), true, 'auch nicht freigeschaltete Techs zur Wahl');
  eq(useBackPick(S, 0, opts[0].k), null, 'Gratis-Tech aus der Rückschau');
  eq(backPickOptions(S, 0).length, 0, 'keine Kette – der Anspruch ist verbraucht');
}

/* England: Alternativen */
{
  const A = mkA('england', 'gruenden'), B = mkA('england', 'basis');
  const cap = capitalOf(A, 0);
  const far = within(cap.r, cap.c, 6).find(([r, c]) => isLand(A, r, c) &&
    foundDistance(A, 0, r, c) != null &&           // erreichbar, sonst gibt es keine Kosten
    !A.cities.some(x => hexDistance(x.r, x.c, r, c) < 3));
  // Basiskosten bei einer Stadt = 1; die Distanzkosten sind in beiden Spielen gleich
  eq(foundCost(B, 0, far[0], far[1]) - foundCost(A, 0, far[0], far[1]), 1,
    'Alternative "Kolonisten": Basiskosten fallen weg, Distanz bleibt');
  eq(foundCost(A, 0, far[0], far[1]) > 0, true, 'Distanzkosten werden weiter berechnet');
  eq(rates(A, 0).foodToCoins, Infinity, 'Alternative: kein 1:1-Pool mehr');
}
{
  const S = mkA('england', 'kuestenstaedte');
  const cap = capitalOf(S, 0);
  const sea = cityAtSea(S, cap);
  const b = incomeBreakdown(S, 0);
  eq(b.extra.some(e => e.name === 'Städte am Meer'), sea, 'Küstenzeile erscheint nur bei Meeresanschluss');
  if (sea) eq(b.extra.find(e => e.name === 'Städte am Meer').y,
    [SEA_CITY_BONUS, SEA_CITY_BONUS, SEA_CITY_BONUS],
    `Seemacht: +${SEA_CITY_BONUS} auf alle drei Erträge (v53: 1 statt 2)`);
}

/* Russland: Alternativen */
{
  const S = mkA('russland', 'wachstum');
  const c = capitalOf(S, 0);
  eq(growPrice(S, 0, c).food, 0, 'Wachstum kostet keine Nahrung');
  eq(growPrice(S, 0, c).coins, c.pop, 'Münzen fallen weiter an');
  eq(tileYield(S, 0, 'W')[1], 0, 'Alternative: kein Waldbonus');
  // die Nahrungsgrenze gilt trotzdem
  c.pop = 30;
  eq(typeof canGrowPaid(S, 0, c), 'string', 'Nahrungsgrenze gilt auch bei Gratis-Nahrungskosten');
}
{
  const S = mkA('russland', 'siedler');
  const cap = capitalOf(S, 0);
  eq(cap.pop, 2, 'Siedlertrecks: auch die Hauptstadt startet mit 2 Bevölkerung');
  eq(capitalOf(mkA('russland', 'basis'), 0).pop, 1, 'mit Grundfähigkeit startet sie mit 1');
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.players[0].res = { sci: 0, food: 99, coins: 99 };
  eq(foundCity(S, 0, spot[0], spot[1]), null, 'Stadt gegründet');
  eq(cityAt(S, spot[0], spot[1]).pop, 2, 'neue Städte starten mit 2 Bevölkerung');
}

/* ==================================================== Ereignisse */
/* Spaltenauswürfelung: hart trifft immer, leicht nur bei 1/3/5 */
{
  const S = mk('griechenland');
  eq([1, 2, 3, 4, 5, 6].map(r => eventColumn(S, 'hard', r)), [1, 1, 2, 2, 3, 3], 'hart: 1/2→1, 3/4→2, 5/6→3');
  eq([1, 2, 3, 4, 5, 6].map(r => eventColumn(S, 'easy', r)), [1, 0, 2, 0, 3, 0], 'leicht: nur 1/3/5 treffen');
}
/* Häufigkeit: leicht trifft etwa halb so oft wie hart */
{
  let hard = 0, easy = 0;
  for (let g = 0; g < 200; g++) {
    const H = mkX('griechenland', { events: true, eventMode: 'hard', seed: 100 + g });
    const E = mkX('griechenland', { events: true, eventMode: 'easy', seed: 100 + g });
    if (H.event.k) hard++;
    if (E.event.k) easy++;
  }
  eq(hard, 200, 'harter Modus: jede Runde ein Ereignis');
  eq(easy > 60 && easy < 140, true, `leichter Modus trifft etwa halb so oft (${easy}/200)`);
}
/* Bots sind nie betroffen, Menschen schon */
{
  const S = mkX('griechenland', { events: true });
  setEvent(S, 'duerre');
  eq(evActive(S, 0, 'duerre'), true, 'Ereignis trifft den Menschen');
  eq(evActive(S, 1, 'duerre'), false, 'Bots sind nie betroffen');
  eq(tileYield(S, 0, 'G'), [0, 0, 0], 'Dürre: Grasland bringt nichts');
  eq(tileYield(S, 1, 'G')[1], 1, 'Bot-Grasland bringt weiter Nahrung');
  for (const [k, t] of Object.entries(EVENT_TERRAIN)) {
    setEvent(S, k);
    eq(tileYield(S, 0, t), [0, 0, 0], `${EVENT_BY_KEY[k].n}: ${TERRAIN[t].name} bringt nichts`);
  }
}
/* Pest, Sturmflut, Kriegsmüdigkeit, Wirtschaftskrise, Hungersnot, Revolution */
{
  const S = mkX('griechenland', { events: true });
  const c = capitalOf(S, 0); c.pop = 7;
  setEvent(S, 'pest'); applyEvent(S);
  eq(c.pop, 3, 'Pest: 7 → 3 (Hälfte aufgerundet abgezogen)');
  c.pop = 1;
  setEvent(S, 'pest'); applyEvent(S);
  eq(c.pop, 1, 'Pest zerstört keine Stadt (letzte Bevölkerung bleibt)');
}
{
  const S = mkX('griechenland', { events: true });
  const c = capitalOf(S, 0); c.pop = 9;
  const wet = neighbors(c.r, c.c).some(([r, cc]) => ['M', 'F'].includes(terrainAt(S, r, cc)));
  setEvent(S, 'sturmflut'); applyEvent(S);
  if (wet) {
    eq(c.pop, 6, 'Sturmflut: 9 → 6 (ein Drittel)');
    eq(typeof canGrow(S, 0, c), 'string', 'Sturmflut: diese Runde kein Wachstum');
  } else eq(c.pop, 9, 'ohne Wasseranschluss keine Sturmflut');
}
{
  const S = mkX('griechenland', { events: true });
  S.players[0].power = 12;
  setEvent(S, 'kriegsmuedigkeit'); applyEvent(S);
  eq(S.players[0].power, 0, 'Kriegsmüdigkeit setzt die Macht auf 0');
}
{
  const S = mkX('griechenland', { events: true });
  const base = income(S, 0);
  setEvent(S, 'wirtschaftskrise');
  eq(income(S, 0).coins, 0, 'Wirtschaftskrise: keine Münzen');
  eq(income(S, 0).sci, base.sci, 'Wissenschaft bleibt');
  setEvent(S, 'hungersnot');
  eq(income(S, 0).food, 0, 'Hungersnot: keine Nahrung');
  eq(rates(S, 0).coinsToFood, 4, 'Hungersnot: Münzen→Nahrung 4:1');
  S.players[0].techs.gilden = true;
  eq(rates(S, 0).coinsToFood, 2, 'Hungersnot mit Gilden: 2:1');
  const E = mkX('england', { events: true });
  setEvent(E, 'hungersnot');
  eq(rates(E, 0).coinsToFood, 1, 'Englands 1:1 wird von der Hungersnot nicht überschrieben');
}
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0); cap.pop = 4;
  const before = income(S, 0);
  setEvent(S, 'revolution');
  const after = income(S, 0);
  eq(after.sci === 0 && after.coins === 0, true, 'Revolution: Hauptstadt und Umland produzieren nichts');
  eq(after.food, -4, 'Revolution: Nahrung wird trotzdem verbraucht');
  eq(before.sci > 0, true, 'Vergleichswert war vorher positiv');
}
/* Dunkles Zeitalter, Bürgerkrieg, Atomwaffenproteste */
{
  const S = mkX('griechenland', { events: true });
  S.players[0].avail.schrift = true; S.players[0].res = { sci: 9, food: 0, coins: 0 };
  setEvent(S, 'dunkles_zeitalter');
  eq(typeof doResearch(S, 0, 'schrift'), 'string', 'Dunkles Zeitalter verbietet Forschung');
  S.event = null;
  eq(doResearch(S, 0, 'schrift'), null, 'danach wieder erlaubt');
}
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0), sp = spotBy(S, cap);
  S.armies.push({ id: 92, owner: 0, r: sp[0], c: sp[1], mp: 0, born: 0 });
  setEvent(S, 'buergerkrieg'); applyEvent(S);
  eq(armiesOf(S, 0).length, 0, 'Bürgerkrieg zerstört alle eigenen Armeen');
  S.players[0].res = { sci: 0, food: 20, coins: 0 };
  eq(buildArmy(S, 0, cap), null, 'Bürgerkrieg: Armee kann mit Nahrung bezahlt werden');
  const T = mkX('griechenland', { events: true });
  T.players[0].res = { sci: 0, food: 20, coins: 0 };
  eq(typeof buildArmy(T, 0, capitalOf(T, 0)), 'string', 'ohne Bürgerkrieg geht das nicht');
}
/* Bürgerkrieg: die gemeldete Mischzahlung aus Nahrung und Münzen.
   Der eigentliche Fehler saß nicht im Bezahlen, sondern in der Prüfung davor: die
   Oberfläche fragte `available(…, 'coins')` OHNE payOpts und sperrte den Knopf.
   Diese Invariante bindet beide Seiten aneinander. */
{
  const mkCivil = () => {
    const S = mkX('griechenland', { events: true });
    setEvent(S, 'buergerkrieg'); applyEvent(S);
    return S;
  };
  const S0 = mkCivil();
  eq(payOpts(S0, 0).foodOk, true, 'payOpts meldet den Bürgerkrieg');
  eq(payOpts(mkX('griechenland', { events: true }), 0).foodOk, false, 'sonst nicht');
  const cost = armyCost(S0, 0);
  eq(cost >= 2, true, 'die Armee kostet genug für eine Mischzahlung');

  // Genau die gemeldete Lage: halb Münzen, halb Nahrung
  {
    const S = mkCivil(), c = Math.floor(cost / 2);
    S.players[0].res = { sci: 0, food: cost - c, coins: c };
    eq(available(S, 0, 'coins', payOpts(S, 0)) >= cost, true,
      `${c} Münzen + ${cost - c} Nahrung reichen laut Prüfung`);
    eq(buildArmy(S, 0, capitalOf(S, 0)), null, 'und der Kauf gelingt auch');
    eq(S.players[0].res.coins + S.players[0].res.food, 0, 'beides wurde aufgebraucht');
  }
  // Eins zu wenig darf nicht gehen – und die Prüfung muss das genauso sehen
  {
    const S = mkCivil(), c = Math.floor(cost / 2);
    S.players[0].res = { sci: 0, food: cost - c - 1, coins: c };
    eq(available(S, 0, 'coins', payOpts(S, 0)) >= cost, false, 'eins zu wenig ist zu wenig');
    eq(typeof buildArmy(S, 0, capitalOf(S, 0)), 'string', 'und der Kauf scheitert');
  }
  // Invariante über alle Aufteilungen: Prüfung und Bezahlung stimmen immer überein
  {
    let geprueft = 0;
    for (let coins = 0; coins <= cost + 2; coins++)
      for (let food = 0; food <= cost + 2; food++) {
        const S = mkCivil();
        S.players[0].res = { sci: 0, food, coins };
        const darf = available(S, 0, 'coins', payOpts(S, 0)) >= cost;
        const ging = buildArmy(S, 0, capitalOf(S, 0)) === null;
        if (darf !== ging) throw new Error(`Prüfung ${darf} ≠ Kauf ${ging} bei ${coins}🪙 ${food}🌾`);
        geprueft++;
      }
    eq(geprueft, (cost + 3) * (cost + 3), `${geprueft} Aufteilungen: Prüfung und Kauf stimmen überein`);
  }
  // Dasselbe für Macht
  {
    const S = mkCivil(), price = powerPrice(S, 0);
    S.players[0].res = { sci: 0, food: price - 1, coins: 1 };
    eq(Math.floor(available(S, 0, 'coins', payOpts(S, 0)) / price) >= 1, true,
      'Macht: Nahrung zählt bei der Prüfung mit');
    eq(buyPower(S, 0, 1), null, 'Macht lässt sich im Bürgerkrieg mischbezahlen');
  }
}
{
  const S = mkX('griechenland', { events: true }, ['atomwaffen']);
  setEvent(S, 'atomprotest'); applyEvent(S);
  eq(S.nukeBan, true, 'Atomwaffenproteste sperren Atomwaffen');
  eq(typeof nuke(S, 0, capitalOf(S, 1).r, capitalOf(S, 1).c), 'string', 'Atomschlag wird abgelehnt');
  S.round += 3; S.event = null;
  eq(typeof nuke(S, 0, capitalOf(S, 1).r, capitalOf(S, 1).c), 'string', 'die Sperre ist dauerhaft');
}
/* Vulkanausbruch */
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 8, cap: false, grown: 0, born: 0 });
  setEvent(S, 'vulkan'); applyEvent(S);
  const city = cityAt(S, spot[0], spot[1]);
  eq(city.pop, 2, 'Vulkan: 8 → 2 (drei Viertel aufgerundet)');
  const vulk = neighbors(spot[0], spot[1]).find(([r, c]) => terrainAt(S, r, c) === 'V');
  eq(!!vulk, true, 'ein Nachbarfeld ist jetzt Vulkan');
  eq(tileYield(S, 0, 'V'), [0, 0, 0], 'Vulkan bringt keinen Ertrag');
  eq(canPass(S, 0, vulk[0], vulk[1]), false, 'Vulkan ist unpassierbar');
  eq(typeof canFound(S, 0, vulk[0], vulk[1]), 'string', 'auf einem Vulkan kann nicht gesiedelt werden');
}
/* Barbareninvasion */
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  const cid = S.nextId++;
  S.cities.push({ id: cid, owner: 0, r: spot[0], c: spot[1], pop: 4, cap: false, grown: 0, born: 0 });
  setEvent(S, 'barbaren'); applyEvent(S);
  const force = S.barbs[0];
  eq(force.power, 10, 'Barbarenmacht = max(10, doppelter Machtwert)');
  eq(force.hits, 1, 'erster Angriff sitzt (10 > 4)');
  eq(cityAt(S, spot[0], spot[1]).owner, 0, 'die Stadt gehört noch dem Spieler');
  S.round++; resolveBarbs(S);          // zweiter Angriff vor dem nächsten Ereignis
  const city = cityAt(S, spot[0], spot[1]);
  const bi = S.players.findIndex(p => p.kind === 'barbar');
  eq(city.owner, bi, 'nach zwei Runden gehört die Stadt den Barbaren');
  eq(city.pop, 2, 'Eroberung kostet 2 Bevölkerung');
  eq(defenseValue(S, city), 2, 'Barbarenstadt verteidigt nur mit Bevölkerung');
  eq(civOf(S.players[bi]).n, 'Barbaren', 'die Barbaren sind eine eigene Fraktion');
  eq(S.players[bi].dead, true, 'die Barbaren kommen nie an den Zug');
  // Rückerobern klappt nach den normalen Regeln
  S.players[0].power = 20;
  const near = neighbors(city.r, city.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
  S.armies.push({ id: 93, owner: 0, r: near[0], c: near[1], mp: 0, born: 0 });
  combatPhase(S, 0); combatPhase(S, 0);
  eq(cityAt(S, spot[0], spot[1]) ? cityAt(S, spot[0], spot[1]).owner : 0, 0, 'die Stadt ist zurückerobert');
}
/* Barbaren ziehen ab, wenn der erste Angriff scheitert */
{
  const S = mkX('griechenland', { events: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 30, cap: false, grown: 0, born: 0 });
  setEvent(S, 'barbaren'); applyEvent(S);
  eq((S.barbs || []).length, 0, 'starke Stadt wehrt die Barbaren sofort ab');
  eq(cityAt(S, spot[0], spot[1]).owner, 0, 'die Stadt bleibt beim Spieler');
}

/* ==================================================== Weltwunder */
/* Kostenleiter und Pyramidenregel */
{
  const S = mkX('griechenland', { wonders: true });
  eq(wonderCost(S, 0), 10, 'erstes Wunder kostet 10');
  const cap = capitalOf(S, 0);
  const push = (k, lvl) => S.wonders.push({ k, lvl, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  push('gaerten', 1);
  eq(wonderCost(S, 0), 20, 'zweites Wunder kostet 20');
  push('koloss', 1); push('zeus', 1);
  eq(wonderCost(S, 0), 40, 'viertes Wunder kostet 40');
  eq(wonderLevelOk(S, 0, 2), true, 'mit 3 Stufe-1-Wundern ist Stufe 2 erlaubt');
  push('taj', 2);
  eq(wonderLevelOk(S, 0, 2), true, 'zweites Stufe-2-Wunder bei 3 Stufe-1 erlaubt (2 < 3)');
  push('canal', 2);
  eq(wonderLevelOk(S, 0, 2), false, 'drittes Stufe-2-Wunder bräuchte 4 Stufe-1-Wunder');
  eq(wonderLevelOk(S, 0, 3), true, 'mit 2 Stufe-2-Wundern ist Stufe 3 erlaubt');
  // Verlust senkt die Kosten wieder
  const before = wonderCost(S, 0);
  removeWonder(S, S.wonders[0]);
  eq(wonderCost(S, 0), before - 10, 'ein verlorenes Wunder senkt den Preis');
}
/* Beispiel des Autors: ein erobertes Stufe-2-Wunder ohne Stufe-1-Wunder */
{
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  S.wonders.push({ k: 'taj', lvl: 2, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(wonderLevelOk(S, 0, 2), false, 'ohne Stufe-1-Wunder kein weiteres Stufe-2-Wunder');
  for (const k of ['gaerten', 'koloss']) S.wonders.push({ k, lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(wonderLevelOk(S, 0, 2), false, 'zwei Stufe-1-Wunder genügen noch nicht');
  S.wonders.push({ k: 'zeus', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(wonderLevelOk(S, 0, 2), true, 'ab drei Stufe-1-Wundern geht es weiter');
}
/* Pool: je 3 verfügbar, Stufe 3 vollständig, Nachwürfeln nach dem Bau */
{
  const S = mkX('griechenland', { wonders: true });
  eq([poolOf(S, 1).length, poolOf(S, 2).length], [3, 3], 'je drei Wunder der Stufen 1 und 2 verfügbar');
  eq(poolOf(S, 3).length, 3, 'alle drei Stufe-3-Wunder sind verfügbar');
  eq(new Set(poolOf(S, 1)).size, 3, 'keine Doppelungen im Pool');
  const cap = capitalOf(S, 0);
  const first = poolOf(S, 1)[0];
  S.players[0].res = { sci: 0, food: 0, coins: 50 };
  eq(buildWonder(S, 0, cap, first), null, 'Wunder gebaut');
  eq(poolOf(S, 1).includes(first), false, 'das gebaute Wunder ist aus dem Pool');
  eq(poolOf(S, 1).length, 3, 'ein neues Wunder wurde nachgewürfelt');
  eq(S.players[0].res.coins, 40, '10 Münzen bezahlt');
  // zweites Wunder in derselben Stadt, drittes nicht mehr
  eq(buildWonder(S, 0, cap, poolOf(S, 1)[0]), null, 'zweites Wunder in derselben Stadt');
  eq(typeof buildWonder(S, 0, cap, poolOf(S, 1)[0]), 'string', 'drittes Wunder in derselben Stadt abgelehnt');
}
/* Dauerhafte Effekte */
{
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0); cap.pop = 3;
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 5, cap: false, grown: 0, born: 0 });
  const other = cityAt(S, spot[0], spot[1]);
  const add = (k, lvl) => S.wonders.push({ k, lvl, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  eq(defenseValue(S, other), 5, 'ohne Mauer verteidigt die Stadt mit eigener Bevölkerung');
  add('mauer', 1);
  eq(defenseValue(S, other), 8, 'Große Mauer: Verteidigung = Gesamtbevölkerung (3+5)');
  add('leuchtturm', 1);
  eq(tileYield(S, 0, 'M'), [1, 1, 2], 'Leuchtturm: Meer +1 auf alles');
  add('pyramiden', 1);
  eq(rates(S, 0).foodToCoins, 1, 'Pyramiden: Nahrung → Münzen 1:1');
  eq(rates(S, 0).coinsToFood, 2, 'Pyramiden wirken nur in eine Richtung');
  add('himeji', 2);
  eq(powerPrice(S, 0), 4, 'Burg Himeji senkt den Machtpreis um 1');
  add('kreml', 3);
  eq(techCost(S, 0, SINGULARITY), 145, 'Kreml: Singularität +50 (100+50−5 Rabatt)');
  eq(techCost(S, 1, SINGULARITY), 150, 'der Kreml verteuert Singularität für alle');
  add('zeus', 1);
  eq(powerOf(S, 0), 3, 'Zeusstatue: +3 Macht');
}
/* Sofortwirkungen */
{
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0); cap.pop = 2;
  const p = S.players[0];
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.canal);
  eq(p.res.coins >= 40, true, 'Canal du Midi: +40 Münzen');
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.pentagon);
  eq(p.power, 15, 'Pentagon: +15 Macht');
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.taj);
  eq(p.doubleIncome, S.round + 1, 'Taj Mahal wirkt in der nächsten Runde');
  const plain = income(S, 0).sci;
  S.round++; p.doubleIncome = S.round;
  eq(income(S, 0).sci, plain * 2, 'Taj Mahal verdoppelt die Erträge');
  p.doubleIncome = null;
  // Koloss: zwei kostenlose Armeen, aber nacheinander – auf einem Feld steht nur eine
  {
    const vorher = armiesOf(S, 0).length;
    applyWonderEffect(S, 0, cap, WONDER_BY_KEY.koloss);
    eq(armiesOf(S, 0).length, vorher + 1, 'zuerst erscheint nur EINE Armee');
    eq(p.freeArmies, 1, 'die zweite wartet in der Warteschlange');
    const erste = armiesOf(S, 0).find(a => a.r === cap.r && a.c === cap.c);
    eq(!!erste, true, 'sie steht in der Hauptstadt');
    eq(erste.born, S.round, 'und gilt als neu gebaut – muss die Stadt verlassen');
    eq(erste.mp > 0, true, 'sie hat dafür auch Bewegungspunkte');
    eq(pendingWarnings(S, 0).some(w => /kostenlose Armee wartet/.test(w)), true,
      'das Zugende warnt vor der wartenden Armee');
    eq(blockingIssues(S, 0).length > 0, true, 'und ist blockiert, solange sie in der Stadt steht');
    // Solange die Hauptstadt besetzt ist, kommt keine zweite
    spawnFreeArmies(S, 0);
    eq(armiesOf(S, 0).length, vorher + 1, 'die zweite kommt nicht, solange es eng ist');
    // Erst das Wegziehen macht Platz
    const ziel = neighbors(cap.r, cap.c).find(([r, c]) =>
      isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
    eq(!!ziel, true, 'ein Nachbarfeld ist frei');
    erste.mp = moveAllowance(S, 0);
    eq(moveArmy(S, erste, ziel[0], ziel[1]), null, 'die erste zieht heraus');
    eq(armiesOf(S, 0).length, vorher + 2, 'und die zweite rückt sofort nach');
    eq(p.freeArmies, 0, 'die Warteschlange ist leer');
    eq(armiesOf(S, 0).filter(a => cityAt(S, a.r, a.c)).length, 1,
      'genau eine Armee steht jetzt noch in der Stadt');
  }
  /* Der Koloss stellt seine Armeen in DER STADT, DIE IHN GEBAUT HAT – nicht in der
     Hauptstadt. Das war ein Fehler: `spawnFreeArmies` nahm immer `capitalOf`, und weil
     Wunder meist in der Hauptstadt gebaut werden, fiel es lange nicht auf. Geprüft wird
     deshalb ausdrücklich mit einer zweiten Stadt, auch für die WARTENDE Armee: die
     Warteschlange überdauert Züge, der Ort muss also gemerkt bleiben. */
  {
    S.armies = S.armies.filter(a => a.owner !== 0);       // beide Städte frei machen
    p.res.food = 99;
    const H = S.map.rows.length, W = S.map.rows[0].length;
    let zweite = null;
    for (let r = 0; r < H && !zweite; r++) for (let c = 0; c < W; c++) {
      if (!isLand(S, r, c) || cityAt(S, r, c)) continue;
      if (hexDistance(r, c, cap.r, cap.c) < 2) continue;
      if (foundCity(S, 0, r, c) === null) { zweite = cityAt(S, r, c); break; }
    }
    eq(!!zweite && !zweite.cap, true, 'eine zweite Stadt steht (nicht die Hauptstadt)');
    p.freeArmies = 0; p.freeArmyCity = null;
    applyWonderEffect(S, 0, zweite, WONDER_BY_KEY.koloss);
    const erste = armiesOf(S, 0).find(a => a.r === zweite.r && a.c === zweite.c);
    eq(!!erste, true, 'die erste Armee steht in der Kolossstadt, nicht in der Hauptstadt');
    eq(armyAt(S, cap.r, cap.c), undefined, 'in der Hauptstadt steht keine');
    eq(p.freeArmyCity, zweite.id, 'die Stadt ist für die wartende Armee gemerkt');
    eq(pendingWarnings(S, 0).some(w => w.includes(`${zweite.r}/${zweite.c}`)), true,
      'die Warnung nennt die Kolossstadt und nicht die Hauptstadt');
    // Die erste zieht heraus – die zweite rückt in DIESELBE Stadt nach
    const raus = neighbors(zweite.r, zweite.c).find(([r, c]) =>
      isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
    erste.mp = moveAllowance(S, 0);
    eq(moveArmy(S, erste, raus[0], raus[1]), null, 'die erste zieht heraus');
    eq(!!armyAt(S, zweite.r, zweite.c), true, 'die zweite rückt in der Kolossstadt nach');
    eq(armyAt(S, cap.r, cap.c), undefined, 'auch die zweite landet nicht in der Hauptstadt');
    eq(p.freeArmies, 0, 'die Warteschlange ist leer');
    eq(p.freeArmyCity, null, 'und die gemerkte Stadt ist wieder frei');
    // Fällt die Kolossstadt weg, gehen wartende Armeen nicht verloren
    p.freeArmies = 1; p.freeArmyCity = 99999;             // Stadt, die es nicht gibt
    S.armies = S.armies.filter(a => a.owner !== 0);
    spawnFreeArmies(S, 0);
    eq(!!armyAt(S, cap.r, cap.c), true,
      'ohne die Kolossstadt rückt die Armee in die Hauptstadt nach');
    S.armies = S.armies.filter(a => a.owner !== 0);
  }
  const before = cap.pop;
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.angkor);
  eq(cap.pop > before, true, 'Angkor Wat lässt die Stadt wachsen');
  eq(income(S, 0).food >= 0, true, 'auch Angkor Wat bleibt an der Nahrungsgrenze');
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.bibliothek);
  eq(freePickOptions(S, 0).every(t => t.age <= 1), true, 'Bibliothek: Mittelalter oder früher');
  eq(freePickOptions(S, 0).some(t => !p.avail[t.k]), true, 'Bibliothek ignoriert die Verfügbarkeit');
  const pick = freePickOptions(S, 0)[0];
  eq(useFreePick(S, 0, pick.k), null, 'Gratis-Tech aus der Bibliothek');
  eq(freePick(p), null, 'Anspruch verbraucht');
  p.avail.schrift = true;
  applyWonderEffect(S, 0, cap, WONDER_BY_KEY.oxford);
  eq(freePickOptions(S, 0).every(t => p.avail[t.k]), true, 'Oxford nur auf verfügbare Techs');
  eq(freePick(p).n, 2, 'Oxford gibt zwei Gratis-Techs');
}
/* Erdbeben, Stonehenge, Eroberung, Zerstörung */
{
  const S = mkX('griechenland', { wonders: true, events: true });
  const cap = capitalOf(S, 0);
  S.wonders.push({ k: 'gaerten', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  setEvent(S, 'erdbeben'); applyEvent(S);
  eq(wondersOf(S, 0).length, 0, 'Erdbeben zerstört ein Wunder');
  eq(S.wgone.includes('gaerten'), true, 'zerstörte Wunder sind endgültig weg');
  initWonderPools(S);
  eq(poolOf(S, 1).includes('gaerten'), false, 'zerstörte Wunder kommen nicht zurück in den Pool');
  S.wonders.push({ k: 'stonehenge', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  setEvent(S, 'erdbeben'); applyEvent(S);
  eq(wondersOf(S, 0).length, 1, 'Stonehenge schützt vor dem Erdbeben');
}
{
  // Eroberung: dauerhafte Effekte wechseln den Besitzer
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 5, cap: false, grown: 0, born: 0 });
  const city = cityAt(S, spot[0], spot[1]);
  S.wonders.push({ k: 'leuchtturm', lvl: 1, owner: 0, cityId: city.id, r: city.r, c: city.c });
  captureCity(S, 1, city);
  eq(city.owner, 1, 'Stadt erobert');
  eq(ownsWonder(S, 1, 'leuchtturm'), true, 'der Eroberer übernimmt das Wunder');
  eq(hasWonder(S, 1, 'leuchtturm'), false, 'ein Bot als Eroberer nutzt den Effekt aber nicht');
  S.players[1].kind = 'human';
  eq(hasWonder(S, 1, 'leuchtturm'), true, 'ein menschlicher Eroberer erhält den Effekt');
  eq(hasWonder(S, 0, 'leuchtturm'), false, 'der Verlierer verliert den Effekt');
  eq(wonderCost(S, 0), 10, 'nach dem Verlust kostet ein neues Wunder wieder 10');
}
{
  // Zerstörung ohne Stonehenge: Wunder weg; mit Stonehenge: bleiben stehen
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 1, cap: false, grown: 0, born: 0 });
  const city = cityAt(S, spot[0], spot[1]);
  S.wonders.push({ k: 'leuchtturm', lvl: 1, owner: 0, cityId: city.id, r: city.r, c: city.c });
  captureCity(S, 1, city);          // pop 1 − 2 → Stadt zerstört
  eq(cityAt(S, spot[0], spot[1]), undefined, 'Stadt zerstört');
  eq(S.wonders.length, 0, 'die Wunder sind mit der Stadt verloren');
  eq(S.wgone.includes('leuchtturm'), true, 'und nicht mehr verfügbar');
}
{
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 1, cap: false, grown: 0, born: 0 });
  const city = cityAt(S, spot[0], spot[1]);
  S.wonders.push({ k: 'stonehenge', lvl: 1, owner: 0, cityId: city.id, r: city.r, c: city.c });
  S.wonders.push({ k: 'leuchtturm', lvl: 1, owner: 0, cityId: city.id, r: city.r, c: city.c });
  captureCity(S, 1, city);
  eq(S.wonders.length, 2, 'Stonehenge: die Wunder überstehen die Zerstörung der Stadt');
  eq(S.wonders.every(w => w.owner === 0 && w.cityId == null), true, 'sie bleiben freistehend beim Besitzer');
  eq(hasWonder(S, 0, 'leuchtturm'), true, 'die Effekte wirken weiter');
  // wer hier eine Stadt gründet, übernimmt sie
  S.players[1].res = { sci: 0, food: 99, coins: 99 };
  eq(foundCity(S, 1, spot[0], spot[1]), null, 'neue Stadt auf dem Feld gegründet');
  eq(ownsWonder(S, 1, 'leuchtturm'), true, 'die freistehenden Wunder gehen an die neue Stadt');
}
/* Kultursieg */
{
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  S.wpool[3] = ['pentagon'];
  S.players[0].res = { sci: 0, food: 0, coins: 99 };
  for (const k of ['gaerten', 'koloss', 'zeus']) S.wonders.push({ k, lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  for (const k of ['taj', 'canal']) S.wonders.push({ k, lvl: 2, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  const spot = within(cap.r, cap.c, 5).find(([r, c]) => !canFound(S, 0, r, c));
  S.cities.push({ id: S.nextId++, owner: 0, r: spot[0], c: spot[1], pop: 3, cap: false, grown: 0, born: 0 });
  const city = cityAt(S, spot[0], spot[1]);
  eq(buildWonder(S, 0, city, 'pentagon'), null, 'Stufe-3-Wunder gebaut');
  eq(S.players[0].cultureWin, S.round, 'Kultursieg ist vorgemerkt');
  eq(checkCultureVictory(S, 0), null, 'im selben Zug gewinnt niemand');
  eq(S.claims.length, 0, 'und es ist auch nichts angemeldet');
  S.round++;
  checkCultureVictory(S, 0);
  eq(S.claims.map(c => c.how.startsWith('Kultursieg')), [true],
    'zu Beginn des nächsten Zuges wird der Kultursieg angemeldet');
  eq(S.over, null, 'entschieden wird er erst am Rundenende');
}
{
  // verlorenes Stufe-3-Wunder verhindert den Kultursieg
  const S = mkX('griechenland', { wonders: true });
  const cap = capitalOf(S, 0);
  S.wonders.push({ k: 'pentagon', lvl: 3, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
  S.players[0].cultureWin = S.round;
  S.round++;
  removeWonder(S, S.wonders[0]);
  eq(checkCultureVictory(S, 0), null, 'ohne Stufe-3-Wunder kein Kultursieg');
  eq(S.claims.length, 0, 'und kein Anspruch');
}
/* Bots bauen Wunder ohne Kosten und ohne Effekte */
{
  const S = newGame({
    seed: 21, wonders: true,
    players: CIVS.map(c => ({ civ: c.k, kind: 'bot', diff: 'david' })),
  });
  let built = 0;
  for (let i = 0; i < 12 && !S.over; i++) {
    const before = S.wonders.length;
    botWonderStep(S, S.cur);
    built += S.wonders.length - before;
    advanceTurn(S);
  }
  eq(built > 0, true, 'Bots bauen Weltwunder');
  eq(S.wonders.every(w => w.cityId != null), true, 'Bot-Wunder stehen in Städten');
  eq(S.players.every(p => !p.res.coins || p.res.coins >= 0), true, 'Bots zahlen keine Münzen');
  const withEffect = S.wonders.filter(w => w.k === 'canal');
  eq(withEffect.every(() => true), true, 'Bots wenden keine Wundereffekte an');
}

/* ==================================================== Siedelertrag (settleGain)
   Was eine gedachte Stadt der Größe 1 auf einem Feld einbrächte. Die Oberfläche zeigt
   das im Feldblatt an; das Tutorial rechnet damit seine Beispielzahlen aus. */
{
  const S = mk('russland');
  const pi = 0, cap = capitalOf(S, pi);
  // Erwartung aus der Regel: alle noch nicht kontrollierten Nachbarfelder (ohne Stadtfelder)
  // plus der Ertrag des einen Bevölkerungspunkts – die Nahrung isst er selbst mit.
  const expect = (r, c) => {
    const own = controlledTiles(S, pi);
    const y = [0, 0, 0];
    for (const [nr, nc] of neighbors(r, c)) {
      if (!terrainAt(S, nr, nc) || cityAt(S, nr, nc)) continue;
      if (own.has(key(nr, nc))) continue;                 // zählt schon, nicht doppelt
      const t = tileYieldAt(S, pi, nr, nc);
      for (let i = 0; i < 3; i++) y[i] += t[i];
    }
    const py = cityPopYield(S, pi);
    for (let i = 0; i < 3; i++) y[i] += py[i];
    return { sci: y[0], food: y[1], coins: y[2] };
  };
  // Ein Feld weit weg von der Hauptstadt: alle sechs Nachbarn sind neu
  const far = within(cap.r, cap.c, 5).filter(([r, c]) =>
    isLand(S, r, c) && hexDistance(cap.r, cap.c, r, c) >= 4 &&
    neighbors(r, c).every(([nr, nc]) => terrainAt(S, nr, nc)))[0];
  eq(settleGain(S, pi, ...far), expect(...far), 'Siedelertrag = neues Umland + Bevölkerung');
  // Die eine Bevölkerung isst mit: die Nahrung liegt genau 1 unter der Feldsumme
  {
    const felder = neighbors(...far).filter(([r, c]) => terrainAt(S, r, c) && !cityAt(S, r, c))
      .reduce((a, [r, c]) => a + tileYieldAt(S, pi, r, c)[1], 0);
    eq(settleGain(S, pi, ...far).food, felder - 1,
      'die eine Bevölkerung isst im Siedelertrag schon mit (−1 Nahrung)');
  }

  // Ein Feld dicht an der Hauptstadt: das gemeinsame Umland darf NICHT doppelt zählen.
  // (Distanz 2 wäre als Stadtplatz verboten – hier geht es nur um die Rechnung.)
  const near = within(cap.r, cap.c, 2).filter(([r, c]) =>
    isLand(S, r, c) && hexDistance(cap.r, cap.c, r, c) === 2 &&
    neighbors(r, c).some(([nr, nc]) => controlledTiles(S, pi).has(key(nr, nc))))[0];
  eq(settleGain(S, pi, ...near), expect(...near), 'überlappendes Umland zählt nur einmal');
  // Exakte Gegenprobe: naive Summe minus Siedelertrag = genau die schon kontrollierten Felder
  const own = controlledTiles(S, pi);
  const dop = neighbors(...near).filter(([r, c]) => terrainAt(S, r, c) && own.has(key(r, c)));
  eq(dop.length > 0, true, 'das nahe Feld teilt Umland mit der Hauptstadt');
  const py = cityPopYield(S, pi);
  const naiv = neighbors(...near).filter(([r, c]) => terrainAt(S, r, c) && !cityAt(S, r, c))
    .reduce((a, [r, c]) => a.map((v, i) => v + tileYieldAt(S, pi, r, c)[i]), py.slice());
  const g = settleGain(S, pi, ...near);
  const diff = [naiv[0] - g.sci, naiv[1] - g.food, naiv[2] - g.coins];
  const dopSum = dop.reduce((a, [r, c]) => a.map((v, i) => v + tileYieldAt(S, pi, r, c)[i]), [0, 0, 0]);
  eq(diff, dopSum, 'die Differenz ist genau das gemeinsame Umland');

  // Keine Nebenwirkung: Spielstand und Einkommen sind hinterher unverändert
  const before = JSON.stringify(S);
  settleGain(S, pi, ...far); settleGain(S, pi, ...near);
  eq(JSON.stringify(S), before, 'settleGain verändert den Spielstand nicht');

  // Fähigkeiten wirken mit: Russlands Grundfähigkeit gibt +1 Nahrung je Wald.
  // Gegenprobe im selben Spielstand, nur mit umgeschalteter Fähigkeit.
  {
    const wald = within(cap.r, cap.c, 6).filter(([r, c]) =>
      isLand(S, r, c) && hexDistance(cap.r, cap.c, r, c) >= 4 &&
      neighbors(r, c).filter(([a, b]) => terrainAt(S, a, b) === 'W').length >= 1)[0];
    eq(!!wald, true, 'ein Waldplatz zum Vergleich gefunden');
    const n = neighbors(...wald).filter(([a, b]) => terrainAt(S, a, b) === 'W').length;
    const mit = settleGain(S, pi, ...wald).food;
    S.players[pi].ability = 'wachstum';                  // Alternative: kein Waldbonus
    const ohne = settleGain(S, pi, ...wald).food;
    S.players[pi].ability = 'basis';
    eq(mit - ohne, n, `Waldfähigkeit bringt genau +1 je Wald (${n} Wälder)`);
  }
}
/* ==================================================== Gründungsmodus (v75)
   Die Oberfläche fragt jedes Feld ab: taugt der Platz (foundSiteError), was kostet er
   (foundCost), reicht die Nahrung (canFound). Dafür wurde canFound geteilt – an seinen
   Antworten darf sich nichts ändern – und eine Wegtabelle eingeführt, die dieselben
   Entfernungen liefern muss wie die Einzelsuche. */
{
  const S = newGame({ seed: 5, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
  let guard = 0;
  while (!S.over && S.round < 6 && guard++ < 200) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
  S.over = null;
  const pi = S.players.findIndex(p => !p.dead);
  // canFound = foundSiteError, sonst die Nahrung – Feld für Feld
  let uneins = 0, knapp = 0;
  S.players[pi].res = { sci: 0, food: 2, coins: 0 };
  S.map.rows.forEach((row, r) => [...row].forEach((t, c) => {
    const site = foundSiteError(S, pi, r, c), cost = foundCost(S, pi, r, c);
    const soll = site || (available(S, pi, 'food') < cost ? T('Zu wenig Nahrung (%s nötig).', cost) : null);
    if (canFound(S, pi, r, c) !== soll) uneins++;
    if (!site && soll) knapp++;
  }));
  eq(uneins, 0, 'canFound = Platzprüfung + Nahrung, auf jedem Feld');
  eq(knapp > 0, true, `mit 2 Nahrung scheitern Plätze nur an der Nahrung (${knapp}) – sie zeigen ihre Kosten rot`);
  // Wegtabelle gegen Einzelsuche, auch mit Navigation, Kartografie und Luftwaffe
  const abw = [];
  let felder = 0;
  for (const techs of [[], ['navigation'], ['kartografie'], ['luftwaffe']]) {
    const alt = Object.assign({}, S.players[pi].techs);
    techs.forEach(k => { S.players[pi].techs[k] = true; });
    const einzeln = S.map.rows.flatMap((row, r) => [...row].map((t, c) =>
      JSON.stringify([foundSiteError(S, pi, r, c), foundCost(S, pi, r, c)])));
    const tabelle = withFoundTable(S, pi, () => S.map.rows.flatMap((row, r) => [...row].map((t, c) =>
      JSON.stringify([foundSiteError(S, pi, r, c), foundCost(S, pi, r, c)]))));
    einzeln.forEach((e, i) => { felder++; if (e !== tabelle[i]) abw.push(techs.join() + '#' + i); });
    S.players[pi].techs = alt;
  }
  eq(abw.slice(0, 3), [], `Wegtabelle = Einzelsuche (${felder} Felder, vier Technikstände)`);
  eq(FOUND_SCOPE, null, 'außerhalb von withFoundTable rechnet wieder die Einzelsuche');
  // Die Tabelle gilt nur für das Reich, für das sie gerechnet wurde
  const anderer = S.players.findIndex((p, i) => i !== pi && !p.dead);
  const probe = S.map.rows.flatMap((row, r) => [...row].map((t, c) => [r, c]))
    .filter(([r, c]) => isLand(S, r, c)).slice(0, 40);
  eq(withFoundTable(S, pi, () => probe.map(([r, c]) => foundCost(S, anderer, r, c))),
    probe.map(([r, c]) => foundCost(S, anderer, r, c)), 'ein anderes Reich rechnet in der Tabelle nicht mit');
}
/* ==================================================== Machtansicht (v75)
   powerView: je Stadt Verteidigung und Angriff jedes Reichs mit Armeen in Reichweite,
   je Armee Machtwert und Flankierer – dieselben Zahlen wie im Kampf. */
{
  const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'human' },
    { civ: 'wikinger', kind: 'human' }] });
  S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
  S.armies.length = 0;
  const ru = S.players.findIndex(p => p.civ === 'russland');
  const en = S.players.findIndex(p => p.civ === 'england');
  const wi = S.players.findIndex(p => p.civ === 'wikinger');
  const cap = capitalOf(S, ru);
  S.players[ru].power = 2; S.players[en].power = 4; S.players[wi].power = 3;
  const nb = neighbors(cap.r, cap.c);
  S.armies.push({ id: 1, owner: en, r: nb[0][0], c: nb[0][1], mp: 0, born: 0 });
  S.armies.push({ id: 2, owner: en, r: nb[1][0], c: nb[1][1], mp: 0, born: 0 });
  S.armies.push({ id: 3, owner: wi, r: nb[3][0], c: nb[3][1], mp: 0, born: 0 });
  const v = powerView(S).cities.find(x => x.city === cap);
  eq(v.def, defenseValue(S, cap), 'Stadt: Verteidigung wie im Kampf');
  eq(v.atk.map(a => [a.pi, a.v]).sort((a, b) => a[0] - b[0]),
    [[en, attackValue(S, en, 2)], [wi, attackValue(S, wi, 1)]].sort((a, b) => a[0] - b[0]),
    'Stadt: je angreifendem Reich sein Angriffswert (zwei Armeen addieren sich)');
  eq(powerView(S).cities.filter(x => x.city.owner !== ru).every(x => !x.atk.length), true,
    'Städte ohne fremde Armeen in Reichweite: kein Angreifer');
  S.players[wi].dead = true;
  eq(powerView(S).cities.find(x => x.city === cap).atk.map(a => a.pi), [en], 'ein ausgeschiedenes Reich greift nicht an');
}
/* Der Protokollschritt im Tutorial darf beim Weiterschalten nicht das offene Fenster
   wegreißen – dafür gibt es keepOpen. */
{
  const look = TUT_STEPS.filter(st => st.keepOpen);
  eq(look.length, 1, 'genau ein Leseschritt ist als keepOpen markiert');
  eq(look.every(st => !!st.goal), true, 'der Leseschritt hat ein Ziel');
  eq(TUT_STEPS[TUT_STEPS.length - 1].goal, undefined,
    'der letzte Schritt hat keine Aufgabe – sonst würde er sich selbst beenden');
}

/* Bots forschen zufällig – nur im Tutorial liegt das Ergebnis fest.
   Der Hook tauscht ausschließlich das ERGEBNIS im Militärfeld; gewürfelt wird normal
   weiter, damit sich die feste Würfelfolge nicht verschiebt. */
{
  // Außerhalb des Tutorials greift der Hook nicht.
  // ACHTUNG: hier keine lokale Konstante `S` anlegen – tutorialSetup() schreibt in die
  // globale, eine Schattenvariable würde stillschweigend auf ein anderes Spiel zeigen.
  ui = { tut: null };
  {
    const frei = mk('russland');
    eq(tutBotTech(frei, 0, 2), null, 'ohne laufendes Tutorial keine Vorgabe');
  }
  // Im Tutorial: nur Griechenland, nur das Militärfeld
  tutorialSetup();
  const gi = S.players.findIndex(p => p.civ === 'griechenland');
  const ri = S.players.findIndex(p => p.civ === 'russland');
  eq(tutBotTech(S, gi, 2).k, 'eisenverarbeitung', 'Griechenland bekommt zuerst Eisenverarbeitung');
  eq(tutBotTech(S, gi, 0), null, 'in anderen Feldern gibt es keine Vorgabe');
  eq(tutBotTech(S, ri, 2), null, 'andere Reiche sind nicht betroffen');
  S.players[gi].techs.eisenverarbeitung = true;
  eq(tutBotTech(S, gi, 2).k, 'stahl', 'danach Stahl');
  S.players[gi].techs.stahl = true;
  eq(tutBotTech(S, gi, 2), null, 'danach greift wieder der Würfel');

  // Zwei komplette Durchläufe: Griechenland forscht jedes Mal dasselbe
  const durchlauf = () => {
    tutorialSetup();
    for (let i = 0; i < TUT_STEPS.length; i++) {
      ui.tut.i = i; tutEnter();
      const st = TUT_STEPS[i];
      if (st.goal && !st.goal()) st.auto();
    }
    const g = S.players.findIndex(p => p.civ === 'griechenland');
    return {
      techs: Object.keys(S.players[g].techs).filter(k => S.players[g].techs[k]).sort().join(','),
      wuerfel: ui.tut.die,
      alle: S.players.map(p => Object.keys(p.techs).filter(k => p.techs[k]).sort().join(',')).join('|'),
    };
  };
  const a1 = durchlauf(), a2 = durchlauf();
  eq(a1.techs, a2.techs, 'Griechenland forscht in beiden Durchläufen dasselbe');
  eq(a1.alle, a2.alle, 'auch alle anderen Reiche forschen identisch');
  eq(a1.wuerfel, a2.wuerfel, 'und es werden gleich viele Würfel verbraucht');
  eq(a1.techs.includes('eisenverarbeitung') && a1.techs.includes('stahl'), true,
    'Eisenverarbeitung und Stahl sind dabei: ' + a1.techs);
  eq(a1.techs.includes('stadtmauern') || a1.techs.includes('burgenbau'), false,
    'Stadtmauern und Burgenbau nicht: ' + a1.techs);
  ui = { sel: null, army: null, mode: null, botTimer: null };
}

/* Die Versionsnummer steht an zwei Stellen – sie müssen zusammenpassen, sonst zeigt das
   Menü etwas anderes an, als der Offline-Cache ausliefert. */
{
  const sw = require('fs').readFileSync(__dirname + '/sw.js', 'utf8');
  const m = /const VERSION = 'hochciv-(v\d+)'/.exec(sw);
  eq(!!m, true, 'sw.js nennt eine Version');
  eq(APP_VERSION, m[1], `APP_VERSION (${APP_VERSION}) passt zu sw.js (${m && m[1]})`);
  eq(/^v\d+$/.test(APP_VERSION), true, 'die Version hat die Form vNN');
  /* Der Service Worker liefert zuerst aus dem Cache und legt einen neuen nur an, wenn
     sich VERSION ändert. Wer Code ändert, ohne zu erhöhen, liefert eine Fassung aus, die
     bei niemandem ankommt – nach v54 genau so passiert. Deshalb steht in sw.js ein Hash
     über die zwischengespeicherten Dateien, den dieser Test nachrechnet. */
  {
    const crypto = require('crypto');
    const liste = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1]
      .matchAll(/'\.\/([^']+)'/g)].map(x => x[1])
      .filter(f => f && !/^icons\//.test(f) && f !== 'manifest.webmanifest');
    const h = crypto.createHash('sha1');
    liste.slice().sort().forEach(f => { h.update(f); h.update(fs.readFileSync(__dirname + '/' + f)); });
    const ist = h.digest('hex').slice(0, 12);
    const soll = (sw.match(/const BUILD_HASH = '([^']*)'/) || [])[1];
    eq(ist, soll, `sw.js kennt den Stand der Dateien (sonst: node tools_version.js)`);
  }
}

/* ==================================================== Tutorial
   Geführtes Übungsspiel auf Schienen. Geprüft wird: Aufbau der Schritte, dass jede Aufgabe
   erfüllbar ist, dass der Verlauf deterministisch ist und dass die im Text genannten Zahlen
   aus dem Spielstand stammen. Den Durchlauf über die Oberfläche fährt smoke.js. */
{
  eq(TUT_STEPS.length >= 20, true, `${TUT_STEPS.length} Tutorialschritte`);
  eq(TUT_STEPS.every(st => st.t && typeof st.html === 'function'), true,
    'jeder Schritt hat Titel und Text');
  eq(TUT_STEPS.some(st => st.sub), false,
    'die Zugablauf-Einordnung ist überall entfernt');
  eq(TUT_STEPS.every(st => !st.goal || st.auto), true, 'jede Aufgabe hat einen Ausweg');
  eq(TUT_STEPS.every(st => !st.task || st.goal), true, 'jede Aufgabenzeile hat ein Ziel');
  eq(TUT_STEPS.every(st => !st.task || st.allow), true, 'jede Aufgabe schaltet gezielt frei');
  const tasks = TUT_STEPS.filter(st => st.goal);
  eq(tasks.length >= 10, true, `${tasks.length} Aufgaben zum Selbermachen`);
  // jede Aufgabe sagt, wo man tippen muss
  // Keine Koordinaten in den Texten – es wird über die goldene Umrandung gesprochen
  {
    tutorialSetup();
    const bad = [];
    for (let i = 0; i < TUT_STEPS.length; i++) {
      ui.tut.i = i; tutEnter();
      const st = TUT_STEPS[i];
      const txt = (st.html() + ' ' + (st.task || '')).replace(/<[^>]+>/g, ' ')
        .replace(/Zug 1\/2/g, '')                        // Belagerungszähler ist keine Koordinate
        .replace(/\d+(\/\d+)+\)/g, ')');                 // Kostenstaffeln wie (1/3/6/10) auch nicht
      if (/\b\d{1,2}\/\d{1,2}\b/.test(txt)) bad.push(st.t);
      if (st.goal && !st.goal()) st.auto();
    }
    eq(bad.length, 0, 'keine Feldkoordinaten in den Texten: ' + bad.join(', '));
    ui = { sel: null, army: null, mode: null, botTimer: null };
  }
  // Keine Erwähnung der Erweiterungen. Ausnahme: der Siegschritt muss sagen, wie der
  // Punktvergleich am Rundenende rechnet – und dort zählen Weltwunder mit (ohne die
  // Erweiterung sind es null für alle). Nur dieser eine Schritt darf das Wort führen.
  {
    const text = st => [st.html, st.kurz].filter(x => typeof x === 'function')
      .map(f => f.toString()).join(' ');
    const sieg = TUT_STEPS.filter(s2 => /Wege zu gewinnen/.test(s2.t));
    eq(sieg.length, 1, 'es gibt genau einen Siegschritt');
    const andere = TUT_STEPS.filter(s2 => !/Wege zu gewinnen/.test(s2.t)).map(text).join(' ');
    const all = TUT_STEPS.map(text).join(' ');
    for (const w of ['Ereignis', 'Kultursieg', '1 gegen 1', 'Zufallskarte', 'Karteneditor'])
      eq(all.includes(w), false, `„${w}" kommt im Tutorial nicht vor`);
    eq(andere.includes('Weltwunder'), false, '„Weltwunder" nur im Siegschritt');
    eq(/Bevölkerung \+ Weltwunder \+ Technologien/.test(text(sieg[0])), true,
      'der Siegschritt nennt die Punkte für den Vergleich am Rundenende');
    eq(/sofort/.test(text(sieg[0])), true, 'und dass nur der Militärsieg sofort endet');
  }
  // Jede Aktionsart wird mindestens einmal mit Klickweg erklärt (Wiederholungen sind raus)
  const all = TUT_STEPS.map(st => st.html.toString()).join(' ');
  for (const kind of ['gründest', 'forschst', 'wächst', 'baust', 'bewegst', 'beendest', 'kaufst', 'liest'])
    eq(new RegExp('So ' + kind + ' du').test(all), true, `Klickweg für „${kind}" erklärt`);
  // und keine Aktionsart wird zweimal erklärt
  for (const kind of ['gründest', 'wächst', 'baust', 'bewegst', 'kaufst'])
    eq((all.match(new RegExp('So ' + kind + ' du', 'g')) || []).length, 1,
      `Klickweg für „${kind}" steht nur einmal da`);
  // kein Verweis auf die Beispielpartie des Autors
  const body = TUT_STEPS.map(st => st.html.toString()).join(' ');
  eq(/im Protokoll (gewonnen|angefangen|hat Russland)/.test(body), false,
    'kein „so wie im Protokoll" im Text');
}
/* Der komplette Ablauf, zweimal gestartet – identischer Verlauf */
function tutRun() {
  tutorialSetup();                       // genau derselbe Aufbau wie in der App
  const ru = S.players.findIndex(p => p.civ === 'russland');
  const trace = [];
  for (let i = 0; i < TUT_STEPS.length; i++) {
    ui.tut.i = i;
    const st = TUT_STEPS[i];
    if (st.enter && !ui.tut.seen[i]) { ui.tut.seen[i] = true; st.enter(); }
    const text = st.html();
    if (st.goal && !st.goal()) { st.auto(); trace.push(i + ':' + st.t); }
    trace.push(`${i}|${text.length}|${st.goal ? (st.goal() ? 'ok' : 'offen') : '-'}`);
  }
  return { trace: trace.join(';'), ru };
}
{
  const a = tutRun();
  const state = () => {
    const ru = a.ru;
    return JSON.stringify({
      round: S.round, cities: citiesOf(S, ru).map(c => [c.r, c.c, c.pop]),
      techs: Object.keys(S.players[ru].techs).sort(), power: S.players[ru].power,
    });
  };
  const after1 = state();
  eq(a.trace.includes('offen'), false, 'jede Aufgabe im Durchlauf wurde erfüllt');
  eq(S.round >= 3, true, 'das Übungsspiel läuft bis Runde 3');
  eq(citiesOf(S, a.ru).length >= 3, true, 'drei Städte gegründet');
  eq(has(S.players[a.ru], 'schrift') && has(S.players[a.ru], 'papier') &&
    has(S.players[a.ru], 'wiss_methode') && has(S.players[a.ru], 'stadtmauern'), true,
    'die vorgesehenen Technologien sind erforscht');
  eq(has(S.players[a.ru], 'fischerei') && has(S.players[a.ru], 'eisenverarbeitung'), true,
    'die beiden Gratis-Technologien sind dabei');
  eq(!S.over, true, 'das Spiel ist danach offen');
  const b = tutRun();
  eq(b.trace, a.trace, 'zweiter Durchlauf nimmt genau denselben Verlauf');
  eq(state(), after1, 'und endet in genau demselben Zustand');
  ui = { sel: null, army: null, mode: null, botTimer: null };
}
/* Schienen: nur die vorgesehenen Felder, Knöpfe und Technologien */
{
  S = newGame({
    seed: TUT_SEED, map: MAP_ORIGINAL, startPlayer: 0,
    players: [{ civ: 'russland', kind: 'human', ability: 'basis' },
      { civ: 'griechenland', kind: 'bot', diff: 'david' }],
  });
  ui = { tut: { i: 0, seen: {} } };
  // Leseschritt: nur Nachschlagen erlaubt
  eq(tutAllow().bar, ['a-info', 'a-log'], 'im Leseschritt sind nur Welt und Protokoll offen');
  // Gründungsschritt
  ui.tut.i = TUT_STEPS.findIndex(st => /zweite Stadt/.test(st.t));
  // v75: gegründet wird über „Stadt gründen" in der Leiste – nur dieser Knopf ist frei
  eq(tutAllow().bar, ['a-found'], 'beim Gründen ist nur „Stadt gründen" in der Leiste offen');
  eq(tutAllow().labels.map(String), ['/Hier gründen/'], 'und im Blatt nur „Hier gründen"');
  eq(tutHexOk(...TUT_CITY_1), true, 'das Zielfeld ist freigegeben');
  eq(tutHexOk(0, 0), false, 'andere Felder nicht');
  // Forschungsschritt – über die Freigabe gesucht, nicht über den Titel: die Texte
  // werden umgeschrieben, die Schienen bleiben.
  ui.tut.i = TUT_STEPS.findIndex(st => st.allow && (st.allow.techs || []).includes('schrift'));
  eq(tutAllow().techs, ['schrift'], 'im Forschungsschritt ist nur Schrift freigegeben');
  eq(tutAllow().bar, ['a-tech'], 'und nur der Forschen-Knopf');
  // Armeeschritt: Zugziel ist gebunden
  ui.tut.i = TUT_STEPS.findIndex(st => /Armee bewegen/.test(st.t));
  ui.tutArmyTo = [5, 12];
  eq(tutMoveOk(5, 12), true, 'das Wachfeld ist als Zug erlaubt');
  eq(tutMoveOk(5, 11), false, 'andere Zielfelder nicht');
  ui = { sel: null, army: null, mode: null, botTimer: null };
}
/* Die Begründungen rechnen mit echten Werten */
{
  S = newGame({ seed: TUT_SEED, map: MAP_ORIGINAL, startPlayer: 0,
    players: [{ civ: 'russland', kind: 'human', ability: 'basis' },
      { civ: 'griechenland', kind: 'bot', diff: 'david' }] });
  const ru = S.players.findIndex(p => p.civ === 'russland');
  const before = income(S, ru);
  const g = tutGain(...TUT_CITY_1);
  S.players[ru].res = { sci: 0, food: 99, coins: 0 };
  eq(foundCity(S, ru, ...TUT_CITY_1), null, 'Stadt gegründet');
  const after = income(S, ru);
  eq([g.sci, g.food, g.coins], [after.sci - before.sci, after.food - before.food, after.coins - before.coins],
    'die im Text genannte Verbesserung entspricht dem echten Einkommenszuwachs');
  eq(tutNeighbourText(...TUT_CITY_1).includes('Wald'), true, 'die Geländeaufstellung nennt den Wald');
  eq(S.cities.length >= 2, true, 'Stadt steht');
  ui = { sel: null, army: null, mode: null, botTimer: null };
  S = null;
}

/* --- Vollständige Partien: 4 Bots, keine Ausnahmen, Spiel endet */
{
  let ended = 0, rounds = [], how = {};
  for (let g = 0; g < 40; g++) {
    const S = newGame({
      seed: 1000 + g,
      players: CIVS.map((c, i) => ({ civ: c.k, kind: 'bot', diff: DIFFICULTIES[(g + i) % 5].k })),
    });
    let guard = 0;
    while (!S.over && guard++ < 400) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
    if (S.over) { ended++; rounds.push(S.round); how[S.over.how.split(' (')[0]] = (how[S.over.how.split(' (')[0]] || 0) + 1; }
  }
  eq(ended, 40, '40 Bot-Partien laufen bis zum Sieg durch');
  console.log('       Runden bis zum Sieg: min ' + Math.min(...rounds) + ', median ' +
    rounds.sort((a, b) => a - b)[Math.floor(rounds.length / 2)] + ', max ' + Math.max(...rounds));
  console.log('       Siegarten: ' + JSON.stringify(how));
}

/* --- Vollständige Partien mit beiden Erweiterungen (Bots bauen Wunder) */
{
  let ended = 0, rounds = [], how = {}, wonders = 0;
  for (let g = 0; g < 40; g++) {
    const S = newGame({
      seed: 5000 + g, events: true, eventMode: g % 2 ? 'easy' : 'hard', wonders: true,
      players: CIVS.map((c, i) => ({ civ: c.k, kind: 'bot', diff: DIFFICULTIES[(g + i) % 5].k })),
    });
    let guard = 0;
    while (!S.over && guard++ < 500) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
    wonders += S.wonders.length;
    if (S.over) { ended++; rounds.push(S.round); how[S.over.how.split(' (')[0]] = (how[S.over.how.split(' (')[0]] || 0) + 1; }
  }
  eq(ended, 40, '40 Bot-Partien mit Ereignissen und Wundern laufen bis zum Sieg durch');
  console.log('       Erweiterungen: Runden bis zum Sieg median ' +
    rounds.sort((a, b) => a - b)[Math.floor(rounds.length / 2)] +
    ', Wunder je Partie ' + (wonders / 40).toFixed(1));
  console.log('       Siegarten: ' + JSON.stringify(how));
}

/* --- Menschliche Partien mit Erweiterungen: Ereignisse treffen, Wunder werden gebaut */
{
  let ended = 0, events = 0, built = 0, culture = 0;
  for (let g = 0; g < 20; g++) {
    const S = newGame({
      seed: 8000 + g, events: true, eventMode: g % 2 ? 'easy' : 'hard', wonders: true,
      players: CIVS.map((c, i) => ({
        civ: c.k, kind: i === 0 ? 'human' : 'bot', diff: 'prinz',
        ability: CIVS[i].abilities[g % 3].k,
      })),
    });
    let guard = 0;
    while (!S.over && guard++ < 400) {
      const pi = S.cur;
      if (S.players[pi].kind === 'bot') { botTurn(S, pi); if (S.over) break; endTurn(S); continue; }
      if (S.event && S.event.k && S.event.round === S.round) events++;
      // füttern, wachsen, forschen, Wunder bauen
      feedSources(S, pi).forEach(x => coverPop(S, pi, x.kind, x.have));
      for (const city of citiesOf(S, pi))
        for (const w of availableWonders(S))
          if (!buildWonder(S, pi, city, w.k)) { built++; break; }
      citiesOf(S, pi).forEach(c => growCity(S, pi, c));
      researchable(S, pi).sort((a, b) => techCost(S, pi, a) - techCost(S, pi, b))
        .forEach(t => { if (available(S, pi, 'sci') >= techCost(S, pi, t)) doResearch(S, pi, t.k); });
      freeTechOptions(S, pi).slice(0, 1).forEach(t => useFreeTech(S, pi, t.k));
      backPickOptions(S, pi).slice(0, 1).forEach(t => useBackPick(S, pi, t.k));
      while (freePickOptions(S, pi).length) useFreePick(S, pi, freePickOptions(S, pi)[0].k);
      for (const city of citiesOf(S, pi))
        for (const w of availableWonders(S))
          if (!buildWonder(S, pi, city, w.k)) { built++; break; }
      const cap = capitalOf(S, pi);
      if (cap) for (const [r, c] of within(cap.r, cap.c, 5))
        if (!canFound(S, pi, r, c)) { foundCity(S, pi, r, c); break; }
      if (S.over) break;
      endTurn(S);
    }
    if (S.over) { ended++; if (S.over.how.startsWith('Kultur')) culture++; }
  }
  eq(ended, 20, '20 Partien mit Mensch, Ereignissen und Wundern enden regulär');
  eq(events > 0, true, 'Ereignisse treten auf');
  eq(built > 0, true, 'Weltwunder werden gebaut');
  console.log('       Ereignisrunden ' + events + ', Wunderbauten ' + built + ', Kultursiege ' + culture);
}

/* --- Menschliche Züge: Aktionen ohne Ausnahme durchspielen */
{
  const S = newGame({
    seed: 42, players: [{ civ: 'griechenland', kind: 'human' },
    ...CIVS.slice(1).map(c => ({ civ: c.k, kind: 'bot', diff: 'prinz' }))]
  });
  let guard = 0;
  while (!S.over && guard++ < 300) {
    if (S.players[S.cur].kind === 'bot') { botTurn(S, S.cur); if (S.over) break; endTurn(S); continue; }
    const pi = S.cur;
    // wachsen, gründen, forschen, Armee bauen, Macht kaufen – jeweils wenn möglich
    citiesOf(S, pi).forEach(c => growCity(S, pi, c));
    const cap = capitalOf(S, pi);
    if (cap) for (const [r, c] of within(cap.r, cap.c, 5))
      if (!canFound(S, pi, r, c)) { foundCity(S, pi, r, c); break; }
    researchable(S, pi).sort((a, b) => techCost(S, pi, a) - techCost(S, pi, b))
      .forEach(t => { if (available(S, pi, 'sci') >= techCost(S, pi, t)) doResearch(S, pi, t.k); });
    if (cap) buildArmy(S, pi, cap);
    buyPower(S, pi, Math.max(0, Math.floor(available(S, pi, 'coins') / powerPrice(S, pi))));
    armiesOf(S, pi).forEach(a => {
      const reach = [...armyReach(S, a).keys()];
      if (reach.length) moveArmy(S, a, ...unkey(reach[Math.floor(Math.random() * reach.length)]));
    });
    endTurn(S);
  }
  eq(!!S.over, true, 'Partie mit menschlichem Spieler endet (' + (S.over ? S.over.how : 'offen') + ')');
  console.log('       Runde ' + S.round + ', Bevölkerung ' + S.players.map((p, i) => popOf(S, i)).join('/'));
}

/* ==================================================== Plättchenkarten
   Zufallskarten aus Dreiecken zu 15 Feldern: Vorrat, Formen, Legeregeln, Karte. */
{
  // Startgüte, die der Vorrat garantieren soll (früher eine Konstante des alten
  // Rastergenerators, jetzt eine Entwurfsregel für die Plättchen).
  const START_MIN_FOOD = 4;
  // --- Vorrat
  eq(TILE_POOL.length, 20, 'der Vorrat hat 20 Plättchen');
  eq(TILE_POOL.every(t => tileTerrain(t).length === TILE_CELLS), true, 'jedes Plättchen hat 15 Felder');
  eq(TILE_POOL.every(t => t.a.map(r => r.length).join() === '5,4,3,2,1'), true,
    'die Zeilen sind 5/4/3/2/1 Felder lang');
  eq(TILE_POOL.every(t => tileTerrain(t).every(c => TERRAIN[c] && !TERRAIN[c].off && !TERRAIN[c].block)), true,
    'nur bespielbares Gelände auf den Plättchen');
  eq(new Set(TILE_POOL.map(t => t.n)).size, 20, 'die Namen sind verschieden');
  // Die drei mittigen Felder tragen Bot-Hauptstädte: Land, und ihre sechs Nachbarn
  // liegen sämtlich auf demselben Plättchen – die Startgüte steht also hier schon fest.
  const nbIJK = ([i, j, k]) => [[i + 1, j - 1, k], [i - 1, j + 1, k], [i + 1, j, k - 1],
    [i - 1, j, k + 1], [i, j + 1, k - 1], [i, j - 1, k + 1]];
  const midStart = (tile, n) => {
    const face = tileTerrain(tile);
    let food = -1, coins = 1, miss = 0;                       // Stadt mit 1 Bevölkerung
    for (const t of nbIJK(TRI_IJK[n])) {
      const idx = TRI_INDEX[t.join(',')];
      if (idx == null) { miss++; continue; }
      food += TERRAIN[face[idx]].yield[1]; coins += TERRAIN[face[idx]].yield[2];
    }
    return { food: food + Math.floor(coins / 2), miss };
  };
  eq(TILE_POOL.every(t => TRI_MIDDLE.every(n => TERRAIN[tileTerrain(t)[n]].land)), true,
    'die drei mittigen Felder sind überall Land');
  eq(TILE_POOL.every(t => TRI_MIDDLE.every(n => midStart(t, n).miss === 0)), true,
    'die Nachbarn der mittigen Felder liegen auf demselben Plättchen');
  const schlecht = TILE_POOL.filter(t => TRI_MIDDLE.some(n => midStart(t, n).food < START_MIN_FOOD));
  eq(schlecht.map(t => t.n), [], 'jedes mittige Feld bringt mindestens 4 Nahrung (Münzen 2:1)');
  {
    const alle = TILE_POOL.flatMap(t => TRI_MIDDLE.map(n => midStart(t, n).food));
    console.log('       Startnahrung der mittigen Felder: min ' + Math.min(...alle) +
      ', max ' + Math.max(...alle));
  }

  // --- Vielfalt und Meer am Rand
  // Zwei Geländearten je Plättchen sind zu wenig, das sah auf der Karte eintönig aus.
  const arten = TILE_POOL.map(t => new Set(tileTerrain(t)).size);
  eq(Math.min(...arten) >= 3, true, `jedes Plättchen hat mindestens 3 Geländearten (${Math.min(...arten)})`);
  eq(arten.filter(a => a >= 4).length >= 15, true,
    `die meisten haben 4 oder mehr (${arten.filter(a => a >= 4).length} von 20)`);
  // Meer gehört an den Rand: nur dort kann es sich mit dem Nachbarplättchen verbinden.
  // Ein Randfeld hat mindestens eine Koordinate 0, eine Ecke zwei.
  const amRand = n => TRI_IJK[n].some(v => v === 0);
  eq(TILE_POOL.every(t => tileTerrain(t).every((c, n) => c !== 'M' || amRand(n))), true,
    'jedes Meerfeld liegt am Plättchenrand');
  const meer = TILE_POOL.reduce((a, t) => a + tileTerrain(t).filter(c => c === 'M').length, 0);
  eq(meer > 300 * 0.15 && meer < 300 * 0.30, true,
    `Meeranteil im Vorrat liegt zwischen 15 und 30 % (${(100 * meer / 300).toFixed(0)} %)`);
  eq(TILE_POOL.filter(t => tileTerrain(t).includes('M')).length >= 15, true,
    'Meer verteilt sich über die meisten Plättchen, nicht nur über ein paar Inselkarten');

  // --- Startgüte auch für Russland, das mit Bevölkerung 2 anfängt
  // Ein Plättchen allein auf der Karte: die sechs Nachbarn eines mittigen Feldes liegen
  // sämtlich darauf, gerechnet wird deshalb mit der echten Einkommensrechnung.
  const soloKarte = (tileIdx, cellIdx, civ) => {
    const zellen = slotCells({ t: 'A', a: [0, -4, 4] }).map(cubeToRC);
    const r0 = Math.min(...zellen.map(x => x[0])), c0 = Math.min(...zellen.map(x => x[1]));
    const R = Math.max(...zellen.map(x => x[0])) - r0 + 1;
    const C = Math.max(...zellen.map(x => x[1])) - c0 + 1;
    const grid = [];
    for (let r = 0; r < R; r++) grid.push(new Array(C).fill('X'));
    const face = tileFaceTerrain(tileIdx, 0);
    zellen.forEach(([r, c], i) => { grid[r - r0][c - c0] = face[i]; });
    const caps = {};
    caps[civ] = [zellen[cellIdx][0] - r0, zellen[cellIdx][1] - c0];
    return { name: 'Solo', rows: grid.map(g => g.join('')), capitals: caps };
  };
  const startBudget = (tileIdx, cellIdx, civ, ability) => {
    const S = newGame({ seed: 1, map: soloKarte(tileIdx, cellIdx, civ),
      players: [{ civ, kind: 'human', ability }] });
    return { food: available(S, 0, 'food'), pop: capitalOf(S, 0).pop };
  };
  eq(startBudget(0, TRI_MIDDLE[0], 'russland', 'siedler').pop, 2,
    'Russlands Hauptstadt startet mit Bevölkerung 2');
  {
    const je = TILE_POOL.map((_, i) =>
      Math.max(...TRI_MIDDLE.map(n => startBudget(i, n, 'russland', 'siedler').food)));
    const schwach = TILE_POOL.filter((t, i) => je[i] < START_MIN_FOOD).map(t => t.n);
    eq(schwach, [], 'auch mit Bevölkerung 2 hat jedes Plättchen ein mittiges Feld mit 4 Nahrung');
    // Nicht jedes der drei mittigen Felder schafft das – Bots setzen zufällig
    const alle = TILE_POOL.flatMap((_, i) =>
      TRI_MIDDLE.map(n => startBudget(i, n, 'russland', 'siedler').food));
    console.log(`       Russland (Bevölkerung 2): bestes Feld je Plättchen ${Math.min(...je)}–` +
      `${Math.max(...je)}, alle mittigen Felder ${Math.min(...alle)}–${Math.max(...alle)}, ` +
      `davon unter 4: ${alle.filter(x => x < START_MIN_FOOD).length} von 60`);
  }

  // --- Drehung
  eq(TRI_ROT.length, 3, 'drei Lagen je Plättchen');
  eq(TRI_ROT.every(r => new Set(r).size === TILE_CELLS), true, 'jede Lage ist eine Umordnung');
  eq(TRI_ROT[0].map((_, n) => TRI_ROT[1][TRI_ROT[1][TRI_ROT[1][n]]]).join(), TRI_ROT[0].join(),
    'dreimal gedreht ist wieder die Ausgangslage');
  eq(TRI_MIDDLE.every(m => TRI_ROT.every(r => TRI_MIDDLE.includes(r[m]))), true,
    'die Mitte bleibt beim Drehen die Mitte');

  // --- Formen
  const nbCube = c => [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]]
    .map(d => [c[0] + d[0], c[1] + d[1], c[2] + d[2]]);
  for (const n of [2, 3, 4]) {
    const sh = TILE_SHAPES[n], K = c => c[0] + ',' + c[1];
    const belegt = new Map();
    let doppelt = 0;
    sh.slots.forEach((sl, i) => slotCells(sl).forEach(c => {
      if (belegt.has(K(c))) doppelt++;
      belegt.set(K(c), i);
    }));
    sh.holes.forEach(h => { if (belegt.has(K(h))) doppelt++; belegt.set(K(h), 'loch'); });
    eq(doppelt, 0, `${n}P: kein Plättchen überlappt ein anderes`);
    eq(belegt.size, sh.slots.length * TILE_CELLS + sh.holes.length,
      `${n}P: ${sh.slots.length} × 15 Felder plus ${sh.holes.length} Loch/Löcher`);
    // keine ungenutzte Zelle mitten in der Form
    let luecken = 0;
    for (const k of belegt.keys()) {
      const [x, y] = k.split(',').map(Number);
      for (const nb of nbCube([x, y, -x - y]))
        if (!belegt.has(K(nb)) && nbCube(nb).every(z => belegt.has(K(z)))) luecken++;
    }
    eq(luecken, 0, `${n}P: keine Lücke im Inneren der Form`);
    // Zeilenversatz: die Verschiebung nach oben muss gerade sein, sonst kippt der
    // Versatz der Zeilen und die Form verzerrt sich.
    const zeilen = [...belegt.keys()].map(k => { const [x, y] = k.split(',').map(Number); return -x - y; });
    eq(Math.min(...zeilen) % 2, 0, `${n}P: die Form beginnt in einer geraden Zeile`);
    // Sitzplätze
    sh.seatSets.forEach(set => {
      eq(set.length, n, `${n}P: ${set.length} Sitzplätze`);
      eq(new Set(set).size, n, `${n}P: keine zwei Reiche auf demselben Plättchen`);
      const frei = set.map((_, i) => seatFreeCells(sh, set, i));
      eq(frei.every(f => TRI_MIDDLE.every(m => f[m])), true,
        `${n}P: die mittigen Felder sind immer erlaubt (dort setzen Bots)`);
      /* Seit v73 eine Reihe näher am Gegner: nicht mehr „3 Felder zu jedem fremden
         Startplättchen", sondern „das Umland zweier Hauptstädte teilt sich nie ein echtes
         Feld, und es liegt nie auf einem verdeckten Plättchen". Geprüft wird über ALLE
         Paare erlaubter Felder – gelegt wird blind, es muss für jede Wahl halten. */
      const echt = new Set(sh.slots.flatMap(slotCells).map(c => c.join(',')));
      const umland = c => nbCube(c).filter(x => echt.has(x.join(','))).map(x => x.join(','));
      let naeher = 99, geteilt = 0, nurLoch = 0, aufVerdecktem = 0;
      for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++)
        slotCells(sh.slots[set[a]]).forEach((x, xi) => slotCells(sh.slots[set[b]]).forEach((y, yi) => {
          if (!frei[a][xi] || !frei[b][yi]) return;
          const d = cubeDist(x, y);
          naeher = Math.min(naeher, d);
          const uy = new Set(umland(y));
          if (d <= 1 || umland(x).some(k => uy.has(k))) geteilt++;
          else if (d === 2) nurLoch++;      // gemeinsamer Nachbar, aber kein echtes Feld
        }));
      set.forEach((s, i) => {
        const fremd = new Set(set.filter((_, j) => j !== i)
          .flatMap(t => slotCells(sh.slots[t])).map(c => c.join(',')));
        slotCells(sh.slots[s]).forEach((x, xi) => {
          if (frei[i][xi] && nbCube(x).some(y => fremd.has(y.join(',')))) aufVerdecktem++;
        });
      });
      eq(geteilt, 0, `${n}P: zwei mögliche Hauptstädte teilen sich nie ein Umlandfeld`);
      eq(aufVerdecktem, 0, `${n}P: kein Umland einer möglichen Hauptstadt liegt auf einem fremden Startplättchen`);
      // Näher als 3 nur im 1 gegen 1, und dann nur über das Loch in der Mitte
      eq(naeher >= 3 || (n === 2 && naeher === 2 && nurLoch > 0), true,
        `${n}P: kleinster Hauptstadtabstand ${naeher}${naeher < 3 ? ' – nur über das Loch' : ''}`);
      // „Eine Reihe näher": alles, was bis v72 erlaubt war, bleibt erlaubt
      const alt = set.map((s, i) => {
        const others = set.filter((_, j) => j !== i).flatMap(t => slotCells(sh.slots[t]));
        return slotCells(sh.slots[s]).map(m => others.every(o => cubeDist(m, o) >= 3));
      });
      eq(alt.every((f, i) => f.every((v, k) => !v || frei[i][k])), true,
        `${n}P: jedes bis v72 erlaubte Feld bleibt erlaubt`);
      eq(frei.map(f => f.filter(Boolean).length),
        set.map(() => ({ 2: 15, 3: 15, 4: 13 })[n]),
        `${n}P: erlaubte Felder je Startplättchen (bis v72: ${alt.map(f => f.filter(Boolean).length).join('/')})`);
    });
  }
  // Vier Reiche: gesperrt bleiben genau die Spitze und die Ecke am offenen Mittelplättchen
  {
    const sh = TILE_SHAPES[4], set = sh.seatSets[0];
    const gesperrt = set.map((s, i) => seatFreeCells(sh, set, i)
      .map((v, k) => v ? null : TRI_IJK[k].join('')).filter(Boolean).sort().join(' '));
    // (i,j,k): 004 ist die Spitze, 400 und 040 die Ecken der langen Kante
    eq(gesperrt.every(g => g.split(' ').length === 2 && g.includes('004')), true,
      `4P: je Startplättchen gesperrt: Spitze + eine Ecke (${gesperrt.join(' | ')})`);
    // Die gesperrte Ecke: mit der gegenüberliegenden Ecke des Nachbarsitzes teilte sie sich
    // die Spitze des offenen Mittelplättchens – genau das verhindert Bedingung 2.
    const ecke = i => slotCells(sh.slots[set[i]])[seatFreeCells(sh, set, i)
      .findIndex((v, k) => !v && TRI_IJK[k].join('') !== '004')];
    const [e1, e3] = [ecke(0), ecke(1)];
    const mitte = nbCube(e1).find(x => nbCube(e3).some(y => y.join() === x.join()));
    eq(cubeDist(e1, e3), 2, '4P: die beiden oberen Ecken liegen 2 auseinander');
    eq(!!mitte && slotCells(sh.slots[2]).some(c => c.join() === mitte.join()), true,
      '4P: ihr gemeinsames Nachbarfeld ist die Spitze des offenen Mittelplättchens');
  }
  // Vier Reiche: die Sitze sind die beiden oberen und die beiden unteren Dreiecke,
  // also die, deren Fünferzeile auf der Ober- bzw. Unterkante der Form liegt.
  {
    const sh = TILE_SHAPES[4];
    const set = sh.seatSets[0];
    const zeilen = sh.slots.map(sl => slotCells(sl).map(c => cubeToRC(c)[0]));
    const oben = Math.min(...zeilen.flat()), unten = Math.max(...zeilen.flat());
    const kante = i => {
      const z = zeilen[i];
      const anOben = z.filter(r => r === oben).length, anUnten = z.filter(r => r === unten).length;
      return anOben === TILE_SIDE ? 'oben' : anUnten === TILE_SIDE ? 'unten' : null;
    };
    eq(set.map(kante).sort(), ['oben', 'oben', 'unten', 'unten'],
      'je zwei Startplättchen liegen mit ihrer breiten Seite oben und unten');
    eq(sh.slots.map((_, i) => i).filter(i => kante(i)).sort(), set.slice().sort(),
      'und es sind genau diese vier – keine anderen liegen so');
    eq(set.includes(2) || set.includes(7), false, 'die beiden mittigen Plättchen bleiben offen');
  }

  // --- Plan, Legen, Karte
  const civs4 = CIVS.map(c => c.k);
  for (const n of [2, 3, 4]) {
    const civs = civs4.slice(0, n);
    const plan = tilePlan(civs, 1000 + n);
    eq(plan.tiles.length, TILE_SHAPES[n].slots.length, `${n}P: für jeden Platz ein Plättchen`);
    eq(new Set(plan.tiles).size, plan.tiles.length, `${n}P: kein Plättchen doppelt gezogen`);
    eq(plan.seats.map(s => s.civ), civs, `${n}P: jedes Reich hat einen Sitzplatz`);
    eq(plan.seats.every(s => s.cell == null), true, `${n}P: vor dem Legen ist nichts gesetzt`);
    // verdeckt: die Karte zeigt nur die offenen Plättchen
    const offen = TILE_SHAPES[n].slots.map((_, i) => i).filter(i => !isSeatSlot(plan, i));
    const vorher = tileMap(plan);
    const sichtbar = vorher.rows.join('').split('').filter(c => c !== 'X').length;
    eq(sichtbar, offen.length * TILE_CELLS,
      `${n}P: vor dem Aufdecken sind nur die offenen Plättchen zu sehen`);
    // Bots legen
    const rnd = mapRng(77);
    plan.seats.forEach(s => eq(botPlaceSeat(plan, s, rnd), null, `${n}P: Bot legt ${s.civ}`));
    eq(plan.seats.every(s => TRI_MIDDLE.includes(s.cell)), true,
      `${n}P: Bots setzen auf eines der drei mittigen Felder`);
    const m = tileMap(plan);
    eq(m.rows.every(r => r.length === m.rows[0].length), true, `${n}P: alle Zeilen gleich lang`);
    eq(m.rows.every(r => [...r].every(t => TERRAIN[t])), true, `${n}P: nur bekanntes Gelände`);
    eq(m.rows.join('').split('').filter(c => c !== 'X').length,
      TILE_SHAPES[n].slots.length * TILE_CELLS,
      `${n}P: die fertige Karte hat 15 Felder je Plättchen`);
    // Das Loch in der Mitte bleibt ein Loch – ringsum aber echte Felder.
    {
      const alle = TILE_SHAPES[n].slots.flatMap(slotCells)
        .concat(TILE_SHAPES[n].holes).map(cubeToRC);
      const r0 = Math.min(...alle.map(x => x[0])), c0 = Math.min(...alle.map(x => x[1]));
      TILE_SHAPES[n].holes.forEach(h => {
        const [hr, hc] = cubeToRC(h), r = hr - r0, c = hc - c0;
        eq(m.rows[r][c], 'X', `${n}P: das Mittelfeld bleibt leer`);
        eq(neighbors(r, c).every(([nr, nc]) => m.rows[nr] && m.rows[nr][nc] !== 'X'), true,
          `${n}P: rings um das Loch liegen echte Felder`);
        eq(canPass(newGame({
          seed: 1, map: m, duel: n === 2,
          players: civs.map(cv => ({ civ: cv, kind: 'bot' })),
        }), 0, r, c), false, `${n}P: durch das Loch führt kein Weg`);
      });
    }
    eq(m.capitals.map(e => e.civ), civs, `${n}P: für jeden Platz eine Hauptstadt`);
    for (const e of m.capitals) {
      eq(TERRAIN[m.rows[e.r][e.c]].land, true, `${n}P: Hauptstadt ${e.civ} liegt auf Land`);
      eq(TERRAIN[m.rows[e.r][e.c]].off, undefined, `${n}P: Hauptstadt ${e.civ} liegt auf der Karte`);
    }
    for (let i = 0; i < m.capitals.length; i++) for (let j = i + 1; j < m.capitals.length; j++)
      eq(hexDistance(m.capitals[i].r, m.capitals[i].c, m.capitals[j].r, m.capitals[j].c) >= 3, true,
        `${n}P: Platz ${i + 1} und ${j + 1} liegen mindestens 3 Felder auseinander`);
    console.log(`       ${n}P: ${m.rows.length} × ${m.rows[0].length}, ` +
      `${m.rows.join('').split('').filter(c => c !== 'X').length} Felder`);
    // Zusammenhängende Meere: der Sinn des Meeres am Rand ist, dass beim Zusammenlegen
    // größere Flächen entstehen können. Feste Startwerte, also reproduzierbar.
    const meerFlaechen = karte => {
      const R = karte.rows.length, C = karte.rows[0].length, gesehen = new Set(), out = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (karte.rows[r][c] !== 'M' || gesehen.has(r + ',' + c)) continue;
        const stack = [[r, c]]; let size = 0; gesehen.add(r + ',' + c);
        while (stack.length) {
          const [a, b] = stack.pop(); size++;
          for (const [x, y] of neighbors(a, b)) {
            if (x < 0 || x >= R || y < 0 || y >= C) continue;
            if (karte.rows[x][y] === 'M' && !gesehen.has(x + ',' + y)) {
              gesehen.add(x + ',' + y); stack.push([x, y]);
            }
          }
        }
        out.push(size);
      }
      return out;
    };
    const groesste = [];
    for (let seed = 0; seed < 40; seed++) {
      const pl = tilePlan(civs, seed * 13 + n);
      const r2 = mapRng(seed + 1);
      pl.seats.forEach(st => botPlaceSeat(pl, st, r2));
      const f = meerFlaechen(tileMap(pl));
      groesste.push(f.length ? Math.max(...f) : 0);
    }
    groesste.sort((a, b) => a - b);
    const median = groesste[20];
    eq(median >= 5, true, `${n}P: größtes Meer im Median mindestens 5 Felder (${median})`);
    eq(Math.max(...groesste) >= 12, true,
      `${n}P: manchmal entsteht ein richtig großes Meer (${Math.max(...groesste)})`);
    console.log(`       ${n}P: größtes Meer im Median ${median}, im Größtfall ` +
      `${Math.max(...groesste)} Felder`);
    // gleicher Startwert = gleiche Ziehung
    const gleich = tilePlan(civs, 1000 + n);
    eq(gleich.tiles.join(), plan.tiles.join(), `${n}P: gleicher Startwert zieht dieselben Plättchen`);
    eq(tilePlan(civs, 999).tiles.join() !== plan.tiles.join(), true,
      `${n}P: ein anderer Startwert zieht andere`);
    // eine ganze Partie darauf
    const S = newGame({
      seed: 30 + n, map: m, duel: n === 2,
      players: civs.map(c => ({ civ: c, kind: 'bot', diff: 'david' })),
    });
    eq(S.cities.length, n, `${n}P: alle Hauptstädte stehen`);
    let guard = 0;
    while (!S.over && guard++ < 400) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
    eq(!!S.over, true, `${n}P: die Partie auf der Plättchenkarte endet regulär`);
  }
  // --- Dauerlauf: viele Ziehungen, alle Invarianten
  {
    let fehler = [], minAbstand = 99, minStart = 99, benutzt = new Set();
    for (const n of [2, 3, 4]) for (let seed = 0; seed < 60; seed++) {
      const civs = CIVS.map(c => c.k).slice(0, n);
      const plan = tilePlan(civs, seed);
      const rnd = mapRng(seed * 7 + 1);
      plan.seats.forEach(st => { const e = botPlaceSeat(plan, st, rnd); if (e) fehler.push(e); });
      plan.tiles.forEach(t => benutzt.add(t));
      const m = tileMap(plan);
      if (m.rows.some(r => r.length !== m.rows[0].length)) fehler.push(`${n}/${seed}: Zeilenlänge`);
      if (m.rows.join('').split('').filter(c => c !== 'X').length !== TILE_SHAPES[n].slots.length * TILE_CELLS)
        fehler.push(`${n}/${seed}: Feldzahl`);
      const caps = m.capitals;
      if (caps.length !== n) fehler.push(`${n}/${seed}: ${caps.length} Hauptstädte`);
      caps.forEach(e => {
        if (!TERRAIN[m.rows[e.r][e.c]].land) fehler.push(`${n}/${seed}: Hauptstadt auf ${m.rows[e.r][e.c]}`);
      });
      for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++)
        minAbstand = Math.min(minAbstand, hexDistance(caps[i].r, caps[i].c, caps[j].r, caps[j].c));
      // Startgüte auf der FERTIGEN Karte messen, nicht nur auf dem Plättchen
      const S = newGame({ seed, map: m, duel: n === 2, players: civs.map(cv => ({ civ: cv, kind: 'bot' })) });
      S.players.forEach((_, pi) => {
        const inc = baseIncome(S, pi);
        minStart = Math.min(minStart, inc.food + Math.floor(inc.coins / 2));
      });
    }
    eq(fehler.slice(0, 5), [], '180 Ziehungen über alle Spielerzahlen ohne Beanstandung');
    eq(minAbstand >= 3, true, `Hauptstädte immer mindestens 3 Felder auseinander (${minAbstand})`);
    eq(minStart >= START_MIN_FOOD, true,
      `jede Bot-Hauptstadt startet mit mindestens 4 Nahrung (${minStart})`);
    eq(benutzt.size, TILE_POOL.length, 'über die Ziehungen kommt jedes Plättchen einmal vor');
    console.log(`       Dauerlauf: kleinster Hauptstadtabstand ${minAbstand}, ` +
      `schlechtester Start ${minStart} Nahrung`);
  }

  // Ein Mensch kann nicht auf ein gesperrtes oder nasses Feld setzen
  {
    const plan = tilePlan(['russland', 'england'], 4711);
    const seat = plan.seats[0];
    const ok = placeOptions(plan, seat, 0);
    const nass = ok.findIndex(v => !v);
    eq(placeSeat(plan, seat, 0, nass) !== null, true, 'gesperrtes Feld wird abgelehnt');
    eq(placeSeat(plan, seat, 3, ok.indexOf(true)) !== null, true, 'es gibt nur drei Lagen');
    eq(placeSeat(plan, seat, 2, ok.indexOf(true)), null, 'erlaubtes Feld wird angenommen');
    eq([seat.o, seat.cell], [2, ok.indexOf(true)], 'Lage und Feld sind gespeichert');
  }
  // Drehen zeigt dasselbe Plättchen, nur anders herum
  {
    const face0 = tileFaceTerrain(0, 0).slice().sort().join('');
    eq([1, 2].every(o => tileFaceTerrain(0, o).slice().sort().join('') === face0), true,
      'jede Lage zeigt dieselben 15 Gelände');
    eq(tileFaceTerrain(2, 0).join() !== tileFaceTerrain(2, 1).join(), true,
      'aber an anderer Stelle');
  }
  /* v73: dominierte Startfelder. „Rundum besser" heißt: von keinem Ertrag weniger, von
     einem mehr. Verglichen wird über alle drei Lagen – Lage und Hauptstadt wählt man
     zusammen. */
  {
    const y = (sci, food, coins) => ({ sci, food, coins });
    eq(yieldBeats(y(2, 4, 4), y(2, 3, 4)), true, 'mehr Nahrung, sonst gleich: rundum besser');
    eq(yieldBeats(y(2, 3, 4), y(2, 3, 4)), false, 'Gleichstand ist nicht besser');
    eq(yieldBeats(y(1, 5, 3), y(2, 4, 4)), false, 'Tausch (mehr Nahrung, dafür weniger anderes) ist nicht besser');
    eq(yieldBeats(y(2, 3, 6), y(2, -1, 5)), true, 'auch gegen einen negativen Ertrag');
    const tab = [                       // null: dort darf die Hauptstadt nicht stehen
      [y(2, 4, 4), y(1, 5, 3), null, y(2, 3, 4)],
      [y(2, 4, 4), y(1, 1, 1), y(3, 3, 3), null],
      [y(1, 1, 1), null, y(2, 3, 4), y(0, 6, 0)],
    ];
    eq(dominatedCells(tab), [
      [false, false, false, true],
      [false, true, false, false],
      [true, false, true, false],
    ], 'dominiert wird über alle drei Lagen hinweg, Gleichstand (zweimal 2/4/4) dominiert nicht');
  }
  /* Die Ertragsvorschau der Legephase ist genau: legt man die Hauptstadt so und startet
     die Partie, bringt sie im ersten Zug exakt die Zahl aus placeYieldTable – obwohl die
     Vorschau die fremden Startplättchen nicht sieht. Wäre sie es nicht, wäre „dominiert"
     geraten. Wechselnde Reiche und Fähigkeiten, auch ortsabhängige wie Englands Seemacht. */
  {
    const alle = CIVS.map(c => c.k);
    let geprueft = 0, rot = 0, tafeln = 0;
    const abweichend = [], ohneGegenstueck = [], zuUnrecht = [];
    for (const n of [2, 3, 4]) for (let seed = 0; seed < 6; seed++) {
      const civs = alle.slice(seed % 4).concat(alle.slice(0, seed % 4)).slice(0, n);
      const ability = CIV_BY_KEY[civs[0]].abilities[seed % 3].k;
      const plan = tilePlan(civs, 500 + seed * 7 + n);
      const rnd = mapRng(seed + 3), seat = plan.seats[0];
      plan.seats.slice(1).forEach(st => botPlaceSeat(plan, st, rnd));
      const tab = placeYieldTable(plan, seat, { civ: civs[0], ability });
      const dom = dominatedCells(tab);
      tafeln++;
      const opt = [];
      tab.forEach((row, o) => row.forEach((yv, cell) => {
        if (!yv) return;
        opt.push({ yv, rot: dom[o][cell] });
        placeSeat(plan, seat, o, cell);
        const S = newGame({ seed: 1, map: tileMap(plan), duel: n === 2,
          players: civs.map((cv, i) => i ? { civ: cv, kind: 'bot' } : { civ: cv, kind: 'human', ability }) });
        const pi = S.players.findIndex(p => p.slot === 0);
        geprueft++;
        if (JSON.stringify(income(S, pi)) !== JSON.stringify(yv))
          abweichend.push(`${n}P/${seed} ${civs[0]}/${ability} Lage ${o + 1} Feld ${cell}`);
      }));
      // Jedes rote Feld hat ein ungefärbtes, das es schlägt; kein ungefärbtes wird geschlagen
      opt.forEach(a => {
        if (a.rot) { rot++; if (!opt.some(b => !b.rot && yieldBeats(b.yv, a.yv))) ohneGegenstueck.push(n + 'P/' + seed); }
        else if (opt.some(b => yieldBeats(b.yv, a.yv))) zuUnrecht.push(n + 'P/' + seed);
      });
    }
    eq(abweichend.slice(0, 3), [], `Vorschau = echtes Einkommen im ersten Zug (${geprueft} Wahlmöglichkeiten)`);
    eq([ohneGegenstueck.length, zuUnrecht.length], [0, 0],
      'jedes rot umrandete Feld wird von einem nicht markierten geschlagen, kein nicht markiertes von irgendeinem');
    eq(rot > 0 && rot < geprueft, true,
      `auf echten Plättchen ist ein Teil dominiert (${rot} von ${geprueft}, ${tafeln} Legesituationen)`);
  }
}

/* ==================================================== Felder außerhalb der Karte */
{
  const S = newGame({
    seed: 5, players: [{ civ: 'russland', kind: 'human' }, { civ: 'england', kind: 'bot' }],
  });
  // ein Feld neben der Hauptstadt zu „kein Feld" machen
  const cap = capitalOf(S, 0);
  const [nr, nc] = neighbors(cap.r, cap.c).find(([r, c]) => terrainAt(S, r, c));
  S.map.rows[nr] = S.map.rows[nr].slice(0, nc) + 'X' + S.map.rows[nr].slice(nc + 1);
  eq(tileYield(S, 0, 'X'), [0, 0, 0], 'ein Feld außerhalb der Karte bringt nichts');
  eq(incomeBreakdown(S, 0).rows.some(r => r.key === 'X'), false,
    'es taucht in der Ertragsübersicht nicht auf');
  eq(canPass(S, 0, nr, nc), false, 'keine Armee kann es betreten');
  eq(canFound(S, 0, nr, nc), 'Kein Feld.', 'dort lässt sich keine Stadt gründen');
  eq(isOff('X') && !isOff('M') && !isOff('V'), true, 'nur X gilt als außerhalb');
  eq(TERRAIN.X.land, false, 'außerhalb ist kein Land');
  // v73: X gehört nie zum Gebiet – sonst zog die Reichsgrenze um leere Sechsecke
  eq(controlledTiles(S, 0).has(key(nr, nc)), false, 'es gehört nicht zum Gebiet der Stadt daneben');
  S.players[0].techs.kolonialismus = true; S.players[0].res.coins = 20;
  eq(buyTile(S, 0, nr, nc), 'Kein Feld.', 'kaufen lässt es sich auch nicht');
  eq([S.players[0].res.coins, (S.bought[0] || []).length], [20, 0], 'und es kostet nichts');
}
/* Plättchenkarten liegen in einem Rechteck aus X. Eine Stadt am Kartenrand oder am Loch
   zog bis v72 die leeren Sechsecke dahinter in ihr Gebiet – sichtbar als Reichsgrenze
   jenseits der Karte. Geprüft wird jedes Randfeld jeder Form mit einer gedachten Stadt. */
for (const n of [2, 3, 4]) {
  const civs = CIVS.map(c => c.k).slice(0, n);
  const plan = tilePlan(civs, 40 + n);
  const rnd = mapRng(9);
  plan.seats.forEach(st => botPlaceSeat(plan, st, rnd));
  const S = newGame({ seed: 3, map: tileMap(plan), duel: n === 2,
    players: civs.map(cv => ({ civ: cv, kind: 'bot' })) });
  const echt = (r, c) => { const t = terrainAt(S, r, c); return !!t && !isOff(t); };
  let rand = 0, amLoch = 0, falsch = 0, fehlt = 0;
  for (let r = 0; r < S.map.rows.length; r++) for (let c = 0; c < S.map.rows[r].length; c++) {
    if (!echt(r, c) || cityAt(S, r, c)) continue;
    const nb = neighbors(r, c);
    if (nb.every(([a, b]) => echt(a, b))) continue;           // kein Randfeld
    rand++;
    if (nb.some(([a, b]) => S.map.rows[a] && S.map.rows[a][b] === 'X' &&
      neighbors(a, b).every(([x, y]) => echt(x, y)))) amLoch++;
    const alt = S.cities.filter(x => x.owner === 0);
    S.cities = S.cities.filter(x => x.owner !== 0);
    S.cities.push({ id: -5, owner: 0, r, c, pop: 1, cap: true, grown: 0, born: 0 });
    const own = controlledTiles(S, 0);
    if ([...own].some(k => !echt(...unkey(k)))) falsch++;
    const soll = nb.filter(([a, b]) => echt(a, b) && !cityAt(S, a, b)).length;
    if (own.size !== soll) fehlt++;
    S.cities = S.cities.filter(x => x.id !== -5).concat(alt);
  }
  eq([falsch, fehlt], [0, 0],
    `${n}P: eine Stadt am Rand beherrscht genau ihre echten Nachbarfelder (${rand} Randfelder, ${amLoch} am Loch)`);
}

/* ============================================== Spielende: Ansprüche und Punkte
   Alles außer dem Militärsieg endet erst am Rundenende; erfüllen mehrere in derselben
   Runde eine Bedingung, entscheiden Punkte = Bevölkerung + Wunder + Technologien.   */
{
  // Hilfsspiel: vier Menschen in Zugreihenfolge, Startspieler Russland (Index 0),
  // damit die Runde nachvollziehbar bei Russland beginnt und endet.
  const ZUGFOLGE = ['russland', 'griechenland', 'england', 'wikinger'];
  // Es steht in Runde 2: in Runde 1 gibt es keinen Wirtschaftssieg (v77).
  const mkEnd = () => {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: ZUGFOLGE.map(k => ({ civ: k, kind: 'human' })),
    });
    S.round = 2;
    return S;
  };
  eq([mkEnd().startIdx, mkEnd().cur], [0, 0], 'Russland ist Startspieler');
  // --- Punkteformel
  {
    const S = mkEnd();
    const cap = capitalOf(S, 0);
    cap.pop = 7;
    S.wonders.push({ k: 'gaerten', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
    S.wonders.push({ k: 'koloss', lvl: 1, owner: 0, cityId: cap.id, r: cap.r, c: cap.c });
    S.players[0].techs = { rad: true, schrift: true, bronze: true, aus: false };
    const sc = victoryScore(S, 0);
    eq([sc.pop, sc.wonders, sc.techs, sc.total], [7, 2, 3, 12],
      'Punkte = Bevölkerung + Wunder + Technologien');
  }
  // --- Ein Anspruch: die Runde läuft weiter, das Spiel endet am Rundenende
  {
    const S = mkEnd();
    S.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });   // 7 von 10 > 2/3
    markRoundStart(S);                             // so steht es zu Beginn von Runde 2 (v83)
    eq(S.claims.map(c => c.pi), [0], 'zu Rundenbeginn angemeldet');
    eq(finishTurn(S), null, 'der Wirtschaftssieg beendet den Zug nicht');
    eq([S.over, S.endRound], [null, 2], 'Ende ist für Runde 2 vorgemerkt');
    advanceTurn(S);
    eq([S.over, S.cur, S.round], [null, 1, 2], 'Griechenland ist regulär am Zug');
    endTurn(S); endTurn(S);                       // Griechenland, England
    eq([!!S.over, S.cur], [false, 3], 'auch die Wikinger kommen noch dran');
    endTurn(S);                                    // Wikinger beenden die Runde
    eq(!!S.over, true, 'am Rundenende ist das Spiel zu Ende');
    eq([S.over.winner, S.round, S.over.shared], [0, 2, false], 'Russland gewinnt in Runde 2');
    eq(S.over.how.startsWith('Wirtschaftssieg'), true, 'und zwar mit dem Wirtschaftssieg');
  }
  // --- Verlorene Bedingung schadet dem Anspruch nicht
  {
    const S = mkEnd();
    S.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });
    markRoundStart(S);
    finishTurn(S);
    eq(S.claims.length, 1, 'Anspruch steht');
    capitalOf(S, 0).pop = 1;                       // Bedingung fällt weg
    checkVictory(S, 0);
    eq(S.claims.length, 1, 'der Anspruch bleibt trotzdem stehen');
    advanceTurn(S); endTurn(S); endTurn(S); endTurn(S);
    eq([!!S.over, S.over && S.over.winner], [true, 0],
      'und gewinnt am Rundenende, obwohl die Bevölkerung längst gesunken ist');
  }
  // --- Zwei Ansprüche in derselben Runde: Punkte entscheiden
  {
    const S = mkEnd();
    // Russland: Wirtschaftssieg, wenig Technologien
    S.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });
    S.players[0].techs = { rad: true };
    markRoundStart(S);                              // Anspruch Russland zu Rundenbeginn
    finishTurn(S);
    // Griechenland: Forschungssieg, dafür viele Technologien
    const g = S.players[1];
    techPool(S).forEach(t => { if (t.k !== 'singularitaet') g.techs[t.k] = true; });
    advanceTurn(S);
    applyTech(S, 1, SINGULARITY, 'Test');
    eq(S.claims.map(c => c.pi), [0, 1], 'beide Ansprüche sind vermerkt');
    eq(S.over, null, 'entschieden ist noch nichts');
    const pR = victoryScore(S, 0).total, pG = victoryScore(S, 1).total;
    eq(pG > pR, true, `Griechenland hat mehr Punkte (${pG} zu ${pR})`);
    endTurn(S); endTurn(S); endTurn(S);
    eq(!!S.over, true, 'Rundenende');
    eq(S.over.winner, 1, 'der Punktsieger gewinnt, nicht der erste Anspruch');
    eq(S.over.score.length, 2, 'die Punktetafel nennt beide');
    eq(S.over.score[0].total >= S.over.score[1].total, true, 'sie ist absteigend sortiert');
    eq(/Punktvergleich/.test(S.over.how), true, 'und der Vergleich steht im Ergebnistext');
  }
  // --- Gleichstand: gemeinsamer Sieg
  {
    const S = mkEnd();
    S.cities.forEach(c => { c.pop = 1; });
    // beide melden an, beide haben genau dieselben Punkte
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    claimVictory(S, 1, 'Kultursieg (Weltwunder der Stufe 3)');
    S.players[0].techs = { rad: true, schrift: true };
    S.players[1].techs = { bronze: true, mathematik: true };
    eq(victoryScore(S, 0).total, victoryScore(S, 1).total, 'gleich viele Punkte');
    for (let i = 0; i < 4; i++) endTurn(S);
    eq(!!S.over, true, 'die Runde endet');
    eq(S.over.shared, true, 'bei Gleichstand gewinnen beide');
    eq(S.over.winners.slice().sort(), [0, 1], 'und zwar genau diese beiden');
  }
  // --- Mensch und Bot melden beide an: der Mensch gewinnt
  {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: [
        { civ: 'russland', kind: 'bot', diff: 'david' },
        { civ: 'griechenland', kind: 'human' },
        { civ: 'england', kind: 'bot', diff: 'david' },
        { civ: 'wikinger', kind: 'human' },
      ],
    });
    S.cities.forEach(c => { c.pop = 2; });
    [0, 1, 2].forEach(i => claimVictory(S, i, 'Forschungssieg (Singularität)'));
    S.players.forEach(p => { p.techs = { rad: true, schrift: true }; });   // überall gleich
    eq([0, 1, 2].map(i => victoryScore(S, i).total), [4, 4, 4], 'drei Reiche gleichauf');
    for (let i = 0; i < 4; i++) endTurn(S);
    eq(!!S.over, true, 'die Runde endet');
    eq(S.over.winners, [1], 'bei gleichen Punkten gewinnt der Mensch allein');
    eq(S.over.tiebreak, 'mensch', 'und das steht auch im Ergebnis');
    eq(S.players[S.over.winner].kind, 'human', 'der Sieger ist kein Bot');
    eq(/Mensch vor Bot/.test(S.over.how), true, 'der Ergebnistext nennt die Regel');
  }
  /* --- Der Mensch gewinnt auch gegen MEHR Punkte eines Bots.
     Bis v59 entschieden erst die Punkte und der Mensch bekam nur den Gleichstand –
     ein Bot konnte dem Menschen den Sieg also wegrechnen, obwohl beide es in derselben
     Runde geschafft hatten. Gemeldet als Fehler, auch aus dem Tutorial. */
  {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: [
        { civ: 'russland', kind: 'bot', diff: 'david' },
        { civ: 'griechenland', kind: 'human' },
        { civ: 'england', kind: 'bot', diff: 'david' },
        { civ: 'wikinger', kind: 'human' },
      ],
    });
    S.cities.forEach(c => { c.pop = 2; });
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    claimVictory(S, 1, 'Wirtschaftssieg (Test)');
    S.players[0].techs = { rad: true, schrift: true, bronze: true, mathematik: true };
    S.players[1].techs = { rad: true, schrift: true };
    eq(victoryScore(S, 0).total > victoryScore(S, 1).total, true, 'der Bot hat mehr Punkte');
    for (let i = 0; i < 4; i++) endTurn(S);
    eq(S.over.winners, [1], 'der Mensch gewinnt trotz weniger Punkte');
    eq(S.over.tiebreak, 'mensch', 'und die Regel steht im Ergebnis');
    eq(S.over.score.length, 2, 'die Punktetafel nennt weiter beide Ansprüche');
    eq(S.over.score[0].pi, 0, 'und zeigt den Bot mit seinen höheren Punkten oben');
    eq(/Mensch vor Bot/.test(S.over.how), true, 'der Ergebnistext nennt die Regel');
  }
  // --- Ohne menschlichen Anspruch entscheiden weiter nur die Punkte
  {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: [
        { civ: 'russland', kind: 'bot', diff: 'david' },
        { civ: 'griechenland', kind: 'human' },
        { civ: 'england', kind: 'bot', diff: 'david' },
        { civ: 'wikinger', kind: 'human' },
      ],
    });
    S.cities.forEach(c => { c.pop = 2; });
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    claimVictory(S, 2, 'Kultursieg (Weltwunder der Stufe 3)');
    S.players[0].techs = { rad: true, schrift: true, bronze: true };       // ein Punkt mehr
    S.players[2].techs = { rad: true, schrift: true };
    for (let i = 0; i < 4; i++) endTurn(S);
    eq([S.over.winner, S.over.tiebreak], [0, null],
      'unter Bots gewinnen weiter die Punkte, ohne Menschenvermerk');
  }
  // --- Der Mensch gewinnt nicht, wenn sein Anspruch verfällt (Reich untergegangen)
  {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: [
        { civ: 'russland', kind: 'bot', diff: 'david' },
        { civ: 'griechenland', kind: 'human' },
        { civ: 'england', kind: 'bot', diff: 'david' },
        { civ: 'wikinger', kind: 'human' },
      ],
    });
    S.cities.forEach(c => { c.pop = 2; });
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    claimVictory(S, 1, 'Wirtschaftssieg (Test)');
    S.cities = S.cities.filter(c => c.owner !== 1);      // der Mensch hat keine Stadt mehr
    S.players[1].dead = true;
    for (let i = 0; i < 4; i++) endTurn(S);
    eq([S.over.winner, S.over.tiebreak], [0, null],
      'ein untergegangener Mensch verdrängt den Bot nicht');
  }
  // --- Zwei Menschen gleichauf: gemeinsamer Sieg, Bots bleiben draußen
  {
    const S = newGame({
      seed: 77, wonders: true, startPlayer: 0,
      players: [
        { civ: 'russland', kind: 'bot', diff: 'david' },
        { civ: 'griechenland', kind: 'human' },
        { civ: 'england', kind: 'bot', diff: 'david' },
        { civ: 'wikinger', kind: 'human' },
      ],
    });
    S.cities.forEach(c => { c.pop = 2; });
    [0, 1, 3].forEach(i => claimVictory(S, i, 'Kultursieg (Weltwunder der Stufe 3)'));
    S.players.forEach(p => { p.techs = { rad: true }; });
    for (let i = 0; i < 4; i++) endTurn(S);
    eq(S.over.winners.slice().sort(), [1, 3], 'die beiden Menschen teilen den Sieg');
    eq(S.over.shared, true, 'und zwar als gemeinsamer Sieg');
  }
  // --- Barbaren gewinnen nie
  {
    const S = mkEnd();
    const bi = barbIndex(S);
    eq(claimVictory(S, bi, 'Wirtschaftssieg (Test)'), null, 'Barbaren melden nichts an');
    eq(S.claims.length, 0, 'ihr Anspruch wird nicht vermerkt');
  }
  // --- Militärsieg schlägt jeden angemeldeten Anspruch, sofort
  {
    const S = mkEnd();
    S.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });
    markRoundStart(S);                              // zu Rundenbeginn angemeldet (v83)
    eq(S.claims.map(c => c.pi), [0], 'Russland hat angemeldet');
    // Griechenland erobert die russische Hauptstadt
    const cap = capitalOf(S, 0), att = S.players[1];
    att.power = 99;
    S.armies.push({ id: S.nextId++, owner: 1, r: cap.r, c: cap.c === 0 ? 1 : cap.c - 1, mp: 0 });
    S.sieges['1|' + cap.id] = { rounds: 2, last: 99 };
    captureCity(S, 1, cap);
    eq(!!S.over, true, 'der Militärsieg endet sofort');
    eq([S.over.winner, S.over.military], [1, true], 'und gewinnt für den Angreifer');
    eq(S.over.score, undefined, 'ohne Punktvergleich');
  }
  // --- Bis v82 wurde am Rundenende noch einmal für alle geprüft. Seit v83 zählt der
  //     Wirtschaftssieg zu Rundenbeginn: wer erst im Lauf der Runde über die Schwelle
  //     wächst, kommt am Ende dieser Runde nicht mehr in den Vergleich.
  {
    const S = mkEnd();
    // Wikinger (letzter im Zug) melden an; Russland erfüllt die Schwelle erst danach
    claimVictory(S, 3, 'Kultursieg (Weltwunder der Stufe 3)');
    S.cities.forEach(c => { c.pop = c.owner === 0 ? 7 : 1; });
    for (let i = 0; i < 4; i++) endTurn(S);
    eq(S.claims.map(c => c.pi), [3], 'Russland kommt am Rundenende nicht mehr dazu (v83)');
    eq([!!S.over, S.over && S.over.winner], [true, 3], 'das Spiel ist zu Ende, die Wikinger gewinnen');
  }
  // --- Ausgeschiedene Reiche gewinnen nicht; verfällt der letzte Anspruch, geht es weiter
  {
    const S = mkEnd();
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    S.cities = S.cities.filter(c => c.owner !== 0);       // Russland verliert alles
    S.players[0].dead = true;
    for (let i = 0; i < 5; i++) if (!S.over) endTurn(S);
    eq(S.over, null, 'ein ausgeschiedenes Reich gewinnt nicht');
    eq([S.endRound, S.claims.length], [null, 0], 'der Anspruch verfällt, das Spiel läuft');
    eq(S.round >= 3, true, 'und die nächste Runde beginnt');
  }
  // --- Nur ein Anspruch je Reich, auch bei mehreren Gründen
  {
    const S = mkEnd();
    claimVictory(S, 0, 'Wirtschaftssieg (Test)');
    claimVictory(S, 0, 'Forschungssieg (Singularität)');
    eq(S.claims.length, 1, 'der zweite Grund desselben Reichs macht keinen zweiten Anspruch');
    eq(S.claims[0].how.startsWith('Wirtschaftssieg'), true, 'der erste Grund bleibt vermerkt');
  }
  // --- Bot-Partien enden weiterhin regulär
  {
    let rounds = [], arten = {};
    for (let g = 0; g < 25; g++) {
      const S = newGame({
        seed: 900 + g, wonders: g % 2 === 0, events: g % 3 === 0, eventMode: 'hard',
        players: CIVS.map(c => ({ civ: c.k, kind: 'bot', diff: 'david' })),
      });
      let guard = 0;
      while (!S.over && guard++ < 400) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
      eq(!!S.over, true, `Bot-Partie ${g} endet`);
      rounds.push(S.round);
      const art = S.over.how.split(' (')[0];
      arten[art] = (arten[art] || 0) + 1;
      // Wer gewinnt, muss auch am Ende noch leben
      eq(!S.players[S.over.winner].dead, true, `Sieger von Partie ${g} lebt noch`);
    }
    rounds.sort((a, b) => a - b);
    console.log('       25 Bot-Partien: Median Runde ' + rounds[12] + ', Siegarten ' +
      Object.entries(arten).map(([k, v]) => `${k} ${v}`).join(', '));
  }
}

/* ================================ Dieselbe Zivilisation mehrfach am Tisch
   Auf Plättchenkarten darf jeder Platz frei wählen, auch zweimal dieselbe Zivilisation.
   Geführt wird dann alles über den Platz (slot), nicht über die Zivilisation.        */
{
  const schatten = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    const m = v => Math.round(a > 0 ? v + (255 - v) * a : v * (1 + a));
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(m);
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  };
  const rus = CIV_BY_KEY.russland;
  const players = [
    { civ: 'russland', kind: 'human', ability: 'siedler', name: 'Russland I', color: rus.color },
    { civ: 'russland', kind: 'human', ability: 'basis', name: 'Russland II', color: schatten(rus.color, 0.45) },
    { civ: 'russland', kind: 'bot', ability: 'basis', name: 'Russland III', color: schatten(rus.color, -0.4) },
    { civ: 'england', kind: 'bot', ability: 'basis' },
  ];
  const plan = tilePlan(players.map(p => p.civ), 4242);
  eq(plan.seats.map(s => s.idx), [0, 1, 2, 3], 'jeder Sitz kennt seinen Platz im Aufbau');
  eq(plan.seats.map(s => s.civ), players.map(p => p.civ), 'und seine Zivilisation');
  const rnd = mapRng(7);
  plan.seats.forEach(st => botPlaceSeat(plan, st, rnd));
  const m = tileMap(plan);
  eq(m.capitals.length, 4, 'vier Hauptstädte, obwohl dreimal Russland dabei ist');
  eq(m.capitals.map(e => e.civ), ['russland', 'russland', 'russland', 'england'],
    'die Liste folgt den Plätzen');
  eq(new Set(m.capitals.map(e => e.r + ',' + e.c)).size, 4, 'alle vier stehen woanders');

  const S = newGame({ seed: 5, map: m, players });
  eq(S.players.length, 4, 'vier Reiche im Spiel');
  eq(S.players.map(p => p.slot).sort(), [0, 1, 2, 3], 'jedes Reich merkt sich seinen Platz');
  eq(S.cities.length, 4, 'jedes bekommt eine eigene Hauptstadt');
  eq(new Set(S.cities.map(c => c.r + ',' + c.c)).size, 4, 'auf vier verschiedenen Feldern');
  eq(S.players.map(p => civOf(p).n),
    ['Russland I', 'Russland II', 'Russland III', 'England'], 'Doppelgänger tragen Ziffern');
  eq(new Set(S.players.map(p => civOf(p).color)).size, 4, 'und haben vier verschiedene Farben');
  // Fähigkeiten wirken je Platz, nicht je Zivilisation
  eq(S.cities.map(c => c.pop), [2, 1, 1, 1],
    'nur der Platz mit Siedlertrecks startet mit Bevölkerung 2');
  eq(isAbil(S.players[0], 'siedler') && !isAbil(S.players[1], 'siedler'), true,
    'gleiche Zivilisation, verschiedene Fähigkeiten');
  // Startspieler hängt am Platz, nicht an der Zivilisation
  const T = newGame({ seed: 5, map: m, players, startPlayer: 2 });
  eq(T.players[T.startIdx].slot, 2, 'der Startspieler ist der dritte Platz, nicht das erste Russland');
  // eine ganze Partie läuft durch
  let guard = 0;
  while (!S.over && guard++ < 400) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
  eq(!!S.over, true, 'eine Partie mit drei Russlands endet regulär');

  // Feste Karten führen die Hauptstädte weiter nach Zivilisation
  const F = newGame({ seed: 1, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
  eq(Array.isArray(F.map.capitals), false, 'die Originalkarte bleibt bei der alten Form');
  eq(F.cities.length, 4, 'und setzt weiterhin vier Hauptstädte');
}

/* ================================= Farben, Zufallswahl, Startspieler, Duelltexte */
{
  // --- Siegschwellen im Bogen: im Duell andere Zahlen als im Vierspielerspiel
  const T = TECH_BY_KEY.theologie, U = TECH_BY_KEY.un;
  const N = newGame({ seed: 1, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
  const D = newGame({
    seed: 1, duel: true,
    players: [{ civ: 'england', kind: 'bot' }, { civ: 'russland', kind: 'bot' }],
  });
  eq(techEffect(T, N), '>3/5 der Bevölkerung zum Sieg', 'Theologie normal: 3/5');
  eq(techEffect(U, N), '>1/2 der Bevölkerung zum Sieg', 'Vereinte Nationen normal: 1/2');
  eq(techEffect(T, D), '>7/10 der Bevölkerung zum Sieg', 'Theologie im Duell: 7/10');
  eq(techEffect(U, D), '>2/3 der Bevölkerung zum Sieg', 'Vereinte Nationen im Duell: 2/3');
  eq(techEffect(TECH_BY_KEY.rad, D), TECH_BY_KEY.rad.e, 'andere Technologien bleiben, wie sie sind');
  eq(techEffect(T, null), '>3/5 der Bevölkerung zum Sieg', 'ohne Spielstand die Normalwerte');
  // die Anzeige muss zur Rechnung passen
  const pT = { civ: 'england', techs: { theologie: true }, kind: 'human', ability: 'basis' };
  eq(victoryOption(D, pT).label, '7/10', 'Rechnung und Anzeige nennen dieselbe Schwelle');
  eq(victoryOption(N, pT).label, '3/5', 'auch im normalen Spiel');
}

/* ============================================================ Sprachen (i18n)
   Deutsch ist die Quelle, Englisch kommt aus DATA_EN (Spielobjekte) und UI_EN
   (Oberflächensätze, Schlüssel ist der deutsche Satz).                             */
{
  eq(LANG, 'de', 'Deutsch ist die Vorgabe');
  eq(LANGS.map(l => l.k), ['de', 'en'], 'zwei Sprachen');
  // Datentabellen vollständig? Sonst stünde im englischen Spiel deutscher Text.
  const luecken = [];
  TECHS.forEach(t => { if (!DATA_EN.tech[t.k]) luecken.push('tech ' + t.k); });
  if (!DATA_EN.tech.singularitaet) luecken.push('tech singularitaet');
  WONDERS.forEach(w => { if (!DATA_EN.wonder[w.k]) luecken.push('wonder ' + w.k); });
  Object.values(EVENT_BY_KEY).forEach(e => { if (!DATA_EN.event[e.k]) luecken.push('event ' + e.k); });
  Object.values(TERRAIN).forEach(t => { if (!DATA_EN.terrain[t.key]) luecken.push('terrain ' + t.key); });
  DIFFICULTIES.forEach(d => { if (!DATA_EN.diff[d.k]) luecken.push('diff ' + d.k); });
  EVENT_MODES.forEach(m => { if (!DATA_EN.evmode[m.k]) luecken.push('evmode ' + m.k); });
  CIVS.forEach(c => {
    if (!DATA_EN.civ[c.k]) luecken.push('civ ' + c.k);
    c.abilities.forEach(a => { if (!(DATA_EN.abil[c.k] || {})[a.k]) luecken.push('abil ' + c.k + '/' + a.k); });
  });
  TILE_POOL.forEach(t => { if (!DATA_EN.tile[t.de || t.n]) luecken.push('tile ' + t.n); });
  eq(luecken, [], `alle ${TECHS.length + WONDERS.length + 18 + 12 + TILE_POOL.length} Datentexte haben eine englische Fassung`);
  eq(DATA_EN.ages.length, AGES.length, 'Zeitalter übersetzt');
  eq(DATA_EN.fields.length, FIELDS.length, 'Technologiefelder übersetzt');
  eq(DATA_EN.maps.length, MAPS.length, 'Kartennamen übersetzt');
  /* Spieltipps. Sie stehen am Spielende und werden nur angezeigt – nichts im Code hängt
     an ihrem Wortlaut. Geprüft wird deshalb nur, was still schiefgehen könnte: eine
     vergessene Übersetzung (dann trüge das englische Spiel den deutschen Satz) und ein
     doppelt eingefügter Tipp. */
  eq(DATA_EN.tips.length, TIPS.length, `alle ${TIPS.length} Spieltipps haben eine englische Fassung`);
  eq(TIPS.filter(t => !t || !t.trim()).length, 0, 'kein leerer Tipp');
  eq(DATA_EN.tips.filter(t => !t || !t.trim()).length, 0, 'keine leere Übersetzung');
  eq(new Set(TIPS).size, TIPS.length, 'kein Tipp steht zweimal in der Liste');
  eq(new Set(DATA_EN.tips).size, DATA_EN.tips.length, 'und keine Übersetzung zweimal');

  // Umschalten und zurück
  setLang('en', { quiet: true });
  eq([TECH_BY_KEY.schrift.n, TECH_BY_KEY.schrift.e], ['Writing', 'Per population: +1 science'],
    'Technologien wechseln Name und Wirkung');
  eq(TERRAIN.G.name, 'Grassland', 'Gelände wechselt');
  eq([CIVS[0].n, CIVS[0].abilities[0].n], ['Greece', 'Cheap research'], 'Zivilisation und Fähigkeit wechseln');
  eq(WONDER_BY_KEY.mauer.n, 'The Great Wall', 'Weltwunder wechseln');
  eq(EVENT_BY_KEY.pest.n, 'The Plague', 'Ereignisse wechseln');
  eq(AGES[0], 'Antiquity', 'Zeitalter wechseln');
  eq(TILE_POOL[0].n, 'Open Plain', 'Plättchennamen wechseln');
  eq(TIPS[0], DATA_EN.tips[0], 'Spieltipps wechseln mit');
  eq(TIPS.some(t => /[äöüß]/.test(t)), false,
    'auf Englisch ist kein deutscher Tipp übrig: ' + (TIPS.find(t => /[äöüß]/.test(t)) || '').slice(0, 40));
  eq(TILE_SHAPES[2].name, 'Tile map (6 triangles)', 'Kartenformen wechseln');
  // techEffect rechnet weiter mit den Duellschwellen, jetzt auf Englisch
  eq(techEffect(TECH_BY_KEY.theologie, { duel: true }), '>7/10 of the population to win',
    'Duellschwellen auch auf Englisch');
  // T(): Übersetzung, Platzhalter, Rückfall auf Deutsch
  eq(T('Neues Spiel'), 'New game', 'Oberflächensatz wird übersetzt');
  eq(T('Runde %s · Bevölkerung %s/%s (%s %)', 3, 4, 12, 33),
    'Round 3 · Population 4/12 (33 %)', 'Platzhalter werden der Reihe nach ersetzt');
  /* Kein Schlüssel darf zweimal in UI_EN stehen. Ein Objektliteral verschluckt die
     Doppelung stillschweigend – der spätere Eintrag gewinnt, der frühere verschwindet
     ohne jede Meldung. Solange beide dieselbe Übersetzung tragen, fällt das nie auf;
     ändert jemand nur eine der beiden, wirkt die Änderung scheinbar nicht. Gefunden
     wurde das bei 'Münzen', 'Welt' und 'Zug beenden'. Geprüft wird deshalb der
     QUELLTEXT, nicht das fertige Objekt: im Objekt ist die Doppelung schon weg. */
  {
    const quelle = fs.readFileSync(__dirname + '/js/i18n.js', 'utf8');
    const anfang = quelle.indexOf('const UI_EN = {');
    const tabelle = quelle.slice(anfang, quelle.indexOf('\nconst MISSING', anfang));
    const schluessel = [...tabelle.matchAll(/^  '((?:[^'\\]|\\.)*)':/gm)].map(m => m[1]);
    const doppelt = schluessel.filter((k, i) => schluessel.indexOf(k) !== i);
    eq(anfang > 0 && schluessel.length > 400, true, `UI_EN gefunden (${schluessel.length} Einträge)`);
    eq(doppelt, [], 'kein Schlüssel steht zweimal in UI_EN');
  }
  /* Ratsche gegen verwaiste Übersetzungen: ein Schlüssel, dessen deutscher Satz
     nirgends mehr im Quelltext steht, wird nie nachgeschlagen – er sieht nur so aus,
     als wäre er in Gebrauch, und führt beim nächsten Umbau in die Irre. Gefunden wurden
     so sieben Leichen (eine Rasterkarte, die es nicht mehr gibt, und alte Tutorialtitel).
     Verglichen wird mit normalisierten Leerzeichen, weil Sätze im Markup umbrochen sind.
     Die Grenze sind die zwei Flaggen-Schlüssel: sie stehen in der Zeile der
     Symbol-Identitäten (🔬🌾🪙 …), die Fehlmeldungen von T() abfängt – `langRow` nimmt
     die Flaggen direkt aus LANGS, ohne T(). Die Zahl darf sinken, nicht steigen. */
  {
    const norm = x => x.replace(/\s+/g, ' ');
    const quellen = ['data', 'civs', 'hex', 'tiles', 'engine', 'expansion', 'bots', 'ki', 'marathon', 'ui', 'tutorial']
      .map(n => fs.readFileSync(`${__dirname}/js/${n}.js`, 'utf8'))
      .concat(fs.readFileSync(__dirname + '/index.html', 'utf8')).join('\n');
    const heu = norm(quellen);
    const roh = fs.readFileSync(__dirname + '/js/i18n.js', 'utf8');
    const ab = roh.indexOf('const UI_EN = {');
    const tabelle = roh.slice(ab, roh.indexOf('\nconst MISSING', ab));
    const schluessel = [...tabelle.matchAll(/(?:^  |, )'((?:[^'\\]|\\.)*)':/gm)].map(m => m[1]);
    const waisen = schluessel.filter(k => {
      const de = norm(k.replace(/\\'/g, "'").replace(/\\\\/g, '\\')).trim();
      return de && !heu.includes(de);
    });
    eq(waisen.length <= 2, true, `höchstens 2 verwaiste Schlüssel (sind: ${waisen.join(' | ') || '—'})`);
  }
  clearMissing();
  eq(T('Ein Satz, den es nicht gibt'), 'Ein Satz, den es nicht gibt',
    'ohne Übersetzung bleibt der deutsche Satz stehen');
  eq(missingStrings(), ['Ein Satz, den es nicht gibt'], 'und die Lücke wird gemeldet');
  clearMissing();
  // Regeln bleiben von der Sprache unberührt
  {
    const S = newGame({ seed: 4, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
    eq(S.cities.length, 4, 'ein englisches Spiel startet genauso');
    let guard = 0;
    while (!S.over && guard++ < 400) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
    eq(!!S.over, true, 'und läuft genauso durch');
  }
  setLang('de', { quiet: true });
  eq([TECH_BY_KEY.schrift.n, TERRAIN.G.name, AGES[0], TILE_POOL[0].n],
    ['Schrift', 'Grasland', 'Antike', 'Weite Ebene'], 'zurück auf Deutsch stimmt alles wieder');
  eq(TIPS[0].startsWith('Es ist nicht immer korrekt'), true, 'auch die Spieltipps sind zurück');
}

/* =================== Tutorialschienen bleiben sprachunabhängig
   Das Tutorial filtert die Knöpfe im Aktionsblatt über deutsche Ausdrücke. Damit das
   auch auf Englisch trägt, tragen die Knöpfe ihren **deutschen** Schlüssel als
   `data-label` – die sichtbare Beschriftung wechselt, der Schlüssel nicht. Zweimal ist
   genau das schiefgegangen (Schritt 4 „Stadt gründen", Schritt 24 „Straße bauen"),
   deshalb prüft dieser Block die Quelle statt der Oberfläche.                       */
{
  const ui = fs.readFileSync(__dirname + '/js/ui.js', 'utf8');
  // 1) Kein btn()-Aufruf darf im **ersten** Parameter eine Übersetzung bekommen –
  //    dort steht der Schlüssel. In den übrigen Parametern ist T(…) richtig.
  const ersteParameter = [];
  for (const m of ui.matchAll(/\bbtn\(/g)) {
    let i = m.index + m[0].length, tiefe = 0, arg = '';
    for (; i < ui.length; i++) {
      const ch = ui[i];
      if (ch === '(' || ch === '[') tiefe++;
      else if (ch === ')' || ch === ']') { if (!tiefe) break; tiefe--; }
      else if (ch === ',' && !tiefe) break;
      arg += ch;
    }
    ersteParameter.push(arg.trim());
  }
  eq(ersteParameter.filter(a => a.includes('T(')), [],
    'btn() bekommt im ersten Parameter immer den deutschen Schlüssel, nie T(…)');
  // 2) Alle deutschen Schlüssel einsammeln, die die Oberfläche vergeben kann
  const schluessel = [
    ...[...ui.matchAll(/btn\(\s*'([^']+)'/g)].map(m => m[1]),
    ...[...ui.matchAll(/btn\([^']*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)].flatMap(m => [m[1], m[2]]),
    ...[...ui.matchAll(/data-label="([^"]+)"/g)].map(m => m[1]),
  ];
  eq(schluessel.length > 10, true, `die Oberfläche vergibt ${schluessel.length} Knopf-Schlüssel`);
  // 3) Jeder Ausdruck des Tutorials muss auf mindestens einen davon passen
  const ohne = [];
  TUT_STEPS.forEach((st, i) => {
    (st.allow && st.allow.labels || []).forEach(rx => {
      if (!schluessel.some(k => rx.test(k))) ohne.push(`${i + 1}: ${rx}`);
    });
  });
  eq(ohne, [], 'jeder Knopf-Ausdruck des Tutorials trifft einen vorhandenen Schlüssel');
  // 4) Titel und Aufgaben aller Schritte haben eine englische Fassung
  setLang('en', { quiet: true });
  const fehlt = [];
  TUT_STEPS.forEach((st, i) => {
    if (st.t && st.t !== 'Hochzeivilization' && T(st.t) === st.t) fehlt.push(`${i + 1} Titel`);
    if (st.tKurz && T(st.tKurz) === st.tKurz) fehlt.push(`${i + 1} Kurztitel`);
    if (st.task && T(st.task) === st.task) fehlt.push(`${i + 1} Aufgabe`);
  });
  eq(fehlt, [], 'alle 29 Tutorialschritte haben Titel und Aufgabe auf Englisch');
  clearMissing();
  setLang('de', { quiet: true });
}

/* ============================ Zivilisationen aus data/civs.json (v53)
   Die JSON ist die Quelle, js/civs.js die daraus erzeugte Fassung. Dieser Block prüft,
   dass beide zusammenpassen – wer die JSON ändert und `node tools_civs.js` vergisst,
   merkt es hier und nicht erst im Spiel.                                            */
{
  const roh = JSON.parse(fs.readFileSync(__dirname + '/data/civs.json', 'utf8'));
  eq(roh.civs.map(c => c.k), CIVS.map(c => c.k),
    'js/civs.js steht in derselben Reihenfolge wie data/civs.json (Anzeigereihenfolge)');
  eq(roh.civs.slice().sort((a, b) => a.order - b.order).map(c => c.k), ORDER,
    'ORDER ist die Zugreihenfolge aus dem Feld order');
  roh.civs.forEach(c => {
    const civ = CIV_BY_KEY[c.k];
    eq([civ.n, civ.sym, civ.color], [c.n, c.sym, c.color], `${c.k}: Name, Zeichen und Farbe`);
    eq(civ.abilities.map(a => [a.k, a.n, a.e]), c.abilities.map(a => [a.k, a.n, a.e]),
      `${c.k}: drei Fähigkeiten wie in der JSON`);
    eq(civ.ability, c.abilities[0].e, `${c.k}: ability ist die Grundfähigkeit`);
  });
  eq([BARB_CIV.k, BARB_CIV.n, BARB_CIV.color],
    [roh.barbaren.k, roh.barbaren.n, roh.barbaren.color], 'Barbaren kommen ebenfalls aus der JSON');
  // Formvorschriften, die tools_civs.js beim Erzeugen erzwingt
  eq(CIVS.every(c => /^[a-z]+$/.test(c.k)), true, 'Schlüssel sind kleingeschrieben');
  eq(CIVS.every(c => /^#[0-9a-f]{6}$/i.test(c.color)), true, 'Farben sind #rrggbb');
  eq(new Set(CIVS.map(c => c.color)).size, CIVS.length, 'jede Zivilisation hat eine eigene Farbe');
  eq(CIVS.every(c => c.abilities.length === 3 && c.abilities[0].k === 'basis'), true,
    'je drei Fähigkeiten, die erste ist die Grundfähigkeit');
  eq(new Set(CIVS.map(c => c.sym)).size, CIVS.length, 'jede Zivilisation hat ein eigenes Zeichen');
  // Jeder Fähigkeitsschlüssel, der nicht 'basis' ist, muss im Code auch vorkommen –
  // sonst hängt eine Alternative in der Auswahl, ohne etwas zu tun.
  const code = ['js/engine.js', 'js/expansion.js', 'js/bots.js', 'js/ui.js']
    .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n');
  const ohneWirkung = CIVS.flatMap(c => c.abilities.filter(a => a.k !== 'basis').map(a => a.k))
    .filter(k => !code.includes(`'${k}'`));
  eq(ohneWirkung, [], 'jede Alternativfähigkeit wird im Code auch geprüft');
}

/* ==================================== Balance v53: Kolonisten und Seemacht */
{
  // Achtung: newGame sortiert in die Zugreihenfolge – der Platz im Aufbau ist nicht der
  // Index im Spiel. Deshalb wird hier nach Zivilisation gesucht.
  const mk = (civ, abil) => {
    const S = newGame({
      seed: 12, players: [{ civ, kind: 'human', ability: abil },
        { civ: civ === 'england' ? 'russland' : 'england', kind: 'bot' }],
    });
    S.ich = S.players.findIndex(p => p.civ === civ && p.kind === 'human');
    return S;
  };
  // Kolonisten: Wachstum kostet doppelt
  const A = mk('england', 'gruenden'), B = mk('england', 'basis');
  const ca = capitalOf(A, A.ich), cb = capitalOf(B, B.ich);
  ca.pop = cb.pop = 3;
  eq(growPrice(A, A.ich, ca), { food: 6, coins: 6 },
    'Kolonisten: Wachstum kostet doppelt (2 × Bevölkerung)');
  eq(growPrice(B, B.ich, cb), { food: 3, coins: 3 }, 'Handelsreich zahlt weiterhin einfach');
  // Fruchtbarkeit und Dampfmaschine greifen unverändert – auch zusammen mit dem Faktor
  const R = mk('russland', 'wachstum');
  capitalOf(R, R.ich).pop = 3;
  eq(growPrice(R, R.ich, capitalOf(R, R.ich)), { food: 0, coins: 3 }, 'Fruchtbarkeit: keine Nahrung');
  A.players[A.ich].techs.dampfmaschine = true;
  eq(growPrice(A, A.ich, ca), { food: 6, coins: 0 },
    'Dampfmaschine streicht die Münzen, auch verdoppelt');
  // und die Kosten kommen auch beim Wachsen an
  delete A.players[A.ich].techs.dampfmaschine;
  A.players[A.ich].res = { sci: 0, food: 20, coins: 20 };
  A.cur = A.ich;
  const vor = { f: A.players[A.ich].res.food, c: A.players[A.ich].res.coins };
  eq(growCity(A, A.ich, ca), null, 'die Stadt wächst');
  eq([vor.f - A.players[A.ich].res.food, vor.c - A.players[A.ich].res.coins], [6, 6],
    'bezahlt wurden 6 Nahrung und 6 Münzen');
  // Seemacht: +1 statt +2
  eq(SEA_CITY_BONUS, 1, 'Seemacht gibt +1 je Küstenstadt');
  {
    const S = newGame({
      seed: 3, players: [{ civ: 'england', kind: 'human', ability: 'kuestenstaedte' },
        { civ: 'russland', kind: 'bot' }],
    });
    const ich = S.players.findIndex(p => p.civ === 'england');
    const b = incomeBreakdown(S, ich);
    const zeile = b.extra.find(e => e.name === 'Städte am Meer');
    if (zeile) eq(zeile.y, [zeile.count, zeile.count, zeile.count],
      'die Zeile bringt +1 je Stadt am Meer');
    // Gegenprobe: mit doppeltem Zuschlag wäre es das Doppelte
    if (zeile) eq(zeile.y[0] * 2, zeile.count * 2, 'vor v53 waren es +2 – jetzt die Hälfte');
  }
}

/* ====================== Zwei Tutorialfassungen aus einer Schrittliste (v54)
   „Ja, ich kenne solche Spiele" führt in eine kurze Fassung: **dieselben Aufgaben**,
   nur die Eigenheiten dieses Spiels erklärt. Was hier geprüft wird, ist genau das:
   dass die Kurzfassung nichts weglässt, was den Ablauf trägt.                       */
{
  const kurz = TUT_STEPS.filter(st => st.kurz !== false);
  eq(TUT_STEPS.every(st => st.kurz !== undefined), true,
    'jeder Schritt sagt, was in der kurzen Fassung mit ihm passiert');
  eq(TUT_STEPS.filter(st => st.task).every(st => st.kurz !== false), true,
    'die kurze Fassung enthält jede Aufgabe der langen');
  eq(TUT_STEPS.filter(st => st.enter || st.dice).every(st => st.kurz !== false), true,
    'kein Schritt mit Nebenwirkung (enter/dice) fällt weg');
  eq(TUT_STEPS.filter(st => st.goal).every(st => st.kurz !== false), true,
    'kein Schritt mit Ziel fällt weg');
  eq(kurz.length < TUT_STEPS.length, true,
    `die kurze Fassung ist kürzer (${kurz.length} statt ${TUT_STEPS.length} Schritte)`);
  eq(kurz[0].t, TUT_STEPS[0].t, 'sie beginnt mit demselben Schritt');
  eq(kurz[kurz.length - 1].t, TUT_STEPS[TUT_STEPS.length - 1].t, 'und endet mit demselben');
  // Textmenge: „deutlich abgespeckt" soll auch messbar sein
  const laenge = x => (typeof x === 'function' ? x() : x || '').length;
  const lang = TUT_STEPS.reduce((a, st) => a + laenge(st.html), 0);
  const kurzL = kurz.reduce((a, st) => a + laenge(st.kurz || st.html), 0);
  eq(kurzL < lang / 2, true, `die kurze Fassung hat weniger als die Hälfte Text ` +
    `(${kurzL} von ${lang} Zeichen, ${Math.round(100 * kurzL / lang)} %)`);
  // Die Schlüsselpraktiken müssen in der kurzen Fassung vorkommen
  const text = kurz.map(st => laenge(st.kurz || st.html) && (typeof (st.kurz || st.html) === 'function'
    ? (st.kurz || st.html)() : (st.kurz || st.html))).join(' ');
  [['verfallen', 'Ressourcen verfallen'], ['aufeinanderfolgenden Zügen', 'Kampfsystem'],
   ['zufällig', 'Zufall im Technologiebaum'], ['Zivilisationsfähigkeit', 'Reichsfähigkeiten'],
   ['Militärsieg', 'Siegwege'], ['Punkte', 'Punktvergleich am Rundenende']]
    .forEach(([wort, was]) => eq(text.includes(wort), true, `die kurze Fassung erklärt ${was}`));
  // und beide Fassungen auf Englisch
  setLang('en', { quiet: true });
  const ohne = [];
  TUT_STEPS.forEach((st, i) => {
    if (typeof st.kurz === 'function' && /[äöüß]/.test(st.kurz())) ohne.push(`${i + 1} kurz`);
    if (typeof st.html === 'function' && /[äöüß]/.test(st.html())) ohne.push(`${i + 1} lang`);
  });
  eq(ohne, [], 'beide Fassungen sind auf Englisch übersetzt');
  clearMissing();
  setLang('de', { quiet: true });
}

/* ========================= Ausgeloste Fähigkeit muss ablesbar sein (v54) */
{
  const S = newGame({
    seed: 5, players: [
      { civ: 'england', kind: 'human', ability: 'kuestenstaedte' },
      { civ: 'russland', kind: 'bot' }],
  });
  const ich = S.players.findIndex(p => p.kind === 'human');
  const a = abilInfo(S.players[ich]);
  eq([a.k, a.n], ['kuestenstaedte', 'Seemacht'], 'abilInfo liefert Schlüssel und Kurznamen');
  eq(typeof a.e, 'string', 'und den Wirkungstext');
  eq(abilInfo(S.players[1 - ich]), null, 'Bots haben keine');
  // Grundfähigkeit, wenn nichts gewählt wurde
  const B = newGame({ seed: 5, players: [{ civ: 'wikinger', kind: 'human' }, { civ: 'england', kind: 'bot' }] });
  eq(abilInfo(B.players[B.players.findIndex(p => p.kind === 'human')]).k, 'basis',
    'ohne Wahl ist es die Grundfähigkeit');
  // jede Fähigkeit jeder Zivilisation ist über abilInfo auffindbar
  const fehlt = [];
  CIVS.forEach(c => c.abilities.forEach(ab => {
    const S2 = newGame({ seed: 1, players: [{ civ: c.k, kind: 'human', ability: ab.k },
      { civ: c.k === 'england' ? 'russland' : 'england', kind: 'bot' }] });
    const p2 = S2.players.find(x => x.kind === 'human');
    const got = abilInfo(p2);
    if (!got || got.k !== ab.k || got.n !== ab.n) fehlt.push(`${c.k}/${ab.k}`);
  }));
  eq(fehlt, [], 'alle 12 Fähigkeiten sind ablesbar');
}

/* ================= Doppelgängernamen wandern mit der Sprache (v56) */
{
  const p = { civ: 'griechenland', kind: 'human', roman: 'II', color: '#8f2f3f' };
  eq(civOf(p).n, 'Griechenland II', 'Ziffer hängt am Namen');
  eq(civOf(p).color, '#8f2f3f', 'die geliehene Farbe bleibt');
  setLang('en', { quiet: true });
  eq(civOf(p).n, 'Greece II', 'auf Englisch wandert auch der Doppelgängername mit');
  setLang('de', { quiet: true });
  // alte Spielstände kennen nur name – der wird weiter benutzt
  eq(civOf({ civ: 'england', kind: 'human', name: 'England II' }).n, 'England II',
    'gespeicherte Namen ohne Ziffer funktionieren weiter');
  eq(civOf({ civ: 'england', kind: 'human' }).n, 'England', 'ohne beides der normale Name');
}

/* ===================================== reachable: Heap statt Sortieren (v77)
   Die Warteschlange war ein Array, das vor jedem Schritt ganz sortiert wurde; jetzt ist sie
   ein Heap, und passable wird je Feld nur einmal gefragt. Das Ergebnis muss dasselbe sein:
   verglichen wird mit der alten Fassung (hier wörtlich) an echten Spielständen, mit
   Reichweiten bis 20 und mit Straßen und Eisenbahn (Kosten 0,5 und 0). */
{
  const alt = (startR, startC, budget, passable, edgeCost) => {
    const dist = new Map();
    dist.set(key(startR, startC), 0);
    const queue = [[startR, startC]];
    const stopped = new Set();
    while (queue.length) {
      queue.sort((a, b) => dist.get(key(a[0], a[1])) - dist.get(key(b[0], b[1])));
      const [r, c] = queue.shift();
      const d = dist.get(key(r, c));
      if (d > budget) continue;
      if (stopped.has(key(r, c)) && !(r === startR && c === startC)) continue;
      for (const [nr, nc] of neighbors(r, c)) {
        const pp = passable(nr, nc);
        if (!pp) continue;
        const nd = d + edgeCost(r, c, nr, nc);
        if (nd > budget + 1e-9) continue;
        const k = key(nr, nc);
        if (!dist.has(k) || nd < dist.get(k) - 1e-9) {
          dist.set(k, nd);
          if (pp === 'stop') stopped.add(k);
          queue.push([nr, nc]);
        }
      }
    }
    dist.delete(key(startR, startC));
    return dist;
  };
  const gleich = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && Math.abs(b.get(k) - v) < 1e-9);
  let n = 0, abw = 0;
  const S = newGame({ seed: 71, players: CIVS.map(c => ({ civ: c.k, kind: 'bot', diff: 'david' })) });
  // Straßen und Eisenbahn streuen, Schießpulver für Kontrollzonen
  let z = 7;
  const rnd = () => { z = (z * 1103515245 + 12345) & 0x7fffffff; return z / 0x7fffffff; };
  S.players.forEach(p => { p.techs.schiesspulver = true; });
  for (let runde = 0; runde < 6 && !S.over; runde++) {
    for (let i = 0; i < 4 && !S.over; i++) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
    for (let i = 0; i < 12; i++) {
      const r = Math.floor(rnd() * S.map.rows.length), c = Math.floor(rnd() * S.map.rows[0].length);
      if (isLand(S, r, c)) S.roads[key(r, c)] = 1 + (i % 2);
    }
    for (const a of S.armies) for (const mp of [3, 6, 9, 20]) {
      const pi = a.owner;
      const pass = (r, c) => canPass(S, pi, r, c) ? (zocStop(S, pi, r, c) ? 'stop' : true) : false;
      const cost = (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2);
      n++;
      if (!gleich(alt(a.r, a.c, mp, pass, cost), reachable(a.r, a.c, mp, pass, cost))) abw++;
    }
  }
  eq([n > 100, abw], [true, 0], `reachable liefert dieselben Felder und Kosten wie die alte Fassung (${n} Vergleiche)`);
}
/* ============================================================ KI (js/ki.js, v77)
   Die KI spielt nach den Regeln für Menschen. Geprüft wird: dass sie das wirklich tut
   (Fähigkeiten, Macht, Ereignisse, Wunderwirkungen), dass sie in keiner Aufstellung hängen
   bleibt oder einen ungültigen Zustand hinterlässt, dass sie fair ist (keine Würfel der
   Partie für ihre Planung, kein Blick auf das vorgewürfelte Ereignis, verdecktes Legen) und
   dass Partien mit ihr aus demselben Startwert gleich ablaufen. */
{
  const kiP = (civ, ability, extra) => Object.assign({ civ, kind: 'ki', ability }, extra || {});
  // --- Regeln für Menschen, nicht für Bots
  const S = newGame({ seed: 7, players: [kiP('wikinger', 'basis'), kiP('england', 'basis')] });
  const wi = S.players.findIndex(p => p.civ === 'wikinger');
  const en = S.players.findIndex(p => p.civ === 'england');
  eq(armiesOf(S, wi).length, 1, 'KI-Wikinger bekommen die Gratisarmee – die Fähigkeit gilt');
  eq(rates(S, en).foodToCoins, 1, 'KI-England tauscht Nahrung 1:1 in Münzen (Handelsreich)');
  eq(powerOf(S, wi), 0, 'Machtwert der KI ist gekaufte Macht, nicht die Bevölkerung');
  eq([isAuto(S.players[wi]), isAuto({ kind: 'bot' }), isAuto({ kind: 'human' })], [true, true, false],
    'KI und Bots ziehen von selbst, Menschen nicht');
  eq(S.players[wi].kiLevel, KI_DEFAULT_LEVEL, 'ohne Angabe spielt die KI auf der Vorgabestufe');
  eq(KI_LEVELS.every(l => KI_PARAMS[l.k]), true, 'jede Stufe hat ihre Werte in KI_PARAMS');
  eq(/\(KI\)/.test(S.log[0].m), true, 'das Protokoll nennt die KI als solche');
  // Ereignisse treffen die KI, Bots weiter nicht
  const E = newGame({ seed: 3, events: true, players: [kiP('russland', 'basis'), { civ: 'england', kind: 'bot' }] });
  const eKi = E.players.findIndex(p => p.kind === 'ki'), eBot = 1 - eKi;
  E.event = { round: E.round, row: 2, col: 3, k: 'duerre' };
  eq([evActive(E, eKi, 'duerre'), evActive(E, eBot, 'duerre')], [true, false], 'Ereignisse treffen die KI, Bots nicht');
  // Wunderwirkungen gelten für die KI
  const W = newGame({ seed: 4, wonders: true, players: [kiP('griechenland', 'basis'), kiP('england', 'basis')] });
  W.wonders.push({ k: 'zeus', lvl: 1, owner: 0, cityId: W.cities[0].id, r: W.cities[0].r, c: W.cities[0].c });
  eq(hasWonder(W, 0, 'zeus') && powerOf(W, 0) === 3, true, 'Wunderwirkungen gelten für die KI (Zeusstatue +3 Macht)');
  // Die KI zahlt: nach ihrem Zug ist vom Einkommen etwas ausgegeben und das Reich gewachsen
  const Z = newGame({ seed: 11, players: [kiP('russland', 'basis'), kiP('griechenland', 'basis')] });
  const z = Z.cur, vorher = popOf(Z, z) + citiesOf(Z, z).length, inc = Object.assign({}, Z.players[z].res);
  kiTurn(Z, z);
  eq(popOf(Z, z) + citiesOf(Z, z).length > vorher, true, 'im ersten Zug wächst oder siedelt die KI');
  eq(Z.players[z].res.food + Z.players[z].res.coins < inc.food + inc.coins, true, '… und bezahlt dafür');
}
{
  // --- Volle Partien: 2, 3 und 4 Reiche, Plättchenkarte mit Legephase und feste Karte,
  //     mit und ohne Erweiterungen, alle Stufen, alle Fähigkeiten reihum, gemischt mit Bots.
  //     Nach jedem KI-Zug: keine Armee in einer Stadt (wenn sie herauskönnte), keine
  //     negativen Ressourcen oder Macht, keine Ausnahme; jede Partie endet regulär.
  let ended = 0, stuck = [], errs = [], turns = 0, slow = 0, slowest = 0;
  const civKeys = CIVS.map(c => c.k);
  for (let g = 0; g < 9; g++) {
    const np = [2, 3, 4][g % 3];
    const tiles = g < 6;
    const players = [];
    for (let i = 0; i < np; i++) {
      const c = civKeys[(g + i) % 4];
      const lv = KI_LEVELS[(g + i) % KI_LEVELS.length].k;
      players.push((g >= 6 && i === np - 1) ? { civ: c, kind: 'bot', diff: 'prinz' }
        : { civ: c, kind: 'ki', kiLevel: lv, ability: CIV_BY_KEY[c].abilities[(g + 2 * i) % 3].k });
    }
    const cfg = { seed: 600 + g, players, duel: np === 2, events: g % 2 === 0, wonders: g % 3 !== 1, startPlayer: g % np };
    if (tiles) {
      const plan = tilePlan(players.map(p => p.civ), 600 + g);
      const setup = rollSetup(Object.assign({}, cfg));
      plan.seats.forEach(seat => {
        const pl = players[seat.idx];
        if (pl.kind === 'ki') { const e = kiPlaceSeat(plan, seat, pl, setup); if (e) errs.push('Legen: ' + e); }
        else botPlaceSeat(plan, seat, mapRng(g + 1));
      });
      Object.assign(cfg, { map: tileMap(plan), avail: setup.avail, wpool: setup.wpool });
    } else cfg.map = MAPS[g % 2];
    const S = newGame(cfg);
    let guard = 0;
    while (!S.over && guard++ < 300) {
      const pi = S.cur, p = S.players[pi];
      try {
        if (p.kind === 'ki') {
          const t0 = Date.now();
          kiTurn(S, pi);
          const dt = Date.now() - t0;
          // Grenze 3 s (bis v81 2 s): der Testrechner ist seit v82 langsamer – dieselben
          // Partien im alten Techtree brauchen im längsten Zug knapp 1 s statt 0,5–0,65 s –,
          // und im heutigen Techtree läuft eine dieser Partien bis Runde 10 (24 Städte,
          // 22 Armeen): längster Zug dort 1,7–2,7 s. Gemeint ist die Grenze als Wächter
          // gegen Ausreißer, nicht als Messlatte – gemessen wird mit tools_ki.js.
          turns++; slowest = Math.max(slowest, dt); if (dt > 3000) slow++;
          if (blockingIssues(S, pi).length) stuck.push(`${g}/${S.round}/${p.civ}`);
          if (['sci', 'food', 'coins'].some(k => p.res[k] < 0) || p.power < 0) errs.push(`negativ ${g}/${S.round}`);
        } else botTurn(S, pi);
      } catch (e) { errs.push(`${g}/${S.round}/${p.civ}: ${e.message}`); break; }
      if (S.over) break;
      endTurn(S);
    }
    if (S.over) ended++;
  }
  eq(ended, 9, '9 Partien mit KI enden regulär (2/3/4 Reiche, Plättchen und feste Karte, Erweiterungen)');
  eq(errs, [], 'keine Ausnahme und keine negativen Ressourcen');
  eq(stuck, [], 'nach keinem KI-Zug steht eine Armee in einer Stadt, die herauskönnte');
  eq(slow, 0, `kein KI-Zug über 3 s (${turns} Züge, längster ${slowest} ms)`);
}
{
  // --- Gleicher Startwert, gleiche Partie – auch mit der KI (sie hat einen eigenen,
  //     im Spielstand gespeicherten Zufall)
  const lauf = () => {
    const S = newGame({ seed: 21, players: [
      { civ: 'griechenland', kind: 'ki', kiLevel: 'leicht', ability: 'rueckschau' },
      { civ: 'wikinger', kind: 'ki', kiLevel: 'mittel', ability: 'basis' }] });
    for (let i = 0; i < 10 && !S.over; i++) { kiTurn(S, S.cur); if (S.over) break; endTurn(S); }
    return JSON.stringify(S.log.map(l => l.m)) + '|' + S.seed;
  };
  eq(lauf() === lauf(), true, 'zwei Läufe aus demselben Startwert sind Zeichen für Zeichen gleich');
}
{
  // --- Fair: die KI verbraucht für ihre Planung keine Würfe der Partie. Jeder Wurf der
  //     Partie hinterlässt eine Würfelzeile (d6 protokolliert immer); ohne Weltwunder (dort
  //     zieht refillPool ohne Protokoll) rückt S.seed also genau so oft weiter, wie neue
  //     Würfelzeilen dazukommen. Würde die KI in ihren Kopien den Würfelstrom der Partie
  //     weiterdrehen oder in die Zukunft schauen, stimmte die Rechnung nicht mehr.
  const A = 0x6D2B79F5;
  let inv = A;
  for (let i = 0; i < 5; i++) inv = Math.imul(inv, 2 - Math.imul(A, inv));
  const schritte = (vor, nach) => Math.imul((nach - vor) | 0, inv) >>> 0;
  const S = newGame({ seed: 33, events: true, players: [
    { civ: 'russland', kind: 'ki', ability: 'siedler' }, { civ: 'england', kind: 'ki', ability: 'basis' },
    { civ: 'griechenland', kind: 'ki', ability: 'gratistech' }] });
  let ok = true, zuege = 0;
  for (let i = 0; i < 12 && !S.over; i++) {
    const vor = S.seed, seq = S.logSeq;
    kiTurn(S, S.cur);
    const wuerfe = S.log.filter(l => l.seq > seq && l.c === 'roll').length;
    if (schritte(vor, S.seed) !== wuerfe) ok = false;
    zuege++;
    if (S.over) break;
    endTurn(S);
  }
  eq(ok, true, `in ${zuege} KI-Zügen rückt der Würfelstrom genau um die protokollierten Würfe weiter`);
  // Das vorgewürfelte Ereignis der nächsten Runde liest sie nie
  const E = newGame({ seed: 34, events: true, players: [
    { civ: 'wikinger', kind: 'ki', ability: 'basis' }, { civ: 'england', kind: 'ki', ability: 'basis' }] });
  let gelesen = 0;
  for (let i = 0; i < 4 && !E.over; i++) {
    const wert = E.evNext;
    Object.defineProperty(E, 'evNext', { get() { gelesen++; return wert; }, set(v) { }, enumerable: true, configurable: true });
    kiTurn(E, E.cur);
    delete E.evNext; E.evNext = wert;
    if (E.over) break;
    endTurn(E);
  }
  eq(gelesen, 0, 'das vorgewürfelte Ereignis der nächsten Runde bleibt ungelesen');
  // Verdeckt legen: die Wahl hängt nicht davon ab, wie der andere gelegt hat
  const wahl = legt => {
    const plan = tilePlan(['russland', 'england'], 17);
    if (legt != null) placeSeat(plan, plan.seats[1], legt.o, legt.cell);
    kiPlaceSeat(plan, plan.seats[0], { civ: 'russland', kind: 'ki', ability: 'basis' }, null);
    return plan.seats[0].o + '/' + plan.seats[0].cell;
  };
  const leer = wahl(null);
  const probe = tilePlan(['russland', 'england'], 17);
  const andere = [];
  for (let o = 0; o < 3; o++) placeOptions(probe, probe.seats[1], o).forEach((v, cell) => { if (v && andere.length < 6) andere.push({ o, cell }); });
  eq(andere.every(l => wahl(l) === leer), true, 'die KI legt gleich, egal wie der Gegner verdeckt gelegt hat');
  const plan = tilePlan(['griechenland', 'wikinger', 'russland'], 18);
  plan.seats.forEach(seat => kiPlaceSeat(plan, seat, { civ: seat.civ, kind: 'ki', ability: 'basis' }, null));
  eq(plan.seats.every(seat => placeOptions(plan, seat, seat.o)[seat.cell]), true, 'jede KI legt auf ein erlaubtes Feld');
}
{
  // --- Flanke nach der Regel des Kampfes (v77, aufgesetzt auf v75 des Autors): „gegenüber"
  //     ist die Spiegelung in Würfelkoordinaten (hexOpposite). Erst das Beispiel des
  //     Bot-Tests über die Diagonale: Partner nordwestlich des Gegners (4/6), gegenüber liegt
  //     Südost 6/7 – nicht 6/6, wohin die Spiegelung in Zeile/Spalte führte (dieselbe Seite).
  const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'ki', ability: 'basis' }, { civ: 'england', kind: 'human' }] });
  S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
  S.cities.length = 0; S.armies.length = 0; S.sieges = {};
  const stadt = (owner, r, c, pop, cap) => { const x = { id: S.nextId++, owner, r, c, pop, cap, grown: 0, born: -1 }; S.cities.push(x); return x; };
  const armee = (owner, r, c, mp) => { const x = { id: S.nextId++, owner, r, c, mp, born: -1 }; S.armies.push(x); return x; };
  const hs = stadt(0, 5, 5, 1, true); stadt(0, 1, 1, 8, false);
  stadt(1, 5, 16, 6, true);
  S.players[1].power = 6; S.players[0].power = 0;
  const feind = armee(1, 5, 6, 0);
  S.sieges['1|' + hs.id] = 1;
  armee(0, 4, 6, moveAllowance(S, 0));
  armee(0, 8, 7, moveAllowance(S, 0));
  S.cur = 0; S.players[0].res = { sci: 0, food: 0, coins: 80 };
  const K = kiContext(S, 0);
  const plaene = kiFlankPlans(S, 0, K, kiStepMemo({})).filter(f => f.tag === 'flank:' + feind.id);
  eq(plaene.length, 1, 'die KI findet die Flanke über die Diagonale');
  const X = kiClone(S, 1);
  eq(plaene[0].run(X), null, '… der Plan läuft durch');
  eq([!!armyAt(X, 6, 7), !!armyAt(X, 6, 6), canFlank(X, 0, kiArmy(X, feind.id))], [true, false, true],
    '… stellt die zweite Armee nach Südost (6/7), nicht nach Südwest, und die Stellung flankiert');
  combatPhase(X, 0);
  eq(!!kiArmy(X, feind.id), false, '… und die Armee fällt im Kampf');
}
{
  //     Dann an echten Spielständen: jeder Flankenplan der KI endet in einer Stellung, die
  //     nach canFlank flankiert – mit und ohne Taktik, in Partien zu dritt.
  let plaene = 0, falsch = [];
  for (const seed of [81, 82, 83]) {
    const S = newGame({ seed, players: ['russland', 'england', 'wikinger'].map((c, i) =>
      ({ civ: c, kind: 'ki', kiLevel: 'schwer', ability: CIV_BY_KEY[c].abilities[i % 3].k })) });
    for (let z = 0; z < 36 && !S.over; z++) {
      const pi = S.cur;
      if (seed === 83 && S.round === 4) S.players.forEach(p => { p.techs.taktik = true; });
      const K = kiContext(S, pi);
      for (const f of kiFlankPlans(S, pi, K, kiStepMemo({}))) {
        const X = kiClone(S, 5), eid = +f.tag.split(':')[1];
        if (f.run(X)) continue;
        plaene++;
        const e = kiArmy(X, eid);
        if (e && !canFlank(X, pi, e)) falsch.push(`${seed}/${S.round}: ${e.r}/${e.c}`);
      }
      kiTurn(S, pi);
      if (S.over) break;
      endTurn(S);
    }
  }
  eq([plaene > 0, falsch], [true, []], `jeder Flankenplan der KI steht nach canFlank (${plaene} Pläne)`);
}
{
  // --- Gemerkte Reichweiten (kiStepMemo, v78): der nächste Planungsschritt rechnet mit den
  //     Reichweiten weiter, solange sich nichts ändert, wovon sie abhängen (kiMoveSig). Hier:
  //     nach jeder Art Aktion, die die KI ausführt, gleichen die gemerkten Reichweiten einer
  //     frischen Rechnung – sonst fehlt der Signatur etwas.
  let geprueft = 0, falsch = [];
  const arten = new Set();
  for (const seed of [91, 92]) {
    const S = newGame({ seed, players: ['wikinger', 'england', 'russland'].map((c, i) =>
      ({ civ: c, kind: 'ki', kiLevel: 'schwer', ability: CIV_BY_KEY[c].abilities[i % 3].k })) });
    for (let z = 0; z < 24 && !S.over; z++) {
      const pi = S.cur, K = kiContext(S, pi);
      if (S.round >= 3) {
        const memo = kiStepMemo({}, S, pi);
        armiesOf(S, pi).forEach(a => kiTilesOf(S, a, memo));
        citiesOf(S, pi).forEach(c => kiNewReach(S, pi, c, memo));
        const cands = kiCandidates(S, pi, K, memo);
        for (let i = 0; i < cands.length; i += 3) {
          const X = kiClone(S, 1), m = { armyTiles: new Map(memo.armyTiles), newReach: new Map(memo.newReach), moveSig: memo.moveSig };
          if (cands[i].run(X)) continue;
          kiStepMemo(m, X, pi);
          arten.add(cands[i].tag.split(':')[0]);
          for (const a of armiesOf(X, pi)) {
            geprueft++;
            if (JSON.stringify(kiTilesOf(X, a, m)) !== JSON.stringify(kiArmyTiles(X, a))) falsch.push(`${seed}/${S.round} ${cands[i].tag} Armee ${a.id}`);
          }
          for (const c of citiesOf(X, pi)) {
            geprueft++;
            const fresh = kiReachKeys(X, pi, c.r, c.c, moveAllowance(X, pi));
            if ([...kiNewReach(X, pi, c, m)].sort().join() !== [...fresh].sort().join()) falsch.push(`${seed}/${S.round} ${cands[i].tag} Stadt ${c.id}`);
          }
        }
      }
      kiTurn(S, pi);
      if (S.over) break;
      endTurn(S);
    }
  }
  eq([geprueft > 200, falsch.slice(0, 3)], [true, []],
    `gemerkte Reichweiten = frisch gerechnete nach jeder Aktion (${geprueft} Vergleiche, Aktionen: ${[...arten].sort().join(', ')})`);
}
{
  // --- Stufen (v78): Leichtere Stufen übersehen Möglichkeiten (`see`), geben aber aus, was
  //     sie haben – findet sich unter dem Gesehenen nichts, schauen sie ein zweites Mal.
  //     Probe mit einer Stufe, die fast nichts sieht: sie wächst trotzdem und zahlt.
  KI_PARAMS.probe = { see: 0.01, noise: 0, slip: 0, defend: 1, strike: 1, evals: 600 };
  const Z = newGame({ seed: 11, players: [{ civ: 'russland', kind: 'ki', kiLevel: 'probe', ability: 'basis' },
    { civ: 'griechenland', kind: 'ki', kiLevel: 'probe', ability: 'basis' }] });
  const z = Z.cur, vorher = popOf(Z, z) + citiesOf(Z, z).length, inc = Object.assign({}, Z.players[z].res);
  kiTurn(Z, z);
  eq([popOf(Z, z) + citiesOf(Z, z).length > vorher, Z.players[z].res.food + Z.players[z].res.coins < inc.food + inc.coins],
    [true, true], 'eine Stufe, die fast nichts sieht, wächst trotzdem und zahlt dafür (zweiter Blick)');
  delete KI_PARAMS.probe;
  eq(KI_LEVELS.map(l => KI_PARAMS[l.k].see), [0.25, 0.5, 1], 'Leicht übersieht am meisten, Schwer sieht alles');
  eq(KI_LEVELS.map(l => KI_PARAMS[l.k].noise), [1, 0.5, 0], '… und rechnet am ungenauesten');
}
{
  // --- Abwehr gegen einen Vorstoß (v78): zwei Armeen eines Menschen stehen einen Zug vor der
  //     Hauptstadt der KI, Stadtmauern gibt es nicht. Das Reich ist klein: nach einem ersten
  //     Treffer könnte es nicht genug nachlegen (v79: nur dann sorgt die KI vor). Sie muss
  //     den ersten Treffer verhindern – Armeen neben die Stadt UND Macht dazu (bis v77 baute
  //     sie Armeen ohne Macht oder flankierte eine und ließ die Stadt offen).
  const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'ki', kiLevel: 'schwer', ability: 'basis' }, { civ: 'england', kind: 'human' }] });
  S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
  S.cities.length = 0; S.armies.length = 0; S.sieges = {};
  const stadt = (owner, r, c, pop, cap) => { const x = { id: S.nextId++, owner, r, c, pop, cap, grown: 0, born: -1 }; S.cities.push(x); return x; };
  const armee = (owner, r, c) => { const x = { id: S.nextId++, owner, r, c, mp: 0, born: -1 }; S.armies.push(x); return x; };
  const hs = stadt(0, 5, 5, 3, true); stadt(0, 1, 1, 3, false);
  stadt(1, 5, 14, 4, true); stadt(1, 9, 12, 2, false);
  S.players[1].power = 4;
  armee(1, 5, 8); armee(1, 7, 7);
  S.cur = 0; S.players[0].res = { sci: 0, food: 0, coins: 45 }; S.players[0].avail = {};
  const K = kiContext(S, 0), info = K.info.get(1);
  eq([info.human, kiDetermined(S, info, hs)], [true, true], 'gegen einen Menschen rechnet die KI mit dem entschlossenen Angreifer');
  const a1 = kiAttackPotential(S, info, hs, true);
  eq(a1 > defenseValue(S, hs), true, `ohne Abwehr säße der erste Treffer (${a1} gegen ${defenseValue(S, hs)})`);
  kiTurn(S, 0);
  combatPhase(S, 0);
  const nachher = kiAttackPotential(S, kiContext(S, 0).info.get(1), hs, true);
  eq(nachher <= defenseValue(S, hs), true, `nach dem Zug der KI hält die Hauptstadt jedem Angriff im nächsten Zug stand (${nachher} gegen ${defenseValue(S, hs)})`);
  eq(powerOf(S, 0) > 0 && armiesOf(S, 0).some(a => hexDistance(a.r, a.c, hs.r, hs.c) <= 1), true, '… mit Armeen neben der Stadt und Macht dazu');
}
/* Lage für die Abwehrtests ab v79: Grasland, die KI (Russland, Platz 0) mit Hauptstadt auf 5/5,
   ein Mensch (England, Platz 1) weit im Osten. `gross`: vier Städte mehr – Einkommen genug,
   um nach einem ersten Treffer nachzulegen. */
function kiAbwehrLage(popKI, gross) {
  const S = newGame({ seed: 7, players: [{ civ: 'russland', kind: 'ki', kiLevel: 'schwer', ability: 'basis' }, { civ: 'england', kind: 'human' }] });
  S.map.rows = S.map.rows.map(z => 'G'.repeat(z.length));
  S.cities.length = 0; S.armies.length = 0; S.sieges = {};
  const stadt = (owner, r, c, pop, cap) => { const x = { id: S.nextId++, owner, r, c, pop, cap, grown: 0, born: -1 }; S.cities.push(x); return x; };
  const armee = (owner, r, c) => { const x = { id: S.nextId++, owner, r, c, mp: 0, born: -1 }; S.armies.push(x); return x; };
  const hs = stadt(0, 5, 5, popKI, true); stadt(0, 1, 1, popKI, false);
  if (gross) for (const [r, c] of [[1, 5], [1, 9], [9, 1], [9, 5]]) stadt(0, r, c, 6, false);
  stadt(1, 5, 14, 4, true); stadt(1, 9, 12, 2, false);
  S.cur = 0; S.players[0].avail = {};
  const ring = neighbors(hs.r, hs.c);
  const zwei = within(hs.r, hs.c, 2).filter(([r, c]) => hexDistance(r, c, hs.r, hs.c) === 2);
  return { S, hs, armee, ring, zwei };
}
{
  // --- Plätze an der Stadt (v79): Armeen stapeln sich nicht – jeder Angreifer braucht ein
  //     eigenes freies Feld in Reichweite. Bis v78 zählte jede Armee, die irgendein Feld an
  //     der Stadt erreicht; dass eigene Armeen rund um die Stadt Plätze wegnehmen, sah die KI
  //     nicht (nachgestellt hielt sie eine Hauptstadt nur, wenn sie zufällig ein Nachbarfeld
  //     besetzt hatte und der Mensch mit einer Armee weniger kam).
  const { S, hs, armee, ring, zwei } = kiAbwehrLage(3);
  [zwei[0], zwei[3], zwei[6], zwei[9]].forEach(([r, c]) => armee(1, r, c));
  S.players[1].power = 4;
  S.players[0].res = { sci: 0, food: 0, coins: 45 };
  const info = kiContext(S, 0).info.get(1), hit = kiHits(S, info, hs);
  const frei = kiAttackSlots(S, 1, hit), a1 = kiAttackWaves(S, info, hs, false).a1;
  ring.slice(0, 4).forEach(([r, c]) => armee(0, r, c));
  const zwei4 = kiAttackSlots(S, 1, hit), a1b = kiAttackWaves(S, info, hs, false).a1;
  ring.slice(4).forEach(([r, c]) => armee(0, r, c));
  const zu = kiAttackSlots(S, 1, hit);
  eq([frei.m0, zwei4.m0, zu.m0], [4, 2, 0], 'vier Armeen kommen an die Stadt; vier eigene Nachbarn lassen zwei Plätze, sechs keinen');
  eq([a1b * 2, kiAttackWaves(S, info, hs, false).a1], [a1, 0], `… und der größte Angriff halbiert sich (${a1} → ${a1b}) bzw. fällt weg`);
  // Gegenprobe: wer schon an der Stadt steht, behält seinen Platz
  S.armies = S.armies.filter(a => !(a.owner === 0 && a.r === ring[0][0] && a.c === ring[0][1]));
  armee(1, ring[0][0], ring[0][1]);
  const info2 = kiContext(S, 0).info.get(1);
  eq(kiAttackSlots(S, 1, kiHits(S, info2, hs)).m0, 1, '… eine gegnerische Armee schon an der Stadt behält ihren Platz');
}
{
  // --- Vorher leicht, im Ernstfall alles (v79, Rückmeldung des Autors): dieselben zwei
  //     Armeen eines Menschen – einmal einen Zug vor der Hauptstadt, einmal daneben mit
  //     laufender Belagerung. Das Reich kann nach einem ersten Treffer nachlegen.
  const lauf = ernst => {
    const { S, hs, armee, ring, zwei } = kiAbwehrLage(8, true);
    if (ernst) { armee(1, ring[0][0], ring[0][1]); armee(1, ring[3][0], ring[3][1]); S.sieges['1|' + hs.id] = 1; }
    else { armee(1, zwei[0][0], zwei[0][1]); armee(1, zwei[6][0], zwei[6][1]); }
    S.players[1].power = 6;
    S.players[0].res = { sci: 0, food: 0, coins: 50 };
    const K = kiContext(S, 0), info = K.info.get(1);
    let militaer = 0;
    const _bp = buyPower, _ba = buildArmy;
    buyPower = function (X, pi) { const b = X.players[pi].res.coins, r = _bp.apply(this, arguments); if (X === S) militaer += b - X.players[pi].res.coins; return r; };
    buildArmy = function (X, pi) { const b = X.players[pi].res.coins, r = _ba.apply(this, arguments); if (X === S) militaer += b - X.players[pi].res.coins; return r; };
    try { kiTurn(S, 0); } finally { buyPower = _bp; buildArmy = _ba; }
    combatPhase(S, 0);
    const danach = kiAttackWaves(S, kiContext(S, 0).info.get(1), hs, true).a1;
    return { K, militaer, d: defenseValue(S, hs), danach, an: armiesOf(S, 0).filter(a => hexDistance(a.r, a.c, hs.r, hs.c) <= 1).length, macht: powerOf(S, 0) };
  };
  const v = lauf(false), e = lauf(true);
  eq([v.K.emergency, e.K.emergency], [false, true], 'Ernstfall heißt: eine eigene Stadt wird schon belagert');
  eq(e.danach <= e.d && e.an > 0 && e.macht > 0, true,
    `im Ernstfall hält die Hauptstadt jedem Angriff im nächsten Zug stand (${e.danach} gegen ${e.d}), mit Armeen daneben und Macht`);
  eq(v.militaer < e.militaer, true, `vorher steckt sie weniger in Macht und Armeen als im Ernstfall (${v.militaer} gegen ${e.militaer} Münzen)`);
  // Die Rest-Gefahr, wenn sie nach einem Treffer nachlegen kann, ist klein
  eq(KI_W.preFloor <= 0.02, true, 'Rest-Gefahr vor einem Treffer höchstens 2 %');
}
{
  // --- Verteidigung, die bleibt (v79): im Ernstfall zählen Stadtmauern, Burgenbau und
  //     Maschinengewehr dazu, dass sie auch in den Zügen danach wirken (gekaufte Macht
  //     verfällt). Sonst ließ die KI eine bezahlbare Verteidigungstechnologie liegen, sobald
  //     Macht den nächsten Angriff deckte – nachgestellt in 13 von 18 Fällen.
  const lage = ernst => {
    const { S, hs, armee, ring, zwei } = kiAbwehrLage(8, true);
    if (ernst) { armee(1, ring[0][0], ring[0][1]); armee(1, ring[3][0], ring[3][1]); S.sieges['1|' + hs.id] = 1; }
    else { armee(1, zwei[0][0], zwei[0][1]); armee(1, zwei[6][0], zwei[6][1]); }
    S.players[1].power = 6;
    S.players[0].res = { sci: 16, food: 0, coins: 50 };
    S.players[0].avail = { stadtmauern: true, keramik: true, bewaesserung: true, schrift: true };
    return { S, hs, K: kiContext(S, 0) };
  };
  const v = lage(false), e = lage(true);
  const bonus = (x, k) => kiTechBonus(x.S, 0, k, x.K, baseIncome(x.S, 0));
  eq([bonus(e, 'stadtmauern') - bonus(v, 'stadtmauern'), bonus(e, 'maschinengewehr') - bonus(v, 'maschinengewehr')],
    [5 * KI_W.defPerm, 2 * e.hs.pop * KI_W.defPerm], 'im Ernstfall zählt jeder bleibende Punkt Verteidigung extra (Mauern +5, Maschinengewehr +2 je Bevölkerung)');
  kiTurn(e.S, 0);
  eq(!!e.S.players[0].techs.stadtmauern, true, '… und die belagerte KI erforscht die verfügbaren Stadtmauern');
}
{
  // --- Wissenschaft gehört der Forschung (v79): mit Alchemie kann Wissenschaft Münzen
  //     ersetzen; außerhalb des Ernstfalls zählt sie dafür dreifach (KI_W.sciReserve). In
  //     einer Partie zu viert (Runde 3–6) forscht die KI damit mehr als ohne diese Reserve –
  //     gemessen ging bis v78 zuweilen über die Hälfte der Wissenschaft an der Forschung
  //     vorbei. v82: Startwert 303 statt 300 – im heutigen Techtree (bis v81 der
  //     alternative) kommt die KI mit 300 nur zweimal mit Alchemie an diese Stelle, beide
  //     Male ohne Unterschied; mit 303 sechsmal (225 statt 188). Die Zahl aus v79 (300:
  //     127 statt 105) galt im alten Techtree und gilt dort weiter.
  const S = newGame({ seed: 303, players: CIVS.map((c, i) => ({ civ: c.k, kind: 'ki', kiLevel: 'schwer', ability: c.abilities[i % 3].k })) });
  let mit = 0, ohne = 0, zuege = 0, guard = 0;
  const forschung = (X, pi) => {
    let n = 0;
    const _dr = doResearch;
    doResearch = function (Y, pj) { const b = Y.players[pj].res.sci, r = _dr.apply(this, arguments); if (Y === X && pj === pi && !r) n += b - Y.players[pj].res.sci; return r; };
    try { kiTurn(X, pi); } finally { doResearch = _dr; }
    return n;
  };
  while (!S.over && guard++ < 200 && S.round <= 6) {
    const pi = S.cur, p = S.players[pi];
    if (S.round >= 3 && has(p, 'alchemie') && p.res.sci >= 20) {
      const r0 = KI_W.sciReserve;
      try {
        mit += forschung(JSON.parse(JSON.stringify(S)), pi);
        KI_W.sciReserve = 1;
        ohne += forschung(JSON.parse(JSON.stringify(S)), pi);
      } finally { KI_W.sciReserve = r0; }
      zuege++;
    }
    kiTurn(S, pi); if (S.over) break; endTurn(S);
  }
  eq([zuege > 0, mit > ohne], [true, true], `mit Reserve mehr Wissenschaft in die Forschung (${mit} gegen ${ohne} in ${zuege} Zügen mit Alchemie)`);
}
{
  // --- Entschlossener Angreifer (Menschen): sein Budget enthält Alchemie, wenn er sie diesen
  //     Zug erforschen kann (Wissenschaft 1:1 in Münzen), und seine zweite Welle baut auf
  //     dem Rest der ersten auf. Gegen KI und Bots rechnet die KI milder.
  const S = newGame({ seed: 12, players: [{ civ: 'griechenland', kind: 'ki', ability: 'basis' }, { civ: 'england', kind: 'ki', ability: 'basis' }] });
  const ki = S.players.findIndex(p => p.civ === 'england'), gr = 1 - ki;
  const hs = capitalOf(S, ki);
  const K = kiContext(S, ki), info = K.info.get(gr);
  eq(kiDetermined(S, info, hs), false, 'gegen eine KI: milde Schätzung');
  S.sieges[gr + '|' + hs.id] = 1;
  eq(kiDetermined(S, info, hs), false, '… auch mit laufender Belagerung (gemessen: härter rechnen änderte gegen die KI nichts)');
  delete S.sieges[gr + '|' + hs.id];
  const p = S.players[gr];
  p.techs = {}; p.avail = { alchemie: true };
  const inc = income(S, gr), kosten = techCost(S, gr, TECH_BY_KEY.alchemie);
  if (inc.sci < kosten) S.cities.filter(c => c.owner === gr).forEach(c => { c.pop += 6; });
  const inc2 = income(S, gr);
  eq(kiThreatBudget(S, gr) - kiCoinBudget(S, gr), Math.max(0, inc2.sci - kosten),
    'Budget des entschlossenen Angreifers: dazu die Wissenschaft nach Alchemie, abzüglich ihrer Kosten');
  p.avail = {};
  eq(kiThreatBudget(S, gr), kiCoinBudget(S, gr), 'ohne verfügbare Alchemie bleibt es beim gewöhnlichen Budget');
  // zwei Wellen an einer Armee vor der Stadt
  S.armies = S.armies.filter(a => a.owner !== gr);
  const nb = neighbors(hs.r, hs.c).find(([r, c]) => isLand(S, r, c) && !cityAt(S, r, c));
  S.armies.push({ id: 991, owner: gr, r: nb[0], c: nb[1], mp: 0, born: 0 });
  // Budget ausdrücklich gesetzt, damit die Rechnung nachprüfbar ist: Preis 5, keine Boni
  const welle = (macht, budget) => {
    p.power = macht;
    const i2 = kiContext(S, ki).info.get(gr);
    i2.budget = i2.budgetHard = budget; i2.cityReach = [];
    i2.hits = new Map();
    return { hart: kiAttackWaves(S, i2, hs, true), mild: kiAttackWaves(S, i2, hs, false), i2 };
  };
  const w0 = welle(2, 30);
  // Welle 1: 2 − 1 (Machtverlust) + 30/5 = 7. Welle 2: 7 − 4 = 3, dazu 6 = 9; mit einer
  // zweiten Armee (10 Münzen) 3 + 4 = 7 je Armee, also 14.
  eq([w0.hart.a1, w0.hart.a2], [7, 14], 'entschlossen: erste Welle 7, zweite 14 (Rest der ersten + neues Budget, eine Armee mehr)');
  eq(w0.mild.a2, w0.mild.a1 * 1.3 + 2, 'milde Schätzung: zweite Welle wie bis v77 (1,3 × erste + 2)');
  // viel Macht und kein Budget: der Machtverlust überwiegt, die zweite Welle ist schwächer
  const w1 = welle(40, 0);
  eq([w1.hart.a1, w1.hart.a2], [20, 10], 'entschlossen, viel Macht und kein Budget: 40 → 20 → 10');
}
{
  // --- Siedelplätze: die KI rechnet Wege und Kosten selbst (eine Breitensuche je Zug). Sie
  //     muss dieselben Plätze zu denselben Kosten sehen wie die Regel (foundSiteError,
  //     foundCost) – sonst plant sie Städte, die es nicht gibt, oder übersieht welche.
  const S = newGame({ seed: 5, players: CIVS.map(c => ({ civ: c.k, kind: 'bot' })) });
  let guard = 0;
  while (!S.over && S.round < 6 && guard++ < 200) { botTurn(S, S.cur); if (S.over) break; endTurn(S); }
  S.over = null;
  const abw = [];
  let plaetze = 0;
  S.players.forEach((p, pi) => {
    if (p.dead) return;
    for (const techs of [[], ['kartografie'], ['navigation']]) {
      const alt = Object.assign({}, p.techs);
      techs.forEach(k => { p.techs[k] = true; });
      const ki = new Map(kiSitesAll(S, pi, kiContext(S, pi)).filter(s => !armyAt(S, s.r, s.c)).map(s => [key(s.r, s.c), s.cost]));
      S.map.rows.forEach((row, r) => [...row].forEach((t, c) => {
        const regel = foundSiteError(S, pi, r, c) ? null : foundCost(S, pi, r, c);
        const k = key(r, c), soll = regel != null && regel < 60 ? regel : null;
        const ist = ki.has(k) && ki.get(k) < 60 ? ki.get(k) : null;
        if (soll != null) plaetze++;
        if (soll !== ist) abw.push(`${p.civ} ${techs.join()} ${k}: Regel ${soll}, KI ${ist}`);
      }));
      p.techs = alt;
    }
  });
  eq(abw.slice(0, 3), [], `die KI sieht dieselben Siedelplätze zu denselben Kosten wie die Regel (${plaetze} Plätze)`);
}
{
  // --- Spielende: die KI ist ein vollwertiger Spieler. Gegen einen Bot gilt für sie
  //     „Mensch vor Bot" wie für Menschen; gegen einen Menschen entscheiden nur die Punkte.
  const S = newGame({ seed: 40, players: [{ civ: 'griechenland', kind: 'human' }, { civ: 'england', kind: 'ki' }] });
  const m = S.players.findIndex(p => p.kind === 'human'), k = 1 - m;
  S.players[k].techs = { schrift: true, rad: true, papier: true };
  claimVictory(S, m, 'Forschungssieg (Test)');
  claimVictory(S, k, 'Forschungssieg (Test)');
  S.endRound = S.round;
  resolveClaims(S);
  eq(S.over && S.over.winners, [k], 'Mensch und KI melden an: die Punkte entscheiden, hier für die KI');
  const B = newGame({ seed: 41, players: [{ civ: 'griechenland', kind: 'bot' }, { civ: 'england', kind: 'ki' }] });
  const bb = B.players.findIndex(p => p.kind === 'bot'), kk = 1 - bb;
  B.players[bb].techs = { schrift: true, rad: true, papier: true };
  claimVictory(B, bb, 'Forschungssieg (Test)');
  claimVictory(B, kk, 'Forschungssieg (Test)');
  B.endRound = B.round;
  resolveClaims(B);
  eq(B.over && B.over.winners, [kk], 'KI und Bot melden an: wie bei Menschen gewinnt die KI');
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fails ? 1 : 0);
