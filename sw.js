// sw.js — the service worker. Two jobs: make the game start instantly and work with no network at all,
// and never let a stale copy of it linger after an update.
//
// Everything the game needs is a handful of small static files, so they are all cached on install and
// served cache-first. Bump VERSION on any change to them — a new version installs alongside the old one,
// then takes over on the next launch and deletes what it replaced.
//
// The one thing that must NEVER be cached is /api/event: the anonymous play stats are fire-and-forget,
// and a cached response would either swallow them or replay them.
const VERSION = 'nine-to-nine-v1';

const SHELL = [
  './',
  'index.html',
  'style.css',
  'content.js',
  'core.js',
  'daily.js',
  'persona.js',
  'awards.js',
  'challenge.js',
  'week.js',
  'campaign.js',
  'scene.js',
  'game.js',
  'manifest.webmanifest',
  'icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;                      // the stats endpoint posts; leave it alone
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;           // anything off-site is not ours to serve
  if (url.pathname.includes('/api/')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          // Cache what we fetch, so a file added after install is there next time too.
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        // Offline and not cached: a navigation still has to land somewhere, so it lands on the game.
        .catch(() => (request.mode === 'navigate' ? caches.match('index.html') : Promise.reject(new Error('offline'))));
    })
  );
});
