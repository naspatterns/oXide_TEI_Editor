// Service Worker for offline support.
// `CACHE_VERSION` is rewritten at build time by the
// `inject-pwa-cache-version` plugin in vite.config.ts so each production
// build produces a fresh cache name and old caches are evicted on the next
// `activate` event. In dev (where `public/` is served verbatim) the literal
// placeholder string is used, which is fine — it stays stable across dev
// reloads.
const CACHE_VERSION = '__BUILD_HASH__';
const CACHE_NAME = `oxide-tei-v${CACHE_VERSION}`;

// Assets to cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first strategy for HTML navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Only GET requests are cacheable.
  if (event.request.method !== 'GET') return;

  // Cache-first for Google Fonts (long-lived, well-known immutable URLs).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Cache-first for OUR OWN assets (same origin only). We deliberately do
  // not cache arbitrary cross-origin responses: a malicious TEI document
  // that referenced `<graphic url="https://attacker.com/...">` used to be
  // able to permanently poison this cache with attacker-controlled
  // responses. Now those requests fall through to the browser's default
  // network handling and are not retained by the service worker.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // Other cross-origin requests: don't intercept.
});
