// sw.js — the service worker. Two jobs: make the game start instantly and work with no network at all,
// and never let a stale copy of it linger after an update.
//
// Everything the game needs is a handful of small static files, cached on install so the game works with
// no network at all. They are served NETWORK-FIRST with the cache as the fallback, which matters more
// than it sounds: the first cut of this served cache-first, and the very next change to the game simply
// did not reach the browser — the file on disk was right and the page was a version behind, silently.
// That is a miserable thing to debug, and it would have happened on every edit.
//
// Network-first costs a few hundred kilobytes of text on a connection that has one, and falls back to
// the cache the moment the network does not answer within TIMEOUT_MS, so offline and flaky connections
// still start instantly. Bump VERSION when the list below changes; the new worker takes over at once and
// deletes what it replaced.
//
// The one thing that must NEVER be cached is /api/event: the anonymous play stats are fire-and-forget,
// and a cached response would either swallow them or replay them.
const VERSION = 'nine-to-nine-v3';
const TIMEOUT_MS = 2500; // how long a slow network gets before the cache answers instead

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
  'rewards.js',
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

  const fromCache = () => caches.match(request, { ignoreSearch: true })
    // Offline and never cached: a navigation still has to land somewhere, so it lands on the game.
    .then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : undefined));

  const fromNetwork = fetch(request).then((response) => {
    // Keep the cache current, so the copy that runs offline is the copy that ran online.
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(VERSION).then((cache) => cache.put(request, copy));
    }
    return response;
  });

  // Whichever answers first, with the cache standing in for a network that is slow as well as for one
  // that is absent.
  const slowNetwork = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS)).then(fromCache);

  event.respondWith(
    Promise.race([fromNetwork, slowNetwork])
      .then((response) => response || fromNetwork)
      .catch(() => fromCache().then((hit) => hit || Response.error()))
  );
});
