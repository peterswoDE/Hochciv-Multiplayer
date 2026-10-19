/* Hochzeivilization – Tutorial als geführtes Übungsspiel auf Schienen.

   Läuft in der normalen Spieloberfläche: echte Karte, echte Kopfzeile, echte
   Aktionsleiste. Unter der Karte erklärt ein Panel, was zu tun ist, und sagt jeweils
   genau, wo man tippen muss.

   Deterministisch: fester Startwert, und die verfügbaren Technologien des Spielers werden
   je Schritt gesetzt statt gewürfelt. Der Spieler kann nur die vorgesehenen Aktionen
   ausführen (tutAllow → Aktionsleiste, Aktionsblatt, Technologiebogen, Zugziel), damit die
   Partie bis zum Ende des Tutorials genau denselben Verlauf nimmt. Anschauen und
   Kartenerkunden bleibt jederzeit frei.

   Zahlen im Text kommen immer aus dem laufenden Spielstand, nie aus einer Textkopie. */

const TUT_SEED = 20250817;
/* Feste Würfelfolge. Solange das Tutorial läuft, zieht d6() seine Werte hier heraus –
   damit sind auch die Bot-Züge auf Schienen und jeder Durchlauf ist identisch. Jede Zahl von
   1 bis 6 kommt vor – sonst könnten die Auswürfel-Schleifen im Kreis laufen. Diese Folge ist
   aus mehreren Kandidaten die, mit der die Beispielpartie sauber aufgeht: die Bots wachsen
   und siedeln sichtbar, Griechenland belagert die Grenzstadt, und die Belagerung bricht am
   Ende, wenn der Spieler Mauern, Burgenbau und Macht genommen hat. */
const TUT_DICE = [3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2];
function tutNextDie() {
  if (typeof ui === 'undefined' || !ui || !ui.tut) return null;
  // Ein Schritt kann die nächsten Würfe vorgeben (dice), damit z. B. die Technologie des
  // nächsten Zeitalters wirklich ausgewürfelt wird und nicht heimlich gesetzt werden muss.
  if (ui.tut.pre && ui.tut.pre.length) return ui.tut.pre.shift();
  const v = TUT_DICE[(ui.tut.die || 0) % TUT_DICE.length];
  ui.tut.die = (ui.tut.die || 0) + 1;
  return v;
}
const RU = () => S.players.findIndex(p => p.civ === 'russland');
const tutP = () => S.players[RU()];
const tutRes = () => tutP().res;
const tutCap = () => capitalOf(S, RU());
const cityOn = (r, c) => cityAt(S, r, c);
const tutSiegeCity = () => ui.tutSiege && S.cities.find(c => c.id === ui.tutSiege.cityId);
const tutSiegeArmy = () => ui.tutSiege && S.armies.find(a => a.id === ui.tutSiege.armyId);
// Startverfügbarkeit wie im Beispielspiel: in Forschung nur Schrift
const TUT_START_AVAIL = ['schrift', 'fischerei', 'rad', 'keramik',
  'eisenverarbeitung', 'belagerung', 'stadtmauern', 'demokratie'];
/* Was Griechenland im Militärfeld erforscht – vorgegeben statt gewürfelt.
   Grund: Mit Stadtmauern und Burgenbau käme seine Hauptstadt auf 13 Verteidigung, und
   die Drohung im Gegenangriffs-Schritt wäre bloß symbolisch. Mit Eisenverarbeitung und
   Stahl bleibt sie bei ihrer Bevölkerung plus den Armeen daneben – zieht der Bot seine
   Armeen nicht zurück, fällt sie tatsächlich.
   WICHTIG: Die Würfe selbst laufen unverändert weiter (botResearch würfelt normal und
   tauscht nur das Ergebnis), damit sich die feste Würfelfolge nicht verschiebt. */
const TUT_FOE_MILITARY = ['eisenverarbeitung', 'stahl'];
function tutBotTech(S, pi, field) {
  if (typeof ui === 'undefined' || !ui || !ui.tut) return null;
  if (field !== 2) return null;                                  // nur das Militärfeld
  const p = S.players[pi];
  if (!p || p.civ !== 'griechenland') return null;
  const k = TUT_FOE_MILITARY.find(x => !p.techs[x]);
  return k ? TECH_BY_KEY[k] : null;
}
// Die Felder, auf denen im Tutorial gegründet wird
const TUT_CITY_1 = [3, 12];
const TUT_CITY_2 = [6, 13];
const TUT_CITY_3 = [7, 15];
const TUT_ARMY_TO = [5, 12];
/* Das Feld neben Griechenlands Hauptstadt, von dem aus die Armee sie bedroht.
   Gemessen: von 5/12 aus ist bei 3 Bewegungspunkten NUR dieses Feld erreichbar (Kosten
   genau 3) – die anderen Nachbarn sind Meer oder zu weit. Deshalb eine Rückfallebene:
   sollte es einmal belegt oder unerreichbar sein, nimmt tutStrikeSpot das nächstbeste
   erreichbare Feld, das die Hauptstadt noch bedroht. */
const TUT_STRIKE = [8, 11];
/* Die vier Felder, auf denen im Tutorial Straßen gebaut werden: sie verbinden alle drei übrigen
   Städte mit der Hauptstadt. Gemessen: vier Straßen für vier Münzen ergeben +3 auf jeden
   Ertrag (drei angebundene Städte à +1). */
const TUT_ROADS = [[4, 13], [5, 13], [5, 14], [6, 15]];
function tutStrikeSpot() {
  const ru = RU();
  const gr = S.players.findIndex(p => p.civ === 'griechenland');
  const gcap = capitalOf(S, gr);
  const army = armiesOf(S, ru)[0];
  if (!gcap || !army) return TUT_STRIKE;
  const rng = attackRange(S, ru);
  const mp = moveAllowance(S, ru);
  const reach = reachable(army.r, army.c, mp,
    (r, c) => canPass(S, ru, r, c) ? (zocStop(S, ru, r, c) ? 'stop' : true) : false,
    (r1, c1, r2, c2) => moveCost(S, r1, c1, r2, c2));
  const ok = ([r, c]) => reach.has(key(r, c)) && canStop(S, ru, r, c) && !cityAt(S, r, c)
    && hexDistance(r, c, gcap.r, gcap.c) <= rng;
  if (ok(TUT_STRIKE)) return TUT_STRIKE;
  const alt = [...reach.keys()].map(unkey).filter(ok)
    .sort((x, y) => reach.get(key(x[0], x[1])) - reach.get(key(y[0], y[1])));
  return alt[0] || TUT_STRIKE;
}

/* Was ein Feld als Stadtplatz tatsächlich bringt: Geländemischung ringsum und der
   Einkommenszuwachs, gerechnet am echten Spielstand. */
function tutNeighbourText(r, c) {
  const cnt = {};
  for (const [a, b] of neighbors(r, c)) {
    const t = terrainAt(S, a, b);
    if (t) cnt[t] = (cnt[t] || 0) + 1;
  }
  return Object.entries(cnt).sort((x, y) => y[1] - x[1])
    .map(([t, n]) => `${n} × ${TERRAIN[t].name}`).join(', ');
}
function tutGain(r, c) { return settleGain(S, RU(), r, c); }
/* Der Wunschplatz aus der Beispielpartie – falls ihn ein Bot vorher besiedelt hat, das
   beste erreichbare und bezahlbare Feld in der Nähe (deterministisch sortiert). */
function tutSpot(pref) {
  if (!canFound(S, RU(), ...pref) && foundCost(S, RU(), ...pref) <= tutRes().food) return pref;
  const cap = tutCap();
  const list = within(cap.r, cap.c, 5)
    .filter(([r, c]) => !canFound(S, RU(), r, c) && foundCost(S, RU(), r, c) <= tutRes().food);
  // bester Nahrungszuwachs, dann billigster Weg, dann feste Reihenfolge (Determinismus)
  list.sort((a, b) => tutGain(...b).food - tutGain(...a).food ||
    foundCost(S, RU(), ...a) - foundCost(S, RU(), ...b) || a[0] - b[0] || a[1] - b[1]);
  return list[0] || pref;
}
/* Wachfeld für die Armee: das Wunschfeld, sonst das erreichbare Randfeld, das der
   griechischen Hauptstadt am nächsten liegt. */
function tutGuardSpot(army, pref) {
  const reach = [...armyReach(S, army).keys()].map(unkey).filter(([r, c]) => canStop(S, RU(), r, c));
  if (reach.some(([r, c]) => r === pref[0] && c === pref[1])) return pref;
  const foe = capitalOf(S, S.players.findIndex(p => p.civ === 'griechenland'));
  if (!reach.length || !foe) return pref;
  reach.sort((a, b) => hexDistance(foe.r, foe.c, ...a) - hexDistance(foe.r, foe.c, ...b) ||
    a[0] - b[0] || a[1] - b[1]);
  return reach[0];
}

const TUT_STEPS = [
  /* ------------------------------------------------------------------ Runde 1 */
  {
    t: 'Hochzeivilization',
    html: () => T('<p>Hochzeivilization ist ein Spiel, bei dem vier Zivilisationen ihr Reich von der Antike in die Moderne führen. Alle Reiche beginnen mit nur einer einzigen Stadt, werden aber schon bald expandieren, ihre Bevölkerung vergrößern, neue Technologien erforschen und Armeen bauen. Eine Zivilisation gewinnt durch wirtschaftliche, militärische oder Technologische Vorherrschaft. Wie genau das im Detail funktioniert, wird später erklärt.</p> <p>Du spielst <b>Russland</b>, die anderen drei Reiche übernehmen Bots auf dem höchsten Schwierigkeitsgrad „David".</p> <p>Golden umrandet ist deine <b>Hauptstadt</b>: Der Kreis mit Symbol ist die Stadt, die Striche daneben symbolisieren die Bevölkerung. Die Linie um die Felder darum ist die Reichsgrenze. <p>Gezogen wird immer in derselben Reihenfolge: <b>Russland (grün) → Griechenland (blau) → England (rot) → Wikingerreich (lila)</b>. Wo die Runde beginnt, hängt vom Startspieler ab, hier bist das du.</p> <p class="tut-note">Im Tutorial sind nur die Schritte dieser Beispielpartie möglich – so bleibt alles nachvollziehbar. „Tutorial beenden" gibt alles frei.</p>'),
    kurz: () => T('<p>Vier Reiche führen ihre Zivilisation von der Antike in die Moderne. Du spielst <b>Russland</b> (grün), die anderen drei Reiche werden von Bots gespielt. Gezogen wird <b>Russland → Griechenland → England → Wikinger</b>.</p><p>Jedes Reich hat eine <b>Zivilisationsfähigkeit</b>.</p>'),
    hl: () => [[tutCap().r, tutCap().c]],
  },
  {
    t: 'Dein Umland',
    html: () => T('<p>Alle sechs Felder rund um deine Hauptstadt sind unter deiner Kontrolle und bringen dir Einkommen – sie sind gerade golden umrandet. Das Feld <i>unter</i> der Stadt bringt nichts.</p> <p>Jede weitere Stadt bringt bis zu sechs neue Felder dazu. Deshalb ist Ausbreitung wichtiger als große Einzelstädte.</p>'),
    kurz: false,          // in der kurzen Fassung nicht dabei
    hl: () => [...controlledTiles(S, RU())].map(unkey),
  },
  {
    t: T('Woher deine Ressourcen kommen'),
    tKurz: T('Aktionen'),
    html: () => T('<p>Oben rechts in der Kopfzeile stehen 🔬 Wissenschaft, 🌾 Nahrung, 🪙 Münzen und ⚔︎ Macht. So setzen sie sich in diesem Zug zusammen:</p> <table class="tut-tab"> <tr><th align="left">Quelle</th><th>🔬</th><th>🌾</th><th>🪙</th></tr> <tr><td>4 × Grasland</td><td>·</td><td>4</td><td>·</td></tr><tr><td>1 × Wald</td><td>·</td><td>1</td><td>1</td></tr><tr><td>1 × Fluss</td><td>·</td><td>1</td><td>1</td></tr> <tr><td>1 Bevölkerung</td><td>1</td><td>-1</td><td>1</td></tr> <tr class="sum"><td>Summe</td><td>1</td><td>5</td><td>3</td></tr> </table> <div class="tut-key"><b>Merke</b> Ressourcen <b>verfallen am Zugende</b>. Nur Macht bleibt liegen. Gib also alles aus. Münzen können <b>2:1</b> als Nahrung oder Wissenschaft verwendet werden.</div>'),
    kurz: () => T('<p>In deinem Zug kannst du <b>frei so viele Aktionen</b> ausführen, wie du bezahlen kannst – in beliebiger Reihenfolge und beliebig oft. Möglich sind:</p><ul class="tut-list"><li><b>Stadt gründen</b> (Nahrung)</li><li><b>Bevölkerung wachsen</b> lassen (Nahrung und Münzen)</li><li><b>Technologie forschen</b> (Wissenschaft)</li><li><b>Armee bauen</b> und <b>Armeen bewegen</b> (Münzen)</li><li><b>Macht kaufen</b> (Münzen)</li><li><b>Straßen bauen</b> (Münzen)</li></ul><p>Bezahlt wird aus Wissenschaft, Nahrung und Münzen. Die bringen dir deine Städte: eine Stadt erntet die <b>sechs Felder um sich herum</b>, das Feld unter ihr bringt nichts. Deshalb sind viele Städte stärker als große.</p><div class="tut-key"><b>Merke</b> Wissenschaft, Nahrung und Münzen <b>verfallen am Zugende</b> – nur Macht bleibt liegen. Gib also jede Runde alles aus. Münzen zählen <b>2:1</b> als Nahrung oder Wissenschaft.</div>'),
    hl: () => [...controlledTiles(S, RU())].map(unkey),
  },
  {
    t: T('Die zweite Stadt'),
    html: () => T('<p>Es wird Zeit zu expandieren. Auf dem golden umrandeten Feld zu siedeln kostet insgesamt <b>4 Nahrung</b> – 1 Basiskosten für die erste zusätzliche Stadt plus 3 Distanzkosten für den Weg dorthin von der Hauptstadt aus.</p> <p><b>So gründest du:</b> unten auf <b>Stadt gründen</b> → das goldene Feld antippen → <b>Hier gründen</b>. Solange der Gründungsmodus läuft, steht auf jedem möglichen Feld, was die Stadt dort kostet.</p>'),
    kurz: () => T('<p>Gründen kostet <b>Basiskosten + Distanz</b> zur Hauptstadt: hier 1 + 3 = 4 Nahrung. Die Basiskosten steigen 1/3/6/10/…</p>'),
    task: T('Tippe unten auf <b>Stadt gründen</b>, dann auf das <b>goldene Feld</b> und auf <b>Hier gründen</b>.'),
    hl: () => [TUT_CITY_1],
    allow: { bar: ['a-found'], labels: [/Hier gründen/], hex: () => [TUT_CITY_1] },
    goal: () => !!cityOn(...TUT_CITY_1),
    auto: () => foundCity(S, RU(), ...TUT_CITY_1),
  },
  {
    t: T('Forschung und Technologien'),
    html: () => T('<p>Im Gegensatz zu anderen Spielen nutzt Hochzeivilization einen dynamischen Technologiebaum: Jede Technologie ist nur mit <b>50 % Wahrscheinlichkeit</b> in einer Partie verfügbar.</p> <p><b>So forschst du:</b> unten auf <b>Forschen</b> → im Bogen die Kachel <b>Schrift</b> antippen. Der Bogen zeigt Kosten oben links in der Kachel.</p>'),
    kurz: () => T('<p>Der Technologiebaum ist <b>zufällig</b>: jede Technologie steht in einer Partie nur mit 50 % Wahrscheinlichkeit zur Verfügung. Ausgewürfelt wird immer beim Erreichen eines neuen Zeitalters. Planen kannst du also nur grob.</p>'),
    task: T('Öffne <b>Forschen</b> und forsche <b>Schrift</b>.'),
    // Papier steht in Forschung/Mittelalter an erster Stelle – dieser Wurf ist gesetzt,
    // damit der Bogen danach wirklich zeigt, was der nächste Schritt verlangt.
    dice: [5],
    allow: { bar: ['a-tech'], techs: ['schrift'] },
    goal: () => has(tutP(), 'schrift'),
    auto: () => doResearch(S, RU(), 'schrift'),
  },
  {
    t: 'Die Hauptstadt wachsen lassen',
    html: () => T('<p>Die Bevölkerung wachsen zu lassen kostet je <b>1 Nahrung und 1 Münze pro vorhandener Bevölkerung</b>. Deine Hauptstadt hat aktuell 1 Bevölkerung, es kostet also 1 Nahrung und 1 Münzen.</p> <p><b>Warum jetzt?</b> Du hast noch 1 Nahrung und 3 Münzen übrig, und beides verfällt am Zugende. Der Punkt bringt dir ab der nächsten Runde jede Runde +2 Wissenschaft und +1 Münze. Es kostet dich zwar auch eine Nahrungsproduktion, aber davon hast du aktuell noch genug, um weiter schnell Städte gründen zu können.</p> <p><b>So wächst du:</b> Hauptstadt antippen → <b>Bevölkerung wachsen</b>.</p>'),
    kurz: () => T('<p>Wachsen kostet je vorhandener Bevölkerung 1 Nahrung und 1 Münze. Kleine Städte wachsen also billiger als große.</p>'),
    task: T('Tippe deine <b>Hauptstadt</b> an und wähle <b>Bevölkerung wachsen</b>.'),
    hl: () => [[tutCap().r, tutCap().c]],
    allow: { bar: [], labels: [/Bevölkerung wachsen/], hex: () => [[tutCap().r, tutCap().c]] },
    goal: () => tutCap().pop >= 2,
    auto: () => growCity(S, RU(), tutCap(), 'paid'),
  },
  {
    t: T('Zug beenden'),
    html: () => T('<p>Übrig sind 0 🔬, 0 🌾, 2 🪙. Damit kannst du aktuell nichts anfangen, der Rest verfällt. Das ist normal in Runde 1.</p> <p>Danach ziehen die drei Bots.</p> <p><b>So beendest du:</b> unten rechts auf <b>Zug beenden</b>, dann im Bot-Fenster jeweils auf <b>Weiter</b>.</p>'),
    kurz: () => T('<p>Was jetzt übrig ist, verfällt. Danach ziehen die drei Bots.</p>'),
    task: T('Tippe auf <b>Zug beenden</b> und klick dich durch die drei Bot-Fenster.'),
    allow: { bar: ['a-end'] },
    goal: () => S.round >= 2 && P(S).kind !== 'bot',
    auto: () => {
      let guard = 0;
      while (!S.over && guard++ < 12 && !(S.round >= 2 && P(S).kind !== 'bot')) {
        if (P(S).kind === 'bot') botTurn(S, S.cur);
        finishTurn(S); if (S.over) break; advanceTurn(S);
      }
    },
  },
  {
    t: T('Was die Bots getan haben'),
    html: () => T('<p>Ein Bot führt immer dieselben Schritte aus: jede Stadt wachsen lassen, eine neue Stadt siedeln, eine Armee bauen, alle Armeen bewegen, zweimal forschen. Allerdings führt er jede Aktion nur mit einer Wahrscheinlichkeit von 17 % (leichtester Schwierigkeitsgrad) bis 83%(höchster Schwierigkeitsgrad) aus. Jeder Wurf steht im Protokoll.</p> <p><b>So liest du mit:</b> unten auf <b>Protokoll</b> – dort steht jeder Würfelwurf mit Grund.</p>'),
    kurz: () => T('<p>Bots arbeiten eine feste Liste ab (wachsen, siedeln, Armee, ziehen, forschen) und würfeln für jede Aktion – 17 % beim leichtesten, 83 % beim schwersten Grad. Jeder Wurf steht im <b>Protokoll</b>.</p>'),
    task: T('Öffne einmal das <b>Protokoll</b>.'),
    allow: { bar: ['a-log'] },
    goal: () => !!ui.tutSawLog,
    // Leseschritt: nicht weiterschalten, solange das Protokoll offen ist.
    keepOpen: true,
    auto: () => { ui.tutSawLog = true; },
  },
  /* ------------------------------------------------------------------ Runde 2 */
  {
    t: T('Runde 2: exponentielles Wachstum'),
    html: () => T('<p>Dein Einkommen liegt jetzt bei <b>6 🔬, 9 🌾, 10 🪙</b> – in Runde 1 waren es 1, 5 und 3.</p> <p>Drei Dinge greifen zusammen: die zweite Stadt brachte sechs neue Felder, die Hauptstadt hat 2 Bevölkerung, und <b>Schrift</b> erhöht deren Wissenschaft. Genau dieser Effekt entscheidet die Partie, nicht unbedingt die Armeen.</p> <p>Faustregel: die wichtigsten <b>Geländeverbesserungen</b> und <b>viele Städte</b> in Kombination – eines ohne das andere bringt wenig.</p>'),
    kurz: false,          // in der kurzen Fassung nicht dabei
  },
  {
    t: 'Forschen: Papier',
    html: () => T('<p>Mit dem Erforschen der Schrift hat sich das Mittelalter dieser Kategorie geöffnet. Deshalb steht jetzt <b>Papier</b> im Bogen. Es kostet 6 Wissenschaft.</p> <p><b>Warum Papier?</b> Es gibt <b>+1 Wissenschaft auf jedem Grasland</b>. Du kontrollierst 5 Grasland-Felder, das sind 5 Wissenschaft mehr in <i>jeder</i> Runde für einmalig 6. Nach zwei Runden hat es sich mehrfach bezahlt.</p>'),
    kurz: () => T('<p>Papier gibt <b>+1 Wissenschaft je Grasland</b>. Solche Geländeboni wirken auf alle Städte gleichzeitig – deshalb zahlen sie sich mit jeder neuen Stadt erneut aus.</p>'),
    dice: [5],                                   // Wissenschaftliche Methode wird verfügbar
    task: T('Öffne <b>Forschen</b> und forsche <b>Papier</b>.'),
    allow: { bar: ['a-tech'], techs: ['papier'] },
    goal: () => has(tutP(), 'papier'),
    auto: () => doResearch(S, RU(), 'papier'),
  },
  {
    t: T('Die dritte Stadt'),
    html: () => T('<p>Die dritte Stadt kostet mehr: <b>6 Nahrung</b> (3 Basiskosten plus 3 Distanzkosten). Die Basiskosten steigen mit jeder gesiedelten Stadt: 1 / 3 / 6 / 10. Ausbreitung wird immer teurer.</p>'),
    kurz: () => T('<p>Dritte Stadt: 3 Basiskosten + 3 Distanz = 6 Nahrung.</p>'),
    enter: () => { ui.tutSpot2 = tutSpot(TUT_CITY_2); },
    task: T('Tippe unten auf <b>Stadt gründen</b>, dann auf das <b>goldene Feld</b> und auf <b>Hier gründen</b>.'),
    hl: () => [ui.tutSpot2 || TUT_CITY_2],
    allow: { bar: ['a-found'], labels: [/Hier gründen/], hex: () => [ui.tutSpot2 || TUT_CITY_2] },
    goal: () => {
      const sp = ui.tutSpot2 || TUT_CITY_2;
      const c = cityOn(...sp);
      return !!c && c.owner === RU();
    },
    auto: () => foundCity(S, RU(), ...(ui.tutSpot2 || TUT_CITY_2)),
  },
  {
    t: T('Zweimal Bevölkerung wachsen'),
    html: () => T('<p>Jede Stadt darf einmal pro Runde wachsen. Die Hauptstadt kostet 2 Nahrung und 2 Münzen, die jüngere Stadt nur jeweils 1. Kleine Städte wachsen billiger.</p> <p><b>Warum beide?</b> Nahrung und Münzen verfallen sonst. Und weil die Kosten mit der Größe steigen, ist es effizienter, viele kleine Städte gleichmäßig zu vergrößern als eine große.</p>'),
    kurz: () => T('<p>Beide Städte wachsen – die jüngere billiger.</p><div class="tut-key"><b>Merke</b> Jede Bevölkerung isst dauerhaft 1 Nahrung. Die Nahrungsproduktion darf nie negativ werden: ist die Grenze erreicht, ist Wachstum gesperrt.</div>'),
    hl: () => [[tutCap().r, tutCap().c], TUT_CITY_1],
    task: T('Lass <b>beide</b> golden umrandeten Städte je einmal wachsen.'),
    allow: {
      bar: [], labels: [/Bevölkerung wachsen/],
      hex: () => [[tutCap().r, tutCap().c], TUT_CITY_1],
    },
    goal: () => tutCap().pop >= 3 && (cityOn(...TUT_CITY_1) || { pop: 0 }).pop >= 2,
    auto: () => {
      growCity(S, RU(), tutCap(), 'paid');
      const t = cityOn(...TUT_CITY_1);
      if (t) { t.born = 0; growCity(S, RU(), t, 'paid'); }
    },
  },
  {
    t: T('Die erste Armee'),
    html: () => T('<p>Eine Armee zu bauen kostet aktuell <b>5 Münzen</b>. Das steigt um weitere 5 je eigener Armee, die zweite kostet also 10. Sie erscheint <i>in</i> einer Stadt und <b>muss sie im selben Zug verlassen</b>; Armeen stehen nie auf Städten, auch nicht auf eigenen.</p> <p><b>Warum überhaupt eine Armee?</b> Ohne Armee kannst du weder angreifen noch aktiv eine Stadt verteidigen.</p> <p><b>So baust du:</b> die golden umrandete Stadt antippen → im Blatt auf <b>Armee bauen</b>. Die Armee steht dann in der Stadt und muss sie noch in diesem Zug verlassen.</p>'),
    kurz: () => T('<p>Eine Armee kostet 5 Münzen, je weitere 5 mehr. Sie erscheint <i>in</i> der Stadt und muss sie im selben Zug verlassen.</p>'),
    task: T('Tippe die <b>golden umrandete Stadt</b> an und wähle <b>Armee bauen</b>.'),
    hl: () => [TUT_CITY_1],
    allow: { bar: [], labels: [/Armee bauen/], hex: () => [TUT_CITY_1] },
    goal: () => armiesOf(S, RU()).length >= 1,
    auto: () => { const t = cityOn(...TUT_CITY_1); if (t) buildArmy(S, RU(), t); },
  },
  {
    t: T('Die Armee bewegen'),
    html: () => T('<p>Armeen ziehen <b>3 Felder</b> weit, nicht über Meer (bis eine Technologie das ändert), nicht auf Städte und nicht auf andere Armeen. Später erhöhen Panzerschiff und Luftwaffe die Reichweite, Straßen und Eisenbahn ebenfalls.</p> <p><b>Warum auf das goldene Feld?</b> Es liegt am Rand deines Reichs in Richtung Griechenland. Dort steht die Armee als Wache: sie verteidigt die Stadt nebenan mit und blockiert später ggf. mit <b>Schießpulver</b> den Durchmarsch.</p> <p><b>So bewegst du:</b> Deine Armee steht noch <i>in</i> der Stadt, in der du sie gebaut hast. Stadt antippen → <b>Armee hier bewegen</b> → dann das goldene Zielfeld antippen. Steht eine Armee im freien Feld, heißt der Knopf <b>Diese Armee bewegen</b>. Erreichbare Felder werden hell markiert.</p>'),
    kurz: () => T('<p>Armeen ziehen 3 Felder, nicht über Meer und nicht auf Städte.</p><p><b>So bewegst du:</b> Deine Armee steht noch <i>in</i> der Stadt. Stadt antippen → <b>Armee hier bewegen</b> → dann das goldene Zielfeld antippen. Steht die Armee im freien Feld, heißt der Knopf <b>Diese Armee bewegen</b>.</p>'),
    enter: () => {
      const a = armiesOf(S, RU())[0];
      ui.tutArmyTo = a ? tutGuardSpot(a, TUT_ARMY_TO) : TUT_ARMY_TO;
    },
    task: T('Zieh die Armee auf das <b>goldene Feld</b>.'),
    hl: () => [ui.tutArmyTo || TUT_ARMY_TO],
    allow: {
      bar: [], labels: [/Armee.*bewegen/],
      hex: () => armiesOf(S, RU()).map(a => [a.r, a.c]).concat([ui.tutArmyTo || TUT_ARMY_TO]),
      moveTo: () => [ui.tutArmyTo || TUT_ARMY_TO],
    },
    goal: () => {
      const t = ui.tutArmyTo || TUT_ARMY_TO;
      return armiesOf(S, RU()).some(a => a.r === t[0] && a.c === t[1]);
    },
    auto: () => {
      const a = armiesOf(S, RU())[0];
      if (a) moveArmy(S, a, ...(ui.tutArmyTo || TUT_ARMY_TO));
    },
  },
  {
    t: T('Zug beenden'),
    html: () => T('<p>Übrig: 0 🔬, 0 🌾, 2 🪙 – das verfällt. Danach kommen Kampf und Siegprüfung, dann die Bots.</p>'),
    kurz: () => T('<p>Zug beenden – die Bots ziehen.</p>'),
    task: T('Beende den Zug und klick dich durch die Bot-Fenster.'),
    allow: { bar: ['a-end', 'a-log'] },
    goal: () => S.round >= 3 && P(S).kind !== 'bot',
    auto: () => {
      let guard = 0;
      while (!S.over && guard++ < 12 && !(S.round >= 3 && P(S).kind !== 'bot')) {
        if (P(S).kind === 'bot') botTurn(S, S.cur);
        finishTurn(S); if (S.over) break; advanceTurn(S);
      }
    },
  },
  /* ------------------------------------------------------------------ Runde 3 */
  {
    t: 'Forschen: Wissenschaftliche Methode',
    html: () => T('<p>Du hast 20 Wissenschaft. <b>Wissenschaftliche Methode</b> kostet 11 – über die Hälfte davon.</p> <p><b>Warum trotzdem zuerst?</b> Sie senkt jede weitere Technologie um <b>2 in der Antike, 4 im Mittelalter, 6 in der Industrialisierung, 8 in der Moderne</b> – nie unter 0. Danach kosten <b>Fischerei</b> und <b>Eisenverarbeitung</b> jeweils <b>0</b>. Sie bezahlt sich also noch in diesem Zug.</p>'),
    kurz: () => T('<p>Die wissenschaftliche Methode senkt jede weitere Technologie um 2/4/6/8 (je Zeitalter) – nie unter 0. Sie bezahlt sich hier sofort.</p>'),
    task: 'Forsche <b>Wissenschaftliche Methode</b>.',
    allow: { bar: ['a-tech'], techs: ['wiss_methode'] },
    goal: () => has(tutP(), 'wiss_methode'),
    auto: () => doResearch(S, RU(), 'wiss_methode'),
  },
  {
    t: T('Zwei Technologien für null'),
    html: () => T('<p><b>Fischerei</b> (Meer +1 Nahrung) und <b>Eisenverarbeitung</b> (Macht kostet 4 statt 5 Münzen) kosten jetzt beide <b>0 Wissenschaft</b> – der Rabatt frisst ihren Preis komplett auf.</p> <p><b>Warum diese zwei?</b> Fischerei macht deine Meeresfelder nutzbar, und Eisenverarbeitung senkt dauerhaft den Machtpreis – gleich brauchst du Macht. Gratis mitnehmen ist immer richtig; jede Technologie öffnet außerdem Zeitalter.</p> <p><b>So forschst du:</b> <b>Forschen</b> → beide Kacheln antippen, der Bogen bleibt offen.</p>'),
    kurz: () => T('<p><b>Fischerei</b> und <b>Eisenverarbeitung</b> kosten jetzt <b>0</b>. Was nichts kostet, nimmt man mit: jede Technologie schaltet außerdem das nächste Zeitalter ihres Feldes auf.</p>'),
    dice: [5],                                   // Burgenbau wird verfügbar
    task: T('Forsche <b>Fischerei</b> und <b>Eisenverarbeitung</b> (je 0).'),
    allow: { bar: ['a-tech'], techs: ['fischerei', 'eisenverarbeitung'] },
    goal: () => has(tutP(), 'fischerei') && has(tutP(), 'eisenverarbeitung'),
    auto: () => { doResearch(S, RU(), 'fischerei'); doResearch(S, RU(), 'eisenverarbeitung'); },
  },
  {
    t: T('Eine gegnerische Armee vor der Stadt'),
    html: () => T('<p>Griechenland hat im eigenen Zug eine Armee neben deine Stadt gezogen und schon einmal angegriffen – im Protokoll steht dazu „Zug 1/2". Stadt und Armee sind golden umrandet.</p> <p><b>Angriffswert</b> = Machtwert je angreifender Armee, mehrere addieren sich: <b>5</b> (bei Bots ist das ihre Gesamtbevölkerung).<br> <b>Verteidigungswert</b> = 1 je Stadtbevölkerung plus den Machtwert benachbarter eigener Armeen: <b>1</b>.</p> <p>Der Angriff ist höher. Ist er <b>zwei Züge in Folge</b> höher, verlierst du die Stadt und 2 Bevölkerung. Im Protokoll steht dann „Zug 1/2" – das ist deine Vorwarnung, du hast genau eine Runde Zeit.</p>'),
    kurz: () => T('<p>Griechenland hat deine Stadt angegriffen. So funktioniert der Kampf:</p><p>Immer <b>am Ende des Zuges</b> führen alle eigenen Armeen automatisch Angriffe durch. Sie greifen Städte an, die auf benachbarten Feldern liegen. Wenn der Angriff in <b>zwei aufeinanderfolgenden Zügen des Angreifers</b> erfolgreich ist, wird die Stadt erobert. Dazu muss der <b>Angriffswert höher sein als der Verteidigungswert</b>.</p><p>Der <b>Angriffswert</b> auf eine Stadt ist der Machtwert aller sie angreifenden Armeen, zusammengerechnet. Der <b>Verteidigungswert</b> ist die Stadtbevölkerung plus der Machtwert aller verteidigenden Armeen.</p>'),
    enter: () => {
      const ru = RU();
      // Der Bot hat im letzten Zug von sich aus angegriffen – wir nehmen genau diese Armee.
      const foe = S.armies.find(a => a.owner !== ru &&
        citiesOf(S, ru).some(c => hexDistance(c.r, c.c, a.r, a.c) === 1));
      if (foe) {
        const town = citiesOf(S, ru).find(c => hexDistance(c.r, c.c, foe.r, foe.c) === 1);
        ui.tutSiege = { cityId: town.id, armyId: foe.id };
        return;
      }
      // Notfalls stellen wir eine – dann steht es auch so im Protokoll.
      const town = cityOn(...TUT_CITY_1) || tutCap();
      const foeIdx = S.players.findIndex(p => p.civ === 'griechenland');
      const spot = neighbors(town.r, town.c).find(([r, c]) =>
        isLand(S, r, c) && !cityAt(S, r, c) && !armyAt(S, r, c));
      if (!spot) return;
      const army = { id: S.nextId++, owner: foeIdx, r: spot[0], c: spot[1], mp: 0, born: S.round };
      S.armies.push(army);
      ui.tutSiege = { cityId: town.id, armyId: army.id };
      log(S, 'info', T('Tutorial: eine griechische Armee nimmt Stellung neben deiner Stadt.'));
    },
    hl: () => {
      const t = tutSiegeCity(), a = tutSiegeArmy();
      return [t && [t.r, t.c], a && [a.r, a.c]].filter(Boolean);
    },
  },
  {
    t: T('Die Antwort: Mauern und Burgenbau'),
    html: () => T('<p><b>Stadtmauern</b> (3 Wissenschaft) geben <b>jeder</b> deiner Städte +5 Verteidigung. <b>Burgenbau</b> (3) stellt in jede Stadt eine unbewegliche, virtuelle Armee: sie <b>projiziert deinen Machtwert auf die Stadt</b> – erst dadurch hilft gekaufte Macht auch der Verteidigung. Du hast 9 Wissenschaft.</p> <p>Verteidigung jetzt <b>1</b>, Angriff <b>5</b>. Mauern allein bringen dich auf 6 – der Bot wächst aber weiter. Deshalb kommt im nächsten Schritt noch Macht dazu.</p> <p><b>Warum beides?</b> Mauern wirken in allen Städten gleichzeitig, kosten einmalig und schrumpfen nicht. Burgenbau macht deine Macht verteidigungswirksam, ohne dass eine echte Armee neben der Stadt stehen muss – und die virtuelle Armee zählt nicht für die Kosten weiterer Armeen.</p>'),
    kurz: () => T('<p><b>Stadtmauern</b> geben jeder Stadt +5 Verteidigung, <b>Burgenbau</b> stellt eine unbewegliche Armee hinein, die deinen Machtwert auf die Stadt legt.</p>'),
    task: T('Forsche <b>Stadtmauern</b> und <b>Burgenbau</b>.'),
    allow: { bar: ['a-tech'], techs: ['stadtmauern', 'burgenbau'] },
    hl: () => { const t = tutSiegeCity(); return t ? [[t.r, t.c]] : []; },
    goal: () => has(tutP(), 'stadtmauern') && has(tutP(), 'burgenbau'),
    auto: () => { doResearch(S, RU(), 'stadtmauern'); doResearch(S, RU(), 'burgenbau'); },
  },
  {
    t: 'Rechne nach, bevor du kaufst',
    html: () => T('<p>Macht ist der Angriffswert <i>jeder</i> deiner Armeen und zählt zur Verteidigung benachbarter eigener Städte. Ein Punkt kostet dank Eisenverarbeitung <b>4 statt 5 Münzen</b>; du hast 16. Der Haken: zu Beginn jedes Zuges <b>halbiert</b> sich deine Macht (aufgerundet).</p> <p><b>Die naheliegende Rechnung.</b> Kauf dir 4 Macht, dann steht deine belagerte Stadt bei:</p> <div class="tut-calc"> <div><span>Bevölkerung der Stadt</span><b>1</b></div> <div><span>Stadtmauern</span><b>+5</b></div> <div><span>Burgenbau (virtuelle Armee = dein Machtwert)</span><b>+4</b></div> <div><span>deine Armee daneben</span><b>+4</b></div> <div class="sum"><span>Verteidigung</span><b>14</b></div> </div> <p>Das sieht solide aus – <b>6</b> stehen ohne den Kauf schon da.</p> <p><b>Und jetzt die Gegenrechnung.</b> Griechenland hat gerade <b>5</b> Machtwert – bei Bots ist das ihre Gesamtbevölkerung. Mit einer zweiten Armee, für die es jede Runde würfelt, stünde der Angriff bei <b>10</b>. Das reicht gegen 14 noch nicht.</p> <p><b>Aber der Bot steht nicht still.</b> Er würfelt jede Runde für <i>jede</i> seiner 3 Städte auf Wachstum und einmal aufs Siedeln. Läuft das gut, wächst seine Bevölkerung – und damit sein Machtwert – schon im nächsten Zug so:</p> <div class="tut-calc"> <div><span>Machtwert jetzt</span><b>5</b></div> <div><span>3 Städte wachsen je 1</span><b>+3</b></div> <div><span>eine neue Stadt gegründet</span><b>+1</b></div> <div class="sum"><span>Machtwert dann</span><b>9</b></div> <div><span>× 2 Armeen</span><b>18</b></div> </div> <div class="tut-key"><b>Merke</b> 18 gegen 14: deine vier Münzen wären verbrannt und die Stadt eine Runde später trotzdem weg. Gegen einen Gegner, der jede Runde wächst, ist reine Verteidigung ein Wettrennen, das du verlierst – seine Zahlen steigen von allein, deine nur, wenn du zahlst. <b>Kauf hier nichts.</b> Der nächste Schritt zeigt den billigeren Weg.</div>'),
    kurz: false,          // in der kurzen Fassung nicht dabei
    hl: () => { const t = tutSiegeCity(); return t ? [[t.r, t.c]] : []; },
  },
  {
    t: T('Der Gegenangriff als Verteidigung'),
    html: () => T('<p>Bots ziehen ihre Armeen nach festen Prioritäten – und <b>die eigene Hauptstadt steht ganz oben</b>, noch vor „eine begonnene Belagerung zu Ende bringen". Wer eine Armee neben ihre Hauptstadt stellt, zwingt sie zum Rückzug.</p> <p>Um die griechische Hauptstadt zu bedrohen, musst du ihren <b>Verteidigungswert von 3</b> überbieten. Dafür dienen die folgenden drei Schritte:</p> <div class="tut-calc"> <div><span><b>Belagerungsmaschinen</b> forschen (+5 Angriff gegen Städte)</span><b>2 🔬</b></div> <div><span><b>3 Macht</b> kaufen (statt 4)</span><b>12 🪙</b></div> <div><span>Armee auf das <b>goldene Feld</b> daneben ziehen</span><b>3 Bewegung</b></div> </div> <p>Danach greift deine Armee mit <b>8 statt 3</b> an – mehr als die 3, die dort stehen. Am Ende deines Zuges gewinnst du den Kampf, und Griechenlands Hauptstadt steht bei <b>Zug 1 von 2</b>: noch ein Erfolg, und sie gehört dir. Genau das zwingt den Bot, seine Armeen zurückzuholen, statt deine Stadt zu Ende zu belagern.</p> <p>Dein Vorrat geht dabei genau auf – übrig bleiben <b>1 Wissenschaft</b> und <b>4 Münzen</b>, beides brauchst du gleich noch.</p> <p><b>So kaufst du</b> Macht: unten auf <b>Macht</b> → die Menge antippen.</p> <div class="tut-key"><b>Merke</b> Angriff ist oft die billigere Verteidigung. Eine Armee an der richtigen Stelle bindet zwei gegnerische – und kostet dich weniger, als deren Angriff aufzuwiegen. Bots verteidigen ihre Hauptstadt, sobald dort ein erster Angriff durchkam; eine Armee, die bloß danebensteht, beeindruckt sie nicht.</div>'),
    kurz: () => T('<p>Um die griechische Hauptstadt zu bedrohen, musst du ihren <b>Verteidigungswert von 3</b> überbieten. Dafür dienen die folgenden drei Schritte:</p> <div class="tut-calc"> <div><span><b>Belagerungsmaschinen</b> forschen (+5 Angriff gegen Städte)</span><b>2 🔬</b></div> <div><span><b>3 Macht</b> kaufen (statt 4)</span><b>12 🪙</b></div> <div><span>Armee auf das <b>goldene Feld</b> daneben ziehen</span><b>3 Bewegung</b></div> </div> <p>Danach greift deine Armee mit <b>8 statt 3</b> an – mehr als die 3, die dort stehen.</p><p>Ein Gegenangriff auf die <b>Hauptstadt</b> ist dabei besonders lohnend: wer eine gegnerische Hauptstadt erobert, <b>gewinnt das Spiel sofort</b>. Genau deshalb ziehen Bots ihre Armeen zur eigenen Hauptstadt zurück, statt deine Stadt zu Ende zu belagern.</p>'),
    enter: () => { ui.tutStrike = tutStrikeSpot(); },
    task: T('Forsche <b>Belagerungsmaschinen</b>, kaufe <b>3 Macht</b> und zieh deine Armee auf das <b>goldene Feld</b>.'),
    hl: () => {
      const gr = S.players.findIndex(x => x.civ === 'griechenland');
      const gcap = capitalOf(S, gr);
      return [ui.tutStrike || TUT_STRIKE, gcap && [gcap.r, gcap.c]].filter(Boolean);
    },
    allow: {
      bar: ['a-tech', 'a-power'],
      techs: ['belagerung'],
      labels: [/Macht/, /bewegen/],
      // Antippbar: die eigene Armee (um sie auszuwählen) und das Zielfeld
      hex: () => armiesOf(S, RU()).map(a => [a.r, a.c]).concat([ui.tutStrike || TUT_STRIKE]),
      moveTo: () => [ui.tutStrike || TUT_STRIKE],
    },
    goal: () => {
      const z = ui.tutStrike || TUT_STRIKE;
      return has(tutP(), 'belagerung') && tutP().power >= 3 &&
        armiesOf(S, RU()).some(a => a.r === z[0] && a.c === z[1]);
    },
    auto: () => {
      doResearch(S, RU(), 'belagerung');
      let guard = 0;
      while (tutP().power < 3 && guard++ < 6 && !buyPower(S, RU(), 1)) { /* Punkt für Punkt */ }
      const z = ui.tutStrike || TUT_STRIKE;
      const a = armiesOf(S, RU())[0];
      if (a) { a.mp = moveAllowance(S, RU()); moveArmy(S, a, z[0], z[1]); }
    },
  },
  {
    t: T('Der Rest der Wissenschaft: Rad'),
    html: () => T('<p>Übrig ist 1 Wissenschaft – genau der Preis für <b>Rad</b> (1). Ungenutzte Wissenschaft verfällt zum Zugende, also raus damit.</p> <p><b>Warum Rad?</b> Es erlaubt <b>Straßen</b>. Die halbieren nicht nur die Bewegungskosten – sie verbinden auch deine Städte zu <b>Handelsrouten</b>, und die bringen jede Runde etwas ein. Gleich baust du die erste.</p> <div class="tut-key"><b>Merke</b> Wissenschaft, Nahrung und Münzen sind <b>Rundeneinkommen</b>, kein Vorrat: Was du am Zugende übrig hast, ist verloren. Plane deine Käufe so, dass am Ende möglichst wenig liegen bleibt.</div>'),
    kurz: () => T('<p>Übrige Wissenschaft verfällt – das Rad kostet genau 1 und erlaubt Straßen.</p>'),
    task: 'Forsche <b>Rad</b>.',
    allow: { bar: ['a-tech'], techs: ['rad'] },
    goal: () => has(tutP(), 'rad'),
    auto: () => { doResearch(S, RU(), 'rad'); },
  },
  {
    t: T('Die vierte Stadt'),
    html: () => T('<p>Auch die 12 Nahrung sollen nicht verfallen. Eine vierte Stadt kostet <b>9 Nahrung</b> – 6 Basiskosten bei drei bestehenden Städten plus Weg. Teuer, aber es ist die einzige Ausgabe, die dauerhaft etwas zurückgibt.</p> <p><b>Warum dieses Feld?</b> Ringsum liegen 4 × Grasland, 1 × Gebirge, 1 × Meer, das bringt <b>+7 🔬, +4 🌾, +3 🪙</b> je Runde. Es liegt südlich deiner Hauptstadt, also im Rücken – weg von der griechischen Grenze, wo gerade gekämpft wird. </p> <div class="tut-key"><b>Merke</b> Vier Städte sind fast immer besser als zwei große: jede bringt eigene Felder, wächst billiger und verteilt das Risiko. Die Basiskosten steigen zwar (1/3/6/10), aber sie sind einmalig – der Ertrag bleibt.</div>'),
    kurz: () => T('<p>Vierte Stadt: Basiskosten 6 + Distanz 3 = 9 Nahrung.</p>'),
    enter: () => { ui.tutSpot3 = tutSpot(TUT_CITY_3); },
    task: T('Tippe unten auf <b>Stadt gründen</b>, dann auf das <b>goldene Feld</b> und auf <b>Hier gründen</b>.'),
    hl: () => [ui.tutSpot3 || TUT_CITY_3],
    allow: { bar: ['a-found'], labels: [/Hier gründen/], hex: () => [ui.tutSpot3 || TUT_CITY_3] },
    goal: () => {
      const c = cityOn(...(ui.tutSpot3 || TUT_CITY_3));
      return !!c && c.owner === RU();
    },
    auto: () => foundCity(S, RU(), ...(ui.tutSpot3 || TUT_CITY_3)),
  },
  {
    t: T('Straßen: die Städte verbinden'),
    html: () => T('<p>Mit dem <b>Rad</b> kannst du auf Feldern Straßen bauen. Eine Straße kostet <b>1 Münze</b> und halbiert dort die Bewegungskosten – aber der eigentliche Gewinn ist ein anderer:</p> <div class="tut-key"><b>Handelsrouten</b> Jede deiner Städte außer der Hauptstadt, die über einen <b>durchgehenden Weg</b> mit ihr verbunden ist, bringt jede Runde <b>+1 Wissenschaft, +1 Nahrung und +1 Münze</b>. Liegt auf der ganzen Strecke <b>Eisenbahn</b>, sind es <b>+2</b>. Gemischt zählt der kleinere Wert – ein einziges Straßenfeld drückt die Strecke von +2 auf +1.</div> <p>Du hast <b>4 Münzen</b> und brauchst genau <b>4</b> davon: die vier golden umrandeten Felder hängen alle drei Nebenstädte an die Hauptstadt.</p> <p>Das bringt <b>+3</b> auf jeden der drei Erträge – jede Runde, dauerhaft, für einmalig 4 Münzen. Im Forschungsbogen taucht dafür die Zeile <b>Handelsrouten</b> auf.</p>'),
    kurz: () => T('<p>Eine Straße kostet 1 Münze. Der eigentliche Gewinn sind <b>Handelsrouten</b>: jede Stadt, die über einen durchgehenden Weg an der Hauptstadt hängt, bringt <b>+1 auf alle drei Erträge</b> – über durchgehende Eisenbahn +2.</p><p>Straßen und Eisenbahn <b>senken außerdem die Bewegungskosten</b> auf diesen Feldern, deine Armeen kommen darüber also weiter.</p>'),
    enter: () => { ui.tutRoads = true; },
    task: T('Baue Straßen auf den vier <b>goldenen Feldern</b> – je Feld antippen und <b>Straße bauen</b>.'),
    hl: () => TUT_ROADS.filter(([r, c]) => roadLevel(S, r, c) < 1),
    allow: {
      bar: [], labels: [/Straße bauen/],
      hex: () => TUT_ROADS.filter(([r, c]) => roadLevel(S, r, c) < 1),
    },
    goal: () => TUT_ROADS.every(([r, c]) => roadLevel(S, r, c) >= 1),
    auto: () => { for (const [r, c] of TUT_ROADS) buildRoad(S, RU(), r, c, 1); },
  },
  {
    t: T('Zug beenden – und der Rückzug'),
    html: () => T('<p>Deine belagerte Stadt steht bei <b>Verteidigung 9</b>. Griechenland könnte mit seinen 1 Armeen <b>5</b> aufbieten – das würde reichen.</p> <p>Beende den Zug und sieh im Protokoll nach, was stattdessen passiert: <b>„Armee verteidigt die Hauptstadt"</b>. Deine eine Armee neben der griechischen Hauptstadt zieht beide Angreifer ab, und die Belagerung läuft ins Leere.</p> <div class="tut-key"><b>Merke</b> „Zug 1/2" ist eine Vorwarnung mit <b>einer Runde</b> Reaktionszeit. Mehr Verteidigung zu kaufen ist dabei selten die beste Antwort – der Gegner kann nachlegen. Ihm etwas Wertvolleres zu bedrohen, wirkt sofort und kostet weniger.</div>'),
    kurz: () => T('<p>Beende den Zug: die Griechen rufen ihre Armeen zur eigenen Hauptstadt zurück, die Belagerung läuft ins Leere.</p>'),
    task: T('Beende den Zug und klick dich durch die Bot-Fenster.'),
    allow: { bar: ['a-end', 'a-log'] },
    hl: () => { const t = tutSiegeCity(), a = tutSiegeArmy();
      return [t && [t.r, t.c], a && [a.r, a.c]].filter(Boolean); },
    goal: () => S.round >= 4 && P(S).kind !== 'bot',
    auto: () => {
      let guard = 0;
      while (!S.over && guard++ < 12 && !(S.round >= 4 && P(S).kind !== 'bot')) {
        if (P(S).kind === 'bot') botTurn(S, S.cur);
        finishTurn(S); if (S.over) break; advanceTurn(S);
      }
    },
  },
  {
    t: T('Jede Bevölkerung isst'),
    html: () => T('<p>Weil jeder Bevölkerungspunkt dauerhaft 1 Nahrung verbraucht, darf deine <b>Nahrungsproduktion nie negativ</b> werden. Ist die Grenze erreicht, wird Wachstum gesperrt – verhungern tut aber niemand.</p> <p>Du produzierst gerade <b>19 Nahrung</b> über den Verbrauch hinaus. Deine Städte können zusammen also noch <b>19×</b> wachsen, bevor die Grenze greift – egal, wie du die Schritte auf die Städte verteilst.</p> <p>Dagegen hilft mehr Ertrag: <b>Landwirtschaft</b> auf Grasland, <b>Kunstdünger</b> im Wald, <b>Bewässerung</b> im Gebirge, <b>Ökologie</b>. Oder <b>Gentechnik</b> und <b>Massenmedien</b>: damit ernährt zu Zugbeginn jede Münze drei Bevölkerung und jede Wissenschaft eine – dann wird der 🌾-Knopf oben anklickbar. <b>Gentechnik</b> bringt dir obendrein für je vier Wissenschaft eine Nahrung ins Einkommen.</p>'),
    kurz: false,          // in der kurzen Fassung nicht dabei
    hl: () => citiesOf(S, RU()).map(c => [c.r, c.c]),
  },
  {
    t: 'Die drei Wege zu gewinnen',
    html: () => T('<p><b>Militärsieg</b> – erobere eine gegnerische Hauptstadt: dafür musst du zwei Züge in Folge stärker sein. Es ist der Weg, auf dem Bots einem Menschen meist am gefährlichsten werden – und der einzige Sieg, der das Spiel <b>sofort</b> beendet.</p><p><b>Wirtschaftssieg</b> – hältst du mehr als zwei Drittel der Weltbevölkerung, hast du gewonnen. Oben links neben der Runde steht der aktuelle Stand: gerade 7 von 33. Um hier eine echte Chance zu haben, braucht es meist vier bis sechs Städte plus einige der Technologien <b>Töpferei</b>, <b>Verbundwerkstoffe</b>, <b>Theologie</b> oder <b>Vereinte Nationen</b>.</p><p><b>Forschungssieg</b> – erforsche die <b>Singularität</b>: 100 Wissenschaft, mit der wissenschaftlichen Methode 90. Sie verlangt in jedem der <b>vier Felder mindestens eine Technologie der Moderne</b>. Für ein Reich, das früh auf Multiplikatoren gegangen ist, ist das oft der kürzeste Weg.</p><div class="tut-key"><b>Merke</b> Nur der Militärsieg endet sofort. Bei allen anderen <b>meldest du den Sieg an</b> und die Runde wird zu Ende gespielt – die anderen bekommen also noch ihren Zug, und ein Militärsieg in diesem Fenster schlägt deinen Anspruch. Erfüllen mehrere Reiche in derselben Runde eine Bedingung, entscheiden <b>Punkte: Bevölkerung + Weltwunder + Technologien</b>, bei Gleichstand gewinnt der Mensch vor dem Bot. Ein angemeldeter Sieg bleibt gültig, auch wenn die Bedingung danach wieder wegfällt.</div>'),
    kurz: () => T('<p><b>Militärsieg</b> – eine gegnerische Hauptstadt erobern. Er ist der einzige Sieg, der <b>sofort</b> endet.</p><p><b>Wirtschaftssieg</b> – mehr als zwei Drittel der Weltbevölkerung (im Duell 3/4). Der Stand steht oben in der Kopfzeile.</p><p><b>Forschungssieg</b> – die <b>Singularität</b>: 100 Wissenschaft und in jedem der vier Felder mindestens eine Technologie der Moderne.</p><div class="tut-key"><b>Merke</b> Außer dem Militärsieg endet keiner sofort: Wer eine Bedingung erfüllt, <b>meldet den Sieg an</b>, die Runde wird zu Ende gespielt. Erfüllen mehrere in derselben Runde eine Bedingung, entscheiden <b>Punkte: Bevölkerung + Weltwunder + Technologien</b>. Bei Gleichstand gewinnt der Mensch vor dem Bot. Ein angemeldeter Sieg bleibt gültig, auch wenn die Bedingung später wieder wegfällt.</div>'),
  },
  {
    t: T('Die drei Anfängerfehler'),
    html: () => T('<p><b>Ressourcen liegen lassen.</b> Wissenschaft, Nahrung und Münzen verfallen am Zugende. Wer 3 Münzen übrig hat, hätte sie in 1 Nahrung oder 1 Wissenschaft tauschen können – jede Runde ein kleiner Verlust, der sich summiert.</p> <p><b>Zu früh Macht kaufen.</b> Sie halbiert sich zu Beginn jedes Zuges. Kaufe sie in dem Zug, in dem du angreifst oder verteidigst, und dann in einem Rutsch.</p> <p><b>Wachsen ohne Nahrung.</b> Jede Bevölkerung isst dauerhaft 1 Nahrung. Ohne Landwirtschaft, Kunstdünger, Bewässerung oder Ökologie steht das Wachstum nach wenigen Punkten still.</p> <div class="tut-key"><b>Und die Faustregel</b> Am stärksten ist die <b>Kombination</b>: die wichtigsten Multiplikatoren – Schrift, Landwirtschaft, Papier, Wissenschaftliche Methode – <b>zusammen mit vielen Städten</b>. Jede Technologie wirkt auf jedes Feld und jede Bevölkerung, die du besitzt; jede neue Stadt vervielfacht rückwirkend alles, was du schon erforscht hast. Militär nur so viel, wie du zum Überleben brauchst.</div>'),
    kurz: false,          // in der kurzen Fassung nicht dabei
  },
  {
    t: 'Ab hier spielst du allein',
    html: () => T('<p>Das Tutorial ist durch – und dieses Spiel läuft einfach weiter, jetzt ohne Einschränkungen. Du stehst in Runde 4 mit 4 Städten, 7 Bevölkerung und 9 Technologien.</p> <p>Der nächste sinnvolle Schritt: weiter wachsen, Nahrungstechnologien nachziehen und in jedem Feld ein Zeitalter aufschließen – die Singularität braucht am Ende eine Moderne-Technologie in allen vier.</p> <p><b>Was das Tutorial nicht gezeigt hat</b>, aber im Spiel steckt: gegnerische Armeen <b>flankieren</b> und zerstören (zwei eigene Armeen gegenüberliegend, mit <b>Taktik</b> von zwei beliebigen Seiten) · <b>Eisenbahn</b> statt Straße: eine durchgehende Bahn verdoppelt den Handelsroutenbonus auf +2 · Technologien mit eigenen Aktionen: <b>Sklaverei</b> (Bevölkerung gegen Münzen opfern), <b>Spionage</b>, <b>Kundschafterei</b> und <b>Internet</b> (fremde Technologien kopieren), <b>Kolonialismus</b> (Felder kaufen), <b>Atomwaffen</b> (alle Armeen auf einem Feld und ringsum entfernen) · und Reichsfähigkeiten, die du im Aufbau umstellen kannst.</p> <p>Zwei Dinge helfen immer: <b>Protokoll</b> zeigt jeden Würfelwurf, <b>Regeln &amp; Technologien</b> im Menü listet alle Technologien mit ihrer Wirkung.</p>'),
    kurz: () => T('<p>Das Tutorial ist durch, die Partie läuft ohne Einschränkungen weiter.</p><p>Nicht gezeigt, aber vorhanden: Armeen <b>flankieren</b> und zerstören, <b>Eisenbahnen</b> (Handelsroute +2), Technologien mit eigenen Aktionen (Sklaverei, Spionage, Internet, Kolonialismus, Atomwaffen). <b>Regeln &amp; Technologien</b> im Menü listet alles auf.</p>'),
  },
];

/* ------------------------------------------------------ Schienen und Zustand
   Zwei Fassungen aus **einer** Schrittliste: die lange erklärt alles, die kurze richtet
   sich an Leute, die solche Spiele kennen. Die Aufgaben sind in beiden **dieselben** –
   die kurze Fassung lässt nur reine Lesetexte weg (`kurz: false`) und ersetzt die
   Erklärungen durch wenige Sätze (`kurz: () => …`). Schritte mit Nebenwirkung (`enter`,
   `dice`) dürfen nie wegfallen, sonst bricht der Ablauf. */
function tutList() {
  if (!ui || !ui.tut || !ui.tut.kurz) return TUT_STEPS;
  return TUT_STEPS.filter(st => st.kurz !== false);
}
function tutStep() { return ui.tut ? tutList()[ui.tut.i] : null; }
/* Der Titel des Schritts. Die kurze Fassung darf einen eigenen tragen (`tKurz`), wo sie
   etwas anderes erklärt als die lange – bei „Aktionen" gegen „Woher deine Ressourcen
   kommen" wäre ein gemeinsamer Titel für eine der beiden Fassungen falsch. Ohne `tKurz`
   gilt für beide derselbe Titel, das ist der Normalfall. */
function tutTitle(st) {
  const kurz = ui && ui.tut && ui.tut.kurz && st.tKurz;
  return kurz || st.t;
}
/* Der Text des aktuellen Schritts in der gewählten Fassung. */
function tutHtml(st) {
  const kurz = ui && ui.tut && ui.tut.kurz && st.kurz;
  const q = kurz || st.html;
  return typeof q === 'function' ? q() : q;
}
/* Was ist in diesem Schritt erlaubt?
   Leseschritte und bereits erledigte Aufgaben erlauben nur Nachschlagen – sonst könnte man
   den Verlauf verlassen (Stadt irgendwo gründen, Zug ein zweites Mal beenden). */
const TUT_LOOK_ONLY = { bar: ['a-info', 'a-log'], labels: [], hex: () => [], techs: [] };
/* Fehlt ein Schlüssel im allow-Block, heißt das „nichts erlaubt" – nicht „alles erlaubt".
   Sonst schlüpft man z. B. im Protokoll-Schritt (nur bar: ['a-log']) über das Stadtblatt
   an den Schienen vorbei. */
function tutAllow() {
  const st = tutStep();
  if (!st) return { bar: ['a-tech', 'a-found', 'a-power', 'a-info', 'a-log', 'a-end'], labels: null, techs: null };
  if (!st.allow || (st.goal && st.goal())) return TUT_LOOK_ONLY;   // Leseschritt oder erledigt
  return Object.assign({ bar: [], labels: [], techs: [] }, st.allow);
}
function sameHex(a, r, c) { return a && a[0] === r && a[1] === c; }
function tutHexOk(r, c) {
  const al = tutAllow();
  if (!al.hex) return true;
  if (r == null || c == null) return true;   // Aufruf ohne Feld (Macht-/Armeeblatt)
  return al.hex().some(h => sameHex(h, r, c));
}
function tutMoveOk(r, c) {
  const al = tutAllow();
  if (!al.moveTo) return true;
  return al.moveTo().some(h => sameHex(h, r, c));
}
/* Aktionsblatt filtern: nur die Knöpfe des Schritts bleiben aktiv. */
function tutGateSheet(r, c) {
  const al = tutAllow();
  const body = $('sheet-body');
  if (!body) return;
  body.querySelectorAll('.opt').forEach(b => {
    // Geprüft wird der **deutsche** Schlüssel aus data-label, nicht die Beschriftung:
    // die ist auf Englisch anders, und die Regeln des Tutorials sind deutsch notiert.
    const txt = b.dataset.label || b.textContent || '';
    const okLabel = al.labels === null || al.labels.some(rx => rx.test(txt));
    if (!okLabel || !tutHexOk(r, c)) b.disabled = true;
  });
}
/* Technologiebogen filtern: nur die vorgesehenen Kacheln bleiben aktiv. */
function tutGateTechs() {
  const al = tutAllow();
  const body = $('ov-body');
  if (!body) return;
  body.querySelectorAll('[data-tech]').forEach(b => {
    if (al.techs !== null && !al.techs.includes(b.dataset.tech)) b.disabled = true;
  });
  body.querySelectorAll('[data-copy], [data-freetech], [data-backtech], [data-free]')
    .forEach(b => { b.disabled = true; });
}
function tutHighlight() {
  const st = tutStep();
  if (!st || !st.hl) return null;
  try { return st.hl().filter(Boolean); } catch { return null; }
}
function tutDone() {
  const st = tutStep();
  return !st || !st.goal || !!st.goal();
}
/* Aufgabentexte sprechen über die goldene Umrandung, nicht über Koordinaten. */
/* Titel und Aufgaben stehen als feste Zeichenketten in TUT_STEPS und werden beim Laden
   der Datei gebaut – zu diesem Zeitpunkt steht die Sprache immer auf Deutsch. Übersetzt
   wird deshalb erst hier, beim Anzeigen. Die langen Texte sind Funktionen und laufen
   ohnehin bei jedem Zeichnen durch T(). */
function tutTaskText(st) { return st.task ? T(st.task) : ''; }

/* Spielstand des Übungsspiels aufbauen – ohne Oberfläche, damit test.js denselben Weg
   nimmt wie die App. Reihenfolge wichtig: erst ui (und damit die Würfelfolge), dann
   newGame, sonst würfelt der Aufbau frei. */
function tutorialSetup(opts) {
  const kurz = !!(opts && opts.kurz);
  ui = { sel: null, army: null, mode: null, botTimer: null,
    tut: { i: 0, seen: {}, die: 0, kurz } };
  // oldTree: das Tutorial läuft (vorerst) im alten Techtree – Anweisung des Autors (v82),
  // bis ein neues Übungsspiel kommt. Texte, Würfe und Aufgaben sind auf ihn zugeschnitten.
  S = newGame({
    seed: TUT_SEED, map: MAP_ORIGINAL, startPlayer: 0, oldTree: true,
    players: [
      { civ: 'russland', kind: 'human', ability: 'basis' },
      { civ: 'griechenland', kind: 'bot', diff: 'david' },
      { civ: 'england', kind: 'bot', diff: 'david' },
      { civ: 'wikinger', kind: 'bot', diff: 'david' },
    ],
  });
  // Verfügbarkeit setzen statt würfeln: der Verlauf ist damit bei jedem Start gleich
  const p = S.players[RU()];
  p.avail = {};
  TUT_START_AVAIL.forEach(k => { p.avail[k] = true; });
  log(S, 'info', T('Tutorial: verfügbare Technologien der Antike festgelegt – ') +
    TUT_START_AVAIL.map(k => TECH_BY_KEY[k].n).join(', ') + '.');
}
function tutorialStart(opts) {
  tutorialSetup(opts);
  $('tut-panel').hidden = false;
  document.body.classList.add('tut');
  tutEnter();
  startGameScreen();
}
function tutEnter() {
  const st = tutStep();
  if (!st || ui.tut.seen[ui.tut.i]) return;
  ui.tut.seen[ui.tut.i] = true;
  if (st.dice) ui.tut.pre = st.dice.slice();     // vorgegebene Würfe dieses Schritts
  if (st.enter) st.enter();
}
function renderTutPanel() {
  const st = tutStep();
  if (!st) return;
  $('tut-title').textContent = T(tutTitle(st));
  $('tut-body').innerHTML = tutHtml(st);
  const done = tutDone(), last = ui.tut.i === tutList().length - 1;
  const task = $('tut-task');
  task.hidden = !st.task || done;
  if (st.task) task.innerHTML = `<b>${T('Deine Aufgabe:')}</b> ` + tutTaskText(st);
  $('tut-count').textContent = `${ui.tut.i + 1}/${tutList().length}`;
  $('tut-bar-fill').style.width = Math.round(((ui.tut.i + 1) / tutList().length) * 100) + '%';
  $('tut-prev').disabled = ui.tut.i === 0;
  $('tut-next').disabled = !done;
  $('tut-next').textContent = last ? 'Fertig' : 'Weiter ›';
  tutMaybeAdvance();
}
function tutMove(d) {
  if (!ui.tut) return;
  if (d > 0 && ui.tut.i === tutList().length - 1) return tutorialQuit();
  if (d > 0 && !tutDone()) return;
  ui.tut.i = Math.max(0, Math.min(tutList().length - 1, ui.tut.i + d));
  ui.tut.max = Math.max(ui.tut.max || 0, ui.tut.i);
  ui.army = null; ui.mode = null;       // auch ein offener Gründungsmodus endet mit dem Schritt
  tutEnter();
  redraw();
  const sc = $('tut-panel').querySelector('.tut-scroll');
  if (sc) sc.scrollTop = 0;
}
/* Erledigte Aufgabe = nächster Schritt. Wer gerade gesiedelt oder geforscht hat, soll
   nicht noch „Weiter" drücken müssen.
   Bewusst nicht automatisch:
   · der letzte Schritt – „Weiter" heißt dort „Fertig" und beendet das Tutorial,
   · solange ein Bot-Fenster offen ist (dort führt allein „Weiter" weiter),
   · solange eine kostenlose Technologie oder eine Rückschau offen ist,
   · bei Leseschritten mit `keepOpen` – dort wird gewartet, bis das Fenster wieder zu ist
     (closeModal stößt die Prüfung erneut an), sonst risse es dem Leser das Protokoll weg.
   Die kurze Verzögerung lässt das Ergebnis der eigenen Aktion noch sehen. Sie ändert
   nichts an der Würfelfolge: zwischen „Ziel erreicht" und dem Weiterschalten wird nicht
   gewürfelt, weil erledigte Schritte ohnehin nur noch Nachschlagen erlauben. */
let TUT_AUTO_MS = 900;                 // in Tests auf 0 → sofort, damit synchron prüfbar
function tutMaybeAdvance() {
  if (!ui || !ui.tut || ui.tutAuto) return;
  const st = tutStep();
  if (!st || !st.goal || !tutDone()) return;
  if (ui.tut.i >= tutList().length - 1) return;
  // Wer zurückblättert, will nachlesen – dort darf nicht sofort wieder vorgesprungen
  // werden. Automatisch geht es nur auf dem weitesten je erreichten Schritt weiter.
  if (ui.tut.i < (ui.tut.max || 0)) return;
  if (ui.botLock) return;
  const p = tutP();
  if ((p.freePicks || []).some(c => c.n > 0) || (p.backPicks || []).length) return;
  const overlayOpen = $('overlay') && $('overlay').classList.contains('show');
  if (st.keepOpen && overlayOpen) return;
  const from = ui.tut.i;
  ui.tutAuto = true;
  const go = () => {
    if (!ui.tut || ui.tut.i !== from || !tutDone()) { ui.tutAuto = false; return; }
    closeSheet(); closeModal();
    tutMove(1);
    ui.tutAuto = false;                // erst danach frei: eine Stufe je Aktion, keine Kette
  };
  if (TUT_AUTO_MS > 0 && typeof setTimeout === 'function') setTimeout(go, TUT_AUTO_MS);
  else go();
}
function tutorialQuit() {
  ui.tut = null;
  $('tut-panel').hidden = true;
  document.body.classList.remove('tut');
  redraw();
  toast(T('Tutorial beendet – das Spiel läuft weiter.'));
}
