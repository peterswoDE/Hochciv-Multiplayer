/* Zahlen in UEBERGABE.md nachziehen: Zeilenzahlen der Dateitabelle, Zahl der Assertions
   und Smoke-Schritte, Zahl der Dateien im Paket.

   Warum: In der Übergabe standen zuletzt 816 Assertions und 68 Schritte, während es
   längst 1153 und 94 waren – wer damit in eine neue Sitzung geht, hält grüne Läufe für
   falsch. Zahlen von Hand zu pflegen funktioniert über viele Sitzungen nicht.

   `node tools_docs.js`            → Zahlen neu setzen (führt test.js und smoke.js aus)
   `node tools_docs.js --schnell`  → nur die Zeilenzahlen (ohne Testläufe)             */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const wurzel = __dirname;
const pfad = path.join(wurzel, 'UEBERGABE.md');
let doc = fs.readFileSync(pfad, 'utf8');
const schnell = process.argv.includes('--schnell');

// 1) Zeilenzahlen jeder Tabellenzeile „| `datei` | N |"
let angepasst = 0, fehlend = [];
doc = doc.replace(/\| `([^`]+)` \| (\d+) \|/g, (ganz, datei, alt) => {
  const p = path.join(wurzel, datei);
  if (!fs.existsSync(p)) { fehlend.push(datei); return ganz; }
  const ist = fs.readFileSync(p, 'utf8').split('\n').length;
  if (String(ist) !== alt) angepasst++;
  return `| \`${datei}\` | ${ist} |`;
});
// Doppelzeilen „| `a` / `b` | 20 / 34 |"
doc = doc.replace(/\| `([^`]+)` \/ `([^`]+)` \| (\d+) \/ (\d+) \|/g, (ganz, a, b) => {
  const z = f => fs.existsSync(path.join(wurzel, f))
    ? fs.readFileSync(path.join(wurzel, f), 'utf8').split('\n').length : null;
  const za = z(a), zb = z(b);
  if (za == null || zb == null) { fehlend.push(`${a}/${b}`); return ganz; }
  angepasst++;
  return `| \`${a}\` / \`${b}\` | ${za} / ${zb} |`;
});

// 2) Zahl der Dateien im Paket. Ausgeschlossen wird genau das, was auch beim Paketieren
//    draußen bleibt (siehe UEBERGABE.md, „Wichtig beim Paketieren"): node_modules,
//    Verstecktes und die npm-Dateien. Sonst nennt die Übergabe zwei Dateien zu viel –
//    npm install legt package.json und package-lock.json an, und die gehören nicht dazu.
const alleDateien = [];
(function sammle(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return;
    if (/^package(-lock)?\.json$/.test(e.name)) return;
    const p = path.join(d, e.name);
    e.isDirectory() ? sammle(p) : alleDateien.push(path.relative(wurzel, p));
  });
})(wurzel);
doc = doc.replace(/Ordner `hochzeivilization\/` \(\d+ Dateien\)/,
  `Ordner \`hochzeivilization/\` (${alleDateien.length} Dateien)`);

// 3) Assertions und Smoke-Schritte – nur mit Testläufen zu bekommen
if (!schnell) {
  const zaehle = (cmd, muster) => {
    const out = execSync(`cd ${wurzel} && ${cmd}`, { encoding: 'utf8', maxBuffer: 1 << 28 });
    return (out.match(muster) || []).length;
  };
  const asserts = zaehle('node test.js', /^ {2}ok {2}/gm);
  const schritte = zaehle('node smoke.js', /^ {2}ok {2}/gm);
  doc = doc.replace(/\*\*\d+ Assertions\*\*/g, `**${asserts} Assertions**`)
    .replace(/— \d+ Assertions/g, `— ${asserts} Assertions`)
    .replace(/\*\*(\d+) Schritte\*\*/g, (g, n) => n === '29' ? g : `**${schritte} Schritte**`)
    .replace(/durch jsdom \(\d+ Schritte\)/g, `durch jsdom (${schritte} Schritte)`);
  console.log(`Assertions ${asserts} · Smoke-Schritte ${schritte}`);
}

fs.writeFileSync(pfad, doc);
console.log(`UEBERGABE.md: ${angepasst} Zeilenzahl(en) gesetzt, ${alleDateien.length} Dateien` +
  (fehlend.length ? ` · nicht gefunden: ${fehlend.join(', ')}` : ''));
