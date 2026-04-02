/**
 * Budget PWA — Service Worker v2.0
 * Pour GitHub Pages : https://rickson-001.github.io/budgetapp/
 */

'use strict';

const CACHE_NAME = 'budget-pwa-v4';
const FONT_CACHE = 'budget-fonts-v4';

// Le chemin de base absolu
const BASE_URL = self.location.origin + '/budgetapp/';

const CORE_ASSETS = [
  BASE_URL,
  BASE_URL + 'index.html',
  BASE_URL + 'manifest.json',
  BASE_URL + 'icon-192.png',
  BASE_URL + 'icon-512.png'
];

console.log('[SW] BASE_URL =', BASE_URL);
console.log('[SW] CORE_ASSETS =', CORE_ASSETS);

/* --- INSTALL --- */
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('[SW] Mise en cache des assets');
        for (const asset of CORE_ASSETS) {
          try {
            await cache.add(asset);
            console.log('[SW] ✅ Mis en cache:', asset);
          } catch (err) {
            console.warn('[SW] ❌ Échec:', asset, err);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

/* --- ACTIVATE --- */
self.addEventListener('activate', event => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== FONT_CACHE) {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* --- FETCH --- */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorer les requêtes non GET
  if (req.method !== 'GET') return;

  // Google Fonts
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Pour les requêtes de navigation (pages HTML)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CACHE_NAME));
    return;
  }

  // Pour les autres ressources
  event.respondWith(cacheFirst(req, CACHE_NAME));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    return new Response('Ressource non disponible hors ligne', { status: 404 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      return cached;
    }
    // Fallback vers la page d'accueil
    const fallback = await cache.match(BASE_URL + 'index.html');
    if (fallback) {
      return fallback;
    }
    return new Response('Page non disponible hors ligne', { status: 404 });
  }
}
