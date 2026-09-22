"use client";

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
  DRIVE_RECORDING,
  type DriveSample,
} from "@/engine/iov/drive-loader";
import {
  OnlineIdrPipeline,
  type OnlineFrame,
} from "@/engine/iov/pipeline-online";
import { nearestOnRoute, type MatchRoute } from "@/engine/iov/map-matching";

/**
 * Drive player: replays a real recorded drive (IO-VNBD V-S1) through the real
 * IDR pipeline at wall-clock speed. There is no authored demo here: the map,
 * position, uncertainty, speed and stage all come from the pipeline's fused
 * estimate over recorded sensor data, with the recording's GNSS withheld
 * during the logged outage window.
 */

/** Map route for matching: the drive's own GNSS track as the road database. */
function buildRoute(samples: DriveSample[]): MatchRoute {
  const points = samples.map((s) => ({ lat: s.lat, lng: s.lng }));
  const cumulativeM = [0];
  const toRad = Math.PI / 180;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const n = (b.lat - a.lat) * toRad * 6_371_000;
    const e = (b.lng - a.lng) * toRad * 6_371_000 * Math.cos(a.lat * toRad);
    cumulativeM.push(cumulativeM[i - 1] + Math.hypot(n, e));
  }
  return { points, cumulativeM };
}

const route = buildRoute(DRIVE_RECORDING.samples);
// Calibration window = first 20 s of the recording (alignment phase).
const CALIBRATION_COUNT = DRIVE_RECORDING.rateHz * 20;

const pipeline = new OnlineIdrPipeline(route, DRIVE_RECORDING.samples.slice(0, CALIBRATION_COUNT), {
  rateHz: DRIVE_RECORDING.rateHz,
  outageStart: DRIVE_RECORDING.outageStart,
  outageEnd: DRIVE_RECORDING.outageEnd,
});

export type PlayState = "idle" | "playing" | "paused" | "ended";

export interface DrivePlayerState {
  frame: OnlineFrame | null;
  playState: PlayState;
  /** Current sample index (timeline position). */
  index: number;
  totalSamples: number;
  rateHz: number;
  speedMultiplier: number;
  outage: { start: number; end: number };
  route: MatchRoute;
  recording: { source: string; credit: string };
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (m: number) => void;
  scrubTo: (index: number) => void;
}

const Ctx = createContext<DrivePlayerState | null>(null);

export function DrivePlayerProvider({ children }: { children: React.ReactNode }) {
  const [frame, setFrame] = useState<OnlineFrame | null>(null);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [index, setIndex] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextSampleTimeRef = useRef(0);
  const total = DRIVE_RECORDING.samples.length;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    setPlayState("paused");
  }, [clearTimer]);

  const step = useCallback(() => {
    const i = indexRef.current;
    if (i >= total) {
      clearTimer();
      setPlayState("ended");
      return;
    }
    const sample = DRIVE_RECORDING.samples[i];
    const f = pipeline.push(sample);
    indexRef.current = i + 1;
    setFrame(f);
    setIndex(i + 1);
  }, [clearTimer, total]);

  const play = useCallback(() => {
    if (timerRef.current !== null) return;
    if (indexRef.current >= total) return; // ended: use restart
    setPlayState("playing");
    // Wall-clock timer paced to the recording's sample rate: at 1x each 100 ms
    // tick consumes one 10 Hz sample. Speed multiplier fast-forwards.
    const periodMs = 1000 / DRIVE_RECORDING.rateHz / speedMultiplier;
    nextSampleTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      // Catch up if the tab was throttled, capped to avoid teleporting.
      let steps = 0;
      const now = Date.now();
      while (now >= nextSampleTimeRef.current && steps < 8) {
        nextSampleTimeRef.current += periodMs;
        steps++;
      }
      for (let k = 0; k < Math.max(1, steps); k++) step();
    }, Math.max(20, periodMs));
  }, [speedMultiplier, step, total]);

  const pause = useCallback(() => stop(), [stop]);

  const restart = useCallback(() => {
    clearTimer();
    indexRef.current = 0;
    setIndex(0);
    setFrame(null);
    setPlayState("idle");
  }, [clearTimer]);

  const scrubTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(total - 1, Math.round(target)));
      clearTimer();
      setPlayState("paused");
      // Re-run the pipeline from the start up to the target (deterministic).
      const fresh = new OnlineIdrPipeline(
        route,
        DRIVE_RECORDING.samples.slice(0, CALIBRATION_COUNT),
        {
          rateHz: DRIVE_RECORDING.rateHz,
          outageStart: DRIVE_RECORDING.outageStart,
          outageEnd: DRIVE_RECORDING.outageEnd,
        },
      );
      let f: OnlineFrame | null = null;
      for (let i = 0; i <= clamped; i++) f = fresh.push(DRIVE_RECORDING.samples[i]);
      indexRef.current = clamped + 1;
      setFrame(f);
      setIndex(clamped + 1);
    },
    [clearTimer, total],
  );

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const value = useMemo<DrivePlayerState>(
    () => ({
      frame,
      playState,
      index,
      totalSamples: total,
      rateHz: DRIVE_RECORDING.rateHz,
      speedMultiplier,
      outage: { start: DRIVE_RECORDING.outageStart, end: DRIVE_RECORDING.outageEnd },
      route,
      recording: { source: DRIVE_RECORDING.source, credit: DRIVE_RECORDING.credit },
      play,
      pause,
      restart,
      setSpeed: (m: number) => setSpeedMultiplier(m),
      scrubTo,
    }),
    [frame, playState, index, total, speedMultiplier, play, pause, restart, scrubTo],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDrivePlayer(): DrivePlayerState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDrivePlayer must be used inside DrivePlayerProvider");
  return v;
}

/** Project the current fused position onto the route (for the map view). */
export function projectOnRoute(lat: number, lng: number) {
  return nearestOnRoute(route, { lat, lng });
}
