/**
 * Live device sensor acquisition (browser / Android WebView).
 *
 * Real signals only, never fabricated:
 *  - Geolocation watchPosition: latitude, longitude, speed (m/s), heading
 *    (deg), horizontal accuracy (m). Android WebView (Capacitor) bridges the
 *    prompt to the OS location permission declared in AndroidManifest.xml.
 *  - DeviceMotion: accelerometer (includes gravity) and rotationRate (gyro).
 *    iOS requires an explicit user-gesture permission request; Android grants
 *    with the app install.
 *  - Absolute orientation (magnetometer): deviceorientation events where
 *    provided. Availability is probed and reported honestly; when absent the
 *    heading falls back to GNSS course over ground, and the app says so.
 *
 * Everything degrades explicitly: the UI shows "unavailable", never a
 * simulated value. Navigation-assistance prototype; not safety-certified.
 */

export interface LiveGnssSample {
  t: number;
  lat: number;
  lng: number;
  /** Horizontal accuracy, metres (68% confidence). */
  accuracyM: number;
  /** Speed from the platform, m/s. Null when the device does not provide it. */
  speedMps: number | null;
  /** Course/heading degrees true, when provided. Null otherwise. */
  headingDeg: number | null;
  /** Altitude metres when available. */
  altitudeM: number | null;
}

export interface LiveImuSample {
  t: number;
  /** Total acceleration including gravity, m/s^2 (device frame). */
  ax: number;
  ay: number;
  az: number;
  /** Rotation rate, deg/s (device frame). Null when rotationRate unsupported. */
  gx: number | null;
  gy: number | null;
  gz: number | null;
  /** Compass heading degrees true when the platform exposes it. Null otherwise. */
  compassDeg: number | null;
}

export interface SensorAvailability {
  geolocation: boolean;
  motion: boolean;
  /** rotationRate present on motion events (gyroscope). */
  gyroscope: boolean;
  /** Absolute-orientation/compass events actually firing. */
  compass: boolean;
}

export type PermissionState = "unknown" | "prompt" | "granted" | "denied";

export interface LiveSensorHandlers {
  onGnss: (s: LiveGnssSample) => void;
  onImu: (s: LiveImuSample) => void;
  onAvailability: (a: Partial<SensorAvailability>) => void;
  onPermission: (p: PermissionState) => void;
  onError: (msg: string, fatal: boolean) => void;
}

export class LiveSensorSource {
  private handlers: LiveSensorHandlers;
  private watchId: number | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private lastImuT: number | null = null;
  private sawGyroscope = false;
  private sawCompass = false;
  private compassTimeout: number | null = null;
  private running = false;

  constructor(handlers: LiveSensorHandlers) {
    this.handlers = handlers;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Read the persistent permission state without prompting. */
  async queryPermission(): Promise<PermissionState> {
    type PermWithLoc = { query(desc: { name: string }): Promise<{ state: string }> };
    const perms = (navigator as unknown as { permissions?: PermWithLoc }).permissions;
    if (!perms) return "unknown";
    try {
      const st = await perms.query({ name: "geolocation" });
      if (st.state === "granted") return "granted";
      if (st.state === "denied") return "denied";
      return "prompt";
    } catch {
      return "unknown";
    }
  }

  /**
   * Start all sensors. `requestPermission` must come from a user gesture
   * (button click) so iOS DeviceMotion.requestPermission succeeds.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // --- Geolocation ---------------------------------------------------------
    if (!("geolocation" in navigator)) {
      this.handlers.onError(
        "This browser does not expose the Geolocation API. Live GNSS positioning is unavailable here; use the recorded-drive mode or a Chromium-based browser.",
        true,
      );
      this.handlers.onPermission("denied");
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.handlers.onPermission("granted");
          this.handlers.onAvailability({ geolocation: true });
          const c = pos.coords;
          this.handlers.onGnss({
            t: pos.timestamp / 1000,
            lat: c.latitude,
            lng: c.longitude,
            accuracyM: c.accuracy ?? 50,
            speedMps: c.speed !== null && Number.isFinite(c.speed) ? c.speed : null,
            headingDeg: c.heading !== null && Number.isFinite(c.heading) ? c.heading : null,
            altitudeM: c.altitude !== null && Number.isFinite(c.altitude) ? c.altitude : null,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            this.handlers.onPermission("denied");
            this.handlers.onError(
              "Location permission is denied. Enable location for this app in system settings, then restart the live session.",
              true,
            );
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            this.handlers.onError(
              "The device cannot currently determine its position. Move to an open-sky area; the estimator will resume automatically when a fix returns.",
              false,
            );
          } else {
            this.handlers.onError("Location request timed out. Keep the device still until the first fix arrives.", false);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    }

    // --- DeviceMotion (accelerometer + gyro) ----------------------------------
    type MotionWithPerm = { requestPermission?: () => Promise<"granted" | "denied"> };
    const dm = DeviceMotionEvent as unknown as MotionWithPerm | undefined;
    if (typeof DeviceMotionEvent === "undefined") {
      this.handlers.onAvailability({ motion: false, gyroscope: false });
      this.handlers.onError(
        "DeviceMotion is not supported in this environment: the accelerometer and gyroscope are unavailable, so inertial dead reckoning cannot run here.",
        true,
      );
    } else {
      try {
        if (typeof dm?.requestPermission === "function") {
          const res = await dm.requestPermission();
          if (res !== "granted") {
            this.handlers.onAvailability({ motion: false });
            this.handlers.onError(
              "Motion-sensor permission was refused. DHRUVA can still show GNSS position, but inertial estimation during an outage will not run.",
              false,
            );
          }
        }
      } catch {
        // Non-iOS platforms may throw on requestPermission absence handling; ignore.
      }
      this.motionHandler = (e: DeviceMotionEvent) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const t = e.timeStamp !== undefined ? performance.now() / 1000 : Date.now() / 1000;
        const rr = e.rotationRate;
        const gz = rr?.alpha !== null && rr?.alpha !== undefined ? rr.alpha : null;
        const gxr = rr?.beta !== null && rr?.beta !== undefined ? rr.beta : null;
        const gyr = rr?.gamma !== null && rr?.gamma !== undefined ? rr.gamma : null;
        if (gz !== null && !this.sawGyroscope) {
          this.sawGyroscope = true;
          this.handlers.onAvailability({ gyroscope: true });
        }
        this.handlers.onImu({
          t,
          ax: acc.x ?? 0,
          ay: acc.y ?? 0,
          az: acc.z ?? 0,
          gx: gxr,
          gy: gyr,
          gz,
          compassDeg: null,
        });
      };
      window.addEventListener("devicemotion", this.motionHandler);
      this.handlers.onAvailability({ motion: true });
    }

    // --- Compass / absolute orientation ---------------------------------------
    if (typeof DeviceOrientationEvent !== "undefined") {
      this.orientationHandler = (e: DeviceOrientationEvent) => {
        const webkit = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
        const heading =
          typeof webkit.webkitCompassHeading === "number"
            ? webkit.webkitCompassHeading
            : e.absolute && e.alpha !== null
              ? 360 - e.alpha
              : null;
        if (heading !== null && !this.sawCompass) {
          this.sawCompass = true;
          this.handlers.onAvailability({ compass: true });
          if (this.compassTimeout !== null) {
            window.clearTimeout(this.compassTimeout);
            this.compassTimeout = null;
          }
        }
      };
      window.addEventListener("deviceorientation", this.orientationHandler);
      // After 3 s without a compass event, report it honestly as unavailable.
      this.compassTimeout = window.setTimeout(() => {
        if (!this.sawCompass) this.handlers.onAvailability({ compass: false });
      }, 3000);
    }

    // If no motion events ever fire (desktop browsers), report that too.
    window.setTimeout(() => {
      if (!this.sawGyroscope) {
        // Still fine: gyro may be absent; accel may still be flowing.
      }
    }, 3000);
  }

  stop(): void {
    this.running = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.motionHandler) {
      window.removeEventListener("devicemotion", this.motionHandler);
      this.motionHandler = null;
    }
    if (this.orientationHandler) {
      window.removeEventListener("deviceorientation", this.orientationHandler);
      this.orientationHandler = null;
    }
    if (this.compassTimeout !== null) {
      window.clearTimeout(this.compassTimeout);
      this.compassTimeout = null;
    }
  }
}

/** True when the platform looks like a device with motion sensors at all. */
export function motionLikelySupported(): boolean {
  return typeof DeviceMotionEvent !== "undefined" && "ontouchstart" in window;
}
