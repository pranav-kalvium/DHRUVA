/**
 * GNSS + INS fusion engine.
 *
 * Adaptive fusion of absolute GNSS fixes with the relative dead-reckoning
 * estimate, per the SIH problem statement: "combines GNSS & IMU measurements
 * and provides significant improvement in overall output by eliminating drift
 * errors and providing accurate position and velocity".
 *
 * Architecture: a scalar-information form of a Kalman filter. The DR propagates
 * between fixes; each fix is weighted by its measured quality (HDOP proxy and
 * speed consistency against the filtered speed), and the correction is fed
 * back to reset DR state. This is the statistical fusion tier; the problem
 * statement's learned fusion model plugs in here in v1.1 (same interfaces,
 * different gain computation).
 */

import { haversine } from "../geo";
import { DeadReckoner, type DrState, type MatchRoute } from "./map-matching";

/** A GNSS fix as delivered by the platform or a dataset. */
export interface GnssFix {
  t: number;
  lat: number;
  lng: number;
  /** Horizontal dilution of precision when exposed; undefined otherwise. */
  hdop?: number;
  /** Satellites used in the fix when exposed; undefined otherwise. */
  satellites?: number;
  /** Fix-reported speed, m/s, when available. */
  speedMps?: number;
}

/** Fused output frame. */
export interface FusionFrame {
  t: number;
  lat: number;
  lng: number;
  headingDeg: number;
  /** Fused speed, m/s. */
  speedMps: number;
  /** 1-sigma position uncertainty, metres. */
  sigmaM: number;
  /** Positioning source of this frame. */
  source: "gnss" | "ins" | "fused";
  /** True when this cycle ran on inertial only. */
  deadReckoning: boolean;
  drState: DrState;
}

/** Gate: fixes failing this check are rejected (quality-gated reacquisition). */
export interface FusionGate {
  maxHdop: number;
  /** Max plausible |fix speed - DR speed| disagreement, m/s. */
  maxSpeedDisagreementMps: number;
  /** Reject fixes further than this from the current estimate, metres. */
  maxJumpM: number;
}

export const DEFAULT_GATE: FusionGate = {
  maxHdop: 2.5,
  maxSpeedDisagreementMps: 8,
  // Generous: continuous 10 Hz aiding means drift can never get far, and a
  // rejected aid cycle is retried next cycle anyway. This gate exists to stop
  // a single corrupted fix (multipath spike) from teleporting the solution.
  maxJumpM: 200,
};

/**
 * Course over ground between consecutive fixes, degrees true. Null when the
 * displacement is too small for a meaningful direction (noise dominates).
 */
function courseOverGround(a: { lat: number; lng: number }, b: GnssFix): number | null {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  if (Math.hypot(dLat, dLng) < 0.5) return null;
  return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
}

/**
 * Fusion engine. Owns the DeadReckoner and produces one FusionFrame per push.
 */
export class FusionEngine {
  private dr: DeadReckoner;
  private lastT: number | null = null;
  private lastFixT: number | null = null;
  private lastFixLat = 0;
  private lastFixLng = 0;
  private lastSpeedMps = 0;
  private lastHeadingDeg: number;

  constructor(
    route: MatchRoute,
    init: { lat: number; lng: number; headingDeg: number; sigmaM: number },
    private readonly gate: FusionGate = DEFAULT_GATE,
    /** Injected lateral-accel observation (g) for curvature-aided speed. */
    lateralAccelG: () => number = () => 0,
  ) {
    this.dr = new DeadReckoner(route, init, { matchGateM: 25 }, lateralAccelG);
    this.lastHeadingDeg = init.headingDeg;
  }

  /**
   * Push a DR sample (from the vibration filter + gyro) and optionally the
   * simultaneous GNSS fix. Order: predict with INS, correct with GNSS.
   */
  push(
    sample: { t: number; speedMps: number; yawRateDegPerSec: number },
    fix: GnssFix | null,
  ): FusionFrame {
    const drState = this.dr.push(sample);
    const t = sample.t;
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;

    let lat = drState.lat;
    let lng = drState.lng;
    let sigma = drState.sigmaM;
    let source: FusionFrame["source"] = "ins";
    let deadReckoning = true;

    if (fix && this.acceptFix(fix, drState, dt)) {
      // Aid heading/bias: interval since the previous accepted fix.
      const dtAid = this.lastFixT === null ? 0.1 : t - this.lastFixT;
      if (fix.speedMps !== undefined && fix.speedMps > 2) {
        const course = courseOverGround(
          { lat: this.lastFixLat, lng: this.lastFixLng },
          fix,
        );
        if (course !== null) this.dr.aidHeading(course, dtAid, fix.speedMps);
      }
      this.lastFixT = t;
      this.lastFixLat = fix.lat;
      this.lastFixLng = fix.lng;
      const fixSigma = fix.hdop !== undefined ? Math.max(3, fix.hdop * 4) : 7;
      // Scalar information weighting.
      const wDr = sigma ** 2 / (sigma ** 2 + fixSigma ** 2);
      const wFix = 1 - wDr;
      lat = drState.lat * wDr + fix.lat * wFix;
      lng = drState.lng * wDr + fix.lng * wFix;
      sigma = Math.sqrt((sigma ** 2 * fixSigma ** 2) / (sigma ** 2 + fixSigma ** 2));
      source = wDr < 0.5 ? "gnss" : "fused";
      deadReckoning = false;
      // Feed back the correction into DR state (reset drift).
      this.dr.correct({ lat, lng, sigmaM: sigma });
    }

    const speedMps = fix && !deadReckoning && fix.speedMps !== undefined
      ? 0.7 * drState.speedMps + 0.3 * fix.speedMps
      : drState.speedMps;

    return {
      t,
      lat,
      lng,
      headingDeg: drState.headingDeg,
      speedMps,
      sigmaM: sigma,
      source,
      deadReckoning,
      drState,
    };
  }

  /** Quality gate: reject degraded fixes and implausible jumps. */
  private acceptFix(fix: GnssFix, dr: DrState, dt: number): boolean {
    if (fix.hdop !== undefined && fix.hdop > this.gate.maxHdop) return false;
    if (
      fix.satellites !== undefined &&
      fix.satellites < 4 &&
      fix.hdop === undefined
    ) {
      return false;
    }
    if (
      fix.speedMps !== undefined &&
      Math.abs(fix.speedMps - dr.speedMps) > this.gate.maxSpeedDisagreementMps
    ) {
      return false;
    }
    const jump = haversine({ lat: dr.lat, lng: dr.lng }, fix);
    if (jump > this.gate.maxJumpM) return false;
    return true;
  }
}
