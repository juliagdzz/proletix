// Guarda la app para que abra rápido y funcione sin conexión. Sube CACHE al cambiar este archivo.
const CACHE = "proletia-v2";
const SHELL = [
  "/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon.svg",
  "https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js",
];
const RUNTIME = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // La página: primero la red (para ver siempre la última versión) y, sin conexión, la guardada
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("/", copy)); return r; }).catch(() => caches.match("/")));
    return;
  }
  if (url.origin !== location.origin && !RUNTIME.includes(url.hostname)) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
