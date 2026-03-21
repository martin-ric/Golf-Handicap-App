const CACHE_NAME = 'golf-handicap-v6';
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'courses.json'
];

// Install the Service Worker and cache the essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching shell assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: delete old caches and take control of all open tabs immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (key) { return key !== CACHE_NAME; })
              .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Fetching files: Try network first, fall back to cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});