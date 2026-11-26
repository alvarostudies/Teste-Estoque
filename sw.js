// A versão diferencia este cache dos anteriores e força a atualização dos arquivos locais.
const CACHE_NAME = "estoque-loja-v4";

// Lista os arquivos da interface disponíveis mesmo quando o dispositivo estiver offline.
const ARQUIVOS_ESTATICOS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instala o service worker, pré-carrega os arquivos essenciais e assume o controle rapidamente.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

// Ativa a nova versão removendo caches antigos que não correspondam ao nome atual.
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

// Para arquivos locais, prefere o cache e grava respostas de rede para uso offline futuro.
// Pedidos externos (como o endpoint do Apps Script) passam direto para a rede.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Não intercepta outros domínios nem operações POST, que precisam chegar ao servidor.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  // Estratégia cache-first: usa o arquivo já armazenado e consulta a rede quando não houver cópia.
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
