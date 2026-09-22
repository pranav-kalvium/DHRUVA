import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReplayProvider, useReplay } from "@/lib/replay-context";
import { KASARA_GHAT_ROUTE } from "@/engine/routes";
import { MESSAGES } from "@/lib/messages";

/** Harness exposing the replay state for assertions. */
function Probe() {
  const replay = useReplay();
  return (
    <div>
      <div data-testid="phase">{replay.phase}</div>
      <div data-testid="time">{replay.time.toFixed(1)}</div>
      <div data-testid="mode">{replay.frame.mode}</div>
      <div data-testid="confidence">{replay.frame.confidence}</div>
      <div data-testid="uncertainty">{replay.frame.uncertaintyMeters.toFixed(1)}</div>
      <div data-testid="route">{replay.route.id}</div>
      <button data-testid="play" onClick={replay.play}>play</button>
      <button data-testid="pause" onClick={replay.pause}>pause</button>
      <button data-testid="restart" onClick={replay.restart}>restart</button>
      <button data-testid="seek" onClick={() => replay.seekTo(150)}>seek-150</button>
      <button data-testid="speed" onClick={() => replay.setSpeed(4)}>speed-4x</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ReplayProvider mode="demo" routeId="kasara-ghat">
      <Probe />
    </ReplayProvider>,
  );
}

describe("replay playback lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts in ready phase with the selected route", () => {
    renderProvider();
    expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    expect(screen.getByTestId("route")).toHaveTextContent("kasara-ghat");
    expect(screen.getByTestId("mode")).toHaveTextContent("GNSS_AVAILABLE");
  });

  it("plays and advances time in demo mode", async () => {
    renderProvider();
    act(() => {
      screen.getByTestId("play").click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const t = parseFloat(screen.getByTestId("time").textContent ?? "0");
    expect(t).toBeGreaterThan(0.5);
    expect(screen.getByTestId("phase")).toHaveTextContent("running");
  });

  it("pauses and restarts cleanly", async () => {
    renderProvider();
    act(() => screen.getByTestId("play").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    act(() => screen.getByTestId("pause").click());
    const pausedAt = parseFloat(screen.getByTestId("time").textContent ?? "0");
    expect(screen.getByTestId("phase")).toHaveTextContent("paused");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(parseFloat(screen.getByTestId("time").textContent ?? "0")).toBe(pausedAt);
    act(() => screen.getByTestId("restart").click());
    expect(screen.getByTestId("time")).toHaveTextContent(/^0\.0$/);
    expect(screen.getByTestId("phase")).toHaveTextContent("ready");
  });

  it("scrubs to a time inside the tunnel and widens uncertainty", async () => {
    renderProvider();
    const before = parseFloat(screen.getByTestId("uncertainty").textContent ?? "7");
    act(() => screen.getByTestId("seek").click());
    await waitFor(() => {
      expect(screen.getByTestId("mode")).toHaveTextContent(/DHRUVA_ACTIVE|CONFIDENCE_LOW/);
    });
    const after = parseFloat(screen.getByTestId("uncertainty").textContent ?? "0");
    expect(after).toBeGreaterThan(before);
  });

  it("transition through all core modes across the journey", () => {
    renderProvider();
    // Walk the replay manually through the deterministic frames.
    const seen = new Set<string>();
    for (let t = 0; t <= 240; t += 1) {
      const f = frameOf(t);
      seen.add(f.mode);
    }
    expect(seen.has("GNSS_AVAILABLE")).toBe(true);
    expect(seen.has("GNSS_DEGRADING")).toBe(true);
    expect(seen.has("DHRUVA_ACTIVE")).toBe(true);
    expect(seen.has("GNSS_REACQUIRING")).toBe(true);
    expect(seen.has("GNSS_RESTORED")).toBe(true);
  });

  it("reaches the end and flips phase to ended", async () => {
    renderProvider();
    act(() => screen.getByTestId("speed").click()); // 4x
    act(() => screen.getByTestId("play").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80000);
    });
    expect(screen.getByTestId("phase")).toHaveTextContent("ended");
  });
});

describe("status message catalog", () => {
  it("covers every message id used by the engine", () => {
    const ids = [
      "INITIALIZING", "TUNNEL_AHEAD", "SIGNAL_WEAK", "TAKEOVER",
      "LOW_CONFIDENCE", "VERIFYING_FIXES", "RESTORED", "COMPLETE",
    ] as const;
    for (const id of ids) {
      expect(MESSAGES[id].title.length).toBeGreaterThan(3);
      expect(MESSAGES[id].body.length).toBeGreaterThan(10);
    }
  });

  it("never uses vague error copy", () => {
    for (const m of Object.values(MESSAGES)) {
      expect(m.title.toLowerCase()).not.toContain("something went wrong");
      expect(m.body.toLowerCase()).not.toContain("oops");
    }
  });
});

import { computeFrame } from "@/engine/engine";
function frameOf(t: number) {
  return computeFrame(KASARA_GHAT_ROUTE, t);
}
