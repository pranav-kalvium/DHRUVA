"use client";

/** Live-device capability detection with honest "not exposed" reporting. */

export interface CapabilityReport {
  geolocationSupported: boolean;
  deviceMotionSupported: boolean;
  deviceOrientationSupported: boolean;
  /** Browsers never expose GNSS internals; we say so rather than fake them. */
  gnssInternalsExposed: boolean;
  /** Browser never exposes raw IMU streams at fixed rates; report honestly. */
  imuRateExposed: boolean;
  secureContext: boolean;
}

export function detectCapabilities(): CapabilityReport {
  if (typeof window === "undefined") {
    return {
      geolocationSupported: false,
      deviceMotionSupported: false,
      deviceOrientationSupported: false,
      gnssInternalsExposed: false,
      imuRateExposed: false,
      secureContext: false,
    };
  }
  return {
    geolocationSupported: "geolocation" in navigator,
    deviceMotionSupported: typeof window.DeviceMotionEvent !== "undefined",
    deviceOrientationSupported: typeof window.DeviceOrientationEvent !== "undefined",
    gnssInternalsExposed: false,
    imuRateExposed: false,
    secureContext: window.isSecureContext,
  };
}

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported";

export async function queryLocationPermission(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unsupported";
  try {
    const st = await navigator.permissions.query({ name: "geolocation" });
    return st.state as PermissionState;
  } catch {
    return "unsupported";
  }
}

/** Start watching position; returns a stop function. */
export function watchPosition(
  onPos: (p: { lat: number; lng: number; accuracyM: number | null; timestamp: number }) => void,
  onError: (code: number, message: string) => void,
): () => void {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError(0, "Geolocation is not supported by this browser.");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onPos({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
        timestamp: pos.timestamp,
      }),
    (err) => onError(err.code, err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
