const CACHE_NAME = 'wsal-el-bus-v3';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './weather.js',
    './tile-cache.js',
    './leaflet.css',
    './leaflet.js',
    './images/icon16.png',
    './images/icon48.png',
    './images/icon128.png',
    './images/icon192.png',
    './images/icon512.png'
];

// Install event - cache static resources only
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Service Worker: Caching static files');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: Activating...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('🗑️ Service Worker: Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve static files from cache, let tile-cache.js handle tiles
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // DON'T cache tiles - let tile-cache.js handle that
    if (url.hostname.includes('tile.openstreetmap.org')) {
        return; // Let the request pass through to tile-cache.js
    }

    // Cache-first strategy for static assets only
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
