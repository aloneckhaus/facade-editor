/* Facade editor service worker: precache app shell + DWG engine so it works offline */
const CACHE = 'facade-editor-v4';
const FILES = ['./', './index.html', './simple.js', './klil5600.js', './klilgeom.js', './advanced.html', './app.js', './geom.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './lib/dxf-parser.js', './lib/libredwg-glue.js', './lib/libredwg-web.umd.js', './lib/libredwg-web.wasm'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// network-first for the page/code (so updates arrive), cache fallback offline; cache-first for the big engine files
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/lib\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); return; }
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
