/**
 * Budget PWA — Service Worker v1.3
 * Pour GitHub Pages : https://rickson-001.github.io/budgetapp/
 */

'use strict';

const CACHE_NAME = 'budget-pwa-v3';
const FONT_CACHE = 'budget-fonts-v3';

// Chemin de base = nom du dépôt
const BASE_PATH = '/budgetapp/';

const CORE_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icon-192.png',
  BASE_PATH + 'icon-512.png'
];

/* --- INSTALL --- */
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des assets');
        return Promise.allSettled(
          CORE_ASSETS.map(asset => 
            cache.add(asset).catch(err => console.warn(`[SW] Échec: ${asset}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* --- ACTIVATE --- */
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  const VALID_CACHES = new Set([CACHE_NAME, FONT_CACHE]);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => !VALID_CACHES.has(key)).map(key => {
          console.log('[SW] Suppression ancien cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* --- FETCH --- */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Google Fonts
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Navigation
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CACHE_NAME));
    return;
  }

  event.respondWith(cacheFirst(req, CACHE_NAME));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    return new Response('Hors ligne', { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match(BASE_PATH + 'index.html');
    return fallback || new Response('Page non disponible', { status: 503 });
  }
}
