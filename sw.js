// Cambiá este número cada vez que subas una versión nueva, para que el celular la actualice.
const VERSION = 'papel-v3';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La página: primero internet (para tener lo último), si no hay conexión usa la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(res => { const copia = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copia)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }

  // Íconos, fuentes y demás: primero la copia guardada, si no está la baja y la guarda.
  const mismoSitio = url.origin === location.origin;
  const fuentes = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!mismoSitio && !fuentes) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
    return res;
  })));
});
