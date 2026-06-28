const CACHE_NAME = "gami-math-v1";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./pwa-icon-512.png",
  "./manifest.json",
  "https://d3js.org/d3.v7.min.js",
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
