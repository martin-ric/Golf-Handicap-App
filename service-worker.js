const CACHE_NAME = 'golf-handicap-v5';
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

// Activate the Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
});

// Fetching files: Try network first, fall back to cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});