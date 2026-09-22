/**
 * Generates the real-route demo data for DHRUVA from OpenStreetMap.
 *
 * Pipeline:
 *   1. Nominatim: locate "Kamshet-1 Tunnel" (OSM way 130710860) and fetch its
 *      LineString geometry -> tunnel portals.
 *   2. OSRM route with via points: start -> portalA -> portalB -> end. The via
 *      points force the drive over the real tunnel carriageway.
 *   3. Verify: portal vertices exist on the geometry, appear in order, and the
 *      distance between them matches the mapped tunnel length (~1 km).
 *   4. Emit src/engine/data/kamshet-route.json
 *
 * Responses are cached in .freebuff/tmp so the script is reproducible offline.
 * Data (c) OpenStreetMap contributors, ODbL. Routing by OSRM demo server.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".freebuff", "tmp");
const OUT = join(ROOT, "src", "engine", "data", "kamshet-route.json");
const UA = "DHRUVA-Prototype/1.0 (student demo; support@dhruva.app)";

const R = 6371000;
const rad = (x) => (x * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function cachedFetch(name, url) {
  const p = join(CACHE, name);
  if (existsSync(p) && readFileSync(p, "utf8").length > 2) {
    console.log(`[cache] ${name}`);
    return readFileSync(p, "utf8");
  }
  console.log(`[fetch] ${url.slice(0, 90)}`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(p, text);
  return text;
}

async function main() {
  // 1. Tunnel geometry via Nominatim.
  const k1 = JSON.parse(
    await cachedFetch(
      "k1.json",
      "https://nominatim.openstreetmap.org/search?q=Kamshet-1%20Tunnel&format=jsonv2&limit=2&countrycodes=in&polygon_geojson=1",
    ),
  );
  const hit = k1[0];
  if (!hit || hit.geojson?.type !== "LineString") throw new Error("tunnel geometry not found");
  const tunnel = hit.geojson.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const portalA = tunnel[0];
  const portalB = tunnel[tunnel.length - 1];
  console.log(`tunnel: ${hit.display_name.split(",")[0]} | osm way ${hit.osm_id} | ${tunnel.length} pts`);

  // 2. Full drive Pune→Mumbai: start 1.3 km ESE of portalA along the tunnel
  //    axis, via both portals, then 1.3 km past the exit portal. Start and end
  //    are derived by extending the portal-to-portal bearing so they snap onto
  //    the correct carriageway (off-road seeds make OSRM loop for many km).
  const ext = (p, kLat, kLng) => ({
    lat: Number((p.lat + kLat).toFixed(6)),
    lng: Number((p.lng + kLng).toFixed(6)),
  });
  const start = ext(portalA, -0.00809, +0.00888); // continue B->A bearing past A
  // End seed picked by probing OSRM: on-carriageway continuation ~3.8 km past
  // the exit portal (closer seeds snap to a service road and loop the route).
  const end = { lat: 18.747, lng: 73.509 };
  const pts = [
    [start.lng, start.lat],
    [portalA.lng, portalA.lat], // via: tunnel entry portal
    [portalB.lng, portalB.lat], // via: tunnel exit portal
    [end.lng, end.lat],
  ];
  const coordsParam = pts.map(([x, y]) => `${x},${y}`).join(";");
  const routeJson = JSON.parse(
    await cachedFetch(
      "drive-via.json",
      `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`,
    ),
  );
  if (routeJson.code !== "Ok") throw new Error(`OSRM: ${routeJson.code}`);
  const route = routeJson.routes[0];
  const c = route.geometry.coordinates; // [lng, lat]

  // 3. Verify via portals sit on the geometry, in order, ~1 km apart.
  const idxOf = (p) => {
    let best = Infinity;
    let bi = -1;
    c.forEach(([lng, lat], i) => {
      const d = haversine({ lat, lng }, p);
      if (d < best) {
        best = d;
        bi = i;
      }
    });
    return { i: bi, off: best };
  };
  const a = idxOf(portalA);
  const b = idxOf(portalB);
  console.log(`portalA idx ${a.i} (off-route ${a.off.toFixed(1)} m), portalB idx ${b.i} (off-route ${b.off.toFixed(1)} m)`);

  const cum = [0];
  for (let i = 1; i < c.length; i++) {
    cum.push(
      cum[i - 1] + haversine({ lat: c[i - 1][1], lng: c[i - 1][0] }, { lat: c[i][1], lng: c[i][0] }),
    );
  }
  const tunnelLen = cum[b.i] - cum[a.i];
  const total = cum[cum.length - 1];
  console.log(`drive: ${(total / 1000).toFixed(2)} km, tunnel ${(tunnelLen).toFixed(0)} m, duration ${Math.round(route.duration)} s`);

  if (a.off > 25 || b.off > 25) throw new Error("portal does not sit on the driven route");
  if (b.i <= a.i) throw new Error("portals out of order");
  if (tunnelLen < 800 || tunnelLen > 1300) throw new Error(`unexpected tunnel length ${tunnelLen.toFixed(0)} m`);
  if (total < 4000 || total > 7000) throw new Error(`unexpected drive length ${(total / 1000).toFixed(2)} km`);

  // Densify to ~15 m spacing so playback and dead reckoning track the real
  // curvature instead of cutting across long OSRM segments. Portal indices
  // are recomputed after densification.
  const STEP = 15;
  const dense = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p1 = { lat: c[i][1], lng: c[i][0] };
    const p2 = { lat: c[i + 1][1], lng: c[i + 1][0] };
    dense.push(p1);
    const seg = haversine(p1, p2);
    const n = Math.floor(seg / STEP);
    for (let k = 1; k <= n; k++) {
      dense.push({
        lat: p1.lat + ((p2.lat - p1.lat) * k) / (n + 1),
        lng: p1.lng + ((p2.lng - p1.lng) * k) / (n + 1),
      });
    }
  }
  dense.push({ lat: c[c.length - 1][1], lng: c[c.length - 1][0] });

  const idxOfDense = (p) => {
    let best = Infinity;
    let bi = -1;
    dense.forEach((q, i) => {
      const d = haversine(q, p);
      if (d < best) {
        best = d;
        bi = i;
      }
    });
    return bi;
  };
  const entryIdx = idxOfDense(portalA);
  const exitIdx = idxOfDense(portalB);

  // 4. Emit.
  const km = (total / 1000).toFixed(1);
  const out = {
    id: "kamshet-tunnel",
    kind: "highway",
    name: "Mumbai-Pune Expressway (Kamshet)",
    region: "Kamshet, Pune district, Maharashtra",
    description:
      `A real ${km} km expressway drive over OpenStreetMap data, crossing the Kamshet-1 twin-tube tunnel. GNSS is strong on the open approach, degrades at the portal, and is reacquired after the exit portal.`,
    tunnelName: `Kamshet-1 Tunnel (OpenStreetMap way ${hit.osm_id})`,
    points: dense.map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
    tunnelEntryIndex: entryIdx,
    tunnelExitIndex: exitIdx,
    source: {
      attribution: "Route and tunnel geometry (c) OpenStreetMap contributors (ODbL); driving path via OSRM.",
      osmTunnelWayId: hit.osm_id,
      generatedAt: new Date().toISOString().slice(0, 10),
      geometry: "OpenStreetMap",
    },
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${OUT} (${out.points.length} pts, entry idx ${entryIdx}, exit idx ${exitIdx})`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
