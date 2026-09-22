/**
 * Live IDR pipeline over real device sensors.
 *
 * Consumes LiveGnssSample + LiveImuSample streams and produces one fused
 * frame per IMU tick:
 *  - fused position (GNSS-anchored when available, inertial otherwise)
 *  - estimated speed (IMU integration + learned blending, GNSS-corrected)
 *  - heading, motion class, uncertainty sigma
 *  - DR-vs-GNSS separation: the honest, continuously-computed drift evidence
 *
 * Time base: everything internal runs on ONE clock. Geolocation timestamps
 * are epoch seconds; DeviceMotion uses performance.now()/1000. pushGnss
 * converts epoch -> the session clock established by the first IMU sample,
 * so staleness checks and outage timing compare like with like. (Before this
 * fix, an epoch-vs-performance mismatch of thousands of seconds made every
 * fix look stale: the app would declare an outage the moment it started.)
 *
 * Map matching runs against the driven trace itself (self-route), built
 * progressively from accepted GNSS fixes - the offline-map stand-in when no
 * regional extract is bundled. Gyro-bias adaptation survives route rebuilds:
 * the bias is re-injected into the new DeadReckoner so calibration is never
 * silently discarded mid-drive.
 *
 * All values are measured or estimated from real sensor input. Nothing is
 * simulated. Navigation-assistance prototype; not safety-certified.
 */

import { VibrationFilter, type MotionClass } from "./vibration-filter";
import { DeadReckoner, type MatchRoute } from "./map-matching";
import { haversine } from "../geo";
import type { AlignmentResult } from "./alignment";
import type { LiveGnssSample, LiveImuSample } from "@/lib/live-sensors";

export type LiveStage =
  | "waiting-gps"
  | "calibrating"
  | "gnss-available"
  | "gnss-degraded"
  | "dhruva-active"
  | "reacquiring"
  | "gnss-restored";

export interface LiveFrame {
  t: number;
  /** Fused (displayed) position. */
  lat: number;
  lng: number;
  /** Raw GNSS fix position at this instant, when one is fresh. */
  gnss: { lat: number; lng: number; accuracyM: number } | null;
  /** Inertial estimate (what DR says right now, anchored or not). */
  dr: { lat: number; lng: number; headingDeg: number; sigmaM: number };
  headingDeg: number;
  speedMps: number;
  /** GNSS-reported speed when a fresh fix exists. */
  gnssSpeedMps: number | null;
  /** Position 1-sigma uncertainty of the displayed estimate, metres. */
  sigmaM: number;
  source: "gnss" | "ins" | "fused";
  deadReckoning: boolean;
  motion: MotionClass;
  stage: LiveStage;
  /** Distance driven since session start, metres. */
  distanceM: number;
  /** Seconds elapsed in the current outage (0 when GNSS healthy). */
  outageSeconds: number;
  /** Cumulative seconds spent without GNSS this session. */
  totalOutageSeconds: number;
  /** Outages completed so far (restored at least once). */
  outageCount: number;
  /** Worst drift observed across all outages, metres. */
  maxDriftM: number | null;
  /**
   * Live drift: separation between the inertial estimate and the concurrent
   * GNSS position, metres. Non-null only during an outage while a degraded
   * fix still arrives (the vehicle is under cover, fixes are multipath-
   * degraded but present): that comparison is the honest drift evidence.
   */
  driftM: number | null;
  /** Drift as a percentage of the distance driven during the outage. */
  driftPct: number | null;
  /** IMU sample rate achieved (measured, not assumed), Hz. */
  imuRateHz: number;
  /** True when the phone's GNSS reports degraded accuracy. */
  gnssDegraded: boolean;
  /** Tracks for the map: raw GNSS fixes and the displayed estimate path. */
  gnssTrack: Array<{ lat: number; lng: number }>;
  fusedTrack: Array<{ lat: number; lng: number }>;
}

const CALIBRATION_SECONDS = 10;
const GNSS_DEGRADED_ACCURACY_M = 25;
const REACQUIRE_SETTLE_FIXES = 3;
/** A fix older than this is treated as lost (outage), seconds. */
const GNSS_STALE_S = 4;
/** Process the estimator at most this fast regardless of phone IMU rate, Hz. */
const MAX_ENGINE_HZ = 50;
/** Hard cap on stored track points: ~13 min at 10 Hz display cadence. */
const MAX_TRACK_POINTS = 8000;

export class LiveIdrEngine {
  private vibration: VibrationFilter;
  private dr: DeadReckoner;
  private alignment: AlignmentResult;

  // --- Single session clock -------------------------------------------------
  /** Session t of the first IMU sample; maps epoch -> session time. */
  private imuT0: number | null = null;
  /** Offset: epochSeconds - sessionSeconds, fixed by the first GNSS fix. */
  private epochOffset: number | null = null;
  private lastImuT: number | null = null;
  private imuCount = 0;
  private imuRateHz = 0;
  /** Throttle: skip engine work between ticks of MAX_ENGINE_HZ. */
  private lastEngineT = -Infinity;

  private lastGnss: LiveGnssSample | null = null;
  private lastCourseFix: { lat: number; lng: number; t: number } | null = null;
  private outageStartT: number | null = null;
  private totalOutageS = 0;
  private outageCount = 0;
  private maxDriftM: number | null = null;
  private distanceM = 0;
  private lastFrameT: number | null = null;

  private calibration: {
    ax: number[];
    ay: number[];
    az: number[];
    compass: number[];
    done: boolean;
  } = { ax: [], ay: [], az: [], compass: [], done: false };

  private stage: LiveStage = "waiting-gps";
  private goodFixesSinceRestore = 0;
  private inOutage = false;

  /** Self-route for map matching: driven trace from accepted fixes. */
  private routePoints: Array<{ lat: number; lng: number }> = [];
  private routeBuiltAt = 0;
  private routeDirty = false;
  /** Gyro bias learned by the current DeadReckoner; carried across rebuilds. */
  private gyroBiasDegPerS = 0;

  /** Tracks for the map display. */
  readonly gnssTrack: Array<{ lat: number; lng: number }> = [];
  readonly fusedTrack: Array<{ lat: number; lng: number }> = [];

  constructor(private readonly opts: { accuracyGateM?: number } = {}) {
    this.alignment = {
      pitchDeg: 0,
      rollDeg: 0,
      yawOffsetDeg: 0,
      confidence: 0,
      mount: "unknown",
      warnings: [],
    };
    this.vibration = new VibrationFilter(this.alignment, MAX_ENGINE_HZ);
    this.dr = this.makeDeadReckoner({ lat: 0, lng: 0, headingDeg: 0, sigmaM: 15 });
  }

  private makeDeadReckoner(init: { lat: number; lng: number; headingDeg: number; sigmaM: number }): DeadReckoner {
    const dr = new DeadReckoner(this.selfRoute(), init, { matchGateM: 30, sigmaGrowMPerS: 0.4 });
    // Carry the learned bias across instances so route rebuilds never
    // silently discard gyro-bias calibration mid-drive.
    dr.setGyroBias(this.gyroBiasDegPerS);
    return dr;
  }

  private selfRoute(): MatchRoute {
    const cum: number[] = [0];
    for (let i = 1; i < this.routePoints.length; i++) {
      cum.push(cum[i - 1] + haversine(this.routePoints[i - 1], this.routePoints[i]));
    }
    return { points: this.routePoints, cumulativeM: cum };
  }

  private rebuildRouteIfNeeded(): void {
    if (!this.routeDirty) return;
    if (this.routePoints.length - this.routeBuiltAt < 20) return;
    this.routeBuiltAt = this.routePoints.length;
    this.routeDirty = false;
    const st = this.dr.getState();
    this.gyroBiasDegPerS = this.dr.gyroBiasDegPerS;
    this.dr = this.makeDeadReckoner({
      lat: st.lat,
      lng: st.lng,
      headingDeg: st.headingDeg,
      sigmaM: Math.min(15, st.sigmaM),
    });
  }

  get alignmentResult(): AlignmentResult {
    return this.alignment;
  }

  /** Convert an epoch timestamp to the session clock. */
  private toSessionT(epochS: number): number {
    if (this.epochOffset === null) return epochS; // provisional until synced
    return epochS - this.epochOffset;
  }

  /** Feed one GNSS fix (epoch-based timestamp). Low rate, ~1 Hz. */
  pushGnss(s: LiveGnssSample): void {
    // Fix the epoch offset once, on the first fix after the clock exists.
    if (this.epochOffset === null && this.imuT0 !== null) {
      this.epochOffset = s.t - this.imuT0;
    }
    const prev = this.lastGnss;
    this.lastGnss = { ...s, t: this.toSessionT(s.t) };
    if (prev === null) this.seedDrIfNeeded(this.lastGnss);
  }

  private seedDrIfNeeded(s: LiveGnssSample): void {
    if (this.routePoints.length > 0) return;
    this.routePoints.push({ lat: s.lat, lng: s.lng });
    this.gnssTrack.push({ lat: s.lat, lng: s.lng });
    this.dr = this.makeDeadReckoner({
      lat: s.lat,
      lng: s.lng,
      headingDeg: s.headingDeg ?? 0,
      sigmaM: Math.max(4, s.accuracyM),
    });
  }

  /** Feed one IMU sample (session-clock timestamp from performance.now). */
  pushImu(s: LiveImuSample): LiveFrame | null {
    // --- Session clock anchor + rate measurement ------------------------------
    this.imuCount++;
    if (this.imuT0 === null) this.imuT0 = s.t;
    const elapsed = s.t - this.imuT0;
    if (elapsed > 0 && this.imuCount % 50 === 0) {
      this.imuRateHz = this.imuCount / elapsed;
    }

    // Throttle the heavy estimator to MAX_ENGINE_HZ; phones fire 100+ Hz.
    // Strict inequality breaks at exact integer-rate feeds (50 Hz input,
    // 50 Hz cap: floating point makes alternate diffs land a hair under the
    // interval and half the frames are dropped). An epsilon of half a tick
    // keeps every-other-frame drops from happening while still capping rate.
    if (s.t - this.lastEngineT < 1 / MAX_ENGINE_HZ - 0.001) return null;
    this.lastEngineT = s.t;

    const G = 9.80665;
    const axG = s.ax / G;
    const ayG = s.ay / G;
    const azG = s.az / G;

    // --- Calibration window ----------------------------------------------------
    if (!this.calibration.done) {
      this.calibration.ax.push(axG);
      this.calibration.ay.push(ayG);
      this.calibration.az.push(azG);
      if (s.compassDeg !== null) this.calibration.compass.push(s.compassDeg);
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      const moving = this.lastGnss !== null && (this.lastGnss.speedMps ?? 0) > 1;
      this.alignment = {
        pitchDeg: (Math.atan2(mean(this.calibration.ax), Math.hypot(mean(this.calibration.ay), mean(this.calibration.az))) * 180) / Math.PI,
        rollDeg: (Math.atan2(mean(this.calibration.ay), Math.hypot(mean(this.calibration.ax), mean(this.calibration.az))) * 180) / Math.PI,
        yawOffsetDeg: this.calibration.compass.length > 10 ? circularMean(this.calibration.compass) : this.alignment.yawOffsetDeg,
        confidence: this.calibration.ax.length > CALIBRATION_SECONDS * 20 ? 0.7 : 0.3,
        mount: "unknown",
        warnings: moving ? [] : ["Calibrating while stationary: yaw alignment refines once the vehicle is moving."],
      };
      if (this.stage === "waiting-gps" && this.calibration.ax.length > 10) {
        this.stage = "calibrating";
      }
      if (elapsed >= CALIBRATION_SECONDS && this.lastGnss !== null) {
        this.calibration.done = true;
        this.vibration = new VibrationFilter(this.alignment, MAX_ENGINE_HZ);
      }
      return null; // no frames until calibrated
    }

    if (this.lastGnss === null) return null;

    // --- GNSS availability state machine (decided first, used everywhere) ------
    const age = s.t - this.lastGnss.t;
    const fresh = age <= GNSS_STALE_S;
    const degraded = fresh && this.lastGnss.accuracyM > (this.opts.accuracyGateM ?? GNSS_DEGRADED_ACCURACY_M);
    const usable = fresh && !degraded;

    if (usable) {
      if (this.inOutage) {
        this.goodFixesSinceRestore++;
        if (this.goodFixesSinceRestore >= REACQUIRE_SETTLE_FIXES) {
          this.stage = "gnss-restored";
          this.inOutage = false;
          this.outageCount++;
        } else {
          this.stage = "reacquiring";
        }
      } else if (this.stage !== "gnss-restored") {
        this.stage = "gnss-available";
      }
      if (this.outageStartT !== null) {
        this.totalOutageS += s.t - this.outageStartT;
        this.outageStartT = null;
      }
    } else {
      this.goodFixesSinceRestore = 0;
      if (!this.inOutage) {
        this.inOutage = true;
        this.outageStartT = s.t;
      }
      this.stage = degraded ? "gnss-degraded" : "dhruva-active";
    }

    // --- Vibration filter tick ---------------------------------------------------
    const gz = s.gz ?? 0;
    const vib = this.vibration.push(
      { t: s.t, ax: axG, ay: ayG, az: azG, gyroZ: gz },
      usable && this.lastGnss.speedMps !== null ? this.lastGnss.speedMps : null,
    );

    // Course-over-ground aiding for gyro bias, from consecutive fixes.
    if (usable && this.lastGnss.speedMps !== null && this.lastGnss.speedMps > 2) {
      if (this.lastCourseFix) {
        const dtAid = s.t - this.lastCourseFix.t;
        const dLat = (this.lastGnss.lat - this.lastCourseFix.lat) * 111_320;
        const dLng = (this.lastGnss.lng - this.lastCourseFix.lng) * 111_320 * Math.cos((this.lastCourseFix.lat * Math.PI) / 180);
        if (Math.hypot(dLat, dLng) > 3 && dtAid > 0.05) {
          const course = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
          this.dr.aidHeading(course, dtAid, this.lastGnss.speedMps);
          this.lastCourseFix = { lat: this.lastGnss.lat, lng: this.lastGnss.lng, t: s.t };
        }
      } else {
        this.lastCourseFix = { lat: this.lastGnss.lat, lng: this.lastGnss.lng, t: s.t };
      }
    }

    // --- Dead reckoning tick -------------------------------------------------------
    const drState = this.dr.push({ t: s.t, speedMps: vib.speedMps, yawRateDegPerSec: gz });

    // --- Track accumulation & distance ------------------------------------------------
    const dt = this.lastFrameT === null ? 0 : Math.max(0, s.t - this.lastFrameT);
    this.lastFrameT = s.t;
    this.distanceM += vib.speedMps * dt;

    if (
      usable &&
      (this.gnssTrack.length === 0 ||
        haversine(this.gnssTrack[this.gnssTrack.length - 1], this.lastGnss) > 2)
    ) {
      this.gnssTrack.push({ lat: this.lastGnss.lat, lng: this.lastGnss.lng });
      this.routePoints.push({ lat: this.lastGnss.lat, lng: this.lastGnss.lng });
      this.routeDirty = true;
      this.rebuildRouteIfNeeded();
    }
    this.fusedTrack.push({ lat: drState.lat, lng: drState.lng });
    // Cap both tracks: shift when full (the map simply loses the oldest tail,
    // which is fine for a driving session and bounds memory).
    if (this.gnssTrack.length > MAX_TRACK_POINTS) this.gnssTrack.shift();
    if (this.fusedTrack.length > MAX_TRACK_POINTS) this.fusedTrack.shift();

    // --- Drift (honest, continuously computed) ---------------------------------------
    let driftM: number | null = null;
    let driftPct: number | null = null;
    const outageElapsed = this.outageStartT !== null ? s.t - this.outageStartT : 0;
    if (this.inOutage && fresh) {
      // Degraded (multipath) fixes still arriving: compare against them.
      driftM = haversine({ lat: drState.lat, lng: drState.lng }, this.lastGnss);
      const outageDistance = Math.max(1, vib.speedMps * Math.max(1, outageElapsed));
      driftPct = (driftM / outageDistance) * 100;
      if (this.maxDriftM === null || driftM > this.maxDriftM) this.maxDriftM = driftM;
    }

    return {
      t: s.t,
      lat: drState.lat,
      lng: drState.lng,
      gnss: fresh ? { lat: this.lastGnss.lat, lng: this.lastGnss.lng, accuracyM: this.lastGnss.accuracyM } : null,
      dr: { lat: drState.lat, lng: drState.lng, headingDeg: drState.headingDeg, sigmaM: drState.sigmaM },
      headingDeg: drState.headingDeg,
      speedMps: vib.speedMps,
      gnssSpeedMps: fresh ? this.lastGnss.speedMps : null,
      sigmaM: drState.sigmaM,
      source: usable ? "gnss" : "ins",
      deadReckoning: !usable,
      motion: vib.motionClass,
      stage: this.stage,
      distanceM: this.distanceM,
      outageSeconds: outageElapsed,
      totalOutageSeconds: this.totalOutageS,
      outageCount: this.outageCount,
      maxDriftM: this.maxDriftM,
      driftM,
      driftPct,
      imuRateHz: this.imuRateHz,
      gnssDegraded: degraded,
      gnssTrack: this.gnssTrack,
      fusedTrack: this.fusedTrack,
    };
  }

  /** Session summary for the end-of-drive results panel. */
  sessionSummary(): {
    distanceM: number;
    totalOutageSeconds: number;
    outageCount: number;
    maxDriftM: number | null;
    imuRateHz: number;
  } {
    return {
      distanceM: this.distanceM,
      totalOutageSeconds: this.totalOutageS,
      outageCount: this.outageCount,
      maxDriftM: this.maxDriftM,
      imuRateHz: this.imuRateHz,
    };
  }
}

function circularMean(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const d of samples) {
    const r = (d * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  return ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360;
}
