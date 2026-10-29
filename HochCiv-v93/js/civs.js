/* Zivilisationen – ERZEUGT aus data/civs.json, nicht von Hand ändern.
   Neues Reich oder Änderung: data/civs.json bearbeiten, dann `node tools_civs.js`.
   Die Reihenfolge hier ist die Anzeigereihenfolge; ORDER unten ist die Zugfolge.
   Die Regeln zu den Fähigkeiten stehen in js/engine.js, nicht hier. */
const CIVS = [
  {
    k: "griechenland", n: "Griechenland", sym: "star", color: "#2f6f8f",
    ability: "Techs 1/2/3/4/5 günstiger (je Zeitalter)",
    abilities: [
      { k: "basis", n: "Günstige Forschung", e: "Techs 1/2/3/4/5 günstiger (je Zeitalter)" },
      { k: "gratistech", n: "Freie Forschung", e: "1× pro Runde eine verfügbare Technologie der Industrialisierung oder früher umsonst erforschen" },
      { k: "rueckschau", n: "Rückschau", e: "Bei jeder erforschten Technologie zusätzlich eine beliebige (auch nicht freigeschaltete) eines früheren Zeitalters umsonst" },
    ],
  },
  {
    k: "england", n: "England", sym: "cross", color: "#8f2f3f",
    ability: "Münzen = Nahrung für alle Belange (1:1 in beide Richtungen)",
    abilities: [
      { k: "basis", n: "Handelsreich", e: "Münzen = Nahrung für alle Belange (1:1 in beide Richtungen)" },
      { k: "gruenden", n: "Kolonisten", e: "Städte gründen kostet keine Basiskosten (nur Distanzkosten; mit Kartografie die günstigere der beiden). Bevölkerungswachstum kostet doppelt" },
      { k: "kuestenstaedte", n: "Seemacht", e: "Jede Stadt, die an Meer angrenzt, bringt +1 Wissenschaft, Nahrung und Münzen" },
    ],
  },
  {
    k: "russland", n: "Russland", sym: "square", color: "#3f6f3f",
    ability: "+1 Nahrung in Wald",
    abilities: [
      { k: "basis", n: "Taiga", e: "+1 Nahrung in Wald" },
      { k: "wachstum", n: "Fruchtbarkeit", e: "Bevölkerungswachstum kostet keine Nahrung" },
      { k: "siedler", n: "Siedlertrecks", e: "Städte werden mit 2 Bevölkerung gegründet" },
    ],
  },
  {
    k: "wikinger", n: "Wikingerreich", sym: "triangle", color: "#6f4f8f",
    ability: "Kostenlose Armee am Start; eine Armee zählt nicht für Baukosten von Armeen",
    abilities: [
      { k: "basis", n: "Seefahrer", e: "Kostenlose Armee am Start; eine Armee zählt nicht für Baukosten von Armeen" },
      { k: "kampfertrag", n: "Beutezüge", e: "Steht eine Armee neben einer gegnerischen Armee oder Stadt, bringt sie je Punkt Überlegenheit 1 Wissenschaft, Nahrung und Münze" },
      { k: "armeemacht", n: "Kriegerkultur", e: "Jede eigene Armee gibt +2 Macht – mit Burgenbau auch jede eigene Stadt" },
    ],
  },
];
const CIV_BY_KEY = {};
CIVS.forEach(c => { CIV_BY_KEY[c.k] = c; });
/* Alle Schlüssel in Anzeigereihenfolge. Der Aufbau braucht sie an mehreren
   Stellen (Vorauswahl, Auslosung, Tausch beim „Nochmal spielen"). Wer die Liste
   verändern will, nimmt eine Kopie: CIV_KEYS.slice(). */
const CIV_KEYS = CIVS.map(c => c.k);
/* Zugreihenfolge (Feld `order` in der JSON) – nicht die Reihenfolge oben,
   die ist die Anzeigereihenfolge im Aufbau und im Regelbogen. */
const ORDER = ["russland","griechenland","england","wikinger"];
/* Barbaren: neutrale Fraktion, entsteht nur durch das Ereignis „Barbareninvasion". */
const BARB_CIV = { k: "barbaren", n: "Barbaren", sym: "skull", color: "#7a6a55", ability: '' };
