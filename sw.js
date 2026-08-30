/* Kairos – service worker. Při každé změně index.html zvedni číslo verze. */
const CACHE = 'kairos-v174';
const SHELL = ['./', './index.html', './astronomy.browser.min.js', './manifest.webmanifest', './logo.png', './logo-emblem.webp?v=1', './logo-stars.webp?v=1', './moon-tex.png?v=1', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './sky-day.webp?v=7', './sky-night.webp?v=4', './sky-night-hd2.webp?v=1', './sky-day-hd2.webp?v=1'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // NOAA a proxy: vždy ze sítě, nic necachovat
  if (url.hostname.endsWith('noaa.gov') || url.pathname.startsWith('/api/')) return;
  // fonty Google: cache-first s doplněním
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE + '-fonts').then(async (c) => {
      const hit = await c.match(e.request); if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // verzované a statické assety: nejdřív cache (jsou v precache aktuální verze), síť jen jako doplněk
  if (url.search.includes('v=') || /\.(webp|png|js|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreVary: true }).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; })));
    return;
  }
  // HTML/navigace: vždy čerstvě ze sítě (obejít HTTP cache), při výpadku cache
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))));
});
