/**
 * Budget PWA — Service Worker v1.1
 */

'use strict';

const CACHE_NAME  = 'budget-pwa-v1';
const FONT_CACHE  = 'budget-fonts-v1';

// ATTENTION : Vérifie que ces noms de fichiers correspondent EXACTEMENT à tes fichiers sur Netlify
const CORE_ASSETS = [
  '/',
  './index.html', // Si ton fichier s'appelle budget_v6.html, change-le ici en './budget_v6.html'
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

/* --- INSTALL --- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/* --- ACTIVATE --- */
self.addEventListener('activate', event => {
  const VALID = new Set([CACHE_NAME, FONT_CACHE]);
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !VALID.has(k)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

/* --- FETCH --- */
self.addEventListener('fetch', event => {/**
 * Budget PWA — Service Worker v1.2 (corrigé pour GitHub Pages)
 */

'use strict';

const CACHE_NAME = 'budget-pwa-v2';
const FONT_CACHE = 'budget-fonts-v2';

// Chemins absolus (commencent par /) pour GitHub Pages
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* --- INSTALL --- */
self.addEventListener('install', event => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des assets');
        // Ajouter chaque fichier un par un avec gestion d'erreur
        return Promise.allSettled(
          CORE_ASSETS.map(asset => 
            cache.add(asset).catch(err => console.warn(`[SW] Impossible de mettre en cache: ${asset}`, err))
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

  // Ignorer les requêtes non GET
  if (req.method !== 'GET') return;

  // Google Fonts - stratégie cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Pour les requêtes API/navigation
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CACHE_NAME));
    return;
  }

  // Pour les assets statiques
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
    if (fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    console.warn('[SW] Erreur fetch:', req.url, err);
    return new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) {
      return cached;
    }
    // Fallback vers index.html
    const fallback = await cache.match('/index.html');
    return fallback || new Response('Page non disponible hors ligne', { status: 503 });
  }
}
