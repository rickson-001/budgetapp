// Nova Finance — Service Worker (offline-first)
// Changer V à chaque modification d'un fichier de l'app pour déclencher la mise à jour.
const V = 'nova-finance-v22';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './fonts/fredoka-latin-wght-normal.woff2',
  './fonts/nunito-latin-wght-normal.woff2'
];

// Installation : tout est mis en cache d'un coup. Si un fichier manque, l'installation échoue
// (mieux qu'une app à moitié disponible hors ligne).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const store = (key, res) => {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(V).then(c => c.put(key, copy)).catch(() => {});
  }
  return res;
};

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;

  // Pages : on sert toujours l'app depuis le cache (instantané et hors ligne),
  // et on la rafraîchit en arrière-plan quand le réseau est là.
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(V);
      const hit = await cache.match('./index.html');
      const refresh = fetch('./index.html', { cache: 'no-cache' })
        .then(n => store('./index.html', n))
        .catch(() => null);
      if (hit) { e.waitUntil(refresh); return hit; }
      const net = await refresh;
      return net || new Response('Nova Finance est hors ligne et n\'est pas encore installée. Ouvrez-la une fois avec Internet.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })());
    return;
  }

  // Autres fichiers de l'app (icônes, polices, manifest) : cache d'abord.
  e.respondWith((async () => {
    const hit = await caches.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try { return store(r, await fetch(r)); }
    catch (_) { return new Response('', { status: 504 }); }
  })());
});
