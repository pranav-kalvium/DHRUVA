"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, ExclamationTriangle } from "@/components/ui/icons";
import { cumulativeDistances } from "@/engine/route-geometry";
import type { EngineFrame, RouteData } from "@/engine/types";
import { cn } from "@/lib/utils";

/**
 * Real-map journey view. OpenStreetMap raster tiles via Leaflet, with the
 * DHRUVA layers (uncertainty corridor, driven path, dead-reckoning segment,
 * raw GNSS fixes, vehicle marker) drawn on top as Leaflet vectors.
 *
 * Fallback: if tiles cannot load (fully offline demo), an SVG polyline of the
 * bundled route geometry renders instead so the journey stays usable.
 */

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** Haversine distance in meters. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Interpolate along a latlng polyline at arc distance d (m). */
function pointAtDist(pts: L.LatLng[], cum: number[], d: number): L.LatLng {
  const total = cum[cum.length - 1] ?? 0;
  const dist = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < dist) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (dist - cum[i - 1]) / seg));
  return L.latLng(
    pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f,
    pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f,
  );
}

/** Sub-polyline between two arc distances (inclusive endpoints). */
function slicePath(pts: L.LatLng[], cum: number[], a: number, b: number): L.LatLng[] {
  const out: L.LatLng[] = [];
  const d = Math.max(0, Math.min(cum[cum.length - 1] ?? 0, b));
  const s = Math.max(0, Math.min(d, a));
  out.push(pointAtDist(pts, cum, s));
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > s && cum[i] < d) out.push(pts[i]);
  }
  out.push(pointAtDist(pts, cum, d));
  return out;
}

export function JourneyMap({
  route,
  frame,
  className,
}: {
  route: RouteData;
  frame: EngineFrame;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [tilesOk, setTilesOk] = useState<boolean | null>(null); // null = unknown yet
  const [follow, setFollow] = useState(true);
  const [online, setOnline] = useState(true);

  const pts = useMemo(() => route.points.map((p) => L.latLng(p.lat, p.lng)), [route]);
  const cum = useMemo(() => cumulativeDistances(route.points), [route]);
  const entryPt = useMemo(() => pointAtDist(pts, cum, cum[route.tunnelEntryIndex]), [pts, cum, route]);
  const exitPt = useMemo(() => pointAtDist(pts, cum, cum[route.tunnelExitIndex]), [pts, cum, route]);

  // Online/offline awareness for the fallback notice.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      // Keep the journey interaction simple: pan/zoom via controls only.
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true,
      keyboard: true,
    });
    mapRef.current = map;

    // The map must always have a numeric zoom before any layer math runs;
    // an undefined zoom makes follow-camera Math.max(getZoom(), 15) NaN,
    // which Leaflet reports as "infinite number of tiles".
    map.setView([18.73, 73.54], 13);

    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: OSM_ATTR,
      crossOrigin: true,
    }).addTo(map);
    tileRef.current = tiles;
    let failed = false;
    tiles.on("tileerror", () => {
      if (!failed) {
        failed = true;
        setTilesOk(false);
      }
    });
    tiles.on("tileload", () => {
      if (!failed) setTilesOk(true);
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Fit bounds to the route once, when the map is ready and route changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pts.length === 0) return;
    map.whenReady(() => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
    });
  }, [pts]);

  // Draw the data layers whenever the route or frame changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map);
    }
    const g = layerRef.current;
    g.clearLayers();

    // Uncertainty corridor: buffered corridor polygon around the whole route.
    const halfW = Math.max(6, frame.uncertaintyMeters / 2);
    const corridor: L.LatLng[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const bearing = Math.atan2(next.lng - prev.lng, next.lat - prev.lat);
      const dLat = ((halfW / 111320) * Math.cos(bearing));
      const dLng = ((halfW / (111320 * Math.cos((pts[i].lat * Math.PI) / 180))) * Math.sin(bearing));
      corridor.push(L.latLng(pts[i].lat - dLat, pts[i].lng - dLng));
    }
    const corridorRev = [...pts]
      .map((p, i) => {
        const j = pts.length - 1 - i;
        const prev = pts[Math.max(0, j - 1)];
        const next = pts[Math.min(pts.length - 1, j + 1)];
        const bearing = Math.atan2(next.lng - prev.lng, next.lat - prev.lat);
        const dLat = (halfW / 111320) * Math.cos(bearing);
        const dLng = (halfW / (111320 * Math.cos((pts[j].lat * Math.PI) / 180))) * Math.sin(bearing);
        return L.latLng(pts[j].lat + dLat, pts[j].lng + dLng);
      })
      .reverse();
    L.polygon([...corridor, ...corridorRev], {
      color: "#64819f",
      weight: 1,
      opacity: 0.35,
      fillColor: "#94a3b8",
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(g);

    // Full route (light) and tunnel zone (dark band).
    L.polyline(pts, { color: "#b9c7d8", weight: 6, opacity: 0.9, interactive: false }).addTo(g);
    L.polyline(slicePath(pts, cum, cum[route.tunnelEntryIndex], cum[route.tunnelExitIndex]), {
      color: "#2b3b4e",
      weight: 12,
      opacity: 0.55,
      interactive: false,
    }).addTo(g);

    // Dead-reckoning segment (amber dashed) from portal to current position.
    if (frame.drElapsedS > 1) {
      L.polyline(slicePath(pts, cum, cum[route.tunnelEntryIndex], frame.distance), {
        color: "#f59e0b",
        weight: 5,
        opacity: 0.95,
        dashArray: "9 7",
        interactive: false,
      }).addTo(g);
    }

    // Visited path (navy) up to current position.
    L.polyline(slicePath(pts, cum, 0, frame.distance), {
      color: "#1d4ed8",
      weight: 6,
      opacity: 0.95,
      interactive: false,
    }).addTo(g);

    // Raw GNSS fix (small hollow ring where the phone actually "thinks" it is).
    if (frame.gnss.rawFix) {
      L.circleMarker(L.latLng(frame.gnss.rawFix.lat, frame.gnss.rawFix.lng), {
        radius: 5,
        color: "#1d4ed8",
        weight: 2,
        fill: false,
        opacity: 0.8,
        interactive: false,
      }).addTo(g);
    }

    // Tunnel portals.
    for (const [pt, label] of [
      [entryPt, "Tunnel entry"],
      [exitPt, "Tunnel exit"],
    ] as const) {
      L.circleMarker(pt, { radius: 5, color: "#0a2540", fillOpacity: 1, fillColor: "#0a2540" })
        .bindTooltip(label, { direction: "top", offset: [0, -6] })
        .addTo(g);
    }

    // Vehicle marker (rotating arrow divIcon).
    if (!markerRef.current) {
      markerRef.current = L.marker(pts[0], {
        icon: L.divIcon({
          className: "dhruva-vehicle-icon",
          html: '<div class="dhruva-vehicle"><div class="dhruva-vehicle-arrow"></div></div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(map);
    }
    const veh = pointAtDist(pts, cum, frame.distance);
    markerRef.current.setLatLng(veh);
    const el = markerRef.current.getElement()?.querySelector<HTMLElement>(".dhruva-vehicle");
    if (el) el.style.transform = `rotate(${Math.round(frame.heading)}deg)`;

    // Follow camera.
    if (follow) {
      const z = map.getZoom();
      map.setView(veh, Math.max(Number.isFinite(z) ? z : 15, 15), { animate: true });
    }
  }, [route, frame, pts, cum, entryPt, exitPt, follow]);

  const showFallback = tilesOk === false || !online;

  return (
    <div className={cn("map-surface relative h-full w-full", className)}>
      <div ref={containerRef} className="h-full w-full" />

      {showFallback && (
        <FallbackMap route={route} frame={frame} />
      )}

      {/* Follow control */}
      <div className="absolute right-2.5 top-2.5 z-[500] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setFollow((v) => !v)}
          aria-pressed={follow}
          title={follow ? "Center map on vehicle" : "Free map view"}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-[6px] border shadow-sm transition-colors",
            follow
              ? "border-navy-700 bg-navy-900 text-white"
              : "border-line bg-white text-navy-700 hover:bg-surface-raised",
          )}
        >
          <Crosshair className="h-5 w-5" aria-hidden />
          <span className="sr-only">{follow ? "Vehicle centered on map" : "Center map on vehicle"}</span>
        </button>
      </div>

      {/* Status line: data provenance + offline notice */}
      <div className="pointer-events-none absolute bottom-2 left-2.5 z-[500] flex max-w-[75%] flex-wrap items-center gap-1.5 text-[10px] text-ink-600">
        <span>North up</span>
        <span aria-hidden>|</span>
        <span>
          Map data &copy; OpenStreetMap contributors &middot; route via OSRM &middot;{" "}
          {route.tunnelName.includes("OpenStreetMap") ? "real mapped tunnel" : "illustrative geometry"}
        </span>
        {showFallback && (
          <span className="flex items-center gap-1 rounded-[4px] bg-warn-50 px-1.5 py-0.5 font-semibold text-warn-600">
            <ExclamationTriangle className="h-3 w-3" aria-hidden />
            Offline: showing bundled route sketch
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * SVG fallback used when tiles are unavailable (offline demo, blocked network).
 * Renders the bundled geometry so the journey remains understandable, with a
 * clear label that this is the bundled sketch, not the live map.
 */
function FallbackMap({ route, frame }: { route: RouteData; frame: EngineFrame }) {
  const pts = route.points;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const wM = Math.max(1e-4, (maxLng - minLng) * mPerDegLng);
  const hM = Math.max(1e-4, (maxLat - minLat) * mPerDegLat);
  const W = 1000;
  const H = 700;
  const PAD = 70;
  const scale = Math.min((W - 2 * PAD) / wM, (H - 2 * PAD) / hM);
  const project = (p: { lat: number; lng: number }) => ({
    x: (W - wM * scale) / 2 + (p.lng - minLng) * mPerDegLng * scale,
    y: H - ((H - hM * scale) / 2 + (p.lat - minLat) * mPerDegLat * scale),
  });

  const cum = cumulativeDistances(pts);
  const path = pts.map(project);
  const veh = (() => {
    const d = Math.max(0, Math.min(cum[cum.length - 1], frame.distance));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return {
      x: path[i - 1].x + (path[i].x - path[i - 1].x) * f,
      y: path[i - 1].y + (path[i].y - path[i - 1].y) * f,
    };
  })();

  return (
    <div className="absolute inset-0 z-[400] bg-map-bg" role="img" aria-label="Bundled route sketch (offline fallback for the map)">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        <path d={path.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke="#b9c7d8" strokeWidth="7" strokeLinecap="round" />
        <path d={path.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke="#1d4ed8" strokeWidth="4" strokeDasharray="2 10" opacity={0.001} />
        <circle cx={veh.x} cy={veh.y} r="12" fill="#0a2540" stroke="#fff" strokeWidth="3" />
        <text x={16} y={H - 14} fontSize="15" fill="#4a5568">Bundled route geometry (offline)</text>
      </svg>
    </div>
  );
}
