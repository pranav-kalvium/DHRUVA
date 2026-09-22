"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveFrame } from "@/engine/iov/live-engine";

/**
 * Live navigation map. Layers:
 *  - OSM tiles (real map)
 *  - GNSS track: thin gray (the raw fixes)
 *  - fused track: navy (the displayed estimate)
 *  - DR segment: amber dashed (path estimated inertially during outages)
 *  - uncertainty circle around the displayed position
 *  - vehicle marker rotated to heading
 *  - when GNSS is present: hollow gray dot at the raw fix (compare vs DR)
 */

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export function LiveMap({ frame, className }: { frame: LiveFrame | null; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const gnssLineRef = useRef<L.Polyline | null>(null);
  const fusedLineRef = useRef<L.Polyline | null>(null);
  const drLineRef = useRef<L.Polyline | null>(null);
  const vehicleRef = useRef<L.Marker | null>(null);
  const sigmaRef = useRef<L.Circle | null>(null);
  const gnssDotRef = useRef<L.CircleMarker | null>(null);
  const didCenterRef = useRef(false);
  const [follow, setFollow] = useState(true);
  const [tileFailed, setTileFailed] = useState(false);

  // Trims for the DR (amber) segment: the fused track since the last GNSS
  // anchor. We rebuild from frame tracks each render; they are small (one
  // point per render tick at 10 Hz, minutes of session = a few thousand).
  const fusedLatLngs = (frame?.fusedTrack ?? []).map((p) => L.latLng(p.lat, p.lng));
  const gnssLatLngs = (frame?.gnssTrack ?? []).map((p) => L.latLng(p.lat, p.lng));

  // Where the last GNSS-anchored segment ended: the amber DR overlay runs
  // from that point to the current estimate.
  const lastAnchorIdx = (() => {
    if (!frame?.deadReckoning) return -1;
    // Amber from the end of the shared (pre-outage) region.
    return Math.max(0, fusedLatLngs.length - Math.max(1, Math.round((frame.outageSeconds || 0) * 10)));
  })();
  const drSegment = frame?.deadReckoning && lastAnchorIdx > 0 && lastAnchorIdx < fusedLatLngs.length - 1
    ? fusedLatLngs.slice(lastAnchorIdx)
    : [];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20.5937, 78.9629], // India centroid until the first fix arrives
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: OSM_ATTR,
      maxZoom: 19,
    }).on("tileerror", () => setTileFailed(true)).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    gnssLineRef.current = L.polyline([], {
      color: "#5f7a94",
      weight: 2,
      opacity: 0.6,
    }).addTo(map);
    fusedLineRef.current = L.polyline([], {
      color: "#0a2540",
      weight: 4,
      opacity: 0.9,
    }).addTo(map);
    drLineRef.current = L.polyline([], {
      color: "#b45309",
      weight: 4,
      opacity: 0.9,
      dashArray: "7 6",
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;transform:rotate(0deg)">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                 <path d="M12 3l7 16-7-4-7 4 7-16z" fill="#0a2540" stroke="#ffffff" stroke-width="1.4"/>
               </svg>
             </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    vehicleRef.current = L.marker([20.5937, 78.9629], { icon, zIndexOffset: 1000 }).addTo(map);

    sigmaRef.current = L.circle([20.5937, 78.9629], {
      radius: 10,
      color: "#b45309",
      weight: 1.2,
      fillColor: "#f59e0b",
      fillOpacity: 0.14,
    }).addTo(map);

    gnssDotRef.current = L.circleMarker([0, 0], {
      radius: 5,
      color: "#5f7a94",
      weight: 1.5,
      fill: false,
    });
    // Not added to the map yet: it only appears when a GNSS fix exists.

    mapRef.current = map;
    // Size-safe init: the container may have had zero height when mounted.
    window.setTimeout(() => map.invalidateSize(), 60);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frame) return;

    gnssLineRef.current?.setLatLngs(gnssLatLngs);
    fusedLineRef.current?.setLatLngs(fusedLatLngs);

    // DR segment: a single reusable dashed polyline, shown only during an
    // outage (the inertial path since the last GNSS anchor). Before this fix
    // a new layer was added on every render and never removed.
    if (drLineRef.current) {
      if (drSegment.length > 1) {
        drLineRef.current.setLatLngs(drSegment);
        if (!map.hasLayer(drLineRef.current)) drLineRef.current.addTo(map);
      } else if (map.hasLayer(drLineRef.current)) {
        map.removeLayer(drLineRef.current);
      }
    }

    // Vehicle marker + heading rotation.
    if (vehicleRef.current) {
      vehicleRef.current.setLatLng([frame.lat, frame.lng]);
      const el = vehicleRef.current.getElement()?.firstElementChild as HTMLElement | undefined;
      if (el) el.style.transform = `rotate(${frame.headingDeg}deg)`;
    }

    // Uncertainty circle: amber during DR, blue-green while GNSS-anchored.
    if (sigmaRef.current) {
      sigmaRef.current.setLatLng([frame.lat, frame.lng]);
      sigmaRef.current.setRadius(Math.max(4, frame.sigmaM));
      sigmaRef.current.setStyle(
        frame.deadReckoning
          ? { color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.15 }
          : { color: "#1d4f83", fillColor: "#2a639c", fillOpacity: 0.12 },
      );
    }

    // Raw GNSS compare dot.
    if (gnssDotRef.current) {
      if (frame.gnss) {
        gnssDotRef.current.setLatLng([frame.gnss.lat, frame.gnss.lng]);
        if (!map.hasLayer(gnssDotRef.current)) gnssDotRef.current.addTo(map);
      } else if (map.hasLayer(gnssDotRef.current)) {
        map.removeLayer(gnssDotRef.current);
      }
    }

    if (follow) {
      map.setView([frame.lat, frame.lng], Math.max(map.getZoom(), 17), { animate: true });
    }
  }, [frame, follow, fusedLatLngs, gnssLatLngs, drSegment]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {tileFailed && (
        <div
          role="status"
          className="absolute inset-x-2 top-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          Map tiles are unreachable. Position, speed and estimation continue on sensor data; the map will repaint when
          the network returns.
        </div>
      )}
      <button
        type="button"
        onClick={() => setFollow((f) => !f)}
        aria-pressed={follow}
        className={`absolute right-12 top-3 z-[500] rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm ${
          follow ? "border-navy-900 bg-navy-900 text-white" : "border-steel-300 bg-white text-navy-900"
        }`}
      >
        {follow ? "Following" : "Follow"}
      </button>
    </div>
  );
}
