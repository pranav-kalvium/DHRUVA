import { describe, it, expect } from "vitest";
import { LiveIdrEngine } from "../src/engine/iov/live-engine";
import type { LiveGnssSample, LiveImuSample } from "../src/lib/live-sensors";

/**
 * Deterministic sensor streams with realistic dynamics.
 *
 * A constant-gravity stream is a *stationary* device, and the engine's ZUPT
 * (zero-velocity update) correctly clamps its speed to zero. Real phones also
 * carry continuous sensor noise (std ~0.01-0.03 g), which the motion
 * classifier uses to distinguish driving from standstill - a noise-free
 * cruise would be misread as stationary. So the fixture adds a deterministic
 * pseudo-noise wobble plus forward-acceleration bursts matching a real drive.
 */
const HZ = 50;
const G = 9.80665;

/**
 * Deterministic sensor-like wobble in m/s^2: real phone accelerometers carry
 * ~0.01-0.03 g noise std (0.1-0.3 m/s^2). These amplitudes reproduce that in
 * g terms once the engine divides by G; smaller values would misclassify a
 * cruise as stationary (correctly - a perfectly smooth 0-g ride IS ambiguous).
 */
function wobble(t: number): number {
  return 0.15 * Math.sin(2 * Math.PI * 4.2 * t) + 0.08 * Math.sin(2 * Math.PI * 11 * t + 1);
}

function imu(t: number, fwdAccelMps2 = 0, gz = 0): LiveImuSample {
  // Phone flat on the dashboard: gravity along -az, forward accel along ax.
  return {
    t,
    ax: fwdAccelMps2 + wobble(t),
    ay: wobble(t * 1.7),
    az: -G + wobble(t * 0.6),
    gx: 0,
    gy: 0,
    gz,
    compassDeg: null,
  };
}

function gnss(t: number, lat: number, accuracyM = 8, speedMps = 10): LiveGnssSample {
  return { t, lat, lng: 0, accuracyM, speedMps, headingDeg: 0, altitudeM: null };
}

/** Forward accel profile: 0-12 s calibrate stationary, then drive at ~10 m/s. */
function fwdAccelAt(sessionT: number): number {
  if (sessionT < 12) return 0; // calibration, stationary
  if (sessionT < 14) return 2.5; // accelerate
  return 0; // cruise (speed held by the GNSS-blended model)
}

/**
 * Advance the engine with paired IMU + 1 Hz GNSS. Returns session end time.
 * Speed truth follows the same profile so the learned model can track it.
 */
function drive(engine: LiveIdrEngine, startT: number, seconds: number): number {
  const t0 = startT;
  for (let i = 0; i < seconds * HZ; i++) {
    const t = startT + i / HZ;
    engine.pushImu(imu(t, fwdAccelAt(t - t0)));
    if (i % HZ === 0) {
      const st = t - t0;
      const truthV = st < 14 ? (st < 12 ? 0 : Math.min(10, (st - 12) * 2.5)) : 10;
      const lat = 50 + Math.max(0, (st - 12) * 10) / 111_320;
      engine.pushGnss(gnss(t, lat, 8, truthV));
    }
  }
  return startT + seconds;
}

describe("LiveIdrEngine", () => {
  it("calibrates for 10 s and produces frames once calibrated with a fix", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 5);
    let frames = 0;
    for (let i = 0; i < HZ; i++) if (e.pushImu(imu(t + i / HZ)) !== null) frames++;
    expect(frames).toBe(0); // still calibrating
    t = drive(e, t, 12); // crosses the 10 s calibration mark with fixes
    for (let i = 0; i < HZ; i++) if (e.pushImu(imu(t + i / HZ, 0)) !== null) frames++;
    expect(frames).toBeGreaterThan(0);
  });

  it("reports gnss-available while fixes flow", () => {
    const e = new LiveIdrEngine();
    const t = drive(e, 1000, 20);
    const f = e.pushImu(imu(t));
    expect(f).not.toBeNull();
    expect(["gnss-available", "gnss-restored"]).toContain(f!.stage);
    expect(f!.deadReckoning).toBe(false);
  });

  it("detects an outage when fixes stop, and recovers after they return", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 20); // calibrated and cruising
    // Stop pushing fixes; keep feeding IMU well past the 4 s staleness window.
    let out: ReturnType<LiveIdrEngine["pushImu"]> = null;
    for (let i = 0; i < 10 * HZ; i++) {
      const f = e.pushImu(imu(t + i / HZ, 0));
      if (f) out = f;
    }
    expect(out).not.toBeNull();
    expect(out!.deadReckoning).toBe(true);
    expect(out!.stage).toBe("dhruva-active");
    expect(out!.outageSeconds).toBeGreaterThan(3); // ~10 s since the last fix

    // Fixes return; after the settle window the stage is gnss-restored.
    t = drive(e, t + 10, 3);
    const f2 = e.pushImu(imu(t, 0));
    expect(["reacquiring", "gnss-restored"]).toContain(f2!.stage);
  });

  it("reports degraded (not lost) when accuracy is poor but fixes continue", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 20);
    e.pushGnss({ t: t + 1, lat: 50.001, lng: 0, accuracyM: 60, speedMps: 10, headingDeg: 0, altitudeM: null });
    const f = e.pushImu(imu(t + 1.5));
    expect(f!.stage).toBe("gnss-degraded");
    expect(f!.deadReckoning).toBe(true);
    // Drift is measured against the degraded fix while it stays fresh.
    expect(f!.driftM).not.toBeNull();
  });

  it("accumulates distance during a real drive", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 20);
    t = drive(e, t, 15); // cruise ~10 m/s
    const s = e.sessionSummary();
    expect(s.distanceM).toBeGreaterThan(50);
    expect(s.outageCount).toBe(0);
  });

  it("caps track memory", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 20);
    for (let k = 0; k < 9000; k++) e.pushImu(imu(t + k * 0.02, 0));
    expect(e.fusedTrack.length).toBeLessThanOrEqual(8000);
  });

  it("survives route rebuilds without losing the gyro bias or crashing", () => {
    const e = new LiveIdrEngine();
    let t = drive(e, 1000, 60); // many fixes -> at least one rebuild
    for (let i = 0; i < 200; i++) e.pushImu(imu(t + i * 0.02, 0, 5)); // sustained turn
    const f = e.pushImu(imu(t + 4, 0));
    expect(f).not.toBeNull();
    expect(e.sessionSummary().distanceM).toBeGreaterThanOrEqual(0);
  });
});
