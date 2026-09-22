/**
 * Advanced map-matching & kinematic constraints.
 *
 * Dead-reckoning core with Non-Holonomic Constraints (NHC) and offline map
 * matching, per the SIH problem statement: "binds the calculated position to
 * known road networks and geometric paths during a dropout" and "it can apply
 * Non-Holonomic Constraints (NHC), assuming a car cannot slide sideways or fly
 * upwards, to dramatically snap the drifting IMU path back onto the actual
 * road grid".
 *
 * State: position (lat/lng), heading, along-route distance, cross-track offset.
 * Prediction integrates forward speed and yaw rate (unicycle model); the NHC
 * update zeroes lateral velocity; map matching snaps onto the known route
 * geometry when the combined score passes, else grows uncertainty.
 *
 * Match scoring: candidates are ranked by route distance plus the mismatch
 * between along-route progress and odometry since the last accepted match.
 * Pure nearest-point matching re-locks onto the wrong passage where a route
 * passes near itself (cross-track zero, along-track wrong); the odometry term
 * resolves that ambiguity, which is the practical role HMM map matching plays
 * in full implementations.
 */

import { destination, haversine } from "../geo";
import type { LatLng } from "../types";

/** One prediction/update cycle input. */
export interface DrSample {
  t: number;
  /** Forward speed, m/s (from the vibration filter). */
  speedMps: number;
  /** Yaw rate, deg/s, clockwise-positive (gyroZ in vehicle frame). */
  yawRateDegPerSec: number;
}

/** Emitted per cycle. */
export interface DrState {
  lat: number;
  lng: number;
  /** Vehicle heading, degrees true. */
  headingDeg: number;
  /** Forward speed used for propagation, m/s. */
  speedMps: number;
  /** Metres travelled since DR start. */
  distanceM: number;
  /** Along-route distance of the last accepted map match, metres. */
  alongM: number;
  /** Perpendicular offset from the matched route centreline, metres. */
  crossTrackM: number;
  /** Standard deviation of the position estimate, metres. */
  sigmaM: number;
  /** Whether the last update snapped to the route. */
  mapMatched: boolean;
}

/** Route geometry contract consumed from the offline map database. */
export interface MatchRoute {
  points: LatLng[];
  /** Cumulative distance at each point, metres. */
  cumulativeM: number[];
}

const DEG2RAD = Math.PI / 180;
const G = 9.80665;

/** Weight of the odometry-consistency term in the match score (metres). */
const ODOMETRY_WEIGHT = 0.35;

function wrap180(d: number): number {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/** Local-metre offset of b relative to a (equirectangular, fine for <2 km). */
function localOffset(a: LatLng, b: LatLng): { east: number; north: number } {
  const north = (b.lat - a.lat) * 111_320;
  const east = (b.lng - a.lng) * 111_320 * Math.cos(a.lat * DEG2RAD);
  return { east, north };
}

/** Route curvature (1/m) at along-route distance s, from finite differences. */
export function curvatureAtDistance(route: MatchRoute, s: number): number {
  const { points, cumulativeM } = route;
  // Binary search for the segment containing s.
  let lo = 0;
  let hi = cumulativeM.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeM[mid] < s) lo = mid;
    else hi = mid;
  }
  // Neighbouring points around s, spaced by the route resolution.
  const i = Math.max(1, Math.min(points.length - 2, lo));
  const p0 = points[i - 1];
  const p1 = points[i];
  const p2 = points[i + 1];
  const o1 = localOffset(p0, p1);
  const o2 = localOffset(p1, p2);
  const d1 = Math.hypot(o1.east, o1.north);
  const d2 = Math.hypot(o2.east, o2.north);
  if (d1 < 1e-6 || d2 < 1e-6) return 0;
  // Turning angle between segments over path length.
  const dot = (o1.east * o2.east + o1.north * o2.north) / (d1 * d2);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  return angle / (d1 + d2);
}

export interface NearestRoutePoint {
  point: LatLng;
  /** Perpendicular distance to the centreline, metres. */
  distanceM: number;
  /** Along-route distance of the matched point, metres. */
  alongM: number;
  /** Route tangent heading at the matched point, degrees true. */
  headingDeg: number;
  index: number;
}

/** Project a point onto the route; brute force over segments (route is small). */
export function nearestOnRoute(route: MatchRoute, p: LatLng): NearestRoutePoint {
  let best = { distanceM: Number.POSITIVE_INFINITY, point: route.points[0], alongM: 0, headingDeg: 0, index: 0 };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const ao = localOffset(a, p);
    const ab = localOffset(a, b);
    const ab2 = ab.east * ab.east + ab.north * ab.north;
    let t = ab2 > 0 ? (ao.east * ab.east + ao.north * ab.north) / ab2 : 0;
    t = Math.max(0, Math.min(1, t));
    const proj = {
      lat: a.lat + t * (b.lat - a.lat),
      lng: a.lng + t * (b.lng - a.lng),
    };
    const d = haversine(p, proj);
    if (d < best.distanceM) {
      const cumA = route.cumulativeM[i - 1];
      const alongM = cumA + t * (route.cumulativeM[i] - cumA);
      const h = (Math.atan2(ab.east, ab.north) * 180) / Math.PI;
      best = { distanceM: d, point: proj, alongM, headingDeg: (h + 360) % 360, index: i };
    }
  }
  return best;
}

/**
 * Dead-reckoning + map-matching filter.
 *
 * `init` fixes the state from the last trusted GNSS fix. Each `push` predicts
 * with the unicycle model, applies NHC (lateral velocity to zero), then snaps
 * to the route when the combined score passes, else grows uncertainty.
 */
export class DeadReckoner {
  private state: DrState;
  private lastT: number | null = null;
  /** Index of the last matched segment; enables O(window) local search. */
  private lastMatchIndex = 1;
  /** Whether a full-route search has been done to seed the local window. */
  private seeded = false;
  /** Consecutive cycles without an accepted match; drives window expansion. */
  private unmatchedStreak = 0;
  /** Estimated gyro bias, deg/s (adapted against GNSS course over ground). */
  private yawBiasDegPerS = 0;
  /** Along-route position at the last accepted match. */
  private alongRefM = 0;
  /** Odometry (distanceM) at the last accepted match. */
  private odomRefM = 0;

  constructor(
    private readonly route: MatchRoute,
    init: { lat: number; lng: number; headingDeg: number; sigmaM: number },
    private readonly opts: {
      /** Process noise per second on position, metres. */
      sigmaGrowMPerS?: number;
      /** Map-matching gate: max cross-track distance to accept a snap, metres. */
      matchGateM?: number;
      /** Segments searched either side of the last match (local window). */
      searchWindow?: number;
    } = {},
    /** Injected lateral-acceleration observation (g units), for curvature-aided speed. */
    private lateralAccelG: () => number = () => 0,
  ) {
    this.state = {
      lat: init.lat,
      lng: init.lng,
      headingDeg: init.headingDeg,
      speedMps: 0,
      distanceM: 0,
      alongM: 0,
      crossTrackM: 0,
      sigmaM: init.sigmaM,
      mapMatched: false,
    };
    this.alongRefM = 0;
    this.odomRefM = 0;
  }

  getState(): DrState {
    return { ...this.state };
  }

  /**
   * Feedback correction from the fusion layer: reseed position, uncertainty
   * (and optionally heading) after an accepted GNSS fix so INS drift does not
   * accumulate between fixes.
   */
  correct(patch: { lat: number; lng: number; sigmaM: number; headingDeg?: number }): void {
    this.state.lat = patch.lat;
    this.state.lng = patch.lng;
    this.state.sigmaM = patch.sigmaM;
    if (patch.headingDeg !== undefined) this.state.headingDeg = patch.headingDeg;
  }

  /**
   * Gyro-bias calibration from an aiding source (GNSS course over ground).
   *
   * While GNSS is available, persistent disagreement between integrated yaw
   * and observed course is attributed to gyro bias and removed, so a later
   * outage integrates bias-free yaw. `dtAid` is the interval since the
   * previous aiding observation; the P-controller equilibrium (residual err
   * = 5 b dt for bias b with per-fix gain 0.2) is folded into the gain so the
   * adaptation converges to the true bias. Runs only while the vehicle moves:
   * course over ground is noise at near-standstill.
   */
  aidHeading(courseDeg: number, dtAid: number, speedMps: number): void {
    if (speedMps < 2 || dtAid <= 0) return;
    const err = wrap180(courseDeg - this.state.headingDeg);
    this.state.headingDeg = (this.state.headingDeg + 0.2 * err + 360) % 360;
    this.yawBiasDegPerS += (0.05 * -err) / (5 * dtAid);
    this.yawBiasDegPerS = Math.max(-2, Math.min(2, this.yawBiasDegPerS));
  }

  get gyroBiasDegPerS(): number {
    return this.yawBiasDegPerS;
  }

  /** Restore a previously learned bias (used when the route model is rebuilt). */
  setGyroBias(biasDegPerS: number): void {
    this.yawBiasDegPerS = Math.max(-2, Math.min(2, biasDegPerS));
  }

  push(sample: DrSample): DrState {
    const dt = this.lastT === null ? 0 : Math.max(0, sample.t - this.lastT);
    this.lastT = sample.t;

    // --- Prediction: unicycle model -----------------------------------------
    // ENU local frame; heading measured clockwise from north.
    const v = sample.speedMps;
    // Remove the calibrated gyro bias before integrating heading.
    const omega = (sample.yawRateDegPerSec - this.yawBiasDegPerS) * DEG2RAD; // rad/s, CW positive
    const h = this.state.headingDeg * DEG2RAD;
    let dEast: number;
    let dNorth: number;
    if (Math.abs(omega) > 1e-6) {
      // Exact arc: east += (v/omega)[cos h - cos(h + omega dt)],
      //            north += (v/omega)[sin(h + omega dt) - sin h].
      const h2 = h + omega * dt;
      dEast = (v / omega) * (Math.cos(h) - Math.cos(h2));
      dNorth = (v / omega) * (Math.sin(h2) - Math.sin(h));
      this.state.headingDeg = (this.state.headingDeg + omega * dt * (180 / Math.PI) + 360) % 360;
    } else {
      dEast = v * dt * Math.sin(h);
      dNorth = v * dt * Math.cos(h);
    }
    const from = { lat: this.state.lat, lng: this.state.lng };
    const moved = destination(
      from,
      (Math.atan2(dEast, dNorth) * 180) / Math.PI,
      Math.hypot(dEast, dNorth),
    );
    this.state.lat = moved.lat;
    this.state.lng = moved.lng;
    this.state.distanceM += v * dt;
    this.state.speedMps = v;

    // --- NHC: a car cannot slide sideways; lateral velocity = 0 --------------
    // In the unicycle model lateral velocity is identically zero, so the NHC
    // update manifests as: cross-track only changes from heading error, and we
    // damp any accumulated lateral drift each cycle.
    this.state.crossTrackM *= 0.98;

    // --- Curvature-aided speed ------------------------------------------------
    // Bicycle model: lateral accel a = v^2 * kappa. On a matched curve of
    // known curvature, the IMU lateral accel makes speed observable without
    // GNSS Doppler or wheel odometry, bounding along-track drift on curves.
    // Uses the previous cycle's match state: the route context is already
    // established, and the observation gates on the current speed anyway.
    if (this.state.mapMatched && v > 3) {
      const kappa = curvatureAtDistance(this.route, this.state.alongM);
      const aLat = Math.abs(this.lateralAccelG()) * G;
      if (kappa > 1 / 500 && aLat > 0.05) {
        const vCurve = Math.sqrt(aLat / kappa);
        // Trust the observation only in a plausible band relative to v.
        if (vCurve > 0.5 * v && vCurve < 1.6 * v) {
          this.state.speedMps = 0.75 * v + 0.25 * vCurve;
        }
      }
    }

    // --- Map matching ---------------------------------------------------------
    // Gate scales with current uncertainty: a tight gate while confident,
    // widening as sigma grows so an outage-degraded state can still re-lock
    // to the road it is actually on (never to a parallel fantasy).
    const sigma = this.state.sigmaM;
    const gate = Math.min(80, Math.max(this.opts.matchGateM ?? 25, sigma));
    const baseWindow = this.opts.searchWindow ?? 200;
    const window = baseWindow * Math.min(8, 1 + Math.floor(this.unmatchedStreak / 50));
    const fullRescan = this.unmatchedStreak > 0 && this.unmatchedStreak % 100 === 0;

    const odomStep = this.state.distanceM - this.odomRefM;

    // Candidate scan: local window while seeded (DR is continuous, so the next
    // match lies near the previous one); expanding window and periodic full
    // rescans until the match re-engages after a drift episode.
    let candidate: NearestRoutePoint;
    let bestScore = Number.POSITIVE_INFINITY;
    if (this.seeded && !fullRescan) {
      const lo = Math.max(1, this.lastMatchIndex - window);
      const hi = Math.min(this.route.points.length - 1, this.lastMatchIndex + window);
      candidate = this.scanRange(lo, hi, { lat: this.state.lat, lng: this.state.lng }, odomStep, bestScore);
      bestScore = candidate.distanceM + ODOMETRY_WEIGHT * Math.abs(candidate.alongM - this.alongRefM - odomStep);
    } else {
      candidate = this.scanRange(1, this.route.points.length - 1, { lat: this.state.lat, lng: this.state.lng }, odomStep, bestScore);
      bestScore = candidate.distanceM + ODOMETRY_WEIGHT * Math.abs(candidate.alongM - this.alongRefM - odomStep);
    }

    if (candidate.distanceM <= gate) {
      this.seeded = true;
      this.unmatchedStreak = 0;
      this.lastMatchIndex = candidate.index;
      // Snap position to centreline. NHC is what keeps this snap honest:
      // without it the DR would wander off-road and lock onto wrong
      // parallel streets.
      this.state.crossTrackM = candidate.distanceM;
      this.state.alongM = candidate.alongM;
      this.alongRefM = candidate.alongM;
      this.odomRefM = this.state.distanceM;
      const corrected = candidate.point;
      this.state.lat = corrected.lat;
      this.state.lng = corrected.lng;
      const tangent = candidate.headingDeg;
      const dh = wrap180(tangent - this.state.headingDeg);
      // A mismatch beyond 60 deg is never physical for a car tracked at 10 Hz:
      // it means the heading state is wrong (post-outage re-lock). Snap it;
      // smaller mismatches blend at up to 30 deg/s, which covers urban
      // intersections without over-trusting straight tangents during
      // sensor glitches.
      if (Math.abs(dh) > 60) {
        this.state.headingDeg = tangent;
      } else {
        const clamp = 30 * dt;
        this.state.headingDeg += Math.max(-clamp, Math.min(clamp, dh));
      }
      this.state.mapMatched = true;
      // Matching reduces uncertainty slowly.
      this.state.sigmaM = Math.max(2, this.state.sigmaM * 0.995);
    } else {
      this.state.mapMatched = false;
      this.unmatchedStreak++;
      this.state.sigmaM += (this.opts.sigmaGrowMPerS ?? 0.35) * dt;
    }

    // --- Uncertainty growth from speed integration ---------------------------
    this.state.sigmaM += 0.02 * v * dt;

    return this.getState();
  }

  /**
   * Scan route segments [lo, hi] and return the candidate with the best
   * combined score: perpendicular distance plus odometry mismatch (the
   * along-route progress the candidate implies versus the distance actually
   * driven since the previous accepted match). This resolves re-locks onto
   * wrong passages where the route passes near itself.
   */
  private scanRange(
    lo: number,
    hi: number,
    p: LatLng,
    odomStep: number,
    _bestScore: number,
  ): NearestRoutePoint {
    let best = {
      distanceM: Number.POSITIVE_INFINITY,
      point: this.route.points[lo],
      alongM: this.route.cumulativeM[lo],
      headingDeg: 0,
      index: lo,
    };
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = Math.max(1, lo); i <= Math.min(this.route.points.length - 1, hi); i++) {
      const a = this.route.points[i - 1];
      const b = this.route.points[i];
      const ao = localOffset(a, p);
      const ab = localOffset(a, b);
      const ab2 = ab.east * ab.east + ab.north * ab.north;
      let t = ab2 > 0 ? (ao.east * ab.east + ao.north * ab.north) / ab2 : 0;
      t = Math.max(0, Math.min(1, t));
      const proj = {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      };
      const d = haversine(p, proj);
      const cumA = this.route.cumulativeM[i - 1];
      const alongM = cumA + t * (this.route.cumulativeM[i] - cumA);
      // Combined score: distance plus odometry mismatch.
      const score = d + ODOMETRY_WEIGHT * Math.abs(alongM - this.alongRefM - odomStep);
      if (score < bestScore) {
        const h = (Math.atan2(ab.east, ab.north) * 180) / Math.PI;
        best = { distanceM: d, point: proj, alongM, headingDeg: (h + 360) % 360, index: i };
        bestScore = score;
      }
    }
    void _bestScore;
    return best;
  }
}
