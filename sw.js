/* ╔══════════════════════════════════════════════════════╗
   ║  BTECH Track — Service Worker                        ║
   ║  PWA offline cache + Capacitor coexistence           ║
   ╚══════════════════════════════════════════════════════╝ */

// Bump this on every deploy. Changing the string forces the activate
// handler below to evict every old cache, so a stale app shell can
// never keep being served after an update.
const CACHE_VERSION = 'btech-track-v2';

// Core app shell — always fetched network-first (see fetch handler).
// Keep this list to files that actually exist in the project; a
// missing file here no longer breaks precaching for the rest.
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Cache each asset individually — one missing file (e.g. an
      // optional manifest) no longer aborts precaching for everything
      // else, unlike cache.addAll() which is all-or-nothing.
      return Promise.all(
        PRECACHE_ASSETS.map(function (asset) {
          return cache.add(asset).catch(function (err) {
            console.warn('[SW] Skipped precaching (not found):', asset, err);
          });
        })
      );
    })
  );
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_VERSION; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Files that make up the app shell — these change on every deploy,
// so they must never be served stale-first.
function isCoreAsset(url) {
  return (
    url.endsWith('/index.html') ||
    url.endsWith('/styles.css') ||
    url.endsWith('/script.js') ||
    url.endsWith('/manifest.json')
  );
}

// ── Fetch ────────────────────────────────────────────────────
// Network-first for the app shell (HTML/JS/CSS + navigations) so an
// update is visible on the very next load instead of one load behind.
// Cache-first (with background revalidation) for everything else —
// icons, fonts, images — where instant load matters more than freshness.
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Never intercept Supabase API requests — always go to network
  if (
    url.includes('supabase.co') ||
    url.includes('supabase.io') ||
    url.includes('googleapis.com') ||
    url.includes('google.com/accounts') ||
    url.includes('facebook.com') ||
    url.includes('appleid.apple.com') ||
    event.request.method !== 'GET'
  ) {
    return; // Let the browser handle it
  }

  var isNavigation = event.request.mode === 'navigate';

  if (isNavigation || isCoreAsset(url)) {
    event.respondWith(
      fetch(event.request)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var cloned = networkResponse.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(event.request, cloned);
            });
          }
          return networkResponse;
        })
        .catch(function () {
          // Offline — fall back to whatever we have cached
          return caches.match(event.request).then(function (cached) {
            if (cached) return cached;
            if (isNavigation) return caches.match('/index.html');
            return new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Cache-first strategy for other static assets
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        // Return cached version and update in background
        fetch(event.request)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              var cloned = networkResponse.clone();
              caches.open(CACHE_VERSION).then(function (cache) {
                cache.put(event.request, cloned);
              });
            }
          })
          .catch(function () { /* offline — cached version is fine */ });
        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(function (networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        var cloned = networkResponse.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(event.request, cloned);
        });
        return networkResponse;
      }).catch(function () {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});