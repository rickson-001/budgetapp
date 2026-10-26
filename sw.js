const V = 'budget-v8';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') {
    e.respondWith(new Promise(res => {
      const off = () => caches.match('./index.html').then(h => h || caches.match(r)).then(h => res(h || new Response('Hors ligne', { status: 503 })));
      const t = setTimeout(off, 2500);
      fetch(r).then(n => { clearTimeout(t); put('./index.html', n.clone()); res(n); }).catch(() => { clearTimeout(t); off(); });
    }));
    return;
  }
  if (u.origin === location.origin || FONT_HOSTS.includes(u.hostname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(n => put(r, n)).catch(() => hit)));
  }
});
