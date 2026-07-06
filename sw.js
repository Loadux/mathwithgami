const CACHE_NAME = "gami-math-v3";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./pwa-icon-512.png",
  "./assets/jump.webp",
  "./assets/think.webp",
  "./assets/ok.webp",
  "./assets/wave.webp",
  "./assets/point.webp",
  "./assets/dance.webp",
  "./assets/levitate.webp",
  "./assets/nice.webp",
  "./assets/sit.webp",
  "./assets/stretch.webp",
  "./assets/tear.webp",
  "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails atomically if any single asset fails; cache each
      // individually so one miss (e.g. running from a different filename
      // locally) doesn't kill offline support for everything else.
      return Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // CACHE-FIRST STRATEGY
  // We manually control updates from the UI via HEAD requests.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === "navigate" || event.request.destination === "document") {
          return caches.match("./");
        }
        return Response.error();
      });
    })
  );
});
