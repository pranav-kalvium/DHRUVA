/**
 * Offline tile pre-caching.
 *
 * Fetches OSM raster tiles around a position for a set of zoom levels so the
 * map renders with zero connectivity later (the tunnel use case). The service
 * worker intercepts each fetch and stores it in the tile cache; this module
 * just issues the requests politely (bounded concurrency, sequential zooms).
 *
 * Tile math: standard slippy-map formulas. x = (lon+180)/360 * 2^z,
 * y = (1 - asinh(tan(lat))/pi)/2 * 2^z. Area covered is roughly a
 * radius in tiles per zoom, capped to keep the total a few hundred tiles
 * (a few MB), which is polite to OSM and quick on mobile data.
 *
 * Tiles are (c) OpenStreetMap contributors, ODbL; caching for personal
 * offline navigation use is the intended fair use. Attribution stays on-map.
 */

export interface CacheProgress {
  done: number;
  total: number;
  finished: boolean;
}

const TILE_URL = (z: number, x: number, y: number) =>
  `https://${"abc"[Math.abs(x + y) % 3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`;

function lonToTileX(lonDeg: number, z: number): number {
  return ((lonDeg + 180) / 360) * 2 ** z;
}

function latToTileY(latDeg: number, z: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

/** Zooms and tile radii per level: context far out, detail near the vehicle. */
const PLAN: Array<{ z: number; radiusTiles: number }> = [
  { z: 13, radiusTiles: 1 },
  { z: 15, radiusTiles: 2 },
  { z: 16, radiusTiles: 3 },
  { z: 17, radiusTiles: 6 },
];

export function planTileCount(lat: number, lng: number): number {
  let total = 0;
  for (const { z, radiusTiles } of PLAN) {
    const cx = Math.floor(lonToTileX(lng, z));
    const cy = Math.floor(latToTileY(lat, z));
    total += (2 * radiusTiles + 1) ** 2;
    void cx;
    void cy;
  }
  return total;
}

/** List tile URLs around the position per the plan. */
function tileUrlsAround(lat: number, lng: number): string[] {
  const urls: string[] = [];
  for (const { z, radiusTiles } of PLAN) {
    const cx = Math.floor(lonToTileX(lng, z));
    const cy = Math.floor(latToTileY(lat, z));
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        const n = 2 ** z;
        if (x < 0 || x >= n || y < 0 || y >= n) continue;
        urls.push(TILE_URL(z, x, y));
      }
    }
  }
  return urls;
}

/** Fetch tiles with bounded concurrency; reports progress via callback. */
export async function cacheAreaAround(
  lat: number,
  lng: number,
  onProgress?: (p: CacheProgress) => void,
): Promise<{ cached: number; failed: number }> {
  const urls = tileUrlsAround(lat, lng);
  let done = 0;
  let cached = 0;
  let failed = 0;
  const CONCURRENCY = 5;

  const queue = [...urls];
  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      try {
        // SW intercepts and caches; a cache hit also resolves (already stored).
        const res = await fetch(url, { cache: "no-cache" });
        if (res.ok) cached++;
        else failed++;
      } catch {
        failed++;
      }
      done++;
      onProgress?.({ done, total: urls.length, finished: false });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  onProgress?.({ done, total: urls.length, finished: true });
  return { cached, failed };
}

/** Ask the service worker how many tiles are cached (for the UI indicator). */
export function cachedTileCount(): Promise<number> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      resolve(0);
      return;
    }
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "dhruva:tile-cache-count") {
        navigator.serviceWorker.removeEventListener("message", onMsg);
        resolve(e.data.count ?? 0);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    navigator.serviceWorker.controller?.postMessage("dhruva:tile-cache-count");
    // Resolve 0 if the SW does not answer in 1.5 s (dev mode: SW inactive).
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMsg);
      resolve(0);
    }, 1500);
  });
}
