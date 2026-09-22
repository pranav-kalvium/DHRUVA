/**
 * Streaming (online) IDR pipeline.
 *
 * Same engine modules as the batch benchmark (alignment -> vibration filter
 * with online speed regression -> dead reckoning with NHC + map matching ->
 * GNSS+INS fusion), exposed as an incremental class so the app can feed
 * samples in real time and render each fused frame as it arrives.
 *
 * The alignment phase runs on the first `calibrationSeconds` of samples; the
 * GNSS fix is withheld while `setGnssAvailable(false)` is active (real outage
 * in a recording, or a genuine blackout on a phone).
 */

import { estimateAlignment, type AlignmentResult, type AlignmentWindow } from "./alignment";
import { VibrationFilter, type MotionClass, type VibrationState } from "./vibration-filter";
import { FusionEngine, type FusionFrame, type GnssFix } from "./fusion";
import type { MatchRoute } from "./map-matching";
import type { DriveSample } from "./drive-loader";

/** Pipeline stage for the UI, mirroring the user's architecture diagram. */
export type PipelineStage =
  | "calibrating"
  | "gnss-available"
  | "gnss-degraded"
  | "dhruva-active"
  | "reacquiring"
  | "gnss-restored";

export interface OnlineFrame extends FusionFrame {
  stage: PipelineStage;
  /** Samples processed so far. */
  index: number;
  motion: MotionClass;
  /** GNSS truth at this sample (shown as a compare layer in the app). */
  truth: { lat: number; lng: number; speedMps: number; headingDeg: number } | null;
  /** Instantaneous DR-vs-truth error when truth exists, metres. */
  errorM: number | null;
  /** Accumulated tracks for the map (downsampled every 5th sample). */
  tracks: {
    truth: Array<{ lat: number; lng: number }>;
    fused: Array<{ lat: number; lng: number }>;
  };
}

export class OnlineIdrPipeline {
  private readonly route: MatchRoute;
  private readonly rateHz: number;
  private readonly vibration: VibrationFilter;
  private readonly fusion: FusionEngine;
  private readonly alignment: AlignmentResult;
  private index = 0;
  private gnssAvailable = true;
  private lastFix: { lat: number; lng: number; t: number } | null = null;
  private stage: PipelineStage = "calibrating";
  private readonly outageStart: number;
  private readonly outageEnd: number;
  /** Track accumulators for the map layers. */
  readonly truthTrack: Array<{ lat: number; lng: number }> = [];
  readonly fusedTrack: Array<{ lat: number; lng: number }> = [];

  constructor(
    route: MatchRoute,
    private readonly calibrationSamples: DriveSample[],
    opts: { rateHz: number; outageStart?: number; outageEnd?: number },
  ) {
    this.route = route;
    this.rateHz = opts.rateHz;
    this.outageStart = opts.outageStart ?? -1;
    this.outageEnd = opts.outageEnd ?? -1;

    // --- Alignment over the calibration window ------------------------------
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const std = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
    };
    const window: AlignmentWindow = {
      meanAx: mean(calibrationSamples.map((s) => s.longitudinalAccelG)),
      meanAy: mean(calibrationSamples.map((s) => s.lateralAccelG)),
      meanAz: 1,
      stdAx: std(calibrationSamples.map((s) => s.longitudinalAccelG)),
      stdAy: std(calibrationSamples.map((s) => s.lateralAccelG)),
      stdAz: 0.02,
      yawSamplesDeg: [0],
      vehicleMoving: calibrationSamples.some((s) => s.indicatedSpeedKmh > 2),
    };
    this.alignment = estimateAlignment(window);
    this.vibration = new VibrationFilter(this.alignment, this.rateHz);
    const s0 = calibrationSamples[0];
    this.fusion = new FusionEngine(
      route,
      { lat: s0.lat, lng: s0.lng, headingDeg: s0.heading, sigmaM: 7 },
      undefined,
      () => this.currentLateralG,
    );
  }

  get alignmentResult(): AlignmentResult {
    return this.alignment;
  }

  /** Control GNSS availability (real blackout or recorded outage). */
  setGnssAvailable(available: boolean): void {
    this.gnssAvailable = available;
  }

  private currentLateralG = 0;

  /** Feed one sample; returns the fused frame for rendering. */
  push(s: DriveSample): OnlineFrame {
    const i = this.index++;
    const inRecordedOutage =
      this.outageStart >= 0 && i >= this.outageStart && i < this.outageEnd;
    const gnssOn = this.gnssAvailable && !inRecordedOutage;

    // Sign convention: source yaw is left-handed; the engine is CW-positive.
    const yawRateCw = -s.yawRateDegPerSec;
    this.currentLateralG = s.lateralAccelG;

    const vib: VibrationState = this.vibration.push(
      {
        t: i / this.rateHz,
        ax: s.longitudinalAccelG,
        ay: s.lateralAccelG,
        az: 0,
        gyroZ: yawRateCw,
      },
      gnssOn ? s.gnssSpeedKmh / 3.6 : null,
    );

    const truth = {
      lat: s.lat,
      lng: s.lng,
      speedMps: s.gnssSpeedKmh / 3.6,
      headingDeg: s.heading,
    };
    const fix: GnssFix = {
      t: i / this.rateHz,
      lat: s.lat,
      lng: s.lng,
      speedMps: s.gnssSpeedKmh / 3.6,
    };
    const frame = this.fusion.push(
      { t: i / this.rateHz, speedMps: vib.speedMps, yawRateDegPerSec: yawRateCw },
      gnssOn ? fix : null,
    );

    if (gnssOn) this.lastFix = { lat: s.lat, lng: s.lng, t: i / this.rateHz };

    // --- Stage machine for the UI -------------------------------------------
    const justLost = this.outageStart >= 0 && i === this.outageStart;
    const justRegained = this.outageEnd >= 0 && i === this.outageEnd;
    if (justLost) this.stage = "dhruva-active";
    else if (justRegained) this.stage = "gnss-restored";
    else if (this.stage === "calibrating" && i >= this.calibrationSamples.length) {
      this.stage = "gnss-available";
    }

    const err = Math.hypot(
      (frame.lat - truth.lat) * 111_320,
      (frame.lng - truth.lng) * 111_320 * Math.cos((truth.lat * Math.PI) / 180),
    );

    // Accumulate map tracks (every sample: 10 Hz over 5 min is fine).
    this.truthTrack.push({ lat: truth.lat, lng: truth.lng });
    this.fusedTrack.push({ lat: frame.lat, lng: frame.lng });

    return {
      ...frame,
      stage: this.stage,
      index: i,
      motion: vib.motionClass,
      truth,
      errorM: err,
      tracks: {
        truth: this.truthTrack,
        fused: this.fusedTrack,
      },
    };
  }
}
