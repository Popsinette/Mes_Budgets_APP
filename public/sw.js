/* Service worker de Mes Budgets : rend la PWA utilisable hors ligne.
 * - Pages (navigations) : réseau d'abord, cache en secours → les mises à jour
 *   arrivent dès qu'on est en ligne, et l'app s'ouvre quand même hors ligne.
 * - Ressources (JS, images, polices, wasm) : cache d'abord → démarrage rapide. */

// Incrémenter à chaque changement d'icônes ou de ressources statiques : les
// anciens caches sont purgés à l'activation.
const CACHE_NAME = 'mes-budgets-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('.'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
