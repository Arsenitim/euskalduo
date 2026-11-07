/*
 * EUSKALDUO service worker: lets the learner app open and practise without a
 * connection. Built by the `serviceWorker` plugin in vite.config.ts, which
 * replaces __VERSION__ and __PRECACHE__ with the build's files.
 *
 * It only stores what the server already sends to everyone (the app, the
 * published catalogue, pictures and speech). It never stores or creates
 * requests with learner data, and never touches /admin or /api/admin.
 *
 * Cache names are shared with web/src/api/offline.ts.
 */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;

const SHELL = `euskalduo-shell-${VERSION}`;
const DATA = 'euskalduo-data-v1';
const MEDIA = 'euskalduo-media-v1';
const CONTENT = '/api/public/content';
const MEDIA_PATH = /^\/(uploads\/[a-f0-9]{32}\.webp|audio\/[a-f0-9]{64}\.mp3)$/;
/** On a bad connection (plane Wi-Fi) fall back to the saved copy after this long. */
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload', credentials: 'omit' }))))
      // The page's first catalogue request happened before this worker existed:
      // save a copy now, so the words are there offline even without "Descargar".
      .then(() => caches.open(DATA))
      .then((cache) => cache.add(new Request(CONTENT, { cache: 'no-cache', credentials: 'omit' })).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('euskalduo-shell-') && n !== SHELL).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin')) return;

  if (path === CONTENT) {
    event.respondWith(networkFirst(request, DATA, (response) => putIfOk(DATA, CONTENT, response)));
  } else if (MEDIA_PATH.test(path)) {
    event.respondWith(cacheFirst(request, MEDIA));
  } else if (request.mode === 'navigate') {
    // The page itself: fresh when online (so updates arrive), the saved app otherwise.
    event.respondWith(networkFirst(request, SHELL, null, '/'));
  } else if (!path.startsWith('/api/')) {
    event.respondWith(cacheFirst(request, SHELL, false));
  }
});

async function putIfOk(cacheName, key, response) {
  if (response.ok && response.type === 'basic') await (await caches.open(cacheName)).put(key, response);
}

/**
 * Network, falling back to the cache when offline, on errors or after a timeout.
 * A late network answer still refreshes the cache.
 */
async function networkFirst(request, cacheName, store, fallbackKey) {
  const network = fetch(request).then(async (response) => {
    if (store) await store(response.clone()).catch(() => undefined);
    return response;
  });
  network.catch(() => undefined); // a late failure after the fallback was used is expected
  const cached = () => caches.open(cacheName).then((cache) => cache.match(fallbackKey ?? request, { ignoreVary: true }));
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
  });
  try {
    const first = await Promise.race([network, timeout]);
    if (first && first.status < 500) return first;
    const saved = await cached();
    if (saved) return saved;
    return first ?? (await network);
  } catch {
    const saved = await cached();
    if (saved) return saved;
    throw new TypeError('Offline and not saved');
  } finally {
    clearTimeout(timer);
  }
}

/** Files whose name never changes content (hashed): the cache is always right. */
async function cacheFirst(request, cacheName, store = true) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (store) await putIfOk(cacheName, request, response.clone()).catch(() => undefined);
  return response;
}
