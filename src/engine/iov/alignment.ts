/**
 * In-vehicle alignment & calibration engine.
 *
 * Determines the phone's orientation relative to the vehicle's forward axis
 * from a short stationary calibration window, per the SIH problem statement:
 * "automatically determines the phone's pitch, roll, and yaw relative to the
 * vehicle's driving direction, whether the phone is strictly dashboard-mounted
 * or placed in mobile holder".
 *
 * Method (statistical, edge-deployable, no training run needed):
 *  - Gravity from the accelerometer mean gives pitch and roll directly.
 *  - Yaw offset comes from the dominant motion direction: over a calibration
 *    window that includes some driving (or engine-on vibration), the magnetic
 *    heading measured in phone frame is dominated by the vehicle axis, so the
 *    circular mean of yaw readings gives the phone-to-vehicle yaw offset.
 *
 * The module is deterministic and pure: inputs are summary statistics computed
 * from the raw sensor window, so the same code runs on a phone at 10 Hz or an
 * edge device at 200 Hz.
 */

/** Euler angles of the phone relative to the vehicle frame. */
export interface AlignmentResult {
  /** Rotation about the vehicle's lateral axis. Positive = nose up. */
  pitchDeg: number;
  /** Rotation about the vehicle's longitudinal axis. Positive = right side down. */
  rollDeg: number;
  /** Rotation about the vertical axis between phone yaw and vehicle heading. */
  yawOffsetDeg: number;
  /** Quality of the calibration, 0..1. Below 0.5 the result should be re-run. */
  confidence: number;
  /** Human-readable mount classification for the UI. */
  mount: "dashboard" | "windscreen-holder" | "console" | "unknown";
  /** Warnings surfaced to the technician/driver. */
  warnings: string[];
}

/** Raw window statistics collected over the calibration period. */
export interface AlignmentWindow {
  /** Mean specific force per axis, phone frame (x right, y up, z out of screen), g units. */
  meanAx: number;
  meanAy: number;
  meanAz: number;
  /** Per-axis standard deviation, g units. High values indicate vibration/motion. */
  stdAx: number;
  stdAy: number;
  stdAz: number;
  /**
   * Circumferential yaw samples in the phone frame (deg, 0..360) from the
   * magnetometer/fusion, sampled during the window.
   */
  yawSamplesDeg: number[];
  /** Whether the vehicle was moving during the window (GNSS speed > 2 km/h). */
  vehicleMoving: boolean;
}

/** Circular mean in degrees, robust to the 0/360 wrap. */
export function circularMeanDeg(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const d of samples) {
    const r = (d * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const mean = Math.atan2(sumSin, sumCos) * (180 / Math.PI);
  return (mean + 360) % 360;
}

/**
 * Estimate the phone-to-vehicle alignment from a calibration window.
 *
 * Returns `confidence < 0.5` plus actionable warnings when the window is too
 * noisy to trust, so the caller can re-run calibration instead of silently
 * feeding a bad mounting estimate into the fusion engine.
 */
export function estimateAlignment(w: AlignmentWindow): AlignmentResult {
  const warnings: string[] = [];

  // Gravity direction in phone frame.
  const gMag = Math.hypot(w.meanAx, w.meanAy, w.meanAz) || 1e-9;
  // Pitch: rotation about phone x-axis. atan2 of horizontal vs vertical gravity.
  const pitchDeg = (Math.atan2(w.meanAx, Math.hypot(w.meanAy, w.meanAz)) * 180) / Math.PI;
  // Roll: rotation about phone y-axis.
  const rollDeg = (Math.atan2(w.meanAy, Math.hypot(w.meanAx, w.meanAz)) * 180) / Math.PI;

  // Yaw offset: circular mean of yaw samples taken while driving straight-ish.
  const yawOffsetDeg = circularMeanDeg(w.yawSamplesDeg);

  // Confidence heuristics.
  const vibration = (w.stdAx + w.stdAy + w.stdAz) / 3;
  let confidence = 1;
  if (!w.vehicleMoving) {
    confidence -= 0.25;
    warnings.push(
      "Calibration ran while stationary. Drive straight for 10-20 seconds and recalibrate for a more accurate yaw offset.",
    );
  }
  if (vibration > 0.05) {
    confidence -= 0.3;
    warnings.push(
      "High vibration during calibration (engine idle or rough surface). Mount the phone and recalibrate on a smoother stretch.",
    );
  }
  if (gMag < 0.85 || gMag > 1.15) {
    confidence -= 0.3;
    warnings.push(
      "Accelerometer magnitude deviates from 1 g; the device may be moving or the sensor misreporting.",
    );
  }
  if (w.yawSamplesDeg.length < 20) {
    confidence -= 0.2;
    warnings.push("Few yaw samples in the window; extend the calibration period.");
  }
  confidence = Math.max(0, Math.min(1, confidence));

  // Mount classification from pitch/roll: a windscreen holder tilts the phone
  // back 25-60 deg; a flat dashboard lies near 0-15 deg; a console mount is
  // steeper and often rolled.
  let mount: AlignmentResult["mount"] = "unknown";
  const pitch = Math.abs(pitchDeg);
  if (pitch >= 25 && pitch <= 60) mount = "windscreen-holder";
  else if (pitch < 15 && Math.abs(rollDeg) < 15) mount = "dashboard";
  else if (pitch >= 15) mount = "console";

  return { pitchDeg, rollDeg, yawOffsetDeg, confidence, mount, warnings };
}
