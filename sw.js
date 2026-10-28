const V = 'budget-v12';
const APP_URL = new URL('./index.html', self.registration.scope).href;
const CORE = [
  new URL('./', self.registration.scope).href,
  APP_URL,
  new URL('./manifest.json', self.registration.scope).href,
  new URL('./icon-192.png', self.registration.scope).href,
  new URL('./icon-512.png', self.registration.scope).href
];
self.addEventListener('install', e => {
  // Refuse une installation partielle : chaque fichier essentiel doit être caché.
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
const put = async (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) await (await caches.open(V)).put(req, res.clone());
  return res;
};
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') {
    // L'application démarre immédiatement depuis le cache, sans attente réseau.
    e.respondWith((async () => {
      const hit = await caches.match(APP_URL);
      if (hit) return hit;
      try { return await put(APP_URL, await fetch(r)); }
      catch { return new Response('Hors ligne : ouvre l’application une première fois avec Internet.', { status: 503 }); }
    })());
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(r);
    if (hit) return hit;
    return put(r, await fetch(r));
  })());
});
