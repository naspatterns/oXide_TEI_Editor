// Service Worker for offline support.
// `CACHE_VERSION` is rewritten at build time by the
// `inject-pwa-cache-version` plugin in vite.config.ts so each production
// build produces a fresh cache name and old caches are evicted on the next
// `activate` event. In dev (where `public/` is served verbatim) the literal
// placeholder string is used, which is fine — it stays stable across dev
// reloads.
const CACHE_VERSION = '__BUILD_HASH__';
const CACHE_NAME = `oxide-tei-v${CACHE_VERSION}`;

// Assets to cache on install. The hashed JS/CSS chunks are appended at build
// time by the `inject-sw-build-data` plugin (vite.config.ts) in place of the
// marker below — the SW can't name them literally because the hashes change
// every build. Without them the first offline start white-screened, since the
// chunks the page fetched before the SW took control were never cached
// (audit #9). In dev the marker stays a no-op comment (the SW isn't
// registered in dev anyway).
const PRECACHE_URLS = [
  './',
  './index.html',
  /*__PRECACHE_ASSETS__*/
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
            // waitUntil keeps the SW alive until the write lands; otherwise the
            // put is a detached promise the browser may abort when it
            // terminates the worker after respondWith settles (audit #27).
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
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
            // waitUntil so the write isn't aborted if the SW is terminated
            // right after the response is returned (audit #27).
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
          }
          return response;
        })
      )
    );
    return;
  }

  // Other cross-origin requests: don't intercept.
});
