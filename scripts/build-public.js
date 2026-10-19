/**
 * Builds public/ from the game that ships with this repository – nothing is downloaded:
 *
 *   HochCiv/      → public/       the current game, served at /
 *   HochCiv-v83/  → public/v83/   the version deployed before (v83): only for Rundenspiele that
 *                                 were started on it (mp.js sends their players there)
 *
 * Each copy gets mp.js and the script tags of inject.js. Development files of the game (tests,
 * tools, notes) are not copied. Run by the Dockerfile and at container start (entrypoint.sh),
 * so a mounted HochCiv/ (docker-compose.local.yml) is picked up by a restart.
 *
 * Usage: node scripts/build-public.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const GAMES = [
    { from: 'HochCiv', to: '' },
    { from: 'HochCiv-v83', to: 'v83' },
];
// what the browser needs – everything else in the game folder is development material
const KEEP = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'favicon.ico', 'js', 'css', 'data', 'icons']);

function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const g of GAMES) {
    const src = path.join(ROOT, g.from);
    if (!fs.existsSync(path.join(src, 'index.html'))) {
        console.error(`[build-public] ${g.from}/index.html fehlt – das Spiel liegt nicht im Repository.`);
        process.exit(1);
    }
    const dst = path.join(OUT, g.to);
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (!KEEP.has(e.name)) continue;
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
    fs.mkdirSync(path.join(dst, 'js'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'mp.js'), path.join(dst, 'js', 'mp.js'));
    execFileSync(process.execPath, [path.join(ROOT, 'inject.js'), dst], { stdio: 'inherit' });
    const version = (fs.readFileSync(path.join(src, 'js', 'data.js'), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];
    console.log(`[build-public] ${g.from} (${version || '?'}) → public/${g.to}`);
}
