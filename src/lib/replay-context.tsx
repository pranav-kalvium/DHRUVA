"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getRoute } from "@/engine/routes";
import { computeFrame, replayDurationS } from "@/engine/engine";
import type { EngineFrame, RouteData } from "@/engine/types";

export type JourneyMode = "demo" | "live";
export type Phase = "ready" | "running" | "paused" | "ended";

interface ReplayState {
  mode: JourneyMode;
  route: RouteData;
  phase: Phase;
  /** Replay time in seconds. */
  time: number;
  duration: number;
  /** Selected playback speed multiplier. */
  speed: number;
  frame: EngineFrame;
  /** Wall-clock timestamp of the last state advance, for Last update. */
  lastUpdate: Date | null;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (s: number) => void;
  /** Scrub to an absolute replay time. */
  seekTo: (t: number) => void;
  endJourney: () => void;
}

const ReplayContext = createContext<ReplayState | null>(null);

/**
 * The replay clock advances on a timer, not on requestAnimationFrame. Frame
 * callbacks only run while the page is being painted, so an rAF-driven clock
 * silently freezes the demo whenever the tab or embedded view is not
 * composited. Each step is measured against the wall clock so time stays
 * accurate regardless of how the timer is scheduled.
 */
const TICK_MS = 33; // ~30 Hz, smooth for a marker at road speed
/** Largest single step, so returning from a long stall never teleports the marker. */
const MAX_STEP_S = 0.35;

export function ReplayProvider({
  children,
  mode,
  routeId,
}: {
  children: ReactNode;
  mode: JourneyMode;
  routeId: string;
}) {
  const route = useMemo(() => getRoute(routeId), [routeId]);
  const duration = useMemo(() => replayDurationS(route), [route]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [frame, setFrame] = useState(() => computeFrame(route, 0));

  const lastTickRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  timeRef.current = time;

  // Advance the replay clock while running.
  useEffect(() => {
    if (phase !== "running") {
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = null;
    const advance = () => {
      const now = Date.now();
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
        return;
      }
      const dt = Math.min(MAX_STEP_S, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      const next = timeRef.current + dt * speedRef.current;
      if (next >= durationRef.current) {
        timeRef.current = durationRef.current;
        setTime(durationRef.current);
        setPhase("ended");
        setFrame(computeFrame(route, durationRef.current));
        setLastUpdate(new Date());
        return;
      }
      timeRef.current = next;
      setTime(next);
      setFrame(computeFrame(route, next));
      setLastUpdate(new Date());
    };
    const intervalId = window.setInterval(advance, TICK_MS);
    // A hidden page stops stepping; on return the clock resumes where it left
    // off instead of jumping ahead.
    const onVisibilityChange = () => {
      lastTickRef.current = null;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lastTickRef.current = null;
    };
  }, [phase, route]);

  // Keep latest speed/duration in refs without re-subscribing the raf loop.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const play = useCallback(() => {
    setPhase((p) => (p === "ended" ? "running" : p === "ready" ? "running" : p));
  }, []);

  const pause = useCallback(() => setPhase((p) => (p === "running" ? "paused" : p)), []);

  const restart = useCallback(() => {
    timeRef.current = 0;
    setTime(0);
    setFrame(computeFrame(route, 0));
    setPhase("ready");
  }, [route]);

  const seekTo = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(duration, t));
      timeRef.current = clamped;
      setTime(clamped);
      setFrame(computeFrame(route, clamped));
      setLastUpdate(new Date());
    },
    [duration, route],
  );

  const endJourney = useCallback(() => {
    setPhase("ended");
  }, []);

  const value = useMemo(
    () => ({
      mode,
      route,
      phase,
      time,
      duration,
      speed,
      frame,
      lastUpdate,
      play,
      pause,
      restart,
      setSpeed,
      seekTo,
      endJourney,
    }),
    [mode, route, phase, time, duration, speed, frame, lastUpdate, play, pause, restart, seekTo, endJourney],
  );

  return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>;
}

export function useReplay(): ReplayState {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used within a ReplayProvider");
  return ctx;
}
