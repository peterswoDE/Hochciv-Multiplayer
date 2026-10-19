/* Offline-Cache. Bei Änderungen VERSION erhöhen. */
const VERSION = 'hochciv-v83';
const BUILD_HASH = 'c72c27c6c739';   // von tools_version.js
const FILES = [
  './', './index.html', './css/style.css',
  './js/data.js', './js/civs.js', './js/i18n.js', './js/hex.js', './js/tiles.js', './js/engine.js', './js/expansion.js', './js/bots.js', './js/ki.js', './js/marathon.js', './js/tutorial.js', './js/ui.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
