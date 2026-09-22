import { bearing, destination, haversine } from "./geo";
import type { LatLng, RouteData, SpeedPoint } from "./types";

/** Cumulative distance (m) along a polyline, same length as points. */
export function cumulativeDistances(points: LatLng[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  }
  return cum;
}

export function routeTotalDistance(route: RouteData): number {
  return cumulativeDistances(route.points).at(-1) ?? 0;
}

/** Interpolate a position along the polyline at a given distance (m). */
export function pointAtDistance(route: RouteData, dist: number): LatLng {
  const cum = cumulativeDistances(route.points);
  return pointAtDistanceCached(route, cum, dist);
}

export function pointAtDistanceCached(
  route: RouteData,
  cum: number[],
  dist: number,
): LatLng {
  const total = cum.at(-1) ?? 0;
  const d = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const segStart = cum[i - 1];
  const segLen = cum[i] - segStart || 1;
  const frac = Math.max(0, Math.min(1, (d - segStart) / segLen));
  const a = route.points[i - 1];
  const b = route.points[i];
  return {
    lat: a.lat + (b.lat - a.lat) * frac,
    lng: a.lng + (b.lng - a.lng) * frac,
  };
}

export function headingAtDistance(route: RouteData, cum: number[], dist: number): number {
  const p = pointAtDistanceCached(route, cum, dist);
  const ahead = pointAtDistanceCached(route, cum, dist + 5);
  return bearing(p, ahead);
}

/** Cumulative distance at each polyline vertex (for tunnel index mapping). */
export function tunnelDistances(route: RouteData): { entry: number; exit: number } {
  const cum = cumulativeDistances(route.points);
  const entry = cum[Math.min(route.tunnelEntryIndex, cum.length - 1)];
  const exit = cum[Math.min(route.tunnelExitIndex, cum.length - 1)];
  return { entry, exit };
}

/**
 * Speed profile: piecewise-linear target speed vs distance.
 * Deterministic; encodes realistic approach/inside/exit behaviour.
 */
export function speedProfile(route: RouteData): SpeedPoint[] {
  const cum = cumulativeDistances(route.points);
  const total = cum.at(-1) ?? 0;
  const { entry, exit } = tunnelDistances(route);
  const tl = Math.max(60, exit - entry);
  return [
    { at: 0, speedKmh: 8 },
    { at: Math.max(1, 0.05 * total), speedKmh: 58 },
    { at: Math.max(2, entry - 0.35 * tl), speedKmh: 52 },
    { at: entry, speedKmh: 44 },
    { at: (entry + exit) / 2, speedKmh: 48 },
    { at: exit, speedKmh: 46 },
    { at: Math.min(total, exit + 0.45 * tl), speedKmh: 56 },
    { at: total, speedKmh: 42 },
  ];
}

export function targetSpeedKmh(route: RouteData, cum: number[], dist: number): number {
  const profile = speedProfile(route);
  const total = cum.at(-1) ?? 0;
  const d = Math.max(0, Math.min(total, dist));
  for (let i = 1; i < profile.length; i++) {
    if (d <= profile[i].at) {
      const a = profile[i - 1];
      const b = profile[i];
      const span = b.at - a.at || 1;
      const frac = (d - a.at) / span;
      return a.speedKmh + (b.speedKmh - a.speedKmh) * frac;
    }
  }
  return profile.at(-1)?.speedKmh ?? 40;
}
