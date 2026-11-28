/* Zivilisationen – ERZEUGT aus data/civs.json, nicht von Hand ändern.
   Neues Reich oder Änderung: data/civs.json bearbeiten, dann `node tools_civs.js`.
   Die Reihenfolge hier ist die Anzeigereihenfolge; ORDER unten ist die Zugfolge.
   Die Regeln zu den Fähigkeiten stehen in js/engine.js, nicht hier. */
const CIVS = [
  {
    k: "griechenland", n: "Griechenland", sym: "star", color: "#2f6f8f",
    ability: "Techs 1/1/2/2/5 günstiger (je Zeitalter)",
    abilities: [
      { k: "basis", n: "Günstige Forschung", e: "Techs 1/1/2/2/5 günstiger (je Zeitalter)" },
      { k: "gratistech", n: "Freie Forschung", e: "2× pro Partie, höchstens 1× pro Runde: eine erforschbare Technologie beliebigen Zeitalters umsonst erforschen, auch die Singularität" },
      { k: "rueckschau", n: "Rückschau", e: "Bei jeder erforschten Technologie zusätzlich eine beliebige (auch nicht freigeschaltete) eines früheren Zeitalters umsonst" },
    ],
  },
  {
    k: "england", n: "England", sym: "cross", color: "#8f2f3f",
    ability: "Münzen = Nahrung für alle Belange (1:1 in beide Richtungen)",
    abilities: [
      { k: "basis", n: "Handelsreich", e: "Münzen = Nahrung für alle Belange (1:1 in beide Richtungen)" },
      { k: "gruenden", n: "Kolonisten", e: "Städte gründen kostet nur die Hälfte (aufgerundet). Bevölkerungswachstum kostet doppelt" },
      { k: "kuestenstaedte", n: "Seemacht", e: "Jede Stadt, die an Meer angrenzt, bringt +1 Wissenschaft, Nahrung und Münzen" },
    ],
  },
  {
    k: "russland", n: "Russland", sym: "square", color: "#3f6f3f",
    ability: "Jedes Feld bringt mindestens 1 Nahrung",
    abilities: [
      { k: "basis", n: "Taiga", e: "Jedes Feld bringt mindestens 1 Nahrung" },
      { k: "wachstum", n: "Fruchtbarkeit", e: "Bevölkerungswachstum kostet keine Nahrung; 1× zusätzliches Wachstum pro Stadt" },
      { k: "siedler", n: "Siedlertrecks", e: "Städte werden mit 2 Bevölkerung gegründet und wachsen zum Preis einer um 1 kleineren Stadt" },
    ],
  },
  {
    k: "wikinger", n: "Wikingerreich", sym: "triangle", color: "#6f4f8f",
    ability: "Kostenlose Armee am Start; eine Armee zählt nicht für Baukosten von Armeen",
    abilities: [
      { k: "basis", n: "Berserker", e: "Kostenlose Armee am Start; eine Armee zählt nicht für Baukosten von Armeen" },
      { k: "kampfertrag", n: "Beutezüge", e: "Steht eine Armee neben einer gegnerischen Armee oder Stadt, bringt sie je Punkt Überlegenheit 1 Wissenschaft, Nahrung und Münze" },
      { k: "armeemacht", n: "Kriegerkultur", e: "Jede eigene Armee gibt +1 Macht – mit Burgenbau auch jede eigene Stadt" },
    ],
  },
];
/* Experimentelle Zivilisationen (v111, Feld `exp`): im Aufbau nur mit dem Häkchen
   „Experimentelle Zivilisationen", nie im Marathon. `wo`: wirkt über Weltwunder, nur in
   Partien mit Weltwundern. Was eine Partie anbietet, sagt civKeysFor in js/engine.js. */
const EXP_CIVS = [
  {
    k: "rom", n: "Rom", sym: "circle", color: "#b55a1e", exp: true,
    ability: "Jede Armee hat +50 % Macht (abgerundet) je angrenzender eigener Armee",
    abilities: [
      { k: "basis", n: "Legion", e: "Jede Armee hat +50 % Macht (abgerundet) je angrenzender eigener Armee" },
      { k: "viaappia", n: "Via Appia", e: "Das Rad (Straßen) ist immer erforschbar; Handelsrouten bringen doppelt" },
    ],
  },
  {
    k: "venedig", n: "Venedig", sym: "diamond", color: "#17807a", exp: true,
    ability: "3× pro Runde ein herrenloses Feld beanspruchen wie mit Kolonialismus (mit ihm zusammen 6×). Gründet keine Städte. Bevölkerungswachstum kostet nichts",
    abilities: [
      { k: "basis", n: "Lagunenrepublik", e: "3× pro Runde ein herrenloses Feld beanspruchen wie mit Kolonialismus (mit ihm zusammen 6×). Gründet keine Städte. Bevölkerungswachstum kostet nichts" },
    ],
  },
  {
    k: "azteken", n: "Aztekenreich", sym: "spark", color: "#9c7a10", exp: true, wo: true,
    ability: "Je eigenem Weltwunder zählt eine Armee nicht für die Baukosten von Armeen",
    abilities: [
      { k: "basis", n: "Blumenkriege", e: "Je eigenem Weltwunder zählt eine Armee nicht für die Baukosten von Armeen" },
    ],
  },
  {
    k: "aegypten", n: "Ägypten", sym: "hexagon", color: "#b03a86", exp: true, wo: true,
    ability: "Weltwunder kosten 1 Münze weniger je erforschter Technologie",
    abilities: [
      { k: "basis", n: "Pharaonen", e: "Weltwunder kosten 1 Münze weniger je erforschter Technologie" },
    ],
  },
  {
    k: "deutschland", n: "Deutschland", sym: "plus", color: "#404040", exp: true,
    ability: "Ertragstechnologien addieren sich: Mathematik und Elektrizität bringen Wald zusammen 3 Wissenschaft",
    abilities: [
      { k: "basis", n: "Ingenieurskunst", e: "Ertragstechnologien addieren sich: Mathematik und Elektrizität bringen Wald zusammen 3 Wissenschaft" },
    ],
  },
  {
    k: "maya", n: "Maya", sym: "flower", color: "#5f8a1a", exp: true,
    ability: "Startet mit 10 Münzen zusätzlich (im ersten Zug)",
    abilities: [
      { k: "basis", n: "Kakaobohnen", e: "Startet mit 10 Münzen zusätzlich (im ersten Zug)" },
    ],
  },
  {
    k: "china", n: "China", sym: "lozenge", color: "#c43a3a", exp: true,
    ability: "Einmal je Partie: sofort das Einkommen einsammeln, zusätzlich zum Einkommen zu Zugbeginn",
    abilities: [
      { k: "basis", n: "Mandat des Himmels", e: "Einmal je Partie: sofort das Einkommen einsammeln, zusätzlich zum Einkommen zu Zugbeginn" },
    ],
  },
  {
    k: "usa", n: "USA", sym: "tridown", color: "#34408f", exp: true,
    ability: "+1 Münze nach jeder Forschung, Stadtgründung, jedem Wachstum, Armee- und Weltwunderbau",
    abilities: [
      { k: "basis", n: "Amerikanischer Traum", e: "+1 Münze nach jeder Forschung, Stadtgründung, jedem Wachstum, Armee- und Weltwunderbau" },
    ],
  },
];
const ALL_CIVS = CIVS.concat(EXP_CIVS);
const CIV_BY_KEY = {};
ALL_CIVS.forEach(c => { CIV_BY_KEY[c.k] = c; });
/* Die Schlüssel der Grundreiche in Anzeigereihenfolge. Der Aufbau braucht sie an mehreren
   Stellen (Vorauswahl, Auslosung, Tausch beim „Nochmal spielen"). Wer die Liste
   verändern will, nimmt eine Kopie: CIV_KEYS.slice(). */
const CIV_KEYS = CIVS.map(c => c.k);
const EXP_CIV_KEYS = EXP_CIVS.map(c => c.k);
/* Zugreihenfolge (Feld `order` in der JSON) – nicht die Reihenfolge oben,
   die ist die Anzeigereihenfolge im Aufbau und im Regelbogen. */
const ORDER = ["russland","griechenland","england","wikinger","rom","venedig","azteken","aegypten","deutschland","maya","china","usa"];
/* Barbaren: neutrale Fraktion, entsteht nur durch das Ereignis „Barbareninvasion". */
const BARB_CIV = { k: "barbaren", n: "Barbaren", sym: "skull", color: "#7a6a55", ability: '' };
