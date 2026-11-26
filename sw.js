const CACHE_NAME = "estoque-loja-v3";
const ARQUIVOS_ESTATICOS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instala e salva os arquivos da interface no cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

// Remove caches de versões antigas ao atualizar o SW
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_NAME)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

// Responde do cache para arquivos locais; ignora requisições externas (ex.: Google Apps Script)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Deixa requisições para outros domínios (como script.google.com) irem direto para a rede
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((respostaRede) => {
          const copia = respostaRede.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return respostaRede;
        })
      );
    })
  );
});
