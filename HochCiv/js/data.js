/* Version der App. Sie steht im Hauptmenü und muss zur VERSION in sw.js passen –
   ein Test bindet beide aneinander, damit sie nicht auseinanderlaufen. */
const APP_VERSION = 'v98';

/* Hochzeivilization – Spieldaten
   Alle Werte aus den Originalregeln (Regelheft + Technologiebogen).
   Erratum berücksichtigt: "Kernphysik" und "Raumfahrt" existieren nicht. */

const AGES = ['Antike', 'Mittelalter', 'Industrialisierung', 'Moderne'];
const FIELDS = ['Forschung', 'Produktion', 'Militär', 'Spezial'];

// Zeitalter anhand der Kosten (Reihe im Bogen)
function ageOfCost(c) { return c <= 5 ? 0 : c <= 10 ? 1 : c <= 15 ? 2 : 3; }

// Geländeerträge: [Wissenschaft, Nahrung, Münzen]
const TERRAIN = {
  G: { key: 'G', name: 'Grasland', yield: [0, 1, 0], land: true, color: '#adba7c' },
  W: { key: 'W', name: 'Wald', yield: [0, 0, 1], land: true, color: '#708a58' },
  B: { key: 'B', name: 'Gebirge', yield: [1, 0, 1], land: true, color: '#aa967e' },
  F: { key: 'F', name: 'Fluss', yield: [0, 1, 1], land: true, color: '#70a0ba' },
  M: { key: 'M', name: 'Meer', yield: [0, 0, 1], land: false, color: '#96bac6' },
  I: { key: 'I', name: 'Insel', yield: [1, 1, 1], land: true, color: '#d0c48a' },
  // Vulkan: entsteht nur durch das Ereignis "Vulkanausbruch" – unpassierbar, kein Ertrag.
  V: { key: 'V', name: 'Vulkan', yield: [0, 0, 0], land: true, color: '#6b5a4c', block: true },
  /* Kein Feld: liegt außerhalb der Karte. Plättchenkarten sind nicht rechteckig – was
     nicht zur Form gehört, ist X. Wird nicht gezeichnet, ist unpassierbar, bringt nichts
     und taucht in keiner Ertragsübersicht auf. `off` unterscheidet es vom Vulkan, der
     ein echtes (nur wertloses) Feld ist. */
  X: { key: 'X', name: 'Kein Feld', yield: [0, 0, 0], land: false, color: '#cdc4a4', block: true, off: true },
};
const isOff = t => !!(t && TERRAIN[t] && TERRAIN[t].off);
/* Ertrag JE BEVÖLKERUNGSPUNKT einer Stadt: +1 Wissenschaft, -1 Nahrung, +1 Münze.
   Die Effekttexte der Technologien, die hier zuschlagen (Schrift, Universitätswesen,
   Fließband, Robotik), sagen deshalb „Je Bevölkerung" und nicht „Stadt": eine Stadt mit
   Bevölkerung 5 bekommt durch Schrift +5 Wissenschaft, nicht +1. */
const CITY_YIELD = [1, -1, 1];

/* ---------------------------------------------------------------- Technologien */
// f = Feld, c = Kosten, e = Effekttext, k = Effekt-Schlüssel für die Engine
/* `voll` (v96, Anweisung des Autors): der ganze Wirkungstext für den Regelbogen („Regeln &
   Technologien"), wo er länger ist als der Text der Kachel. Auf den Kacheln des Bogens (und in
   den Knöpfen, die eine Technologie anbieten) steht `e` ohne die Hinweise, was die Bürokratie
   mitverdoppelt – im Regelbogen steht es (techEffectFull). Englisch an dritter Stelle in
   DATA_EN.tech. */
/* Grundkosten (c) sind seit v82 die des früheren „alternativen Techtrees" (v70/v74,
   Anweisung des Autors): Mathematik 1, Astronomie 2, Philosophie 3, Schrift 4 ·
   Bewässerung 1, Landwirtschaft 5 · Chemie 11, Biologie 12, Wissenschaftliche Methode 15.
   Seit v84 (Anweisung des Autors) außerdem Stadtmauern 2, Eisenverarbeitung 4,
   Belagerungsmaschinen 5 (vorher 5, 2, 4).
   Die alten Werte gibt es nur noch im Tutorial (OLD_TECH_COSTS). Die Reihenfolge dieser
   Liste ist bewusst die alte geblieben – die Leiter im Bogen kommt aus techsIn (nach
   Kosten sortiert), und wo Code die Liste der Reihe nach durchgeht, bleibt so alles,
   wie es war (auch im Tutorial). */
const TECHS = [
  // Forschung
  { k: 'schrift', n: 'Schrift', f: 0, c: 4, e: 'Je Bevölkerung: +1 Wissenschaft' },
  { k: 'mathematik', n: 'Mathematik', f: 0, c: 1, e: 'Wald: +1 Wissenschaft' },
  { k: 'astronomie', n: 'Astronomie', f: 0, c: 2, e: 'Meer: +1 Wissenschaft' },
  { k: 'philosophie', n: 'Philosophie', f: 0, c: 3, e: '+1 beim Auswürfeln von Techverfügbarkeit' },
  { k: 'papier', n: 'Papier', f: 0, c: 6, e: 'Grasland: +1 Wissenschaft' },
  { k: 'alchemie', n: 'Alchemie', f: 0, c: 8, e: '1:1 Wissenschaft → Münzen' },
  { k: 'buchdruck', n: 'Buchdruck', f: 0, c: 9, e: 'Fluss: +1 Wissenschaft' },
  { k: 'universitaet', n: 'Universitätswesen', f: 0, c: 10, e: 'Je Bevölkerung: +2 Wissenschaft' },
  { k: 'wiss_methode', n: 'Wissenschaftliche Methode', f: 0, c: 15, e: 'Techkosten −2/−3/−4/−5/−10 (je Zeitalter)' },
  { k: 'chemie', n: 'Chemie', f: 0, c: 11, e: 'Gebirge: +1 Wissenschaft' },
  { k: 'elektrizitaet', n: 'Elektrizität', f: 0, c: 13, e: 'Wald: +2 Wissenschaft' },
  { k: 'biologie', n: 'Biologie', f: 0, c: 12, e: 'Grasland: +2 Wissenschaft' },
  { k: 'computertechnik', n: 'Computertechnik', f: 0, c: 17, e: '1:1 Münzen → Wissenschaft' },
  { k: 'gentechnik', n: 'Gentechnik', f: 0, c: 18, e: 'Je vier Wissenschaft eine Nahrung; füttert auch 1:1' },
  { k: 'raumfahrt', n: 'Raumfahrt', f: 0, c: 19, wo: true, e: 'Bei jedem Wunderbau eine Technologie gratis' },
  { k: 'ki', n: 'Künstliche Intelligenz', f: 0, c: 20, e: 'Wald: +3 Wissenschaft' },
  // Produktion
  { k: 'landwirtschaft', n: 'Landwirtschaft', f: 1, c: 5, e: 'Grasland: +1 Nahrung' },
  { k: 'fischerei', n: 'Fischerei', f: 1, c: 2, e: 'Meer: +1 Nahrung' },
  { k: 'rad', n: 'Rad', f: 1, c: 3, e: 'Straßen' },
  { k: 'keramik', n: 'Keramik', f: 1, c: 4, e: '1× zusätzliches Wachstum pro Stadt' },
  { k: 'bewaesserung', n: 'Bewässerung', f: 1, c: 1, e: 'Gebirge: +1 Nahrung' },
  { k: 'segeln', n: 'Segeln', f: 1, c: 7, e: 'Meer: +2 Nahrung' },
  { k: 'muehlentechnik', n: 'Mühlentechnik', f: 1, c: 8, e: 'Fluss: +1 Münze' },
  { k: 'baukraene', n: 'Baukräne', f: 1, c: 9, wo: true, e: 'Weltwunder kosten 2/4/6/8/… weniger' },
  { k: 'gilden', n: 'Gilden', f: 1, c: 10, e: '1:1 Münzen → Nahrung' },
  { k: 'dampfmaschine', n: 'Dampfmaschine', f: 1, c: 11, e: 'Keine Münzkosten für Bevölkerungswachstum; 1× zusätzliches Wachstum pro Stadt' },
  { k: 'eisenbahn', n: 'Eisenbahn', f: 1, c: 13, e: 'Eisenbahn' },
  { k: 'kunstduenger', n: 'Kunstdünger', f: 1, c: 14, e: 'Wald: +1 Nahrung' },
  { k: 'fliessband', n: 'Fließband', f: 1, c: 15, e: 'Je Bevölkerung: +1 Münze' },
  { k: 'verbundwerkstoffe', n: 'Verbundwerkstoffe', f: 1, c: 16, e: '1× zusätzliches, kostenloses Wachstum pro Stadt' },
  { k: 'gruene_revolution', n: 'Grüne Revolution', f: 1, c: 17, e: 'Grasland: +1 Nahrung, +1 Münze' },
  { k: 'containerlogistik', n: 'Containerlogistik', f: 1, c: 18, e: 'Meer: +2 Nahrung, +1 Münze' },
  { k: 'robotik', n: 'Robotik', f: 1, c: 19, e: 'Je Bevölkerung: +2 Münzen' },
  // Militär
  { k: 'taktik', n: 'Taktik', f: 2, c: 1, e: 'Flankieren von zwei beliebigen Positionen' },
  { k: 'eisenverarbeitung', n: 'Eisenverarbeitung', f: 2, c: 4, e: '4 Münzen = 1 Macht' },
  { k: 'belagerung', n: 'Belagerungsmaschinen', f: 2, c: 5, e: '+3 Angriff gegen Städte' },
  { k: 'stadtmauern', n: 'Stadtmauern', f: 2, c: 2, e: 'Städte haben +5 Verteidigung' },
  { k: 'burgenbau', n: 'Burgenbau', f: 2, c: 7, e: 'Städte enthalten unbewegliche Armee' },
  { k: 'stahl', n: 'Stahl', f: 2, c: 8, e: 'Machtverlust = 1/3' },
  { k: 'militaerlogistik', n: 'Militärlogistik', f: 2, c: 6, wo: true, e: '+1 Bewegungsweite je eigenem Weltwunder' },
  { k: 'schiesspulver', n: 'Schießpulver', f: 2, c: 10, e: 'Kontrollzone' },
  { k: 'gewehre', n: 'Gewehre', f: 2, c: 11, e: '3 Münzen = 1 Macht' },
  { k: 'panzerschiff', n: 'Panzerschiff', f: 2, c: 13, e: 'Bewegung = 6, Bewegung auf und über Meer' },
  { k: 'dynamit', n: 'Dynamit', f: 2, c: 14, e: 'Armeen haben doppelten Angriff gegen Städte' },
  { k: 'maschinengewehr', n: 'Maschinengewehr', f: 2, c: 15, e: 'Städte: +2 Verteidigung je Bevölkerung' },
  { k: 'panzer', n: 'Panzer', f: 2, c: 16, e: 'Machtverlust = 1/4' },
  { k: 'luftwaffe', n: 'Luftwaffe', f: 2, c: 17, e: 'Bewegung = 9, Hindernisse ignorieren' },
  { k: 'raketentechnik', n: 'Raketentechnik', f: 2, c: 19, e: 'Armeen haben einen Ring mehr Reichweite' },
  { k: 'atomwaffen', n: 'Atomwaffen', f: 2, c: 20, e: '1x pro Runde ein Feld mit Umland wählen, alle Armeen zerstören' },
  // Spezial
  { k: 'navigation', n: 'Navigation', f: 3, c: 1, e: 'Bewegung über Meer' },
  { k: 'demokratie', n: 'Demokratie', f: 3, c: 3, e: 'Armeekosten = 4 × Anzahl' },
  { k: 'wallfahrt', n: 'Wallfahrt', f: 3, c: 4, wo: true, e: 'Je eigenem Weltwunder +3 auf alle Erträge' },
  { k: 'sklaverei', n: 'Sklaverei', f: 3, c: 5, e: 'Stadtbevölkerung opfern → 7 Münzen · wird in der Moderne obsolet' },
  { k: 'rittertum', n: 'Rittertum', f: 3, c: 6, e: '1 Bevölkerungsverlust beim Erobern' },
  { k: 'kundschafterei', n: 'Kundschafterei', f: 3, c: 7, e: 'Tech kopieren (2× Kosten in Münzen)' },
  { k: 'buerokratie', n: 'Bürokratie', f: 3, c: 8, e: 'Hauptstadt produziert doppelt',
    voll: 'Hauptstadt produziert doppelt, dazu Handelsrouten, Ökologie, Gentechnik und gekaufte Felder' },
  { k: 'kartografie', n: 'Kartografie', f: 3, c: 9, e: 'Keine Distanzkosten beim Gründen' },
  { k: 'theologie', n: 'Theologie', f: 3, c: 10, e: '>3/5 der Bevölkerung zum Sieg' },
  { k: 'nationalismus', n: 'Nationalismus', f: 3, c: 11, e: 'Armeekosten = 2 × Anzahl' },
  { k: 'spionage', n: 'Spionage', f: 3, c: 12, e: 'Tech kopieren (1× Kosten in Münzen)' },
  { k: 'militaergericht', n: 'Militärgericht', f: 3, c: 13, e: 'Kein Bevölkerungsverlust beim Erobern' },
  { k: 'kolonialismus', n: 'Kolonialismus', f: 3, c: 14, e: 'Für 3 Münzen Feld kaufen; dort auch ohne Weg gründen',
    voll: 'Für 3 Münzen Feld kaufen; dort auch ohne Weg gründen. Gekaufte Felder zählen zur Hauptstadt (mit Bürokratie doppelt)' },
  { k: 'massenmedien', n: 'Massenmedien', f: 3, c: 16, e: 'Eine Münze ernährt drei Bevölkerung' },
  { k: 'un', n: 'Vereinte Nationen', f: 3, c: 17, e: '>1/2 der Bevölkerung zum Sieg' },
  { k: 'oekologie', n: 'Ökologie', f: 3, c: 18, e: '+1 auf alle Erträge je 2 Bevölkerung im ganzen Reich (abrunden)' },
  { k: 'internet', n: 'Internet', f: 3, c: 19, e: '1 Tech/Runde kopieren' },
];
TECHS.forEach(t => { t.age = ageOfCost(t.c); });

/* ----------------------------------------------------------------- Regelkonstanten
   Es gibt nur noch einen Regelsatz: die früher "experimentell v2" genannten Regeln
   sind jetzt die Hauptvariante (Singularität 100, Keramik + Theologie in der
   Techliste, Verbundwerkstoffe = kostenloses Wachstum, Sklaverei ab Moderne
   obsolet, Siegschwellen stapeln nicht, Bots forschen zweimal).
   Griechenland hat KEINEN Würfelbonus auf die Techverfügbarkeit (nur den Rabatt).
   Seit v88 (Anweisung des Autors) kostet die Singularität 120; der Marathon behält seine
   300 (MARATHON_SINGULARITY). */
const SINGULARITY_BASE = 120;
// Belagerungsmaschinen: Angriff je Armee gegen Städte (bis v87: 5). Der Techtext nennt die Zahl.
const SIEGE_BONUS = 3;
const KREML_SURCHARGE = 50;        // Weltwunder "Der Kreml": Singularität teurer, für alle
// Englands „Seemacht": Zuschlag je Stadt am Meer auf jeden der drei Erträge (v53: 1)
const SEA_CITY_BONUS = 1;
/* Handelsrouten (tradeRoutes): Zuschlag je angebundener Stadt auf jeden der drei Erträge – über
   Straßen bzw. gemischte Strecken, über durchgehende Eisenbahn. Seit v96 (Anweisung des Autors)
   bringt die Eisenbahn +4 statt +2. Regelbogen, Straßenknöpfe und Tutorialtexte nennen die Zahlen. */
const TRADE_ROAD_BONUS = 1;
const TRADE_RAIL_BONUS = 4;        // bis v95: 2
/* Massenmedien: eine Münze deckt so viele Bevölkerungskosten (v64: 5, v66: 3). Bleibt
   reines Füttern – gedeckt wird nie mehr, als die Bevölkerung tatsächlich isst (coverPop). */
const FEED_COIN_RATE = 3;
/* Gentechnik: so viel Wissenschaft aus dem Rundeneinkommen ergibt zu Zugbeginn eine
   Nahrung, abgerundet (v64: 2, v66: 4). Kommt zum Füttern 1:1 hinzu, ersetzt es nicht. */
const GENE_SCI_PER_FOOD = 4;
const VICTORY_FRAC = 2 / 3;        // Standard-Siegschwelle
const THEOLOGY_FRAC = 3 / 5;       // mit Theologie
const UN_FRAC = 1 / 2;             // mit Vereinte Nationen
const BOT_RESEARCH_TWICE = true;
const SLAVERY_OBSOLETE_IN_MODERN = true;
const SLAVERY_COINS = 7;     // Sklaverei: Münzen je geopferter Bevölkerung (bis v83: 10)
/* Seit v97 (Anweisung des Autors):
   · Rabatte je Zeitalter – Antike, Mittelalter, Industrialisierung, Moderne und an fünfter Stelle
     die Singularität (techCost): Griechenlands Günstige Forschung 1/1/2/2/5 (bis v96 1/2/3/4/5),
     die Wissenschaftliche Methode 2/3/4/5/10 (bis v96 2/4/6/8/10). Im Marathon zählen beide
     doppelt (MARATHON_DISCOUNT_FACTOR). Der alte Techtree behält die alte Methode
     (OLD_METHOD_DISCOUNT) – sonst ginge der feste Ablauf des Tutorials nicht mehr auf.
   · Griechenlands Freie Forschung: zweimal je Partie, eine verfügbare Technologie aus jedem
     Zeitalter (bis v96 einmal je Runde, bis zur Industrialisierung, im Marathon bis ins
     Mittelalter). Die Singularität nicht – wie bei der Raumfahrt holt nur Oxford sie gratis.
   · Kriegerkultur der Wikinger: +1 Macht je Armee, mit Burgenbau auch je Stadt (bis v96 +2).
   Dazu, ohne eigene Zahl (js/engine.js): Siedlertrecks wachsen zum Preis einer um 1 kleineren
   Stadt (growPrice), Fruchtbarkeit bringt ein bezahltes Wachstum mehr (growLimits).
   Die Texte in data/civs.json, TECHS und DATA_EN nennen dieselben Zahlen; ein Test hält sie
   zusammen. */
const GREEK_DISCOUNT = [1, 1, 2, 2, 5];
const METHOD_DISCOUNT = [2, 3, 4, 5, 10];
const FREE_TECH_USES = 2;          // Freie Forschung je Partie
const WARRIOR_POWER = 1;           // Kriegerkultur: Macht je Armee (mit Burgenbau je Stadt)

const TECH_BY_KEY = {};
TECHS.forEach(t => { TECH_BY_KEY[t.k] = t; });
/* Ertragstechnologien (v88, Anweisung des Autors). Je Technologie das Ziel – eine Geländeart
   oder 'pop' (je Bevölkerungspunkt) – und ihr eigener Zuwachs [Wissenschaft, Nahrung, Münzen].
   Innerhalb eines Feldes schließt eine teurere Technologie die billigeren auf demselben Ziel
   ein: sie SETZT den Bonus auf die Summe bis zu ihr, statt ihn zu erhöhen. Mathematik gibt
   Wald +1 Wissenschaft, Elektrizität +2, Künstliche Intelligenz +3 – wer alle drei hat,
   bekommt weiter +3. Ertragsarten derselben Kette stecken mit darin (Containerlogistik: Meer
   +2 Nahrung, +1 Münze), Ketten verschiedener Felder addieren sich (Grasland: Papier aus
   der Forschung und Landwirtschaft aus der Produktion). Wer eine Kette ganz hat, steht genau
   wie bis v87, als jede Technologie nur ihren eigenen Zuwachs addierte.
   YIELD_CHAINS[Ziel] = je Feld eine Kette, nach den Grundkosten sortiert, jedes Glied mit
   der Summe bis zu sich; yieldBonus (engine.js) nimmt das höchste erforschte Glied.
   Sortiert wird nach t.c: im alten Techtree (Tutorial) und im Marathon ist die Reihenfolge
   innerhalb jeder Kette dieselbe – ein Test hält das fest. Die Techtexte (TECHS und DATA_EN)
   nennen die Summe, die das Glied setzt; ein Test rechnet sie nach. Seit v89 ohne den Zusatz
   „(inkl. …)" (Anweisung des Autors) – die Regel erklärt der Regelbogen unter der
   Geländetabelle. */
const YIELD_TECHS = {
  schrift: { on: 'pop', y: [1, 0, 0] },
  universitaet: { on: 'pop', y: [1, 0, 0] },
  mathematik: { on: 'W', y: [1, 0, 0] },
  elektrizitaet: { on: 'W', y: [1, 0, 0] },
  ki: { on: 'W', y: [1, 0, 0] },
  papier: { on: 'G', y: [1, 0, 0] },
  biologie: { on: 'G', y: [1, 0, 0] },
  astronomie: { on: 'M', y: [1, 0, 0] },
  buchdruck: { on: 'F', y: [1, 0, 0] },
  chemie: { on: 'B', y: [1, 0, 0] },
  landwirtschaft: { on: 'G', y: [0, 1, 0] },
  gruene_revolution: { on: 'G', y: [0, 0, 1] },
  fischerei: { on: 'M', y: [0, 1, 0] },
  segeln: { on: 'M', y: [0, 1, 0] },
  containerlogistik: { on: 'M', y: [0, 0, 1] },
  bewaesserung: { on: 'B', y: [0, 1, 0] },
  muehlentechnik: { on: 'F', y: [0, 0, 1] },
  kunstduenger: { on: 'W', y: [0, 1, 0] },
  fliessband: { on: 'pop', y: [0, 0, 1] },
  robotik: { on: 'pop', y: [0, 0, 1] },
};
const YIELD_CHAINS = {};
{
  const ketten = {};
  for (const t of TECHS) {
    const d = YIELD_TECHS[t.k];
    if (!d) continue;
    const id = d.on + '|' + t.f;
    (ketten[id] || (ketten[id] = { on: d.on, f: t.f, techs: [] })).techs.push(t);
  }
  for (const { on, f, techs } of Object.values(ketten)) {
    const sum = [0, 0, 0];
    const chain = techs.sort((a, b) => a.c - b.c).map(t => {
      YIELD_TECHS[t.k].y.forEach((n, i) => { sum[i] += n; });
      return { k: t.k, y: sum.slice() };
    });
    chain.f = f;
    (YIELD_CHAINS[on] || (YIELD_CHAINS[on] = [])).push(chain);
  }
}
/* Technologien mit `wo: true` gehören zur Weltwunder-Erweiterung und existieren nur in
   einer Partie mit Weltwundern. Ohne Spielstand (z. B. in Tabellen) zählt die Grundliste. */
function techActive(S, t) { return !t.wo || !!(S && S.wo); }
function techPool(S) { return TECHS.filter(t => techActive(S, t)); }
const SINGULARITY = {
  k: 'singularitaet', n: 'Singularität', c: SINGULARITY_BASE,
  e: 'Erfordert mind. 1 Technologie der Moderne in jedem Feld. Du gewinnst das Spiel.',
};
/* Der alte Techtree (bis v81 der Standard) – seit v82 nur noch im Tutorial (Anweisung des
   Autors: „bis ich ein besseres Tutorialspiel liefere"). Er unterscheidet sich vom
   heutigen nur in den Grundkosten dieser zwölf Technologien (die drei militärischen seit
   v84: das Tutorial behält seine Kosten und damit seinen festen Ablauf) und seit v97 im
   Rabatt der Wissenschaftlichen Methode (OLD_METHOD_DISCOUNT, aus demselben Grund); die
   übrigen Wirkungen, Feld und Zeitalter sind gleich. Eine Partie trägt ihn als S.oldTree. Bis v81 hieß der Schalter andersherum
   S.altTree (der heutige Standard war zuschaltbar) – migrateState übersetzt alte
   Spielstände, eine laufende Partie behält ihren Techtree. Ein Test hält fest, dass keiner
   dieser Werte die Zeitaltergrenze überschreitet (t.age kommt aus c). */
const OLD_TECH_COSTS = {
  schrift: 1, mathematik: 2, astronomie: 3, philosophie: 4,     // Forschung, Antike
  wiss_methode: 11, chemie: 12, biologie: 15,                   // Forschung, Industrialisierung
  landwirtschaft: 1, bewaesserung: 5,                           // Produktion, Antike
  eisenverarbeitung: 2, belagerung: 4, stadtmauern: 5,          // Militär, Antike (bis v83 Standard)
};
/* Seit v97 dazu die Wissenschaftliche Methode von damals (bis v96 überall): Das Tutorial rechnet
   mit ihr – Burgenbau (Mittelalter) kostet dort 3 statt 4, und am Ende des Zuges bleibt genau die
   1 Wissenschaft fürs Rad. Gilt im alten Techtree, also auch in Partien von vor v82. */
const OLD_METHOD_DISCOUNT = [2, 4, 6, 8, 10];
/* Kolonialismus und Kundschafterei (v72, Anweisung des Autors; gilt in beiden Techtrees –
   sie unterscheiden sich nur in den Forschungskosten). Die Techtexte in TECHS und DATA_EN
   nennen dieselben Zahlen; ein Test hält beides zusammen. */
const COLONY_COST = 3;       // Kolonialismus: Münzen je Feld (bis v71: 5)
const SCOUTING_RATE = 2;     // Kundschafterei: × Grundkosten, in Münzen (bis v71: 3)
/* Marathon (v83, Anweisung des Autors; Karte und Draft in js/marathon.js): Karte viermal so
   groß wie die Europakarte (Originalkarte 12 × 18), Technologien je Zeitalter ×2/×3/×4/×5.
   Vergünstigungen (Griechenland, Wissenschaftliche Methode) ziehen danach ihre festen
   Beträge ab, der Kreml schlägt seine 50 auf.
   Seit v84 (Anweisung des Autors): Singularität 300 (v83: 2,5-fach, also 250), höchstens
   fünf Gründungen je Zug, Militärsieg erst mit der zweiten eroberten Hauptstadt. */
/* Spielerzahl (Mehrspieler-Erweiterung): 2 bis 8 Reiche. Es gibt vier Zivilisationen – ab dem fünften Reich
   sitzen sie mehrfach am Tisch („England II", eigene Farbe). Die festen Karten und die
   Standard-Marathonkarte haben vier Startpunkte, mehr geht dort nicht; die Plättchenkarte
   hat Formen für 2–8, eigene Karten so viele, wie ihre Startpunkte hergeben. */
const MIN_PLAYERS = 2, MAX_PLAYERS = 8;
/* Farben für Doppelgänger, wenn die vier Zivilisationsfarben vergeben sind (ab fünf Reichen):
   deutlich verschieden von Blau, Rot, Grün, Violett und vom Braun der Barbaren. */
const EXTRA_COLORS = ['#c8691c', '#b39a22', '#b2477d', '#42505e'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const MARATHON_ROWS = 24, MARATHON_COLS = 36;
const MARATHON_TECH_FACTOR = [2, 3, 4, 5];
const MARATHON_SINGULARITY = 300;
const MARATHON_MAX_FOUNDS = 5;      // neue Städte je Zug
const MARATHON_CAPITALS = 2;        // eroberte Hauptstädte für den Militärsieg
/* Seit v85 (Anweisung des Autors): Griechenlands Günstige Forschung und die Wissenschaftliche
   Methode wirken doppelt. Die Freie Forschung reichte v85–v96 im Marathon nur bis ins
   Mittelalter; seit v97 gilt sie zweimal je Partie für jedes Zeitalter, auch hier. */
const MARATHON_DISCOUNT_FACTOR = 2;
/* Startausgleich (v85, Anweisung des Autors): im allerersten Zug bekommt der Zweite in der
   Zugfolge Münzen dazu, der Dritte mehr, der Vierte noch mehr – je Platz in der Zugfolge.
   Seit v98 (Anweisung des Autors) 2/4/6 statt 1/2/3, und zu zweit bekommt der Zweite 4 statt 1
   (START_BONUS_DUEL; zu dritt gilt die Reihe: 2 und 4).
   Ab fünf Reichen (Mehrspieler-Erweiterung) in derselben Reihe weiter: der Fünfte 8 … der Achte 14. */
const START_BONUS_COINS = [0, 2, 4, 6, 8, 10, 12, 14];
const START_BONUS_DUEL = 4;         // zu zweit: der Zweite (bis v97: 1)
const MARATHON_MIN_START = 4;      // Nahrung + ½ Münzen der Hauptstadt im ersten Zug, mit 2 Bevölkerung
const MARATHON_MIN_DIST = 14;      // Mindestabstand der Hauptstädte (Originalkarte: 7 auf halber Breite)
/* Grundkosten einer Technologie IN DIESER PARTIE, vor allen Vergünstigungen (Griechenland,
   Wissenschaftliche Methode). Ohne Spielstand – Tabellen, Regelbogen aus dem Menü – die
   Standardkosten. Wer irgendwo Kosten braucht, nimmt diese Funktion, nicht t.c. Gilt auch
   für die Singularität (SINGULARITY, ohne Zeitalter). */
function techBase(S, t) {
  const c = S && S.oldTree && OLD_TECH_COSTS[t.k] != null ? OLD_TECH_COSTS[t.k] : t.c;
  if (!(S && S.marathon)) return c;
  return t.k === 'singularitaet' ? MARATHON_SINGULARITY : c * MARATHON_TECH_FACTOR[t.age];
}
// Techs je Feld und Zeitalter, nach den Kosten der Partie sortiert (billigere zuerst).
// Das ist die Leiter im Technologiebogen; Würfe auf „die n-te Technologie" zählen ebenso.
function techsIn(field, age, S) {
  return techPool(S).filter(t => t.f === field && t.age === age)
    .sort((a, b) => techBase(S, a) - techBase(S, b));
}

/* ---------------------------------------------------------------- Zivilisationen */
/* Jede Zivilisation hat drei wählbare Fähigkeiten: die Grundfähigkeit und die zwei
   Alternativen aus dem Zivilisationsbogen. Im Aufbau wird eine davon gewählt.
   Bots erhalten grundsätzlich KEINE Zivilisationsfähigkeit. */
/* Die Zivilisationen stehen nicht hier, sondern in js/civs.js – erzeugt aus
   data/civs.json (siehe README). Neues Reich: JSON ändern, `node tools_civs.js` laufen
   lassen. Dort steht auch ORDER, die Zugreihenfolge, und BARB_CIV. */


/* Zwei Karten stehen zur Wahl. Die Originalkarte ist aus dem gedruckten Bogen
   ausgemessen, die große ist im selben Stil erzeugt: zusammenhängende Landmassen,
   Gebirgszüge mit Flussläufen, Inseln – nur weiter und stärker durchmischt. */
const MAP_ORIGINAL = {
  name: 'Originalkarte (12 × 18)',
  rows: [
    'MIMMBBWBGGWWWWWWWM',
    'MMMBBWGGWMMWWWFWWB',
    'MMMMMGGWMMGWWWWFWB',
    'MMGGMMGFGFWWWGGWWB',
    'MMGGMGFGGGWWWWGGFB',
    'MMGGMGFGGGBWWGGGFM',
    'MMMGFGBBGBBGGFGGGM',
    'MMGFGGBGGGFFFFGGGG',
    'MGGBGMGFGGGGGMMMBB',
    'MFGGMMMGGMGGGMMGGB',
    'MGGGMMMMGMMGGMIGGM',
    'MGGMMMMIMIMIMIMMGM',
  ],
  capitals: { wikinger: [1, 8], russland: [4, 15], england: [5, 3], griechenland: [9, 10] },
};

const MAP_GROSS = {
  name: 'Große Karte (15 × 24)',
  rows: [
    'MMMMMMMMIMMMMMMMMIMMMMMM',
    'MGGGMMMMMMGGGGGWMMMMMGGM',
    'MGGGBMMMGGWGGGGWWMGGGGBM',
    'MMMBBBGWWFFFFGGGWFFFGGGM',
    'MMMMWFFFFFWWWGGWGGGGFGMM',
    'MMMBGBWGWWWWWWGGGBBFGBMM',
    'MMGGGGGGGWWWWWGWGBBBBWMM',
    'MGGGGGGGGGWWWGGGGBGBGMMM',
    'MGGGWGGGWWWWWGGGGBBGFGMM',
    'MMFFGGGGGWFWWWGGFGGGFFMM',
    'IMGGFGGGGWFWWGGGGFGGGGMM',
    'MMBBBGGGWFGWWGWBBFGGGGMM',
    'IMBBWBFFFFGWBWGWGGFFGBMM',
    'MBWBBFWWWWWGGMMMMMMMGGMI',
    'MMMMMMMMMMMMMMMMMMMMMMMM',
  ],
  capitals: { wikinger: [2, 11], russland: [3, 20], england: [8, 3], griechenland: [12, 13] },
};

// Reihenfolge bestimmt die Vorauswahl im Aufbau: die Originalkarte ist Standard.
const MAPS = [MAP_ORIGINAL, MAP_GROSS];
const DEFAULT_MAP = MAP_ORIGINAL;

/* Kampfauslegung – beide Seiten addieren, wie vom Autor bestätigt:
   zwei Armeen an derselben Stadt greifen doppelt so stark an wie eine. */
const COMBAT = {
  attackStacks: true,    // jede angreifende Armee bringt den vollen Machtwert
  defenseStacks: true,   // jede benachbarte Verteidigerarmee ebenfalls
};

const DIFFICULTIES = [
  { k: 'siedler', n: 'Siedler', min: 6 },
  { k: 'haeuptling', n: 'Häuptling', min: 5 },
  { k: 'prinz', n: 'Prinz', min: 4 },
  { k: 'koenig', n: 'König', min: 3 },
  { k: 'david', n: 'David', min: 2 },
];
/* Stufen der KI (js/ki.js). Die KI spielt auf jeder Stufe nach denselben Regeln wie ein
   Mensch – sie bekommt weder Ressourcen geschenkt noch abgezogen. Die Stufe regelt nur,
   wie viel sie übersieht, wie gründlich sie rechnet und wie oft sie sich vergreift
   (Einzelheiten in KI_PARAMS, js/ki.js). Im Duell gemessen etwa wie die Bots Prinz,
   König und David. Reihenfolge von leicht nach schwer, wie bei DIFFICULTIES. */
const KI_LEVELS = [
  { k: 'leicht', n: 'Leicht' },
  { k: 'mittel', n: 'Mittel' },
  { k: 'schwer', n: 'Schwer' },
];
const KI_DEFAULT_LEVEL = 'mittel';

/* ---------------------------------------------------------------- Ereignisse
   Aus dem Ereignisbogen. Erster Würfel = Zeile (1–6), zweiter = Spalte.
   Hard: 1/2 → Spalte 1, 3/4 → Spalte 2, 5/6 → Spalte 3, also jede Runde ein Ereignis.
   Easy: nur 1/3/5 treffen ihre Spalte, 2/4/6 gehen ins Leere.
   Bots sind von Ereignissen nie betroffen. */
const EVENT_ROWS = [
  [
    { k: 'pest', n: 'Die Pest', e: 'Alle Städte verlieren die Hälfte ihrer Bevölkerung (aufgerundet).' },
    { k: 'erdbeben', n: 'Erdbeben', e: 'Ein zufälliges eigenes Weltwunder wird zerstört und kann nicht wieder gebaut werden.' },
    { k: 'piraterie', n: 'Piraterie', e: 'Meeresfelder bringen diese Runde keine Erträge.' },
  ],
  [
    { k: 'kriegsmuedigkeit', n: 'Kriegsmüdigkeit', e: 'Der Machtwert wird auf 0 zurückgesetzt.' },
    { k: 'sturmflut', n: 'Sturmflut', e: 'Städte an Meer oder Fluss verlieren ein Drittel ihrer Bevölkerung (aufgerundet) und können diese Runde nicht wachsen.' },
    { k: 'duerre', n: 'Dürre', e: 'Grasland bringt diese Runde keine Erträge.' },
  ],
  [
    { k: 'revolution', n: 'Revolution', e: 'Die Hauptstadt produziert diese Runde nichts, verbraucht aber trotzdem normal Nahrung.' },
    { k: 'barbaren', n: 'Barbareninvasion', e: 'Eine ausgewürfelte Stadt (nicht die Hauptstadt) wird von Barbaren mit Macht 10 oder dem doppelten eigenen Machtwert angegriffen – je nachdem, was mehr ist.' },
    { k: 'hochwasser', n: 'Hochwasser', e: 'Flüsse bringen diese Runde keine Erträge.' },
  ],
  [
    { k: 'dunkles_zeitalter', n: 'Dunkles Zeitalter', e: 'Diese Runde kann nicht geforscht werden.' },
    { k: 'vulkan', n: 'Vulkanausbruch', e: 'Ein Feld neben einer ausgewürfelten Stadt wird zum Vulkan. Die Stadt verliert drei Viertel ihrer Bevölkerung (aufgerundet) oder 3 Bevölkerung – je nachdem, was mehr ist.' },
    { k: 'waldbrand', n: 'Waldbrände', e: 'Wälder bringen diese Runde keine Erträge.' },
  ],
  [
    { k: 'buergerkrieg', n: 'Bürgerkrieg', e: 'Alle Armeen werden zerstört. Diese Runde können Armeen und Macht auch mit Nahrung bezahlt werden.' },
    { k: 'wirtschaftskrise', n: 'Wirtschaftskrise', e: 'Diese Runde werden keine Münzen produziert.' },
    { k: 'lawinen', n: 'Lawinen', e: 'Gebirge bringt diese Runde keine Erträge.' },
  ],
  [
    { k: 'hungersnot', n: 'Hungersnot', e: 'Diese Runde wird keine Nahrung produziert. Der Wechselkurs Münzen → Nahrung ist 4:1 (mit Gilden 2:1).' },
    { k: 'atomprotest', n: 'Atomwaffenproteste', e: 'Es können dauerhaft keine Atomwaffen mehr eingesetzt werden.' },
    { k: 'blockade', n: 'Handelsblockade', e: 'Inseln bringen diese Runde keine Erträge.' },
  ],
];
const EVENT_BY_KEY = {};
EVENT_ROWS.forEach((row, r) => row.forEach((e, c) => { e.row = r + 1; e.col = c + 1; EVENT_BY_KEY[e.k] = e; }));
// Gelände, das ein Ereignis lahmlegt
const EVENT_TERRAIN = { piraterie: 'M', duerre: 'G', hochwasser: 'F', waldbrand: 'W', lawinen: 'B', blockade: 'I' };
const EVENT_MODES = [
  { k: 'hard', n: 'Hart (jede Runde ein Ereignis)' },
  { k: 'easy', n: 'Leicht (etwa jede zweite Runde)' },
];

/* ---------------------------------------------------------------- Weltwunder
   Aus dem Wunderbogen. kind: 'sofort' = einmalige Wirkung beim Bau,
   'dauer' = wirkt, solange das Wunder dem Reich gehört.
   Kosten: 10/20/30/40 … für das 1./2./3./4. Wunder eines Reiches. */
const WONDERS = [
  // Stufe 1
  { k: 'mauer', n: 'Die Große Mauer', lvl: 1, kind: 'dauer', e: 'Deine Stadtverteidigung rechnet mit deiner Gesamtbevölkerung.' },
  { k: 'leuchtturm', n: 'Der Große Leuchtturm', lvl: 1, kind: 'dauer', e: 'Meeresfelder produzieren +1 aller Erträge.' },
  { k: 'pyramiden', n: 'Die Pyramiden', lvl: 1, kind: 'dauer', e: '1:1 Nahrung → Münzen.' },
  { k: 'orakel', n: 'Das Orakel', lvl: 1, kind: 'dauer', e: 'Du siehst das Ereignis der nächsten Runde vorab.' },
  { k: 'stonehenge', n: 'Stonehenge', lvl: 1, kind: 'dauer', e: 'Deine Weltwunder können nicht zerstört werden.' },
  { k: 'bibliothek', n: 'Die große Bibliothek', lvl: 1, kind: 'sofort', e: 'Erforsche sofort kostenlos eine Technologie des Mittelalters oder früher.' },
  { k: 'gaerten', n: 'Die hängenden Gärten', lvl: 1, kind: 'sofort', e: 'Alle deine Städte wachsen kostenlos um 1 Bevölkerung.' },
  { k: 'koloss', n: 'Der Koloss', lvl: 1, kind: 'sofort', e: 'Baue zwei kostenlose Armeen.' },
  { k: 'zeus', n: 'Die Zeusstatue', lvl: 1, kind: 'dauer', e: '+3 Macht (dauerhaft, geht beim Machtverlust nicht verloren).' },
  // Stufe 2
  { k: 'taj', n: 'Das Taj Mahal', lvl: 2, kind: 'sofort', e: 'Nächste Runde erhältst du doppelte Erträge.' },
  { k: 'palast', n: 'Der Apostolische Palast', lvl: 2, kind: 'dauer', e: 'Ereignisse betreffen dich nicht.' },
  { k: 'himeji', n: 'Die Burg Himeji', lvl: 2, kind: 'dauer', e: 'Reduziert die Kosten von Macht um 1.' },
  { k: 'oxford', n: 'Die Universität von Oxford', lvl: 2, kind: 'sofort', e: 'Forsche kostenlos zwei momentan verfügbare Technologien.' },
  { k: 'angkor', n: 'Angkor Wat', lvl: 2, kind: 'sofort', e: 'Die Stadt wächst sofort kostenlos um 9 Bevölkerung.' },
  { k: 'canal', n: 'Canal du Midi', lvl: 2, kind: 'sofort', e: 'Du erhältst sofort 40 Münzen.' },
  // Stufe 3
  { k: 'pentagon', n: 'Das Pentagon', lvl: 3, kind: 'sofort', e: 'Erhalte sofort 15 Macht.' },
  { k: 'kreml', n: 'Der Kreml', lvl: 3, kind: 'dauer', e: 'Die Forschungskosten für Singularität steigen für alle um 50.' },
  { k: 'freiheit', n: 'Die Freiheitsstatue', lvl: 3, kind: 'sofort', e: 'Alle deine Städte wachsen kostenlos um 3 Bevölkerung.' },
];
const WONDER_BY_KEY = {};
WONDERS.forEach(w => { WONDER_BY_KEY[w.k] = w; });
const WONDERS_IN = lvl => WONDERS.filter(w => w.lvl === lvl);
const WONDER_POOL_SIZE = 3;      // je Stufe 1 und 2 sind drei Wunder verfügbar
const WONDER_STEP = 10;          // Kosten je weiteres Wunder

/* ------------------------------------------------------- Zufallskarten
   Zufallskarten entstehen ausschließlich aus Dreiecksplättchen (js/tiles.js). Der frühere
   Rastergenerator (12 × 18 bzw. 12 × 8, gewürfeltes Gelände, feste Startpunkte) ist in v51
   ersatzlos entfallen; geblieben ist nur der Zufallsgenerator, mit dem sich eine Karte aus
   einem Startwert reproduzieren lässt. */
function mapRng(seed) {
  let s = (seed | 0) || Math.floor(Math.random() * 2 ** 31);
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/* Siegschwellen im Duell: 3/4 statt 2/3, mit Theologie 7/10, mit Vereinten Nationen 2/3 */
const DUEL_VICTORY_FRAC = 3 / 4;
const DUEL_THEOLOGY_FRAC = 7 / 10;
const DUEL_UN_FRAC = 2 / 3;
/* Beschriftungen der Siegschwellen – eine Quelle für Regelrechnung und Anzeige, damit
   der Technologiebogen im Duell nicht die Werte des normalen Spiels zeigt. */
const VICTORY_LABEL = { base: '2/3', theologie: '3/5', un: '1/2' };
const DUEL_VICTORY_LABEL = { base: '3/4', theologie: '7/10', un: '2/3' };
const victoryLabels = duel => duel ? DUEL_VICTORY_LABEL : VICTORY_LABEL;

/* ---------------------------------------------------------------- Spieltipps
   Kurze Ratschläge zum Spielen, wörtlich aus der Tippsammlung des Autors. Sie stehen
   am Spielende unter dem Ergebnis – dort schaut man ohnehin hin, und dort nützt ein
   Hinweis für die nächste Partie am meisten.

   Reine Anzeigetexte, keine Regeln: nichts im Code hängt an ihrem Wortlaut oder ihrer
   Reihenfolge, und die Nummer eines Tipps hat keine Bedeutung. Englisch steht in
   `DATA_EN.tips` an derselben Stelle der Liste – wie bei AGES und FIELDS.

   Erweitern: hier eine Zeile anhängen UND eine an derselben Stelle in `DATA_EN.tips`.
   `node test.js` prüft, dass beide Listen gleich lang und ohne Doppelte sind – eine
   vergessene Übersetzung würde sonst still den deutschen Satz ins englische Spiel
   tragen. Ob ein Tipp inhaltlich noch stimmt, prüft nichts: die Namen darin sind
   Prosa, nicht Schlüssel. Wer eine Technologie umbenennt, muss hier nachsehen.       */
const TIPS = [
  'Es ist nicht immer korrekt durch Griechenlands Basisfähigkeit kostenlose Technologien sofort zu erforschen. Durch Philosophie kann ein späteres Forschen auch wertvoll sein.',
  'Griechenlands Rückschau hat einen langsamen Start, aber wird zum Ende hin immer besser.',
  'Der Schlüssel zu Griechenlands Rückschau ist es, frühestmöglich eine Technologie des Mittelalters forschen zu können.',
  'Griechenlands Freie Forschung gibt es nur zweimal je Partie. Hebe sie für teure Technologien der Moderne auf, statt sie früh für billige auszugeben.',
  'Englands Handelsreich erlaubt hohe Flexibilität.',
  'Mit Englands Seemacht kann das Siedeln am Meer besser sein als Binnenstädte, muss es aber nicht.',
  'Englands Kolonisten haben nur einen Vorteil, solange es noch Platz zum Siedeln auf der Karte gibt. Plane dementsprechend.',
  'Die kostenlose Armee der Wikinger kann sowohl offensiv als auch defensiv den entscheidenden Vorteil bringen.',
  'Ein erfolgreicher Beutezug kann mit der entsprechenden Wikingerfähigkeit ausreichen, um einen Schneeballeffekt auszulösen.',
  'Mit Kriegerkultur brauchen die Wikinger vor allem viele Armeen. Bedenke, dass dauerhafte Macht durch Armeen auch für die Machtreduktion zählt.',
  'Mit Russlands Taiga bringt jedes Feld mindestens 1 Nahrung. Plätze zwischen Wald, Gebirge und Meer, die für andere kaum etwas taugen, ernähren Russland trotzdem – dort siedelt es ohne Konkurrenz.',
  'Die russischen Siedlertrecks erlauben es, in einer neu gegründeten Stadt sofort Sklaverei zu nutzen.',
  'Mit den russischen Siedlertrecks ist es umso wichtiger, die anfänglichen Siedlungen so zu planen, dass man in späteren Runden weiter expandieren kann.',
  'Russlands Fruchtbarkeit bringt im Allgemeinen früher größere Städte. Du solltest besonders früh nach Wachstums- und Stadttechnologien im Forschungs- und Produktionsfeld suchen.',
  'Sklaverei bringt früh viele Münzen, kostet aber langfristig Wachstum und Effizienz. Habe besser einen Plan, wie die frühen Münzen sich auszahlen.',
  'Keramik kann den Nachteil von Sklaverei gut ausgleichen.',
  'Frühe Gilden und Sklaverei sorgen für schnelles Wachstum.',
  'Du kannst in einem Zug erst die Sklaverei in allen Städten nutzen und dann die Computertechnik forschen.',
  'Wenn mehrere Gegner häufig die Sklaverei nutzen, kann ein Wirtschaftssieg oft leichter zu erreichen sein.',
  'Sei auf der Hut, wenn ein Nachbar Belagerungsmaschinen forschen kann.',
  'Ein gut ausgebautes Straßennetz kann ebenso viel Einkommen bringen wie eine andere Einkommenstechnologie.',
  'Früh Alchemie zu erforschen bringt hohe Flexibilität mit sich.',
  'Die Wissenschaftliche Methode zahlt sich idealerweise noch im selben Zug aus.',
  'Mit Computertechnik ist es viel einfacher, die nötige Forschung für die Singularität zu generieren.',
  'Gilden können einen frühen Siedlungsvorsprung generieren.',
  'Verbundwerkstoffe erlauben eine deutlich bessere Wachstumskurve.',
  'Mit Taktik wird sowohl Defensive als auch Offensive leichter.',
  'Technologien, die Macht günstiger machen, lohnen sich oft schon, wenn man zum ersten Mal Macht kauft.',
  'Wenn man früh oder regelmäßig verteidigen muss, kann eine Technologie mit weniger Machtreduktion als Wirtschaftstechnologie fungieren.',
  'Kombiniere Burgenbau und Schießpulver.',
  'Mit Schießpulver können Armeen an Schlüsselpunkten das ganze Reich sicher halten.',
  'Wenn du Dynamit erforschen kannst, könnte es ein guter Zeitpunkt sein, in die Offensive zu gehen.',
  'Raketentechnik erlaubt das Angreifen und Verteidigen mehrerer Städte gleichzeitig.',
  'Kombiniere Raketentechnik mit Schießpulver.',
  'Kombiniere Raketentechnik mit Taktik.',
  'Kombiniere Burgenbau mit Taktik.',
  'Burgenbau erlaubt es dir, mit einer Stadt und Armee zu flankieren.',
  'Atomwaffen können als defensive Gefängnisfreikarte verwendet werden.',
  'Bürokratie ist gut für die Wirtschaft.',
  'Kundschafterei ist im Allgemeinen nicht effizient, aber für Schlüsseltechnologien unbezahlbar.',
  'Kartografie kann entweder für frühen Siedlungsvorsprung oder eine späte, weit entfernte Siedlung nützlich sein.',
  'Spionage hilft extrem beim Gewinnen des Tiebreakers.',
  'Ohne Theologie oder Vereinte Nationen wird es sehr schwierig, einen Wirtschaftssieg zu gewinnen.',
];
