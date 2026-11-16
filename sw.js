// Service worker: permite instalar como app e abre mais rápido.
// Sempre tenta a internet primeiro (dados sempre atualizados); usa a cópia
// guardada só se estiver sem conexão. Dados do Supabase nunca são guardados.
const CACHE = 'gestao-preventivas-v1';
const BASE = ['/', '/app.css', '/app.js', '/config.js', '/logo-vetore.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const permitido = url.origin === self.location.origin || (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com');
  if (!permitido) return; // Supabase e outros: direto na internet

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
