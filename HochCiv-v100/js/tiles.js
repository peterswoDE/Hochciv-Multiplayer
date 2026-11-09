/* Hochzeivilization – Plättchenkarten.

   Eine Zufallskarte wird nicht mehr Feld für Feld ausgewürfelt, sondern aus Dreiecken
   zu je 15 Feldern zusammengelegt. Der Vorrat (TILE_POOL) ist von Hand entworfen,
   20 Stück; gezogen wird ohne Zurücklegen.

   Geometrie: gerechnet wird in Würfelkoordinaten (x + y + z = 0), z ist die Zeile.
   Ein Dreieck ist entweder
     Typ A:  Feld = a + (i, j, k)     mit i+j+k = 4,  Summe(a) = −4   → Spitze unten (▽)
     Typ B:  Feld = a − (i, j, k)     mit i+j+k = 4,  Summe(a) = +4   → Spitze oben (△)
   Beide werden über dasselbe Tripel (i, j, k) angesprochen. Eine Drehung um 120° um die
   Plättchenmitte ist genau (i, j, k) → (j, k, i) – deshalb passt jedes Plättchen in
   genau drei Lagen in denselben Platz, ohne je gespiegelt zu werden.

   Die Gelände eines Plättchens werden als fünf Zeilen von 5/4/3/2/1 Feldern notiert;
   so sieht es in einem A-Platz in Lage 0 auch auf der Karte aus (in einem B-Platz um
   180° gedreht, also weiterhin dasselbe Plättchen, nur andersherum gelegt).

   Seit v99 gibt es den experimentellen Plättchenmodus mit SECHSECKIGEN Plättchen (Seitenlänge 3, 19 Felder; Abschnitt „Sechseck-Plättchen“ weiter unten).    */

const TILE_CELLS = 15;
const TILE_SIDE = 5;

/* Feldreihenfolge eines Plättchens: Zeile k (0 = die lange Kante), Position p von links.
   (i, j, k) = (p, 4−k−p, k). */
const TRI_IJK = [];
for (let k = 0; k <= 4; k++) for (let p = 0; p <= 4 - k; p++) TRI_IJK.push([p, 4 - k - p, k]);
const TRI_INDEX = {};
TRI_IJK.forEach((t, n) => { TRI_INDEX[t.join(',')] = n; });

/* Drehung um 120°: (i, j, k) → (j, k, i). TRI_ROT[o][n] sagt, welches Feld des
   Plättchentextes auf Feld n liegt, wenn das Plättchen o-mal gedreht wird. */
function triRotOnce(n) { const [i, j, k] = TRI_IJK[n]; return TRI_INDEX[[j, k, i].join(',')]; }
const TRI_ROT = [TRI_IJK.map((_, n) => n)];
TRI_ROT.push(TRI_ROT[0].map(triRotOnce));
TRI_ROT.push(TRI_ROT[1].map(triRotOnce));
// die drei mittigen Felder (alle Koordinaten ≥ 1) – dort setzen Bots ihre Hauptstadt
const TRI_MIDDLE = [[2, 1, 1], [1, 2, 1], [1, 1, 2]].map(t => TRI_INDEX[t.join(',')]);

/* ---------------------------------------------------------------- Plättchenvorrat
   Jede Zeile ist eine Feldzeile des Dreiecks (5/4/3/2/1). Bedingungen, die
   `node test.js` prüft:
   • die drei mittigen Felder sind Land (dort setzen Bots ihre Hauptstadt),
   • jedes mittige Feld bringt im ersten Zug mindestens 4 Nahrung (Münzen 2:1) –
     seine sechs Nachbarn liegen alle auf demselben Plättchen, das lässt sich also
     hier schon entscheiden.
   G Grasland · W Wald · B Gebirge · F Fluss · M Meer · I Insel                     */
const TILE_POOL = [
  // Binnenland – ohne Küste, damit auch trockene Ecken entstehen
  { n: 'Weite Ebene', a: ['GWGGB', 'GGGF', 'GGW', 'WG', 'G'] },
  { n: 'Kornkammer', a: ['MGWGB', 'GFGG', 'GGF', 'WG', 'G'] },
  // Land mit einzelnen Meerfeldern an Ecken und Kanten. Ecken sind dafür der beste
  // Platz: dort stoßen bis zu drei Plättchen zusammen, und sie liegen als einzige
  // Felder neben keinem der drei mittigen – die Startgüte bleibt also unberührt.
  { n: 'Flusstal', a: ['MFGGB', 'FGGF', 'GFG', 'BW', 'M'] },
  { n: 'Hochland', a: ['BGBWM', 'GGGB', 'BGG', 'FB', 'M'] },
  { n: 'Steppe', a: ['MGWGM', 'GGGG', 'GWG', 'GB', 'G'] },
  { n: 'Taiga', a: ['WBWGM', 'MGGB', 'GGW', 'WG', 'B'] },
  { n: 'Karst', a: ['MGFGW', 'GGGB', 'GBG', 'FG', 'M'] },
  { n: 'Gebirgskette', a: ['MBGBM', 'BGFB', 'GFB', 'BG', 'B'] },
  { n: 'Waldland', a: ['MGWGM', 'WGGW', 'GGW', 'WB', 'G'] },
  { n: 'Urwald', a: ['MFWGM', 'FGGW', 'GFW', 'WG', 'G'] },
  { n: 'Bergsee', a: ['BFBMM', 'FGFB', 'GFG', 'BW', 'M'] },
  { n: 'Zwei Ströme', a: ['FGMMF', 'GFGF', 'GGG', 'FW', 'M'] },
  // Küsten: Meer paarweise und in Zügen entlang der Kanten – trifft eine solche Kante
  // auf eine andere, wächst daraus ein zusammenhängendes Meer.
  { n: 'Marschland', a: ['MFGFM', 'FGGF', 'MFG', 'FW', 'M'] },
  { n: 'Küste', a: ['MMGWB', 'MGGG', 'MGW', 'MG', 'F'] },
  { n: 'Bucht', a: ['GMMGM', 'GGGM', 'GFG', 'WB', 'M'] },
  { n: 'Fjorde', a: ['MWMGM', 'MGGW', 'MFF', 'GG', 'M'] },
  { n: 'Halbinsel', a: ['MGGGM', 'MGGM', 'MFG', 'GB', 'M'] },
  // Inselwelt: viel Meer, dafür Inseln (1/1/1) als Land
  { n: 'Atoll', a: ['MMIMM', 'MIIM', 'MIG', 'IM', 'G'] },
  { n: 'Inselgruppe', a: ['MIMIM', 'MIIM', 'MIG', 'MW', 'G'] },
  { n: 'Ferne Riffe', a: ['MMIMG', 'MIIM', 'MGB', 'MI', 'G'] },
];
// Plättchentext → 15 Gelände in TRI_IJK-Reihenfolge
function tileTerrain(tile) { return tile.a.join('').split(''); }

/* ---------------------------------------------------------------- Sechseck-Plättchen (v99)
   Experimenteller Plättchenmodus (Anweisung des Autors): sechseckige Plättchen mit der Seitenlänge 3 – 19 Felder: die Mitte, sechs im ersten und zwölf im
   zweiten Ring. Ein solches Plättchen ist oben und unten gerade und läuft links und rechts
   spitz zu; notiert wird es in fünf Zeilen von 3/4/5/4/3 Feldern, so wie es in Lage 0 auf der
   Karte liegt:
        A0 A1 A2
      B0 B1 B2 B3          innen (Mitte und erster Ring): B1 B2 · C1 C2 C3 · D1 D2
     C0 C1 C2 C3 C4        außen (zweiter Ring): die übrigen zwölf
      D0 D1 D2 D3
        E0 E1 E2
   Gerechnet wird in Würfelkoordinaten relativ zur Mitte, (dx, dy, dz), dz ist die Zeile.  */
const HEX_TILE_CELLS = 19;
const HEX_DXYZ = [];
for (let dz = -2; dz <= 2; dz++)
  for (let dx = Math.max(-2, -2 - dz); dx <= Math.min(2, 2 - dz); dx++) HEX_DXYZ.push([dx, -dx - dz, dz]);
const HEX_INDEX = {};
HEX_DXYZ.forEach((d, n) => { HEX_INDEX[d.join(',')] = n; });
const hexRing = n => Math.max(...HEX_DXYZ[n].map(Math.abs));
/* Drehung um 60° um die Mitte: (x, y, z) → (−z, −x, −y). Sechs Lagen; HEX_ROT[o][n] sagt wie
   TRI_ROT, welches Feld des Plättchentextes auf Feld n liegt, wenn das Plättchen o-mal gedreht
   wird. Gespiegelt wird auch hier nie. */
function hexRotOnce(n) { const [x, y, z] = HEX_DXYZ[n]; return HEX_INDEX[[-z, -x, -y].join(',')]; }
const HEX_ROT = [HEX_DXYZ.map((_, n) => n)];
for (let o = 1; o < 6; o++) HEX_ROT.push(HEX_ROT[o - 1].map(hexRotOnce));
// Mitte und erster Ring: ihre sechs Nachbarn liegen alle auf demselben Plättchen – dort setzen
// Bots ihre Hauptstadt (wie TRI_MIDDLE bei den Dreiecken)
const HEX_MIDDLE = HEX_DXYZ.map((_, n) => n).filter(n => hexRing(n) <= 1);

/* Vorrat: 20 Plättchen, von Hand entworfen; je Partie werden zehn gezogen. Entwurfsregeln, die
   `node test.js` prüft (dazu die des Dreiecksvorrats, soweit sie passen):
   • innen (Mitte und erster Ring) nur Grasland, Wald, Gebirge oder Fluss – Meer und Inseln
     liegen im äußeren Ring, nur dort verbinden sie sich mit dem Nachbarplättchen;
   • höchstens zwei Inseln je Plättchen, und kein inneres Feld grenzt an zwei – Inseln bringen
     1/1/1 und machten sonst einzelne Startplätze übermächtig (Anweisung des Autors: keine zu
     starken Startplätze). Die sieben Inseln des Vorrats liegen fast alle an Ecken: dort
     grenzen sie an nur ein inneres Feld;
   • jedes innere Feld bringt als Hauptstadt im ersten Zug mindestens 4 Nahrung (Münzen 2:1);
   • Flussfelder hängen meist zusammen und laufen zum Meer – so zeichnet die Karte seit v99
     Flüsse als Wasserlauf (riverLines in js/ui.js);
   • die BESTE innere Hauptstadt jedes Plättchens liegt eng beieinander: Wert 1·🔬 + 1,1·🌾 +
     0,8·🪙 (so wägt die KI beim Legen ab) zwischen 8,8 und 9,7. Im Dreiecksvorrat reicht das
     von 6,7 (Küste) bis 12,8 (Ferne Riffe) – dort machen Inseln den Unterschied.
   Gelände wie dort: G Grasland · W Wald · B Gebirge · F Fluss · M Meer · I Insel.             */
const HEX_POOL = [
  // Binnenland
  { n: 'Weite Ebene', a: ['GWG', 'GGFG', 'BGFGW', 'GFGG', 'WGB'] },
  { n: 'Kornkammer', a: ['FGG', 'GFGW', 'GFGGG', 'WFGG', 'GGB'] },
  { n: 'Hochebene', a: ['GGB', 'WGBG', 'GBGGF', 'BGWF', 'GGF'] },
  // Land mit Meer an einzelnen Ecken und Kanten
  { n: 'Flusstal', a: ['GFG', 'GGFG', 'BGFGW', 'GFGG', 'MGB'] },
  { n: 'Hügelland', a: ['BMM', 'GBGG', 'WGGFB', 'GGFG', 'MGB'] },
  { n: 'Steppe', a: ['MMG', 'GGBG', 'GGGFM', 'BGFG', 'GWG'] },
  { n: 'Taiga', a: ['WMW', 'MWGG', 'WGFGB', 'GFWW', 'BFM'] },
  { n: 'Karst', a: ['GGM', 'GFGB', 'MGBGG', 'GGFW', 'BGM'] },
  { n: 'Gebirgskette', a: ['BMB', 'GBGG', 'BGFGB', 'GGBG', 'BMG'] },
  { n: 'Waldland', a: ['MWG', 'WGFG', 'GWGGM', 'GFFG', 'WGM'] },
  { n: 'Bergsee', a: ['MMB', 'MFFG', 'BGGFG', 'GWGG', 'BGW'] },
  // Küsten: Meer in Zügen entlang einer Seite, Flüsse münden dort
  { n: 'Küste', a: ['MGG', 'MGGW', 'IFGGB', 'MFGG', 'MWG'] },
  { n: 'Bucht', a: ['MMM', 'GGFM', 'WGFGB', 'GFGW', 'BGG'] },
  { n: 'Fjorde', a: ['MWI', 'MGFG', 'WGFGM', 'MFGG', 'BWM'] },
  { n: 'Halbinsel', a: ['MMG', 'MGFG', 'MGFGW', 'MGGG', 'GMI'] },
  { n: 'Marschland', a: ['MGG', 'FGFG', 'MFGGW', 'GGFG', 'MFM'] },
  { n: 'Delta', a: ['GGG', 'BGFG', 'GGFGM', 'GGFM', 'WMM'] },
  // Inseln: mehr Meer, je ein oder zwei Inseln, nie zwei an einem Startplatz
  { n: 'Inselkette', a: ['MIM', 'MGGW', 'MFGGG', 'IGWG', 'MGB'] },
  { n: 'Riff', a: ['GGM', 'WGGM', 'GFGBI', 'GGFM', 'BGM'] },
  { n: 'Lagune', a: ['MMI', 'GGFM', 'WGGGM', 'GBGG', 'MGW'] },
];

/* ---------------------------------------------------------------- Plätze und Formen
   Jede Form nennt ihre Plätze (Reihenfolge = Zeichenreihenfolge), die Löcher – Felder
   der Karte, die zu keinem Plättchen gehören – und die Sitzplätze der Spieler.

   2 Spieler: sechs Dreiecke bilden ein Sechseck (Hexagon mit Radius 5). Genau in der
     Mitte bleibt ein Feld übrig – es wird nicht gefüllt, dort ist kein Feld. 6 · 15 ist
     immer um eins kleiner als das nächste Sechseck; das Loch ist also zwingend, und es
     bleibt als Loch stehen: ein unpassierbarer Punkt mitten in der Welt.
     Die beiden Spieler bekommen zwei gegenüberliegende Plättchen, die vier übrigen
     liegen offen.
   3 Spieler: dasselbe Sechseck (samt Loch), dazu je ein Dreieck an drei Kanten –
     zusammen ein großes Dreieck aus neun Plättchen.
   4 Spieler: zwei Reihen zu fünf Dreiecken, zusammen ein gestrecktes Sechseck ohne
     jedes Loch. Die Spieler sitzen auf den vier Dreiecken, die mit ihrer breiten Seite
     an der Ober- bzw. Unterkante liegen (je zwei oben und unten) – das sind die vier
     Ecken der gestreckten Form. Die übrigen sechs liegen offen.                                     */
const SL = (t, x, y, z) => ({ t, a: [x, y, z] });
/* Sechseck-Platz (v99): Mitte in axialen Koordinaten (q = x, r = z) – Würfel (q, −q−r, r). */
const SLH = (q, r) => ({ t: 'H', a: [q, -q - r, r] });
const TILE_SHAPES = {
  2: {
    key: 'hex6', name: 'Plättchenkarte (6 Dreiecke)',
    slots: [
      SL('A', -5, -1, 2), SL('B', -1, 4, 1), SL('B', 0, -2, 6),
      SL('A', 0, 0, -4), SL('A', 1, -6, 1), SL('B', 5, -1, 0),
    ],
    holes: [[0, -1, 1]],          // bleibt leer, siehe oben
    // die drei gegenüberliegenden Paare; gelost wird, welches die Spieler bekommen
    seatSets: [[0, 5], [4, 1], [2, 3]],
  },
  3: {
    key: 'tri9', name: 'Plättchenkarte (9 Dreiecke)',
    slots: [
      SL('A', -5, -1, 2), SL('B', -1, 4, 1), SL('B', 0, -2, 6),
      SL('A', 0, 0, -4), SL('A', 1, -6, 1), SL('B', 5, -1, 0),
      SL('A', 6, -6, -4), SL('A', -5, 5, -4), SL('A', -5, -6, 7),
    ],
    holes: [[0, -1, 1]],          // bleibt leer
    seatSets: [[6, 7, 8]],
  },
  4: {
    key: 'strip10', name: 'Plättchenkarte (10 Dreiecke)',
    slots: [
      SL('B', 5, -1, 0), SL('A', 6, -6, -4), SL('B', 11, -7, 0), SL('A', 12, -12, -4), SL('B', 17, -13, 0),
      SL('A', 0, -5, 1), SL('B', 5, -6, 5), SL('A', 6, -11, 1), SL('B', 11, -12, 5), SL('A', 12, -17, 1),
    ],
    holes: [],                    // der Streifenverbund deckt lückenlos ab
    // die beiden oberen und die beiden unteren Dreiecke: 1 und 3 liegen mit ihrer
    // Fünferzeile an der Oberkante, 6 und 8 an der Unterkante
    seatSets: [[1, 3, 6, 8]],
  },
  /* Experimenteller Plättchenmodus (v99, Anweisung des Autors): zehn Sechsecke in Reihen zu
     3, 4 und 3. Sechsecke aus 19 Feldern schließen nur auf einem schrägen Gitter lückenlos
     aneinander: die Nachbarmitten liegen um (5, −2), (2, 3) und (−3, 5) versetzt (axial), also
     steigt jede Reihe um gut 23° nach rechts an (vom Autor so gewählt – die Alternative waren
     waagrechte Reihen mit Meer in den Lücken). Reihe 1 entlang (5, −2), Reihe 2 um (−3, 5)
     darunter und einen halben Schritt nach links, Reihe 3 wieder eingerückt.
     Gesessen wird an den Enden der beiden Dreierreihen (Wahl des Autors): 0 und 2 oben, 7 und 9
     unten. Zwischen zwei Startplättchen liegt immer mindestens ein offenes Plättchen. Die
     oberste Feldzeile ist gerade (−6), sonst kehrte sich der Versatz der Zeilen um. */
  hex4: {
    key: 'hex10', name: 'Plättchenkarte (10 Sechsecke)', hex: true,
    slots: [
      SLH(0, 0), SLH(5, -2), SLH(10, -4),
      SLH(-3, 5), SLH(2, 3), SLH(7, 1), SLH(12, -1),
      SLH(-1, 8), SLH(4, 6), SLH(9, 4),
    ],
    holes: [],
    seatSets: [[0, 2, 7, 9]],
  },
};
/* 5–8 Spieler (Mehrspieler-Erweiterung): der Streifen der Vierer-Form, nur länger – zwei Reihen zu 7 (5 und 6
   Spieler, 14 Dreiecke) bzw. 9 Dreiecken (7 und 8 Spieler, 18 Dreiecke). Jede Reihe setzt
   das Muster der Vierer-Form um je zwei Dreiecke fort, dieselben Koordinaten in Schritten
   von (6, −6, 0). Gesessen wird wie zu viert auf den Dreiecken, die mit ihrer breiten Seite
   an der Ober- bzw. Unterkante liegen – zwischen zwei Sitzen liegt immer ein offenes
   Dreieck. Jeder Sitz hat damit dieselbe Nachbarschaft wie in der Vierer-Form, und die
   Abstandsregeln (seatFreeCells) gelten unverändert. Bei ungerader Zahl bleibt auf einer
   Kante ein Sitz frei; gelost wird, ob oben oder unten, und es bleibt die Mitte offen
   (die äußeren Sitze werden genommen), damit niemand eingeklemmt sitzt. Der Vorrat hat 20
   Plättchen, auch 18 werden also ohne Zurücklegen gezogen. */
function stripShape(n) {
  const L = n <= 6 ? 7 : 9;                       // Dreiecke je Reihe
  const slots = [];
  for (let t = 0; t < L; t++) {
    const m = Math.floor(t / 2);
    slots.push(t % 2 === 0 ? SL('B', 5 + 6 * m, -1 - 6 * m, 0) : SL('A', 6 + 6 * m, -6 - 6 * m, -4));
  }
  for (let t = 0; t < L; t++) {
    const m = Math.floor(t / 2);
    slots.push(t % 2 === 0 ? SL('A', 6 * m, -5 - 6 * m, 1) : SL('B', 5 + 6 * m, -6 - 6 * m, 5));
  }
  const top = [], bottom = [];
  for (let t = 1; t < L; t += 2) { top.push(t); bottom.push(L + t); }
  // ungerade: auf einer Kante fällt ein innerer Sitz weg (die äußeren bleiben)
  const drop = list => list.filter((_, i) => i !== Math.floor(list.length / 2));
  const seatSets = top.length + bottom.length === n ? [top.concat(bottom)]
    : [top.concat(drop(bottom)), drop(top).concat(bottom)];
  return { key: 'strip' + 2 * L, name: `Plättchenkarte (${2 * L} Dreiecke)`, slots, holes: [], seatSets };
}
for (let n = 5; n <= 8; n++) TILE_SHAPES[n] = stripShape(n);
/* Sechsecke für jede Zahl von Reichen (Mehrspieler-Erweiterung, zu vier Reichen siehe hex4): dasselbe
   schräge Gitter, geschrieben als i·(5, −2) + j·(2, 3) – die Lage (i, j) grenzt an (i ± 1, j),
   (i, j ± 1), (i + 1, j − 1) und (i − 1, j + 1). Wie dort liegt zwischen zwei Startplättchen immer
   ein offenes, und jedes Reich hat 44 bis 54 Felder (zu viert 47,5):
     zwei Reiche    5 Sechsecke   die beiden Enden einer Dreierreihe, je eines darüber und darunter
     drei Reiche    7 Sechsecke   eine Blüte, gesessen wird auf jedem zweiten Blatt
     fünf, sechs   14 Sechsecke   Reihen zu 5, 4 und 5, gesessen an der Ober- und Unterkante
     sieben, acht  20 Sechsecke   Reihen zu 7, 6 und 7 – so viele hat der Vorrat
   Bei ungerader Zahl bleibt wie im Dreiecksstreifen auf einer Kante die Mitte frei. Gelegt wird
   so, dass die oberste Feldzeile gerade ist (siehe hex4). */
function hexForm(n, lage, seatSets) {
  const mitten = lage.map(([i, j]) => [5 * i + 2 * j, -2 * i + 3 * j]);
  const dz = (Math.min(...mitten.map(m => m[1])) - 2) & 1;
  const platz = ([i, j]) => lage.findIndex(l => l[0] === i && l[1] === j);
  TILE_SHAPES['hex' + n] = {
    key: 'hex' + lage.length, name: `Plättchenkarte (${lage.length} Sechsecke)`, hex: true,
    slots: mitten.map(([q, r]) => SLH(q, r + dz)), holes: [],
    seatSets: seatSets.map(s => s.map(platz)),
  };
}
const hexReihe = (j, von, bis) => Array.from({ length: bis - von + 1 }, (_, k) => [von + k, j]);
hexForm(2, [[0, -1], ...hexReihe(0, -1, 1), [0, 1]], [[[-1, 0], [1, 0]]]);
hexForm(3, [[0, -1], [1, -1], ...hexReihe(0, -1, 1), [-1, 1], [0, 1]],
  [[[1, 0], [-1, 1], [0, -1]], [[0, 1], [-1, 0], [1, -1]]]);
function hexStreifen(n) {
  const L = n <= 6 ? 5 : 7;                       // Sechsecke in der oberen und unteren Reihe
  const oben = hexReihe(0, 0, L - 1).filter(l => l[0] % 2 === 0);
  const unten = hexReihe(2, -1, L - 2).filter(l => l[0] % 2 !== 0);
  const drop = list => list.filter((_, i) => i !== Math.floor(list.length / 2));
  hexForm(n, [...hexReihe(0, 0, L - 1), ...hexReihe(1, 0, L - 2), ...hexReihe(2, -1, L - 2)],
    oben.length + unten.length === n ? [oben.concat(unten)] : [oben.concat(drop(unten)), drop(oben).concat(unten)]);
}
for (let n = 5; n <= 8; n++) hexStreifen(n);
/* Mindestabstand einer Hauptstadt zu jedem Feld der fremden Startplättchen – eine der
   beiden Bedingungen in seatFreeCells. Bis v72 war es 3 und die einzige Bedingung. */
const PLACE_MIN_GAP = 2;

function slotCells(sl) {
  if (sl.t === 'H') return HEX_DXYZ.map(([x, y, z]) => [sl.a[0] + x, sl.a[1] + y, sl.a[2] + z]);
  return TRI_IJK.map(([i, j, k]) => sl.t === 'A'
    ? [sl.a[0] + i, sl.a[1] + j, sl.a[2] + k]
    : [sl.a[0] - i, sl.a[1] - j, sl.a[2] - k]);
}
const cubeDist = (a, b) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const CUBE_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
const cubeNeighbors = c => CUBE_DIRS.map(d => [c[0] + d[0], c[1] + d[1], c[2] + d[2]]);
// Würfel → Zeile/Spalte (odd-r). Die Formen sind so gelegt, dass die Verschiebung
// der Zeilen gerade ist; sonst würde sich der Versatz der Zeilen umkehren.
const cubeToRC = c => [c[2], c[0] + (c[2] - (c[2] & 1)) / 2];

/* Auf welche Felder des eigenen Plättchens darf die Hauptstadt? Rein geometrisch –
   das Gelände kommt in placeOptions dazu.
   Gelegt wird verdeckt, die Regel muss also für JEDE Wahl der anderen halten; ein
   Verstoß wäre hinterher nicht mehr zu heilen. Zwei Bedingungen (v73):
   1. mindestens PLACE_MIN_GAP = 2 Felder Abstand zu jedem Feld eines fremden
      Startplättchens. Dann liegt das Umland (die sechs Nachbarn) nie auf einem
      Plättchen, das beim Legen noch verdeckt ist;
   2. kein echtes Feld kann zugleich Umland dieser und einer möglichen fremden
      Hauptstadt sein – „möglich" heißt: erfüllt dort Bedingung 1. Umland an Umland ist
      erlaubt, geteiltes Umland nicht. Löcher und alles außerhalb der Form sind kein Feld
      und zählen nicht: im 1 gegen 1 dürfen sich zwei Hauptstädte an der Mitte bis auf 2
      nahe kommen, ihr einziges gemeinsames Nachbarfeld ist das Loch.
   Bis v72 galten stattdessen 3 Felder Abstand zu jedem fremden Startplättchen. Jetzt
   darf man eine Reihe näher an den Gegner (test.js rechnet es nach): 2 Reiche 15 statt
   14 Felder (die Ecke am Loch), 3 Reiche unverändert alle 15, 4 Reiche 13 statt 11 –
   die Reihe vor der Spitze wird frei. Gesperrt bleiben dort die Spitze und die Ecke
   neben dem offenen Mittelplättchen: zwei Hauptstädte in den beiden Ecken links und
   rechts davon teilten sich dessen Spitzenfeld.                                        */
function seatFreeCells(shape, seats, seatIdx) {
  const K = c => c.join(',');
  const cellsOf = i => slotCells(shape.slots[seats[i]]);
  const cand = seats.map((_, i) => {
    const others = seats.flatMap((s, j) => j === i ? [] : slotCells(shape.slots[s]));
    return cellsOf(i).map(m => others.every(o => cubeDist(m, o) >= PLACE_MIN_GAP));
  });
  const real = new Set(shape.slots.flatMap(slotCells).map(K));
  const umland = c => cubeNeighbors(c).filter(n => real.has(K(n))).map(K);
  const teilen = (a, b) => {
    if (cubeDist(a, b) <= 1) return true;           // eine stünde im Umland der anderen
    const ub = new Set(umland(b));
    return umland(a).some(k => ub.has(k));
  };
  return cellsOf(seatIdx).map((m, n) => cand[seatIdx][n] &&
    seats.every((_, j) => j === seatIdx ||
      cellsOf(j).every((b, bn) => !cand[j][bn] || !teilen(m, b))));
}

/* ---------------------------------------------------------------- Kartenplan
   Zieht die Plättchen und verteilt die Sitzplätze. Die Spieler legen danach ihr
   eigenes Plättchen (Lage + Hauptstadt); die offenen liegen sofort fest.            */
function tilePlan(civs, seed, opts) {
  const n = civs.length;
  // experimenteller Plättchenmodus (v99): Sechsecke statt Dreiecke
  const hex = !!(opts && opts.hex) && !!TILE_SHAPES['hex' + n];
  const shape = TILE_SHAPES[hex ? 'hex' + n : n];
  if (!shape) return null;
  const rnd = mapRng(seed);
  const pool = (hex ? HEX_POOL : TILE_POOL).map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {          // mischen
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const seats = shape.seatSets[Math.floor(rnd() * shape.seatSets.length)].slice();
  const plan = {
    n, hex, shapeKey: shape.key, name: shape.name,
    tiles: shape.slots.map((_, i) => pool[i]),
    ori: shape.slots.map(() => Math.floor(rnd() * (hex ? 6 : 3))),
    // idx = Platz im Aufbau. Auf Plättchenkarten darf dieselbe Zivilisation mehrfach
    // vorkommen, deshalb wird alles über idx geführt und nicht über civ.
    seats: seats.map((slot, i) => ({
      slot, idx: i, civ: civs[i], o: null, cell: null,
      free: seatFreeCells(shape, seats, i),
    })),
    revealed: false,
  };
  return plan;
}
const planShape = plan => TILE_SHAPES[plan.hex ? 'hex' + plan.n : plan.n];
// Lagen je Plättchen (Dreieck 3, Sechseck 6) und die Felder, auf die Bots ihre Hauptstadt setzen
const planRotations = plan => plan.hex ? 6 : 3;
const planMiddle = plan => plan.hex ? HEX_MIDDLE : TRI_MIDDLE;
const isSeatSlot = (plan, slot) => plan.seats.some(s => s.slot === slot);

/* Gelände eines Plättchens in einer Lage: Feld n zeigt den Text an Position TRI_ROT[o][n] */
function tileFaceTerrain(tileIdx, o) {
  const art = tileTerrain(TILE_POOL[tileIdx]);
  return TRI_ROT[o].map(k => art[k]);
}
// dasselbe für ein Sechseck (v99): HEX_ROT, Text aus HEX_POOL
function hexFaceTerrain(tileIdx, o) {
  const art = tileTerrain(HEX_POOL[tileIdx]);
  return HEX_ROT[o].map(k => art[k]);
}
// Gelände des Plättchens auf Platz `slot` in Lage o – Dreieck oder Sechseck je nach Plan
const planFace = (plan, slot, o) => (plan.hex ? hexFaceTerrain : tileFaceTerrain)(plan.tiles[slot], o);
/* Felder, auf die die Hauptstadt dieses Sitzes gesetzt werden darf: Land, kein Meer,
   und weit genug von den anderen Startplättchen weg. */
function placeOptions(plan, seat, o) {
  const face = planFace(plan, seat.slot, o);
  return face.map((t, i) => seat.free[i] && TERRAIN[t].land && !TERRAIN[t].block);
}
function placeSeat(plan, seat, o, cell) {
  if (!(o >= 0 && o < planRotations(plan))) return 'Ungültige Lage.';
  if (!placeOptions(plan, seat, o)[cell]) return 'Hier ist kein Platz für die Hauptstadt.';
  seat.o = o; seat.cell = cell;
  return null;
}
/* Bots: zufällige Lage, Hauptstadt auf einem der mittigen Felder (Dreieck: drei, Sechseck:
   Mitte und erster Ring). */
function botPlaceSeat(plan, seat, rnd) {
  const o = Math.floor(rnd() * planRotations(plan));
  const ok = placeOptions(plan, seat, o);
  const mid = planMiddle(plan).filter(i => ok[i]);
  const list = mid.length ? mid : ok.map((v, i) => v ? i : -1).filter(i => i >= 0);
  return placeSeat(plan, seat, o, list[Math.floor(rnd() * list.length)]);
}

/* ---------------------------------------------------------------- Erträge beim Legen
   Was eine Hauptstadt auf Feld `cell` in Lage `o` im ersten Zug einbringt – die Zahl
   der Ertragsübersicht in der Legephase. Gerechnet wird von der Regelmaschine auf einer
   Wegwerf-Partie mit dem Kartenstand, den dieser Platz sehen darf: die offenen
   Plättchen und das eigene, fremde Startplättchen noch nicht (sonst verriete die Zahl,
   was dort liegt). Genau ist sie trotzdem: das Umland einer erlaubten Hauptstadt liegt
   nie auf einem verdeckten Plättchen (seatFreeCells, Bedingung 1; test.js prüft es).
   `player` ist der Eintrag aus dem Aufbau ({civ, ability}) – Fähigkeiten zählen mit.
   Die Wegwerf-Partie hat einen Spieler, `tileMap` führt Hauptstädte aber nach PLATZ –
   deshalb wird die eine auf Platz 0 umgelegt (ohne das sah jeder Platz außer dem ersten
   keine Erträge, v60). Braucht engine.js, aufgerufen wird erst zur Laufzeit.        */
function placeYieldAt(plan, seat, o, cell, player) {
  const shown = planShape(plan).slots.map((_, i) => i)
    .filter(i => !isSeatSlot(plan, i) || i === seat.slot);
  const map = tileMap(plan, { show: shown, seat, o, cell, caps: [seat.idx] });
  map.capitals = map.capitals[seat.idx] ? [map.capitals[seat.idx]] : [];
  const T0 = newGame({ seed: 1, map,
    players: [{ civ: player.civ, kind: 'human', ability: player.ability }] });
  return T0.cities.length ? income(T0, 0) : null;
}
/* Alle Wahlmöglichkeiten eines Sitzes: table[o][n] = Ertrag der Hauptstadt auf Feld n in
   Lage o, oder null, wo sie nicht stehen darf. Lagen × Felder Wegwerf-Partien (Dreieck 3 × 15,
   Sechseck 6 × 19 – v99), also einmal je
   Sitz rechnen und merken – die Lage der offenen Plättchen ändert sich beim Legen nicht. */
function placeYieldTable(plan, seat, player) {
  return Array.from({ length: planRotations(plan) }, (_, o) => o).map(o => placeOptions(plan, seat, o)
    .map((ok, n) => ok ? placeYieldAt(plan, seat, o, n, player) : null));
}
/* „a ist rundum besser als b": in allen drei Erträgen mindestens so viel, in einem mehr. */
const yieldBeats = (a, b) =>
  a.sci >= b.sci && a.food >= b.food && a.coins >= b.coins &&
  (a.sci > b.sci || a.food > b.food || a.coins > b.coins);
/* Dominierte Startfelder (v73): es gibt ein anderes erlaubtes Feld, das rundum besser ist
   – in derselben ODER einer anderen Lage, denn Lage und Hauptstadt wählt man zusammen.
   Liegt das bessere Feld nur in einer anderen Lage, ist in dieser Lage womöglich jedes
   Feld markiert: dann taugt die ganze Lage nichts. Gleichstand dominiert nicht, und
   gemessen wird nur, was die Ertragsübersicht zeigt – Siedelraum, Küste für später oder
   Abstand zum Gegner zählen nicht. Ergebnis wie table: dom[o][n] = true/false.       */
function dominatedCells(table) {
  const alle = table.flat().filter(Boolean);
  return table.map(row => row.map(y => !!y && alle.some(z => yieldBeats(z, y))));
}

/* ---------------------------------------------------------------- Karte bauen
   `show` bestimmt, welche Plätze schon zu sehen sind (Standard: die offenen und alle
   fertig gelegten). Die Größe der Karte hängt nie davon ab – sie kommt aus der Form,
   damit das Bild beim Legen nicht springt. Die Löcher der Form bleiben „Kein Feld";
   sie werden bewusst nicht aufgefüllt.                                              */
function tileMap(plan, opts) {
  opts = opts || {};
  const shape = planShape(plan);
  const all = shape.slots.flatMap(slotCells).concat(shape.holes);
  const rcs = all.map(cubeToRC);
  const r0 = Math.min(...rcs.map(x => x[0])), c0 = Math.min(...rcs.map(x => x[1]));
  const rows = Math.max(...rcs.map(x => x[0])) - r0 + 1;
  const cols = Math.max(...rcs.map(x => x[1])) - c0 + 1;
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill('X'));
  const put = (cube, t) => { const [r, c] = cubeToRC(cube); grid[r - r0][c - c0] = t; };
  const visible = slot => {
    if (opts.show) return opts.show.includes(slot);
    const seat = plan.seats.find(s => s.slot === slot);
    return !seat || seat.cell != null;
  };
  shape.slots.forEach((sl, slot) => {
    if (!visible(slot)) return;
    const seat = plan.seats.find(s => s.slot === slot);
    const o = seat ? (opts.o != null && opts.seat === seat ? opts.o : seat.o) : plan.ori[slot];
    if (o == null) return;
    const face = planFace(plan, slot, o);
    slotCells(sl).forEach((cube, i) => put(cube, face[i]));
  });
  // Hauptstädte als Liste nach Platz: dieselbe Zivilisation kann mehrfach dabei sein.
  const capitals = [];
  plan.seats.forEach(seat => {
    const cell = (opts.seat === seat && opts.cell != null) ? opts.cell : seat.cell;
    if (cell == null || !visible(seat.slot)) return;
    if (opts.caps && !opts.caps.includes(seat.idx)) return;
    const [r, c] = cubeToRC(slotCells(shape.slots[seat.slot])[cell]);
    capitals[seat.idx] = { civ: seat.civ, r: r - r0, c: c - c0 };
  });
  return {
    name: plan.name, rows: grid.map(g => g.join('')), capitals,
    random: true, tiles: plan.shapeKey,
  };
}
/* Felder eines Plättchens als [Zeile, Spalte] – für Hervorhebungen in der Oberfläche */
function slotRC(plan, slot) {
  const shape = planShape(plan);
  const all = shape.slots.flatMap(slotCells).concat(shape.holes).map(cubeToRC);
  const r0 = Math.min(...all.map(x => x[0])), c0 = Math.min(...all.map(x => x[1]));
  return slotCells(shape.slots[slot]).map(cube => {
    const [r, c] = cubeToRC(cube);
    return [r - r0, c - c0];
  });
}
