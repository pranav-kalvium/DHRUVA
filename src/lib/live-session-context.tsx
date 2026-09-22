"use client";

/**
 * Live session context: binds LiveSensorSource to LiveIdrEngine and exposes
 * the latest frame + diagnostics to the /live screen.
 *
 * React updates at ~10 Hz (the engine integrates every IMU sample; rendering
 * is throttled) which keeps the phone cool while the map stays smooth.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LiveSensorSource,
  type PermissionState,
  type SensorAvailability,
} from "@/lib/live-sensors";
import { LiveIdrEngine, type LiveFrame } from "@/engine/iov/live-engine";

export type LiveStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "permission-denied"
  | "unsupported";

export interface LiveDiagnostics {
  availability: SensorAvailability;
  permission: PermissionState;
  error: { msg: string; fatal: boolean } | null;
  imuRateHz: number;
  sessionSeconds: number;
}

interface LiveSessionValue {
  status: LiveStatus;
  frame: LiveFrame | null;
  diag: LiveDiagnostics;
  start: () => Promise<void>;
  stop: () => void;
}

const IDLE_DIAG: LiveDiagnostics = {
  availability: { geolocation: false, motion: false, gyroscope: false, compass: false },
  permission: "unknown",
  error: null,
  imuRateHz: 0,
  sessionSeconds: 0,
};

const LiveSessionContext = createContext<LiveSessionValue | null>(null);

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [diag, setDiag] = useState<LiveDiagnostics>(IDLE_DIAG);

  const sourceRef = useRef<LiveSensorSource | null>(null);
  const engineRef = useRef<LiveIdrEngine | null>(null);
  const lastRenderT = useRef(0);
  const availabilityRef = useRef<SensorAvailability>({
    geolocation: false,
    motion: false,
    gyroscope: false,
    compass: false,
  });
  const sessionStartT = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (sourceRef.current?.isRunning) return;
    setStatus("starting");
    setDiag((d) => ({ ...d, error: null }));

    const engine = new LiveIdrEngine();
    engineRef.current = engine;

    const source = new LiveSensorSource({
      onGnss: (s) => engine.pushGnss(s),
      onImu: (imu) => {
        const f = engine.pushImu(imu);
        if (f !== null) {
          // Throttle React renders to ~10 Hz.
          const now = performance.now();
          if (now - lastRenderT.current >= 90) {
            lastRenderT.current = now;
            setFrame(f);
            setDiag((d) => ({
              ...d,
              imuRateHz: f.imuRateHz,
              sessionSeconds: sessionStartT.current !== null ? imu.t - sessionStartT.current : 0,
            }));
          }
        }
      },
      onAvailability: (a) => {
        availabilityRef.current = { ...availabilityRef.current, ...a };
        const av = availabilityRef.current;
        setDiag((d) => ({ ...d, availability: { ...av } }));
      },
      onPermission: (p) => {
        setDiag((d) => ({ ...d, permission: p }));
        if (p === "denied") setStatus("permission-denied");
      },
      onError: (msg, fatal) => {
        setDiag((d) => ({ ...d, error: { msg, fatal } }));
      },
    });
    sourceRef.current = source;

    try {
      await source.start();
      sessionStartT.current = performance.now() / 1000;
      const perm = await source.queryPermission();
      setDiag((d) => ({ ...d, permission: perm }));
      if (perm !== "denied") setStatus("running");
    } catch (e) {
      setDiag((d) => ({
        ...d,
        error: {
          msg: `Sensors could not start: ${e instanceof Error ? e.message : String(e)}`,
          fatal: true,
        },
      }));
      setStatus("stopped");
    }
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    engineRef.current = null;
    setStatus("stopped");
  }, []);

  useEffect(() => {
    return () => sourceRef.current?.stop();
  }, []);

  const value = useMemo<LiveSessionValue>(
    () => ({ status, frame, diag, start, stop }),
    [status, frame, diag, start, stop],
  );

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession(): LiveSessionValue {
  const v = useContext(LiveSessionContext);
  if (!v) throw new Error("useLiveSession must be used within LiveSessionProvider");
  return v;
}
