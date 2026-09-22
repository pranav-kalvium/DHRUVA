/**
 * AI speed & vibration filter.
 *
 * Statistical tier of the "AI Speed & Vibration Filter" required by the SIH
 * problem statement: filters non-navigation motion and estimates vehicle
 * forward velocity from noisy IMU signals without an OBD-II feed.
 *
 * Speed estimation structure (complementary):
 *  - High frequency: integrate bias-corrected forward acceleration.
 *  - Low frequency: a ridge regression from window IMU features (accel stds,
 *    gyro RMS) to speed, trained online while GNSS speed is available
 *    (Doppler-derived). During a GNSS outage the trained model supplies the
 *    slow-speed reference, which stops the exponential error growth that pure
 *    integration suffers. This is the deterministic, explainable stand-in for
 *    the learned kinematics model; the v1.1 neural model drops into the same
 *    interface (features in, speed out).
 *
 * Classification: window thresholds with hysteresis separate driving, engine
 * idle vibration, pothole shocks, door slams, phone handling and standstill.
 * ZUPT (zero-velocity update) applies at confirmed standstill.
 */

import type { AlignmentResult } from "./alignment";

/** Motion classification for the current window. */
export type MotionClass =
  | "driving"
  | "idle-vibration"
  | "pothole"
  | "door-slam"
  | "stationary"
  | "phone-handled";

/** One inference frame consumed by the filter. */
export interface VibrationFrame {
  /** Seconds since recording start. */
  t: number;
  /** Phone-frame accel, g units. */
  ax: number;
  ay: number;
  az: number;
  /** Phone-frame yaw rate, deg/s. */
  gyroZ: number;
}

/** Per-window feature vector, also the training feature contract. */
export interface VibrationFeatures {
  axStd: number;
  ayStd: number;
  azStd: number;
  /** Peak-to-peak of vertical accel within the window (shock indicator), g. */
  azShock: number;
  /** Mean squared yaw rate, (deg/s)^2. */
  gyroEnergy: number;
  /** Bias-corrected forward acceleration, smoothed over the window, g. */
  fwdAccelMeanG: number;
}

/** Output of one filter tick. */
export interface VibrationState {
  motionClass: MotionClass;
  /** Estimated forward velocity, m/s, in the vehicle frame. */
  speedMps: number;
  /** Bias-corrected forward acceleration, m/s^2, vehicle frame. */
  forwardAccelMps2: number;
  /** True when ZUPT clamped velocity to zero this tick. */
  zuptActive: boolean;
  features: VibrationFeatures;
}

const G = 9.80665;

/** Thresholds tuned on IO-VNBD V-S1; see the feasibility page for caveats. */
const STATIONARY_STD_G = 0.004;
const IDLE_STD_G = 0.012;
const SHOCK_G = 0.25;
const DOOR_G = 0.45;
const HANDLED_GYRO_RMS = 25; // deg/s

/** Complementary blend per sample: weight of the integrated (fast) estimate. */
const ALPHA_FAST = 0.85;
/** Ridge regularization for the speed regression. */
const RIDGE_LAMBDA = 1e-3;
/** Retrain the regression every N labelled samples. */
const RETRAIN_EVERY = 100;
/** Innovation feedback gain for the accel bias while driving. */
const BIAS_INNOVATION_GAIN = 0.02;

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
  return Number.isFinite(v) ? v : 0;
}

/**
 * Solve (X^T X + lambda I) w = X^T y for a 4-parameter model
 * [1, axStd, azStd, gyroRms] via Gaussian elimination. Deterministic.
 *
 * Mean-accel was tried as a fifth feature and reverted: gravity leakage
 * through the imperfect pitch/roll estimate puts a quasi-constant offset in
 * mean forward accel at cruise, which the regression turned into a spurious
 * speed bias and destabilised windows that otherwise passed.
 */
function ridgeSolve(xs: number[][], ys: number[]): number[] {
  const p = 4;
  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const b: number[] = new Array(p).fill(0);
  for (let k = 0; k < xs.length; k++) {
    const x = [1, xs[k][0], xs[k][1], xs[k][2]];
    for (let i = 0; i < p; i++) {
      b[i] += x[i] * ys[k];
      for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < p; i++) A[i][i] += RIDGE_LAMBDA * xs.length;

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < p; r++) {
      const f = A[r][col] / (A[col][col] || 1e-12);
      for (let c = col; c < p; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const w = new Array(p).fill(0);
  for (let r = p - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < p; c++) s -= A[r][c] * w[c];
    w[r] = s / (A[r][r] || 1e-12);
  }
  return w;
}

/** Online filter. Feed samples in order at a fixed rate; window is 2 seconds. */
export class VibrationFilter {
  private readonly window: VibrationFrame[] = [];
  private readonly windowSize: number;
  private speedMps = 0;
  private lastT: number | null = null;
  private prevClass: MotionClass = "stationary";

  /** Longitudinal accel bias estimate (g), tracked at standstill. */
  private biasG = 0;
  private biasInitialised = false;

  /** Labelled training buffer and regression weights. */
  private trainX: number[][] = [];
  private trainY: number[] = [];
  private weights: number[] | null = null;
  private samplesSinceTrain = 0;

  constructor(
    private readonly alignment: AlignmentResult,
    /** Nominal sample rate in Hz (10 for phones, up to 200 for edge IMUs). */
    private readonly rateHz: number,
  ) {
    this.windowSize = rateHz * 2;
  }

  /** Gravity-rotate phone accel into the vehicle frame; forward component, g. */
  private forwardAccelG(ax: number, ay: number, az: number): number {
    const p = (this.alignment.pitchDeg * Math.PI) / 180;
    const r = (this.alignment.rollDeg * Math.PI) / 180;
    const cp = Math.cos(-p);
    const sp = Math.sin(-p);
    const cr = Math.cos(-r);
    const sr = Math.sin(-r);
    // Undo pitch about x on (y, z).
    const y1 = cp * ay - sp * az;
    const z1 = sp * ay + cp * az;
    // Undo roll about y on (x, z1); x2 = vehicle-forward horizontal accel.
    const x2 = cr * ax + sr * z1;
    const sign = this.alignment.yawOffsetDeg > 90 || this.alignment.yawOffsetDeg < -90 ? -1 : 1;
    return x2 * sign;
  }

  /** Predict speed from window features with the trained regression, m/s. */
  private modelSpeed(f: VibrationFeatures): number | null {
    if (!this.weights) return null;
    const gyroRms = Math.sqrt(f.gyroEnergy);
    const x = [1, f.axStd, f.azStd, gyroRms];
    let s = 0;
    for (let i = 0; i < 4; i++) s += this.weights[i] * x[i];
    return Math.max(0, Math.min(70, s));
  }

  /**
   * Consume one sample and emit the filtered state.
   *
   * `speedTruthMps`: GNSS-derived speed when a trustworthy fix is available
   * (used to train the regression and correct the integrator), `null` during
   * outages. Samples must arrive in chronological order.
   */
  push(frame: VibrationFrame, speedTruthMps?: number | null): VibrationState {
    this.window.push(frame);
    if (this.window.length > this.windowSize) this.window.shift();

    const dt = this.lastT === null ? 0 : frame.t - this.lastT;
    const gap = dt > 0.5 || dt < 0;
    this.lastT = frame.t;
    if (gap) this.speedMps = 0;

    // --- Features over the sliding window -----------------------------------
    const axs = this.window.map((f) => f.ax);
    const ays = this.window.map((f) => f.ay);
    const azs = this.window.map((f) => f.az);
    const gyros = this.window.map((f) => f.gyroZ);
    const fwdSeries = this.window.map((f) => this.forwardAccelG(f.ax, f.ay, f.az));

    const azMin = Math.min(...azs);
    const azMax = Math.max(...azs);
    const fwdSampleG = this.forwardAccelG(frame.ax, frame.ay, frame.az);
    const features: VibrationFeatures = {
      axStd: std(axs),
      ayStd: std(ays),
      azStd: std(azs),
      azShock: azMax - azMin,
      gyroEnergy: gyros.reduce((a, g) => a + g * g, 0) / gyros.length,
      fwdAccelMeanG: fwdSeries.reduce((a, b) => a + b, 0) / fwdSeries.length,
    };

    // --- Classification -------------------------------------------------------
    const stdMean = (features.axStd + features.ayStd + features.azStd) / 3;
    const gyroRms = Math.sqrt(features.gyroEnergy);
    let motionClass: MotionClass;
    if (features.azShock > DOOR_G) motionClass = "door-slam";
    else if (features.azShock > SHOCK_G) motionClass = "pothole";
    else if (gyroRms > HANDLED_GYRO_RMS) motionClass = "phone-handled";
    else if (stdMean < STATIONARY_STD_G && this.speedMps < 0.5) motionClass = "stationary";
    else if (stdMean < IDLE_STD_G && this.speedMps < 0.5) motionClass = "idle-vibration";
    else motionClass = "driving";

    // Hysteresis: transient events hold for one window before falling back.
    if (
      (this.prevClass === "pothole" || this.prevClass === "door-slam") &&
      motionClass === "driving" &&
      features.azShock > SHOCK_G * 0.5
    ) {
      motionClass = this.prevClass;
    }
    this.prevClass = motionClass;

    // --- Bias tracking ---------------------------------------------------------
    // Tracked at confirmed standstill; while driving it rides on the model's
    // innovation so a slow bias walk during a long outage is absorbed.
    if (motionClass === "stationary") {
      if (!this.biasInitialised) {
        this.biasG = fwdSampleG;
        this.biasInitialised = true;
      } else {
        this.biasG += 0.05 * (fwdSampleG - this.biasG);
      }
    }

    // --- Training on GNSS-available speed -------------------------------------
    if (speedTruthMps !== undefined && speedTruthMps !== null) {
      const gyroRmsF = Math.sqrt(features.gyroEnergy);
      this.trainX.push([features.axStd, features.azStd, gyroRmsF]);
      this.trainY.push(speedTruthMps);
      if (this.trainX.length > 6000) {
        this.trainX.shift();
        this.trainY.shift();
      }
      this.samplesSinceTrain++;
      if (this.samplesSinceTrain >= RETRAIN_EVERY && this.trainX.length >= 50) {
        this.weights = ridgeSolve(this.trainX, this.trainY);
        this.samplesSinceTrain = 0;
      }
    }

    // --- Complementary speed update -------------------------------------------
    const modelV = this.modelSpeed(features);
    const correctedG = fwdSampleG - this.biasG;
    const fwdAccelMps2 = correctedG * G;
    if (!gap) this.speedMps += fwdAccelMps2 * dt;

    const driving = motionClass === "driving" || motionClass === "pothole" || motionClass === "door-slam";
    if (modelV !== null && driving) {
      this.speedMps = ALPHA_FAST * this.speedMps + (1 - ALPHA_FAST) * modelV;
      // Bias rides on the model innovation: if the integrator runs ahead of
      // the (GNSS-trained) model, raise the bias so forward accel shrinks.
      const innov = this.speedMps - modelV;
      this.biasG += BIAS_INNOVATION_GAIN * (innov / G) * (1 / Math.max(1, this.rateHz));
    }

    // Soft GNSS-speed correction of the integrator when a fix is available.
    if (speedTruthMps !== undefined && speedTruthMps !== null) {
      this.speedMps += 0.1 * (speedTruthMps - this.speedMps);
    }

    // ZUPT: confident standstill. Three authorized paths:
    //  - direct zero-motion detection: every channel flat near zero across the
    //    window (classical IMU ZUPT detector). Robust to the feature confound
    //    in this dataset: CAN-smoothed accel looks alike at stop and at smooth
    //    cruise, but at a true stop the yaw rate and both horizontal accel
    //    channels are exactly quiet, which cruise never is.
    //  - raw-signal standstill with the integrator already near zero.
    //  - the trained model predicting near-zero speed at low vibration (it
    //    learned what 0 m/s looks like from GNSS labels; fires on datasets
    //    whose raw IMU preserves vibration cues).
    // Thresholds sit above the channel bias (about -0.009 g longitudinal in
    // V-S1, absorbed by `biasG` once ZUPT engages) but well below real braking
    // or turning events (0.05-0.2 g), so only a true stop reads as all-quiet.
    const maxAbsFwd = Math.max(...fwdSeries.map((v) => Math.abs(v)));
    const maxAbsLat = Math.max(...ays.map((v) => Math.abs(v)));
    const maxAbsYaw = Math.max(...gyros.map((v) => Math.abs(v)));
    const zeroMotion = maxAbsFwd < 0.02 && maxAbsLat < 0.015 && maxAbsYaw < 0.5;
    // A quiet-IMU reading while the integrator carries speed is contradictory:
    // for a road vehicle, cruise always rides on engine/road vibration well
    // above these gates, so "all quiet AND still fast" means a frozen/damped
    // sensor, not a stop. ZUPT therefore requires the estimate to already be
    // near zero - by the time a real stop completes, braking samples have
    // bled the speed down through the deceleration window.
    const zuptActive =
      (zeroMotion && this.speedMps < 2.0) ||
      (motionClass === "stationary" && this.speedMps < 1.2) ||
      (modelV !== null && modelV < 1.0 && stdMean < IDLE_STD_G);
    if (zuptActive) {
      this.speedMps = 0;
      // A confirmed stop is also a bias observation window.
      this.biasG += 0.05 * (fwdSampleG - this.biasG);
    }
    if (motionClass === "idle-vibration") this.speedMps *= 0.9;
    if (this.speedMps < 0) this.speedMps = 0; // no reverse estimation in v1

    return {
      motionClass,
      speedMps: this.speedMps,
      forwardAccelMps2: fwdAccelMps2,
      zuptActive,
      features,
    };
  }
}
