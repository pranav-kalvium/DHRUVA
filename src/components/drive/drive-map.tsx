"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OnlineFrame } from "@/engine/iov/pipeline-online";
import type { MatchRoute } from "@/engine/iov/map-matching";

/**
 * Real-map navigation display for the drive player. Layers:
 *  - thin gray track: recorded GNSS truth so far (reference)
 *  - navy track: DHRUVA fused estimate so far
 *  - amber dashed segment: the portion estimated on inertial only (DR)
 *  - uncertainty circle: filter 1-sigma (amber during DR, green on GNSS)
 *  - vehicle marker: fused position + heading
 *  - small hollow dot: recorded GNSS truth at the same instant (compare)
 */

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export function DriveMap({
  route,
  frame,
  className,
}: {
  route: MatchRoute;
  frame: OnlineFrame | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const truthLineRef = useRef<L.Polyline | null>(null);
  const fusedLineRef = useRef<L.Polyline | null>(null);
  const vehicleRef = useRef<L.Marker | null>(null);
  const sigmaRef = useRef<L.Circle | null>(null);
  const truthDotRef = useRef<L.CircleMarker | null>(null);
  const didFitRef = useRef(false);
  const [follow, setFollow] = useState(true);
  const [tileFailed, setTileFailed] = useState(false);

  // Truth and fused tracks so far (memo per frame index).
  const truthLatLngs = useMemo(() => {
    if (!frame) return [];
    // frame.index samples consumed; truth history is the recording prefix.
    // We rebuild from the frame history the parent keeps is expensive; instead
    // the parent passes accumulated polylines via frame (see DriveJourney).
    return (frame.tracks?.truth ?? []).map((p) => L.latLng(p.lat, p.lng));
  }, [frame]);

  const fusedLatLngs = useMemo(
    () => (frame?.tracks?.fused ?? []).map((p) => L.latLng(p.lat, p.lng)),
    [frame],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [route.points[0].lat, route.points[0].lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTR,
      maxZoom: 19,
    }).on("tileerror", () => setTileFailed(true)).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    truthLineRef.current = L.polyline([], {
      color: "#7d97b5",
      weight: 2.5,
      opacity: 0.9,
    }).addTo(map);
    fusedLineRef.current = L.polyline([], {
      color: "#0a2540",
      weight: 4.5,
      opacity: 0.95,
    }).addTo(map);
    sigmaRef.current = L.circle([route.points[0].lat, route.points[0].lng], {
      radius: 7,
      color: "#f59e0b",
      weight: 1,
      fillColor: "#f59e0b",
      fillOpacity: 0.12,
    }).addTo(map);
    truthDotRef.current = L.circleMarker([route.points[0].lat, route.points[0].lng], {
      radius: 4,
      color: "#16406a",
      weight: 1.5,
      fill: false,
    }).addTo(map);

    const icon = L.divIcon({
      className: "dhruva-vehicle-icon",
      html: '<div class="dhruva-vehicle" id="dhruva-vehicle-el"><div class="dhruva-vehicle-arrow"></div></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    vehicleRef.current = L.marker([route.points[0].lat, route.points[0].lng], {
      icon,
      zIndexOffset: 1000,
    }).addTo(map);

    mapRef.current = map;
    const bounds = L.latLngBounds(route.points.map((p) => L.latLng(p.lat, p.lng)));
    map.fitBounds(bounds, { padding: [24, 24] });
    didFitRef.current = true;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [route]);

  // Per-frame updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frame) return;

    truthLineRef.current?.setLatLngs(truthLatLngs);
    fusedLineRef.current?.setLatLngs(fusedLatLngs);

    const pos = L.latLng(frame.lat, frame.lng);
    vehicleRef.current?.setLatLng(pos);
    sigmaRef.current?.setLatLng(pos);
    sigmaRef.current?.setRadius(Math.max(6, frame.sigmaM));
    const dr = frame.deadReckoning;
    sigmaRef.current?.setStyle({
      color: dr ? "#f59e0b" : "#047857",
      fillColor: dr ? "#f59e0b" : "#047857",
      fillOpacity: dr ? 0.16 : 0.1,
    });
    if (frame.truth) {
      truthDotRef.current?.setLatLng(L.latLng(frame.truth.lat, frame.truth.lng));
    }

    // Rotate the vehicle arrow to heading.
    const el = document.getElementById("dhruva-vehicle-el");
    if (el) el.style.transform = `rotate(${frame.headingDeg}deg)`;

    if (follow) map.panTo(pos, { animate: true, duration: 0.25 });
  }, [frame, truthLatLngs, fusedLatLngs, follow]);

  const toggleFollow = () => {
    setFollow((f) => {
      const next = !f;
      if (next && frame && mapRef.current) {
        mapRef.current.panTo([frame.lat, frame.lng]);
      }
      return next;
    });
  };

  return (
    <div className={`map-surface relative overflow-hidden ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={toggleFollow}
        aria-pressed={follow}
        className="absolute right-2 top-2 z-[500] rounded-[8px] border border-line bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-ink-900 shadow-sm hover:bg-steel-50"
      >
        {follow ? "Following" : "Free view"}
      </button>
      {tileFailed && (
        <div className="absolute bottom-8 left-2 z-[500] max-w-[70%] rounded-[8px] border border-amber-pill-border bg-amber-pill/90 px-2.5 py-1.5 text-xs text-ink-900">
          Map tiles unreachable. The journey continues on recorded geometry; tiles resume when
          the network returns.
        </div>
      )}
    </div>
  );
}
