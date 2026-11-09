/* Offline-Cache. Nach Änderungen an den Dateien: node tools_version.js – zählt VERSION hoch und
   setzt BUILD_HASH. Ohne passenden BUILD_HASH übernimmt die App eine neue Fassung nicht (v106). */
const VERSION = 'hochciv-v106';
const BUILD_HASH = 'e268aef38220';   // von tools_version.js
/* Was zwischengespeichert wird: die festen Dateien hier, die Skripte aus index.html – dort
   steht ihre Liste als <script>-Tags, und nur dort (v102). */
const STATIC = [
  './', './index.html', './css/style.css',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './favicon.ico', './icons/favicon-32.png'
];
const scriptsOf = html => [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => './' + m[1]);
/* Eine neue Fassung kommt ganz oder gar nicht in den Cache (v106). Gemeldet nach v105: In der
   App auf dem Home-Bildschirm ging „Fähigkeiten" in keiner Partie auf, im Browser schon. Ihr
   Cache hielt neue Dateien neben alten (copyRate is not defined): sw.js war schon neu, während
   der Upload noch lief – und gefüllt wird ein Cache nur einmal je VERSION. Ebenso möglich: der
   HTTP-Cache des Browsers (GitHub Pages: zehn Minuten) reicht beim Einbau alte Dateien weiter.
   Darum holt der Einbau jede Datei frisch vom Server und prüft den Inhalt gegen BUILD_HASH –
   dieselbe Rechnung wie tools_version.js und test.js. Passt er nicht, bricht der Einbau ab:
   Die bisherige Fassung bleibt, beim nächsten Start versucht der Browser es wieder. */
const frisch = u => fetch(u, { cache: 'reload' }).then(r => {
  if (!r.ok) throw new Error(`${u}: ${r.status}`);
  return r;
});
// SHA-1 über Name und Inhalt jeder Datei, nach Namen sortiert – ohne './', Icons und Manifest
async function buildHash(urls, antworten) {
  const teile = urls.map((u, i) => [u.slice(2), antworten[i]])
    .filter(([f]) => f && !f.startsWith('icons/') && f !== 'manifest.webmanifest')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const stuecke = [];
  for (const [f, r] of teile) stuecke.push(new TextEncoder().encode(f), new Uint8Array(await r.clone().arrayBuffer()));
  const alles = new Uint8Array(stuecke.reduce((n, s) => n + s.length, 0));
  stuecke.reduce((o, s) => { alles.set(s, o); return o + s.length; }, 0);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', alles));
  return [...h].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const html = await (await frisch('./index.html')).text();
    const urls = [...STATIC, ...scriptsOf(html)];
    const antworten = await Promise.all(urls.map(frisch));
    // ohne WebCrypto (nur über unverschlüsseltes http außerhalb von localhost) ungeprüft
    if (self.crypto && crypto.subtle && await buildHash(urls, antworten) !== BUILD_HASH)
      throw new Error(`Dateien passen (noch) nicht zu ${VERSION}`);
    const c = await caches.open(VERSION);
    await Promise.all(urls.map((u, i) => c.put(u, antworten[i])));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html')))
  );
});
