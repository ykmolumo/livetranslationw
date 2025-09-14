// Service Worker for Live Translation App
const CACHE_NAME = 'live-translation-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Files to cache immediately
const STATIC_FILES = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/voice-engine.js',
    '/performance-optimizer.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API requests differently
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle static files
    if (request.method === 'GET') {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return fetch(request)
                        .then((networkResponse) => {
                            // Cache successful responses
                            if (networkResponse.status === 200) {
                                const responseClone = networkResponse.clone();
                                caches.open(DYNAMIC_CACHE)
                                    .then((cache) => {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return networkResponse;
                        })
                        .catch(() => {
                            // Return offline page for navigation requests
                            if (request.mode === 'navigate') {
                                return caches.match('/index.html');
                            }
                        });
                })
        );
    }
});

// Handle API requests with caching strategy
async function handleApiRequest(request) {
    const url = new URL(request.url);
    
    try {
        // Try network first for API requests
        const networkResponse = await fetch(request);
        
        // Cache successful translation responses
        if (networkResponse.ok && url.pathname === '/api/translate') {
            const responseClone = networkResponse.clone();
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, responseClone);
        }
        
        return networkResponse;
    } catch (error) {
        // Fallback to cache for translation requests
        if (url.pathname === '/api/translate') {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
        }
        
        // Return error response
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: 'Network unavailable',
                offline: true 
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Background sync for offline translations
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-translate') {
        event.waitUntil(processOfflineTranslations());
    }
});

async function processOfflineTranslations() {
    // Process any queued translations when back online
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    for (const request of requests) {
        if (request.url.includes('/api/translate')) {
            try {
                await fetch(request);
            } catch (error) {
                console.log('Still offline, will retry later');
            }
        }
    }
}

// Push notifications for translation updates
self.addEventListener('push', (event) => {
    const options = {
        body: 'New translation available',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'View Translation',
                icon: '/icon-check.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icon-close.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Live Translation', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});
