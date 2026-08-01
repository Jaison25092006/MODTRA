/* NutriScan service worker — offline PWA.
   Cache-first with a versioned cache. Bump CACHE on any asset change
   (e.g. after re-exporting the model) so clients pick up the new files. */
"use strict";

const CACHE = "nutriscan-v3";

// Every asset the app needs to run with zero network. Relative URLs so it
// works under a GitHub Pages subpath (…/<repo>/) as well as at a domain root.
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./tf.min.js",
  "./tf-backend-wasm.min.js",
  "./tfjs-backend-wasm.wasm",
  "./tfjs-backend-wasm-simd.wasm",
  "./tfjs-backend-wasm-threaded-simd.wasm",
  "./web_model/model.json",
  "./web_model/group1-shard1of1.bin",
  "./labels.txt",
  "./label_nutrition.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// Pre-cache everything on install. {cache:"reload"} bypasses the HTTP cache so
// we always store fresh copies. addAll is atomic — if one asset 404s the whole
// install fails, which surfaces a missing-file deploy immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// Drop old versioned caches when a new version activates.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: serve from cache, fall back to network, and for page navigations
// fall back to the cached index.html when fully offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Runtime-cache successful same-origin GETs so anything missed by the
          // precache list is still available offline next time.
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});
