// Копібара — service worker.
// Стратегія: документ (index.html) — network-first, тому встановлений застосунок
// підхоплює зміни при наявності мережі; офлайн — з кешу. Інші ресурси —
// stale-while-revalidate. Кеш-версію бампати не треба для оновлення index.html.

const CACHE = 'kapibara-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // Документ / навігація / index.html — НА МЕРЕЖУ перш за все (свіжа версія).
  const isDoc = req.mode === 'navigate' ||
                (sameOrigin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));

  if (isDoc) {
    e.respondWith(
      fetch(req, { cache: 'reload' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Інші ресурси цього домену — stale-while-revalidate (швидко з кешу, оновлення у фоні).
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Сторонні (Leaflet / тайли OSM) — мережа із запасним кешем.
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
