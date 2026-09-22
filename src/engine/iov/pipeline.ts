/**
 * Intelligent Dead Reckoning (IDR) pipeline: end-to-end orchestration.
 *
 * Wires the four edge-engine modules into the processing chain required by
 * the SIH problem statement:
 *
 *   IO-VNBD samples (or live phone sensors)
 *     -> In-vehicle alignment (calibration window)
 *     -> AI speed & vibration filter (motion class + forward speed)
 *     -> Dead reckoning with NHC + map matching (INS propagation)
 *     -> GNSS+INS fusion (quality-gated blending, seamless mode switch)
 *
 * The pipeline is a pure function over a sample array, so the same code
 * produces the benchmark evidence (Node, scripts/) and the on-device
 * inference path (browser / Capacitor WebView).
 */

import { estimateAlignment, type AlignmentResult, type AlignmentWindow } from "./alignment";
import { VibrationFilter, type MotionClass, type VibrationFeatures } from "./vibration-filter";
import { nearestOnRoute, type MatchRoute } from "./map-matching";
import { FusionEngine, type FusionFrame, type GnssFix } from "./fusion";
import type { IovnbdSample } from "./iov-load";

/** Full pipeline result for one dataset pass. */
export interface PipelineResult {
  alignment: AlignmentResult;
  frames: FusionFrame[];
  /** Per-window motion classifications, aligned to the frames that emitted them. */
  motion: MotionClass[];
  /** Motion-model features per tick (downsampled to every window emission). */
  features: VibrationFeatures[];
}

/** Configuration for a pipeline run. */
export interface PipelineConfig {
  route: MatchRoute;
  /** Sample rate of the input stream, Hz. */
  rateHz: number;
  /** Index of the first sample treated as inside a GNSS outage (simulation). */
  outageStart?: number;
  /** Index of the first sample after the outage ends. */
  outageEnd?: number;
  /** Keep every Nth frame (1 = all) to bound memory for long recordings. */
  frameStride?: number;
}

/**
 * Run the full IDR chain over a sample array.
 *
 * When `outageStart`/`outageEnd` are given, GNSS fixes in that index range are
 * withheld from the fusion engine (they are still used for the ground-truth
 * comparison), simulating a tunnel blackout and exercising the seamless
 * transition between GNSS-aided INS and pure dead reckoning.
 */
export function runIdrPipeline(
  samples: IovnbdSample[],
  config: PipelineConfig,
): PipelineResult {
  const { route, rateHz } = config;
  const outageStart = config.outageStart ?? -1;
  const outageEnd = config.outageEnd ?? -1;
  const stride = config.frameStride ?? 1;

  // --- Alignment over the first ~20 seconds --------------------------------
  const calibCount = Math.min(samples.length, rateHz * 20);
  const calib = samples.slice(0, calibCount);
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const std = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
  };
  const meanAx = mean(calib.map((s) => s.longitudinalAccelG));
  const meanAy = mean(calib.map((s) => s.lateralAccelG));
  const meanAz = 1; // vehicle level; IO-VNBD reports motion accel, not gravity
  const alignmentWindow: AlignmentWindow = {
    meanAx,
    meanAy,
    meanAz,
    stdAx: std(calib.map((s) => s.longitudinalAccelG)),
    stdAy: std(calib.map((s) => s.lateralAccelG)),
    stdAz: 0.02,
    // IO-VNBD inertial channels are already vehicle-aligned (reference IMU),
    // so the phone-to-vehicle yaw offset is 0 by construction. With real
    // phone data this array carries magnetometer yaw samples instead, and the
    // circular mean recovers the mount offset.
    yawSamplesDeg: [0],
    vehicleMoving: calib.some((s) => s.indicatedSpeedKmh > 2),
  };
  const alignment = estimateAlignment(alignmentWindow);

  // --- Filters --------------------------------------------------------------
  const vibration = new VibrationFilter(alignment, rateHz);
  const s0 = samples[0];

  // The fusion engine owns the dead reckoner; frames expose `drState` so the
  // results view can compare the inertial path against raw GNSS.
  const fusion = new FusionEngine(
    route,
    { lat: s0.lat, lng: s0.lng, headingDeg: s0.heading, sigmaM: 7 },
    undefined,
    // Curvature-aided speed reads the lateral accel of the current sample.
    () => samples[cursor].lateralAccelG,
  );

  const frames: FusionFrame[] = [];
  const motion: MotionClass[] = [];
  const features: VibrationFeatures[] = [];
  let cursor = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    cursor = i;
    const inOutage = i >= outageStart && i < outageEnd;

    // GNSS speed trains the speed model outside the outage; inside it the
    // filter runs on IMU only (the v1 neural model plugs into this seam).
    //
    // Sign convention: IO-VNBD reports left-handed yaw rate (positive =
    // counterclockwise), verified against the GNSS heading channel. The engine
    // uses clockwise-positive heading rate, and a right-hand-rule gyro (the
    // Android convention) is also counterclockwise-positive, so both sensor
    // sources negate here at the adapter boundary.
    const yawRateCw = -s.yawRateDegPerSec;
    const vib = vibration.push(
      {
        t: i / rateHz,
        ax: s.longitudinalAccelG,
        ay: s.lateralAccelG,
        az: 0,
        gyroZ: yawRateCw,
      },
      // Speed truth (GNSS Doppler) withheld during the simulated outage.
      inOutage ? null : s.gnssSpeedKmh / 3.6,
    );

    const fix: GnssFix = {
      t: i / rateHz,
      lat: s.lat,
      lng: s.lng,
      speedMps: s.gnssSpeedKmh / 3.6,
    };
    const frame = fusion.push(
      { t: i / rateHz, speedMps: vib.speedMps, yawRateDegPerSec: yawRateCw },
      inOutage ? null : fix,
    );

    if (i % stride === 0) {
      frames.push(frame);
      motion.push(vib.motionClass);
      features.push(vib.features);
    }
  }

  return { alignment, frames, motion, features };
}
