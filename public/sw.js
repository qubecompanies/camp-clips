/* Camp Clips service worker — offline shell + installability.
 *
 * Hand-rolled (no Workbox / no build step) so it stays auditable and adds zero
 * dependencies. Strategy by request type:
 *   - Navigations (HTML)            → network-first, fall back to cached /index.html
 *                                     when offline. Guarantees a fresh app shell on
 *                                     every deploy while still loading offline.
 *   - Same-origin /assets/**        → cache-first. Vite fingerprints these
 *                                     (immutable), so a cache hit is always correct.
 *   - Icons / manifest / music      → stale-while-revalidate: instant from cache,
 *                                     refreshed in the background.
 *   - Everything cross-origin       → pass through to the network untouched
 *                                     (fonts, future APIs — never cached here).
 *
 * Bump CACHE_VERSION on any change to this file so the activate step can purge
 * stale caches. Media (photos/clips/songs) is never fetched over HTTP — it lives
 * only as in-memory object URLs — so there is nothing private to cache here.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `campclips-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `campclips-assets-${CACHE_VERSION}`;

// Minimal shell we want available offline from the first load.
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        /* a missing shell URL must not block install */
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

function isStaleWhileRevalidate(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/music/') ||
    /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch GET; let the browser handle POST/etc. directly.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Google Fonts, future APIs): don't intercept.
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first with cached-shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Fingerprinted build assets: cache-first (they never change under a given URL).
  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Icons / manifest / bundled music: stale-while-revalidate.
  if (isStaleWhileRevalidate(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
    return;
  }

  // Anything else same-origin: try network, fall back to any cache hit.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
