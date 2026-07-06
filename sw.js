// PracticePal service worker — makes the app shell load with zero signal,
// which matters because clubs are notorious wifi dead zones and Live Mode
// must never depend on a live connection mid-session.
//
// Strategy:
// - App shell (this page, manifest, icons): precached on install.
// - Navigations (loading the page itself): network-first, so a visit with
//   signal always gets the latest deploy, falling back to the cached shell
//   the instant the network fails.
// - Same-origin static files: cache-first (they rarely change).
// - Everything else (Supabase, fonts, Anthropic): untouched passthrough —
//   API calls need live data, not a stale cached response.
//
// Bump CACHE_VERSION whenever the precache list changes so old caches are
// dropped on the next activate.
const CACHE_VERSION = 'pp-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes (Supabase inserts/updates etc.)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts/Supabase/Anthropic — always go live

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
      return res;
    }).catch(() => cached))
  );
});
