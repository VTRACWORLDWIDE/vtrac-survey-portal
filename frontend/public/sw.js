const APP_CACHE = 'vtrac-survey-app-v1';
const API_CACHE = 'vtrac-survey-api-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/vtrac-logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![APP_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, '/'));
    return;
  }

  if (url.pathname === '/api/survey-config') {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/vtrac-logo.jpg'
  ) {
    event.respondWith(cacheFirst(request, APP_CACHE));
  }
});

async function networkFirst(request, cacheName, fallbackUrl = '') {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ||
      (fallbackUrl ? await cache.match(fallbackUrl) : null) ||
      new Response('Offline cache is not ready. Open this survey once while online.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
