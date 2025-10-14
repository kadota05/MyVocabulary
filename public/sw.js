const CACHE = 'mvocab-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  e.respondWith((async () => {
    try {
      const net = await fetch(req);
      return net;
    } catch {
      const cache = await caches.match(req);
      if (cache) return cache;
      if (req.mode === 'navigate') {
        return caches.match('/');
      }
      throw new Error('offline');
    }
  })());
});

