import { seededRandom } from "./geo";
import type { GnssSample, LatLng, RouteData } from "./types";
import { cumulativeDistances, pointAtDistanceCached } from "./route-geometry";

/** Satellite counts by quality band, deterministic per schedule design. */
const SATELLITES = {
  NO_FIX: 3,
  POOR: 7,
  FAIR: 10,
  GOOD: 14,
} as const;

/** Reacquisition quality gate: fixes must be at or below this HDOP. */
export const GATE_HDOP_MAX = 2.5;

export type GnssBand = "GOOD" | "FAIR" | "POOR" | "NO_FIX";

export interface GnssSchedulePoint {
  /** Distance along route (m) where this band begins. */
  at: number;
  quality: GnssBand;
}

/**
 * Deterministic GNSS quality schedule over route distance.
 * Shape: GOOD approach, FAIR as the tunnel nears, POOR under the portal
 * canopy, NO_FIX inside the tunnel, then POOR briefly, FAIR and GOOD after
 * the exit. Anchors are tunnel-length-relative so any compact route gets
 * the full arc.
 */
export function buildGnssSchedule(route: RouteData): GnssSchedulePoint[] {
  const cum = cumulativeDistances(route.points);
  const total = cum.at(-1) ?? 0;
  const entry = cum[Math.min(route.tunnelEntryIndex, cum.length - 1)];
  const exit = cum[Math.min(route.tunnelExitIndex, cum.length - 1)];
  const tl = Math.max(60, exit - entry);
  return [
    { at: 0, quality: "GOOD" },
    { at: Math.max(0, entry - 1.6 * tl), quality: "FAIR" },
    { at: Math.max(0, entry - 0.45 * tl), quality: "POOR" },
    { at: entry, quality: "NO_FIX" },
    { at: Math.min(total, exit + 0.05 * tl), quality: "POOR" },
    { at: Math.min(total, exit + 0.15 * tl), quality: "FAIR" },
    { at: Math.min(total, exit + 0.5 * tl), quality: "GOOD" },
    { at: total, quality: "GOOD" },
  ];
}

export function gnssBandAt(
  schedule: GnssSchedulePoint[],
  dist: number,
): GnssBand {
  let band: GnssBand = schedule[0]?.quality ?? "GOOD";
  for (const p of schedule) {
    if (dist >= p.at) band = p.quality;
  }
  return band;
}

const HDOP_BY_BAND: Record<GnssBand, number> = {
  GOOD: 0.9,
  FAIR: 1.8,
  POOR: 4.2,
  NO_FIX: 99,
};

const SIGMA_BY_BAND: Record<GnssBand, number> = {
  GOOD: 4,
  FAIR: 9,
  POOR: 18,
  NO_FIX: 0,
};

export interface ReceiverSample {
  band: GnssBand;
  hdop: number;
  satellites: number;
  rawFix: LatLng | null;
  /** Receiver would emit a position for this sample. */
  hasFix: boolean;
  /** Fix passes the DHRUVA quality gate (usable for absolute correction). */
  passesGate: boolean;
}

/** Deterministic GNSS receiver sample for a given route distance. */
export function sampleGnss(
  route: RouteData,
  cum: number[],
  schedule: GnssSchedulePoint[],
  dist: number,
  rng: () => number,
): ReceiverSample {
  const band = gnssBandAt(schedule, dist);
  const hdop = HDOP_BY_BAND[band];
  const satellites = SATELLITES[band];
  let rawFix: LatLng | null = null;
  if (band !== "NO_FIX") {
    const truth = pointAtDistanceCached(route, cum, dist);
    const sigma = SIGMA_BY_BAND[band];
    const angle = rng() * Math.PI * 2;
    const mag = sigma * Math.sqrt(-2 * Math.log(1 - rng() * 0.999)) * 0.5;
    rawFix = {
      lat: truth.lat + (mag * Math.cos(angle)) / 111320,
      lng:
        truth.lng +
        (mag * Math.sin(angle)) /
          (111320 * Math.cos((truth.lat * Math.PI) / 180) || 1),
    };
  }
  return {
    band,
    hdop,
    satellites,
    rawFix,
    hasFix: rawFix !== null,
    passesGate: rawFix !== null && hdop <= GATE_HDOP_MAX,
  };
}

/** Exported for tests and the engine: deterministic rng factory. */
export { seededRandom as makeRng };
