const VERSION = 'mjh-native-36';
const BASE = new URL('./', self.location.href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const urls = await fetch(new URL('precache.json', BASE), {cache:'no-store'}).then(r => r.json());
    const cache = await caches.open(VERSION);
    await cache.addAll(urls.map(url => new URL(url, BASE).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if ((key.startsWith('mjh-journey-') || key.startsWith('mjh-real-') || key.startsWith('mjh-original-') || key.startsWith('mjh-native-')) && key !== VERSION) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== BASE.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(event.request)) || new Response('Offline', { status: 503 })));
});
