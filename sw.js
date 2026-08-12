const CACHE_NAME = "gami-math-v10";
// Books the user explicitly chose to keep offline. Deliberately NOT version-
// stamped: the shell cache is wiped on every deploy, and downloaded books must
// survive that. Only the user removes books.
const BOOKS_CACHE = "gami-books-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./Math_with_Gami.html",
  "./manifest.json",
  "./pwa-icon-512-modified.png",
  "./assets/face_icon.png",
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
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== BOOKS_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// The Full Depth library is ~410 MB of PDFs. Auto-caching those would blow the
// origin's storage quota and get the WHOLE cache evicted, taking offline
// support down with it. So a PDF is stored ONLY when the user explicitly taps
// "Keep offline" (the page writes it into BOOKS_CACHE itself). Here we just
// serve whatever they chose to keep, and stream everything else from network.
function isPdf(request) {
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.pathname.toLowerCase().endsWith(".pdf");
}

function isHttp(request) {
  const p = new URL(request.url).protocol;
  return p === "http:" || p === "https:";
}

// PDF viewers routinely ask for byte ranges. A cached entry is a full 200
// response, so satisfy Range ourselves rather than handing back the whole file
// and hoping the viewer copes.
async function serveRange(request, cached) {
  const range = request.headers.get("range");
  if (!range) return cached;
  const buf = await cached.arrayBuffer();
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return cached;
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (isNaN(start) || start >= buf.byteLength) return cached;
  const stop = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, stop + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/pdf",
      "Content-Length": String(stop - start + 1),
      "Content-Range": "bytes " + start + "-" + stop + "/" + buf.byteLength,
      "Accept-Ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isHttp(event.request)) return;

  // PDFs: serve a kept-offline copy if there is one, otherwise straight to the
  // network. Never stored here — only the user's explicit "Keep offline" does that.
  if (isPdf(event.request)) {
    event.respondWith(
      caches.open(BOOKS_CACHE)
        .then((c) => c.match(event.request, { ignoreSearch: true, ignoreVary: true }))
        .then((hit) => (hit ? serveRange(event.request, hit) : fetch(event.request)))
        .catch(() => fetch(event.request))
    );
    return;
  }

  // NETWORK-FIRST STRATEGY
  // Always try the network first to get the latest update.
  // If offline, fall back to the cached version.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Network succeeded: update the cache with the fresh response
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, copy).catch(() => {})
          );
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
