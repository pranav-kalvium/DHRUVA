import { describe, expect, it } from "vitest";
import {
  computeBaselines,
  computeFrame,
  computeResults,
  replayDurationS,
  routeContext,
  uncertaintyAt,
  DR_THRESHOLD_S,
  BLEND_S,
} from "@/engine/engine";
import { KASARA_GHAT_ROUTE, PRAGATI_ROUTE } from "@/engine/routes";

describe("engine determinism", () => {
  it("produces identical frames for the same time", () => {
    const a = computeFrame(KASARA_GHAT_ROUTE, 42.5);
    const b = computeFrame(KASARA_GHAT_ROUTE, 42.5);
    expect(a).toEqual(b);
  });

  it("produces identical results across runs", () => {
    const a = computeResults(KASARA_GHAT_ROUTE);
    const b = computeResults(KASARA_GHAT_ROUTE);
    expect(a).toEqual(b);
  });
});

describe("journey lifecycle", () => {
  it("starts in GNSS_AVAILABLE before the tunnel", () => {
    const f = computeFrame(KASARA_GHAT_ROUTE, 2);
    expect(f.mode).toBe("GNSS_AVAILABLE");
    expect(f.confidence).toBe("HIGH");
    expect(f.stage).toBe("BEFORE_TUNNEL");
  });

  it("enters DHRUVA_ACTIVE during the tunnel outage", () => {
    const ctx = routeContext(KASARA_GHAT_ROUTE);
    const mid = (ctx.entry + ctx.exit) / 2;
    const t = findTimeAtDistance(KASARA_GHAT_ROUTE, mid);
    const f = computeFrame(KASARA_GHAT_ROUTE, t);
    expect(["DHRUVA_ACTIVE", "CONFIDENCE_LOW"]).toContain(f.mode);
    expect(f.drElapsedS).toBeGreaterThan(DR_THRESHOLD_S);
  });

  it("reacquires GNSS after the tunnel with a blend phase", () => {
    const ctx = routeContext(KASARA_GHAT_ROUTE);
    const reacquireT =
      ctx.reacquireIndex !== null ? ctx.steps[ctx.reacquireIndex].t : null;
    expect(reacquireT).not.toBeNull();
    const f = computeFrame(KASARA_GHAT_ROUTE, reacquireT! + 0.5);
    expect(["GNSS_REACQUIRING", "GNSS_RESTORED", "GNSS_AVAILABLE"]).toContain(
      f.mode,
    );
  });

  it("reaches JOURNEY_COMPLETE at the end", () => {
    const f = computeFrame(KASARA_GHAT_ROUTE, replayDurationS(KASARA_GHAT_ROUTE));
    expect(f.stage).toBe("JOURNEY_COMPLETE");
  });
});

describe("uncertainty model", () => {
  it("is zero-growth healthy at 7 m before the tunnel", () => {
    expect(uncertaintyAt(0, null)).toBe(7);
  });

  it("grows during dead reckoning", () => {
    const u1 = uncertaintyAt(5, null);
    const u2 = uncertaintyAt(20, null);
    const u3 = uncertaintyAt(40, null);
    expect(u2).toBeGreaterThan(u1);
    expect(u3).toBeGreaterThan(u2);
  });

  it("narrows during the blend after reacquisition", () => {
    const before = uncertaintyAt(30, null);
    const mid = uncertaintyAt(30, 1.0);
    const late = uncertaintyAt(30, 2.4);
    expect(mid).toBeLessThan(before);
    expect(late).toBeLessThan(mid);
    expect(uncertaintyAt(30, BLEND_S)).toBeCloseTo(7, 5);
  });
});

describe("results honesty", () => {
  it("reports a non-zero outage and DR distance for the demo route", () => {
    const r = computeResults(KASARA_GHAT_ROUTE);
    expect(r.outageDurationS).toBeGreaterThan(5);
    expect(r.drDistanceM).toBeGreaterThan(100);
    expect(r.maxUncertaintyM).toBeGreaterThan(12);
    expect(r.timeline.length).toBeGreaterThan(3);
  });

  it("reports a small reacquisition jump under the quality gate", () => {
    const r = computeResults(KASARA_GHAT_ROUTE);
    expect(r.reacquisitionJumpM).toBeGreaterThanOrEqual(0);
    expect(r.reacquisitionJumpM).toBeLessThan(30);
  });

  it("shows naive IMU drifting more than DHRUVA", () => {
    const r = computeResults(KASARA_GHAT_ROUTE);
    expect(r.baselines.naiveImu.finalOffsetFromRouteM).toBeGreaterThan(
      r.baselines.dhruva.finalOffsetFromRouteM,
    );
  });

  it("GNSS-only baseline is stale for the full outage", () => {
    const r = computeResults(KASARA_GHAT_ROUTE);
    expect(r.baselines.gnssOnly.staleSeconds).toBe(r.outageDurationS);
  });
});

describe("both routes are playable", () => {
  it.each([KASARA_GHAT_ROUTE, PRAGATI_ROUTE])(
    "route $id completes with a full lifecycle",
    (route) => {
      const r = computeResults(route);
      expect(r.outageDurationS).toBeGreaterThan(5);
      expect(r.timeline.some((e) => e.label.includes("takeover"))).toBe(true);
      expect(r.timeline.some((e) => e.kind === "green")).toBe(true);
    },
  );
});

describe("baselines", () => {
  it("expose monotone stale time during the outage", () => {
    const b = computeBaselines(KASARA_GHAT_ROUTE);
    const peak = Math.max(...b.gnssOnly.map((s) => s.staleS));
    expect(peak).toBeGreaterThan(5);
  });
});

/** Find the replay time at which the vehicle passes a route distance. */
function findTimeAtDistance(route: typeof KASARA_GHAT_ROUTE, dist: number): number {
  const ctx = routeContext(route);
  const idx = ctx.timeToDist.findIndex((d) => d >= dist);
  if (idx === -1) return replayDurationS(route);
  return idx * 0.5;
}
