/* ===================================================
   AdFree TV Premium - Service Worker
   Offline Caching + APK Install Support
   =================================================== */

const CACHE_NAME = 'adfreetv-v2.1';
const APK_CACHE = 'adfreetv-apk-v1';

const CORE_ASSETS = [
  '/AdFreeTV/',
  '/AdFreeTV/index.html',
  '/AdFreeTV/style.css',
  '/AdFreeTV/script.js',
  '/AdFreeTV/manifest.json',
  '/AdFreeTV/icon.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v2.1...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets...');
        return cache.addAll(CORE_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err);
          return Promise.allSettled(
            CORE_ASSETS.map(url => cache.add(url).catch(() => {}))
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v2.1...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== APK_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (url.pathname.endsWith('.apk')) {
    event.respondWith(
      caches.open(APK_CACHE).then((cache) => {
        return fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cache.match(request));
      })
    );
    return;
  }

  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts') || url.pathname.includes('.m3u')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (
            url.hostname.includes('cdnjs') ||
            url.hostname.includes('fonts.googleapis') ||
            url.hostname.includes('fonts.gstatic')
          )) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => {
            if (request.destination === 'document') {
              return caches.match('/AdFreeTV/index.html');
            }
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }

  if (event.data && event.data.type === 'CACHE_APK') {
    const apkUrl = event.data.url;
    caches.open(APK_CACHE).then((cache) => {
      cache.add(apkUrl).then(() => {
        console.log('[SW] APK cached for offline install:', apkUrl);
      }).catch((err) => {
        console.warn('[SW] APK cache failed:', err);
      });
    });
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'apk-download-sync') {
    console.log('[SW] Syncing APK download...');
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'AdFree TV Update';
  const options = {
    body: data.body || 'A new update is available!',
    icon: '/AdFreeTV/icon.png',
    badge: '/AdFreeTV/icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/AdFreeTV/'
    },
    actions: [
      { action: 'open', title: 'Open App' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/AdFreeTV/')
  );
});
