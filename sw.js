const CACHE_NAME = "gami-math-v4";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./Math_with_Gami.html",
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

  // NETWORK-FIRST STRATEGY
  // Always try the network first to get the latest update.
  // If offline, fall back to the cached version.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Network succeeded: update the cache with the fresh response
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // Network failed (offline): try to serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If the exact request isn't in cache and it's a page load, try the root files
          if (event.request.mode === "navigate" || event.request.destination === "document") {
            return caches.match("./").then(res1 => {
              if (res1) return res1;
              return caches.match("./index.html").then(res2 => {
                if (res2) return res2;
                return caches.match("./Math_with_Gami.html").then(res3 => {
                  return res3 || Response.error();
                });
              });
            });
          }
          return Response.error();
        });
      })
  );
});
