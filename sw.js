// Service Worker — Meu Painel de Metas
// Estratégia: cache-first para o app shell, com atualização em segundo plano.

const CACHE_VERSION = "metas-v1";
const CACHE_NAME = `meu-painel-de-metas-${CACHE_VERSION}`;

// Caminhos relativos ao escopo do Service Worker — funciona em GitHub Pages
// mesmo quando o site está publicado em um subdiretório (ex: /usuario/repo/).
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/charts.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("meu-painel-de-metas-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Cache-first com atualização em segundo plano (stale-while-revalidate) para
// arquivos do app shell; network-first simples para o restante.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  // Ignora requisições cross-origin (ex: fontes do Google Fonts) — deixa o
  // navegador tratar normalmente, sem quebrar o modo offline do app shell.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));

      return cached || networkFetch;
    })
  );
});
