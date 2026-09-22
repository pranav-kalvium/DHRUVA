import { haversine } from "./geo";
import {
  buildGnssSchedule,
  gnssBandAt,
  makeRng,
  sampleGnss,
  type GnssSchedulePoint,
  type ReceiverSample,
} from "./gnss-schedule";
import {
  cumulativeDistances,
  headingAtDistance,
  pointAtDistanceCached,
  targetSpeedKmh,
  tunnelDistances,
} from "./route-geometry";
import type {
  ConfidenceLevel,
  EngineFrame,
  JourneyResults,
  MessageId,
  PositioningMode,
  RouteData,
  TimelineEvent,
} from "./types";

export const SEED = 20260914;

/** Confidence thresholds on uncertainty (meters). */
const CONF_MODERATE_AT = 12;
const CONF_LOW_AT = 30;

/** DR (dead reckoning) begins when the last fix is older than this (s). */
export const DR_THRESHOLD_S = 1.0;

/** Blend duration after a gated fix (s). */
export const BLEND_S = 2.5;

/** How long GNSS_RESTORED is highlighted after blending (s). */
const RESTORED_S = 4;

/** Naive-IMU baseline error growth rates (deterministic). */
const IMU_HEADING_ERR_RATE = 0.45;
const IMU_LATERAL_RATE = 0.55;

const DT = 0.5;

interface ReplayStep {
  t: number;
  dist: number;
  /** Receiver sample at this step. */
  rx: ReceiverSample;
  /** Time of the most recent fix of ANY quality at or before this step. */
  lastFixT: number | null;
  /** Time of the most recent gated fix at or before this step. */
  lastGatedT: number | null;
}

interface RouteContext {
  route: RouteData;
  cum: number[];
  total: number;
  entry: number;
  exit: number;
  schedule: GnssSchedulePoint[];
  timeToDist: number[];
  steps: ReplayStep[];
  /** First step where the last fix (of any quality) is older than the DR threshold. */
  drStartIndex: number;
  /** First step at or after drStartIndex where a gated fix is accepted. */
  reacquireIndex: number | null;
}

const contextCache = new Map<string, RouteContext>();

export function routeContext(route: RouteData): RouteContext {
  const cached = contextCache.get(route.id);
  if (cached) return cached;
  const cum = cumulativeDistances(route.points);
  const { entry, exit } = tunnelDistances(route);
  const total = cum.at(-1) ?? 0;

  // Deterministic t -> distance table from the speed profile.
  // The guard prevents a pathological profile from hanging the app.
  const timeToDist: number[] = [0];
  let dist = 0;
  let guard = 0;
  while (dist < total - 0.5 && guard < 20000) {
    guard++;
    const v = Math.max(1, targetSpeedKmh(route, cum, dist) / 3.6);
    dist = Math.min(total, dist + v * DT);
    timeToDist.push(dist);
  }
  timeToDist.push(total);

  // Deterministic receiver sampling per step (rng consumed once per step).
  const rng = makeRng(SEED);
  const schedule = buildGnssSchedule(route);
  const steps: ReplayStep[] = [];
  let lastFixT: number | null = null;
  let lastGatedT: number | null = null;
  for (let i = 0; i < timeToDist.length; i++) {
    const t = i * DT;
    const d = timeToDist[i];
    const rx = sampleGnss(route, cum, schedule, d, rng);
    if (rx.hasFix) lastFixT = t;
    if (rx.passesGate) lastGatedT = t;
    steps.push({ t, dist: d, rx, lastFixT, lastGatedT });
  }

  // DR starts when no fix (of any quality) has arrived within the threshold.
  let drStartIndex = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.lastFixT === null || s.t - s.lastFixT > DR_THRESHOLD_S) {
      drStartIndex = i;
      break;
    }
  }
  // Reacquisition: first gated fix at or after DR start.
  let reacquireIndex: number | null = null;
  for (let i = drStartIndex; i < steps.length; i++) {
    if (steps[i].rx.passesGate) {
      reacquireIndex = i;
      break;
    }
  }

  const ctx: RouteContext = {
    route,
    cum,
    total,
    entry,
    exit,
    schedule,
    timeToDist,
    steps,
    drStartIndex,
    reacquireIndex,
  };
  contextCache.set(route.id, ctx);
  return ctx;
}

/** Total replay duration in seconds for a route (at 1x speed). */
export function replayDurationS(route: RouteData): number {
  return (routeContext(route).timeToDist.length - 1) * DT;
}

function stepAt(ctx: RouteContext, t: number): ReplayStep {
  const idx = Math.max(0, Math.min(ctx.steps.length - 1, Math.round(t / DT)));
  return ctx.steps[idx];
}

/**
 * Uncertainty model (meters): grows with DR time while no fix arrives,
 * narrows during the quality-gated blend, healthy afterwards. Deterministic.
 */
export function uncertaintyAt(
  drElapsedS: number,
  blendSeconds: number | null,
): number {
  const drCap = Math.min(6 + 0.028 * drElapsedS * drElapsedS, 55);
  if (blendSeconds !== null) {
    const frac = Math.min(1, blendSeconds / BLEND_S);
    return drCap + (7 - drCap) * frac;
  }
  if (drElapsedS > DR_THRESHOLD_S) return drCap;
  return 7;
}

export function confidenceFromUncertainty(u: number): ConfidenceLevel {
  if (u >= CONF_LOW_AT) return "LOW";
  if (u >= CONF_MODERATE_AT) return "MODERATE";
  return "HIGH";
}

/**
 * Compute the full engine frame at replay time t (seconds). Pure and
 * deterministic: the same route and t always yield the same frame.
 */
export function computeFrame(route: RouteData, t: number): EngineFrame {
  const ctx = routeContext(route);
  const duration = replayDurationS(route);
  const tt = Math.max(0, Math.min(duration, t));
  const step = stepAt(ctx, tt);

  // Interpolate motion quantities from the trajectory.
  const i0 = Math.max(0, Math.min(ctx.timeToDist.length - 1, Math.floor(tt / DT)));
  const i1 = Math.min(ctx.timeToDist.length - 1, i0 + 1);
  const frac = Math.min(1, Math.max(0, tt / DT - i0));
  const d0 = ctx.timeToDist[i0];
  const d1 = ctx.timeToDist[i1];
  const dist = d0 + (d1 - d0) * frac;

  const position = pointAtDistanceCached(route, ctx.cum, dist);
  const heading = headingAtDistance(route, ctx.cum, dist);
  const speedMps = targetSpeedKmh(route, ctx.cum, dist) / 3.6;

  const inTunnel = dist >= ctx.entry && dist <= ctx.exit;
  const drStartT = ctx.steps[ctx.drStartIndex]?.t ?? Infinity;
  const reacquireT =
    ctx.reacquireIndex !== null ? ctx.steps[ctx.reacquireIndex].t : Infinity;

  // Dead-reckoning counters: time since the last fix of ANY quality. POOR
  // portal fixes still position the vehicle (degrading mode), so DR starts
  // when even those stop arriving, exactly at the portal.
  const drElapsedS =
    step.lastFixT !== null ? Math.max(0, tt - step.lastFixT) : tt;

  // Reacquisition blending: first gated fix after DR start; uncertainty
  // narrows over BLEND_S, then the GNSS_RESTORED state is highlighted.
  let blendSeconds: number | null = null;
  let restored = false;
  if (tt >= reacquireT && tt > drStartT) {
    const sinceFix = tt - reacquireT;
    if (sinceFix <= BLEND_S) blendSeconds = sinceFix;
    else if (sinceFix <= BLEND_S + RESTORED_S) restored = true;
  }

  const uncertainty = uncertaintyAt(drElapsedS, blendSeconds);
  const confidence = confidenceFromUncertainty(uncertainty);
  const mode = modeFor(step, drElapsedS, blendSeconds !== null, restored, tt, drStartT);
  const messageId = messageIdFor(ctx, dist, mode, confidence, drElapsedS);

  const tunnelProgress = inTunnel
    ? (dist - ctx.entry) / Math.max(1, ctx.exit - ctx.entry)
    : dist > ctx.exit
      ? 1
      : 0;

  const stage = stageFor(dist, ctx.entry, ctx.exit, ctx.total);

  const vPrev = targetSpeedKmh(route, ctx.cum, Math.max(0, dist - 10)) / 3.6;
  const motionState =
    speedMps < 0.5
      ? ("STOPPED" as const)
      : speedMps - vPrev > 1
        ? ("ACCELERATING" as const)
        : vPrev - speedMps > 1
          ? ("DECELERATING" as const)
          : ("CRUISING" as const);

  const drActive = drElapsedS > DR_THRESHOLD_S;
  const sensorHz = drActive ? 200 : 100;
  const latencyMs = drActive ? 14 : 9;
  const matches = Math.floor(dist / 25);

  return {
    t: tt,
    stage,
    mode,
    confidence,
    position,
    heading,
    speedMps,
    motionState,
    gnss: {
      quality: step.rx.band,
      hdop: step.rx.hdop,
      satellites: step.rx.satellites,
      rawFix: step.rx.rawFix,
      passesGate: step.rx.passesGate,
    },
    distance: dist,
    uncertaintyMeters: uncertainty,
    drElapsedS: drActive ? drElapsedS : 0,
    drDistanceM: drActive ? Math.max(0, dist - ctx.entry) : 0,
    tunnelProgress,
    messageId,
    sensorHz,
    latencyMs,
    matches,
  };
}

function modeFor(
  step: ReplayStep,
  drElapsedS: number,
  blending: boolean,
  restored: boolean,
  t: number,
  drStartT: number,
): PositioningMode {
  if (blending) return "GNSS_REACQUIRING";
  if (restored) return "GNSS_RESTORED";
  if (drElapsedS > DR_THRESHOLD_S) {
    const u = uncertaintyAt(drElapsedS, null);
    return confidenceFromUncertainty(u) === "LOW"
      ? "CONFIDENCE_LOW"
      : "DHRUVA_ACTIVE";
  }
  // Between DR start and reacquisition the receiver still emits low-quality
  // portal fixes; the estimator shows degrading if a fix exists at all.
  if (step.rx.hasFix) {
    return step.rx.band === "POOR" ? "GNSS_DEGRADING" : "GNSS_AVAILABLE";
  }
  return "POSITION_UNAVAILABLE";
}

function stageFor(
  dist: number,
  entry: number,
  exit: number,
  total: number,
): EngineFrame["stage"] {
  if (dist >= total - 2) return "JOURNEY_COMPLETE";
  if (dist > exit + 30) return "TUNNEL_EXIT";
  if (dist >= entry - 40) return "INSIDE_TUNNEL";
  return "BEFORE_TUNNEL";
}

function messageIdFor(
  ctx: RouteContext,
  dist: number,
  mode: PositioningMode,
  confidence: ConfidenceLevel,
  drElapsedS: number,
): MessageId | null {
  const { entry, exit, total } = ctx;
  if (dist >= total - 2) return "COMPLETE";
  if (mode === "GNSS_REACQUIRING") return "VERIFYING_FIXES";
  if (mode === "GNSS_RESTORED") return "RESTORED";
  if (dist >= entry - 500 && dist < entry - 250) return "TUNNEL_AHEAD";
  if (dist >= entry - 250 && dist < entry) return "SIGNAL_WEAK";
  if (mode === "DHRUVA_ACTIVE" && dist < entry + 60) return "TAKEOVER";
  if (mode === "CONFIDENCE_LOW") return "LOW_CONFIDENCE";
  if (drElapsedS > 45 && confidence === "LOW") return "LOW_CONFIDENCE";
  return null;
}

/** Convenience: human label for a GNSS band. */
export function gnssQualityLabel(band: string): string {
  switch (band) {
    case "GOOD":
      return "Good";
    case "FAIR":
      return "Fair";
    case "POOR":
      return "Poor";
    default:
      return "No fix";
  }
}

export interface BaselineSamples {
  /** DHRUVA constrained estimate vs route truth (m) over time. */
  dhruva: { t: number; offsetM: number }[];
  /** Naive inertial estimate vs route truth (m) over time. */
  naiveImu: { t: number; offsetM: number; headingErrDeg: number }[];
  /** GNSS-only marker staleness (s since last fix). */
  gnssOnly: { t: number; staleS: number }[];
}

/** Simulated baseline comparison, clearly labeled as simulated in the UI. */
export function computeBaselines(route: RouteData): BaselineSamples {
  const dhruva: BaselineSamples["dhruva"] = [];
  const naiveImu: BaselineSamples["naiveImu"] = [];
  const gnssOnly: BaselineSamples["gnssOnly"] = [];

  let imuLateral = 0;
  let imuHeadingErr = 0;
  let lastT = 0;
  let drActive = false;

  for (let t = 0; t <= replayDurationS(route); t += DT) {
    const frame = computeFrame(route, t);
    const dt = t - lastT;
    lastT = t;

    if (frame.drElapsedS > 0) {
      if (!drActive) drActive = true;
      imuHeadingErr = Math.min(25, imuHeadingErr + IMU_HEADING_ERR_RATE * dt);
      imuLateral += imuHeadingErr * IMU_LATERAL_RATE * dt * 0.2;
    } else if (drActive) {
      drActive = false;
    }
    naiveImu.push({
      t: Math.round(t * 10) / 10,
      offsetM: Math.round(imuLateral * 10) / 10,
      headingErrDeg: Math.round(imuHeadingErr * 10) / 10,
    });
    dhruva.push({
      t: Math.round(t * 10) / 10,
      offsetM:
        Math.round(Math.min(frame.uncertaintyMeters * 0.35, 25) * 10) / 10,
    });
    gnssOnly.push({
      t: Math.round(t * 10) / 10,
      staleS: Math.round(frame.drElapsedS * 10) / 10,
    });
  }

  return { dhruva, naiveImu, gnssOnly };
}

/** Full journey results from a completed replay run. */
export function computeResults(route: RouteData): JourneyResults {
  const ctx = routeContext(route);
  const duration = replayDurationS(route);
  const timeline: TimelineEvent[] = [];
  let maxUncertainty = 0;
  let drDistance = 0;
  let outageStart: number | null = null;
  let outageEnd: number | null = null;

  let prevMode: string | null = null;
  for (let t = 0; t <= duration; t += DT) {
    const frame = computeFrame(route, t);
    if (frame.mode !== prevMode) {
      if (frame.mode === "GNSS_DEGRADING" && prevMode === "GNSS_AVAILABLE")
        timeline.push({ t, label: "GNSS degrading near the portal", kind: "amber" });
      if (frame.mode === "DHRUVA_ACTIVE" && prevMode !== "DHRUVA_ACTIVE") {
        timeline.push({
          t,
          label: "DHRUVA takeover (estimation only)",
          kind: "amber",
        });
        outageStart = t;
      }
      if (frame.mode === "GNSS_REACQUIRING")
        timeline.push({ t, label: "Quality gate checking fixes", kind: "info" });
      if (frame.mode === "GNSS_RESTORED")
        timeline.push({
          t,
          label: "GNSS restored, blending complete",
          kind: "green",
        });
      if (frame.mode === "CONFIDENCE_LOW" && prevMode !== "CONFIDENCE_LOW")
        timeline.push({ t, label: "Low confidence advisory", kind: "red" });
      prevMode = frame.mode;
    }
    if (frame.uncertaintyMeters > maxUncertainty)
      maxUncertainty = frame.uncertaintyMeters;
    if (frame.drDistanceM > drDistance) drDistance = frame.drDistanceM;
    if (outageStart !== null && outageEnd === null && frame.mode === "GNSS_AVAILABLE")
      outageEnd = t;
  }

  // Reacquisition jump: offset between the DR estimate at the first accepted
  // gated fix and that fix position (deterministic from the receiver model).
  let reacquisitionJumpM = 0;
  if (ctx.reacquireIndex !== null) {
    const tFix = ctx.steps[ctx.reacquireIndex].t;
    const f = computeFrame(route, tFix);
    if (f.gnss.rawFix) {
      reacquisitionJumpM =
        Math.round(haversine(f.position, f.gnss.rawFix) * 10) / 10;
    }
  }

  if (timeline.length === 0)
    timeline.push({ t: 0, label: "No state changes recorded", kind: "info" });

  const outageS =
    outageStart !== null && outageEnd !== null ? outageEnd - outageStart : 0;
  const baselines = computeBaselines(route);
  const lastImu = baselines.naiveImu.at(-1);

  return {
    continuityPct: 100,
    outageDurationS: outageS,
    drDistanceM: Math.round(drDistance),
    reacquisitionJumpM,
    maxUncertaintyM: Math.round(maxUncertainty * 10) / 10,
    recoveryBlendS: BLEND_S,
    processingLatencyMs: 14,
    timeline,
    baselines: {
      gnssOnly: {
        staleSeconds: outageS,
        visualJumpM: reacquisitionJumpM,
      },
      naiveImu: {
        finalOffsetFromRouteM: lastImu?.offsetM ?? 0,
        finalHeadingErrorDeg: lastImu?.headingErrDeg ?? 0,
      },
      dhruva: {
        finalOffsetFromRouteM: baselines.dhruva.at(-1)?.offsetM ?? 0,
      },
    },
  };
}
