/* Version erhöhen – und dabei den Inhalt der zwischengespeicherten Dateien festhalten.

   Warum es das gibt: Der Service Worker liefert **zuerst aus dem Cache** und legt einen
   neuen Cache nur an, wenn sich `VERSION` in sw.js ändert. Ändert man Code, ohne die
   Version zu erhöhen, bleibt sw.js Byte für Byte gleich – der Browser hat keinen Anlass,
   irgendetwas neu zu laden, und zeigt die alte Fassung weiter. Genau das ist nach v54
   passiert: die Änderung lag in den Dateien, kam aber bei niemandem an.

   `node tools_version.js`        → erhöht die Nummer um 1
   `node tools_version.js v60`    → setzt sie auf v60

   Geschrieben werden `VERSION` und `BUILD_HASH` in sw.js sowie `APP_VERSION` in
   js/data.js. `node test.js` rechnet den Hash nach und meckert, wenn Dateien geändert
   wurden, ohne die Version zu erhöhen.                                                */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const wurzel = __dirname;
const swPfad = path.join(wurzel, 'sw.js');

/* Hash über alle Dateien, die der Service Worker zwischenspeichert – ohne sw.js selbst
   (die ändert sich ja gerade) und ohne die Icons (Binärdateien, ändern sich nie). */
function dateien(sw) {
  const m = sw.match(/const FILES = \[([\s\S]*?)\];/);
  if (!m) throw new Error('FILES in sw.js nicht gefunden');
  return [...m[1].matchAll(/'\.\/([^']+)'/g)].map(x => x[1])
    .filter(f => f && !/^icons\//.test(f) && f !== 'manifest.webmanifest');
}
function hashOf(sw) {
  const h = crypto.createHash('sha1');
  dateien(sw).sort().forEach(f => {
    h.update(f);
    h.update(fs.readFileSync(path.join(wurzel, f)));
  });
  return h.digest('hex').slice(0, 12);
}

let sw = fs.readFileSync(swPfad, 'utf8');
const alt = (sw.match(/const VERSION = 'hochciv-(v\d+)'/) || [])[1];
if (!alt) throw new Error('VERSION in sw.js nicht gefunden');
const neu = process.argv[2] || 'v' + (parseInt(alt.slice(1), 10) + 1);
if (!/^v\d+$/.test(neu)) throw new Error('Version muss die Form vNN haben');

/* Reihenfolge ist wichtig: erst data.js schreiben, dann hashen, dann sw.js – sonst
   fehlt die neue APP_VERSION im Hash und der Test schlägt sofort wieder an. */
const dPfad = path.join(wurzel, 'js', 'data.js');
const d = fs.readFileSync(dPfad, 'utf8').replace(/const APP_VERSION = 'v\d+'/, `const APP_VERSION = '${neu}'`);
fs.writeFileSync(dPfad, d);

sw = sw.replace(/const VERSION = 'hochciv-v\d+'/, `const VERSION = 'hochciv-${neu}'`);
const hash = hashOf(sw);
sw = /const BUILD_HASH = '[^']*'/.test(sw)
  ? sw.replace(/const BUILD_HASH = '[^']*'/, `const BUILD_HASH = '${hash}'`)
  : sw.replace(/const FILES = \[/, `const BUILD_HASH = '${hash}';   // von tools_version.js\nconst FILES = [`);
fs.writeFileSync(swPfad, sw);

/* Die Kopfzeile der Übergabe nennt die Version – sonst steht dort bald eine alte. */
const uPfad = path.join(wurzel, 'UEBERGABE.md');
if (fs.existsSync(uPfad)) {
  const heute = new Date();
  const datum = `${heute.getDate()}.${heute.getMonth() + 1}.`;
  const u = fs.readFileSync(uPfad, 'utf8')
    .replace(/^(# Hochzeivilization — Projekt-Übergabe \(Stand )[^,]+(, `sw\.js` )v\d+\)/m,
      `$1${datum}$2${neu})`);
  fs.writeFileSync(uPfad, u);
}
console.log(`${alt} → ${neu} · BUILD_HASH ${hash} · ${dateien(sw).length} Dateien im Cache`);
