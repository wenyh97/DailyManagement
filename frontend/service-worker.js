const CACHE_NAME = 'daily-management-capture-v1';
const APP_SHELL = [
    './capture.html',
    './css/capture.css',
    './js/auth.js',
    './js/capture.js',
    './manifest.webmanifest',
    './icons/capture-icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);
    const isAppShellRequest = url.origin === self.location.origin && (
        url.pathname.endsWith('/capture.html') ||
        url.pathname.endsWith('/css/capture.css') ||
        url.pathname.endsWith('/js/auth.js') ||
        url.pathname.endsWith('/js/capture.js') ||
        url.pathname.endsWith('/manifest.webmanifest') ||
        url.pathname.endsWith('/icons/capture-icon.svg')
    );

    if (!isAppShellRequest) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    const cloned = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || networkFetch;
        })
    );
});