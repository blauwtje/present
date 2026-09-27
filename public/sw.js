// Cache-first for the catalog and the language model, so both load from disk after the first visit.
// App files: network first, cache as fallback for offline use.
const DATA = 'cadeau-data-v1';
const SHELL = 'cadeau-shell-v1';
const MODEL_HOSTS = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs.hf.co', 'cas-bridge.xethub.hf.co'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![DATA, SHELL].includes(k) && k.startsWith('cadeau-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isData(url) {
  if (MODEL_HOSTS.includes(url.hostname)) return true;
  return url.origin === self.location.origin && url.pathname.includes('/catalog/') && !url.pathname.endsWith('manifest.json');
}

async function cacheFirst(request) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type !== 'opaque') cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isData(url)) {
    event.respondWith(cacheFirst(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});
