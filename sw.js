/* Kairos – service worker. Při každé změně index.html zvedni číslo verze. */
const CACHE = 'kairos-v9';
const SHELL = ['./', './index.html', './astronomy.browser.min.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './sky-dawn.webp', './sky-day.webp', './sky-dusk.webp', './sky-night.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  // aplikace: nejdřív síť (ať je index vždy čerstvý), při výpadku cache
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))));
});
