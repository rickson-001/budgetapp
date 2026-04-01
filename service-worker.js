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
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Google Fonts
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Navigation (HTML principal)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, CACHE_NAME, CORE_ASSETS[1])); 
    return;
  }

  // Stratégie par défaut
  event.respondWith(networkFirst(req, CACHE_NAME));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req) || (fallbackUrl ? await cache.match(fallbackUrl) : null);
    return cached || new Response("Hors ligne", { status: 503 });
  }
}
