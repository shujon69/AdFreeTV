/* ===================================================
   AdFree TV Premium - Service Worker
   Offline Caching + APK Install Support
   =================================================== */

const CACHE_NAME = 'adfreetv-v2.0';
const APK_CACHE = 'adfreetv-apk-v1';

// Core files to cache on install
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/hls.js',
  '/logo/Logo-PNG.png'
];

// Install Event - Cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v2.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets...');
        return cache.addAll(CORE_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err);
          // Cache what we can
          return Promise.allSettled(
            CORE_ASSETS.map(url => cache.add(url).catch(() => {}))
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v2.0...');
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

// Fetch Event - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle APK download requests specially
  if (url.pathname.endsWith('.apk') || url.hostname.includes('github.com') && url.pathname.includes('releases')) {
    event.respondWith(
      caches.open(APK_CACHE).then((cache) => {
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            return cache.match(request);
          });
      })
    );
    return;
  }

  // HLS stream requests - Network only (live streams shouldn't be cached)
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts') || url.pathname.includes('.m3u')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }

  // API / External requests - Network first
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful CDN responses (fonts, icons, etc.)
          if (response.ok && (url.hostname.includes('cdnjs') || url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic'))) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Local assets - Cache first, then network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached but also update cache in background
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
            // Offline fallback
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

// Handle messages from main thread
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

// Background Sync for APK downloads
self.addEventListener('sync', (event) => {
  if (event.tag === 'apk-download-sync') {
    console.log('[SW] Syncing APK download...');
    // Handle background APK download sync
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'AdFree TV Update';
  const options = {
    body: data.body || 'A new update is available!',
    icon: '/logo/Logo-PNG.png',
    badge: '/logo/Logo-PNG.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'download', title: 'Download APK' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'download') {
    event.waitUntil(
      clients.openWindow('https://github.com/Shariar-Ahamed/online-tv-streaming-platform/releases')
    );
  } else {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});
