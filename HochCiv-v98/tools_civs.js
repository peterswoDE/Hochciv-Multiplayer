/* Schreibt js/civs.js aus data/civs.json.

   Warum der Umweg? Die App läuft auch als einzelne HTML-Datei von der Festplatte, und
   von dort darf `fetch('data/civs.json')` nicht laden (file:// erlaubt das nicht). Eine
   echte JSON-Datei ist trotzdem der bequemere Ort zum Pflegen – also ist sie die Quelle
   und js/civs.js die daraus erzeugte Fassung, die per <script> geladen wird.
   `node test.js` prüft, dass beide zusammenpassen; wer die JSON ändert und das Erzeugen
   vergisst, merkt es beim nächsten Testlauf.

   Aufruf: node tools_civs.js                                                        */
const fs = require('fs');
const path = require('path');

const quelle = path.join(__dirname, 'data', 'civs.json');
const ziel = path.join(__dirname, 'js', 'civs.js');
const roh = JSON.parse(fs.readFileSync(quelle, 'utf8'));

/* Zwei Reihenfolgen, die nicht dasselbe sind:
   • die Reihenfolge in der JSON = Anzeigereihenfolge (Aufbau, Regelbogen, Legenden),
   • das Feld `order` = Zugreihenfolge im Spiel (ORDER).
   Deshalb wird CIVS in Dateireihenfolge geschrieben und nur ORDER sortiert. */
const civs = roh.civs.slice();
const zugfolge = roh.civs.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
const fehler = [];
const schluessel = new Set();
civs.forEach((c, i) => {
  ['k', 'n', 'sym', 'color'].forEach(f => { if (!c[f]) fehler.push(`Reich ${i + 1}: ${f} fehlt`); });
  if (!/^[a-z]+$/.test(c.k || '')) fehler.push(`Reich ${i + 1}: k nur Kleinbuchstaben`);
  if (schluessel.has(c.k)) fehler.push(`Schlüssel ${c.k} doppelt`);
  schluessel.add(c.k);
  if (!/^#[0-9a-f]{6}$/i.test(c.color || '')) fehler.push(`${c.k}: color ist kein #rrggbb`);
  if (!Array.isArray(c.abilities) || c.abilities.length !== 3)
    fehler.push(`${c.k}: braucht genau drei Fähigkeiten`);
  else {
    if (c.abilities[0].k !== 'basis') fehler.push(`${c.k}: die erste Fähigkeit muss 'basis' heißen`);
    c.abilities.forEach(a => {
      if (!a.k || !a.n || !a.e) fehler.push(`${c.k}/${a.k || '?'}: k, n und e sind Pflicht`);
    });
  }
});
if (fehler.length) {
  console.error('data/civs.json ist nicht in Ordnung:');
  fehler.forEach(f => console.error('  ' + f));
  process.exit(1);
}

const j = x => JSON.stringify(x);
const zeilen = [];
zeilen.push('/* Zivilisationen – ERZEUGT aus data/civs.json, nicht von Hand ändern.');
zeilen.push('   Neues Reich oder Änderung: data/civs.json bearbeiten, dann `node tools_civs.js`.');
zeilen.push('   Die Reihenfolge hier ist die Anzeigereihenfolge; ORDER unten ist die Zugfolge.');
zeilen.push('   Die Regeln zu den Fähigkeiten stehen in js/engine.js, nicht hier. */');
zeilen.push('const CIVS = [');
civs.forEach(c => {
  zeilen.push('  {');
  zeilen.push(`    k: ${j(c.k)}, n: ${j(c.n)}, sym: ${j(c.sym)}, color: ${j(c.color)},`);
  zeilen.push(`    ability: ${j(c.abilities[0].e)},`);
  zeilen.push('    abilities: [');
  c.abilities.forEach(a => {
    zeilen.push(`      { k: ${j(a.k)}, n: ${j(a.n)}, e: ${j(a.e)} },`);
  });
  zeilen.push('    ],');
  zeilen.push('  },');
});
zeilen.push('];');
zeilen.push('const CIV_BY_KEY = {};');
zeilen.push('CIVS.forEach(c => { CIV_BY_KEY[c.k] = c; });');
zeilen.push('/* Alle Schlüssel in Anzeigereihenfolge. Der Aufbau braucht sie an mehreren');
zeilen.push('   Stellen (Vorauswahl, Auslosung, Tausch beim „Nochmal spielen"). Wer die Liste');
zeilen.push('   verändern will, nimmt eine Kopie: CIV_KEYS.slice(). */');
zeilen.push('const CIV_KEYS = CIVS.map(c => c.k);');
zeilen.push('/* Zugreihenfolge (Feld `order` in der JSON) – nicht die Reihenfolge oben,');
zeilen.push('   die ist die Anzeigereihenfolge im Aufbau und im Regelbogen. */');
zeilen.push(`const ORDER = ${j(zugfolge.map(c => c.k))};`);
zeilen.push('/* Barbaren: neutrale Fraktion, entsteht nur durch das Ereignis „Barbareninvasion". */');
const b = roh.barbaren;
zeilen.push(`const BARB_CIV = { k: ${j(b.k)}, n: ${j(b.n)}, sym: ${j(b.sym)}, color: ${j(b.color)}, ability: '' };`);
zeilen.push('');
fs.writeFileSync(ziel, zeilen.join('\n'));
console.log(`js/civs.js geschrieben: ${civs.length} Reiche · Anzeige ${civs.map(c => c.k).join(', ')}` +
  ` · Zugfolge ${zugfolge.map(c => c.k).join(', ')}`);
