/* NutriScan service worker — offline PWA.
   Cache-first with a versioned cache. Bump CACHE on any asset change
   (e.g. after re-exporting the model) so clients pick up the new files. */
"use strict";

const CACHE = "nutriscan-v20";

// Files that change whenever the app or model is re-deployed. These are served
// network-first (cache only as an offline fallback) so a stale copy in an old
// cache can never pin the app to an outdated model — the bug where a previously
// cached model.json kept a fused-hardswish graph alive after it had been fixed.
// Everything else (tf.min.js, wasm binaries, icons) stays cache-first.
const NETWORK_FIRST = [/\/$/, /index\.html$/, /web_model\//, /labels\.txt$/, /label_nutrition\.json$/, /foods\.json$/];
const isNetworkFirst = (path) => NETWORK_FIRST.some((re) => re.test(path));

// Every asset the app needs to run with zero network. Relative URLs so it
// works under a GitHub Pages subpath (…/<repo>/) as well as at a domain root.
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./tf.min.js",
  "./supabase.js",
  "./tf-backend-wasm.min.js",
  "./tfjs-backend-wasm.wasm",
  "./tfjs-backend-wasm-simd.wasm",
  "./tfjs-backend-wasm-threaded-simd.wasm",
  "./web_model/model.json",
  "./web_model/group1-shard1of1.bin",
  "./labels.txt",
  "./label_nutrition.json",
  "./foods.json",
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

const putInCache = (req, res) => {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(req, copy));
  }
  return res;
};
const offlineFallback = (req) =>
  caches.match(req).then((cached) => {
    if (cached) return cached;
    if (req.mode === "navigate") return caches.match("./index.html");
    return Response.error();
  });

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url = null;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // e.g. Google sign-in script
  const path = url.pathname;

  // Network-first for the app shell + model/data: always current when online,
  // still fully usable from cache when offline.
  if (isNetworkFirst(path)) {
    event.respondWith(
      fetch(req).then((res) => putInCache(req, res)).catch(() => offlineFallback(req))
    );
    return;
  }

  // Cache-first for large, stable assets (tf.min.js, wasm, icons).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => putInCache(req, res)).catch(() => offlineFallback(req))
    )
  );
});
