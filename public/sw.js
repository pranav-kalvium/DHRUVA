/*
 * DHRUVA service worker.
 *
 * Goals (mobile-app behavior):
 *  - App shell and pages stay available after first load (network-first for
 *    fresh HTML, cache fallback when offline).
 *  - OpenStreetMap tiles seen once are kept for the session, so replaying the
 *    demo in a tunnel-like dead zone still shows the real map.
 *  - Never cache the Next.js dev pipeline; in development the SW stays
 *    passive so hot reload keeps working.
 *
 * Navigation-assistance prototype. Not a safety-certified positioning system.
 */

const VERSION = "dhruva-v3-live";
const SHELL_CACHE = `${VERSION}-shell`;
const TILE_CACHE = `${VERSION}-tiles`;
// Match any tile subdomain and query-less URL patterns of common raster tile
// servers (OSM at minimum). Cached tiles are what make offline map work.
const TILE_RE = /^https:\/\/[abc]\.tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/offline", "/manifest.webmanifest"]).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // The app can ask for the cache status so the UI can show an honest
  // "offline maps: N tiles cached" indicator.
  if (event.data === "dhruva:tile-cache-count") {
    caches.open(TILE_CACHE).then((c) => c.keys().then((keys) => {
      event.source?.postMessage({ type: "dhruva:tile-cache-count", count: keys.length });
    }));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Passive in development: never interfere with HMR or dev chunks.
  if (url.pathname.startsWith("/_next/")) return;

  // OSM tiles: cache-first when offline, stale-while-revalidate when online.
  // The request is passed through UNMODIFIED: in a WebView (Capacitor APK) the
  // raster <img> request must not be re-fetched with explicit CORS mode from
  // the worker context, which fails and blanks the map. Cached tiles are what
  // makes the map work with no internet at all (the tunnel case).
  if (TILE_RE.test(req.url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit && !navigator.onLine) return hit;
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // Navigations: network-first, fall back to cache, then the offline page.
  // Exception: /live must always answer from cache when offline so the app
  // opens with no connectivity at all (the core use case).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = (await caches.match(req)) || (await caches.match("/live"));
          return (
            cached ||
            (await caches.match("/offline")) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }),
    );
    return;
  }

  // Same-origin static assets from public/ (icons, data): stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
