"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useDrivePlayer } from "@/lib/drive-player-context";
import type { PipelineStage } from "@/engine/iov/pipeline-online";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Leaflet touches window at import time; browser-only.
const DriveMap = dynamic(
  () => import("@/components/drive/drive-map").then((m) => m.DriveMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-surface-sunken" /> },
);

const STAGE_META: Record<PipelineStage, { label: string; tone: "green" | "amber" | "blue" | "red" }> = {
  calibrating: { label: "Calibrating sensors", tone: "blue" },
  "gnss-available": { label: "GNSS available", tone: "green" },
  "gnss-degraded": { label: "GNSS degraded", tone: "amber" },
  "dhruva-active": { label: "GNSS lost - DHRUVA takes over", tone: "amber" },
  reacquiring: { label: "GNSS reacquiring", tone: "amber" },
  "gnss-restored": { label: "GNSS restored", tone: "green" },
};

function fmtClock(sampleIndex: number, rateHz: number): string {
  const s = sampleIndex / rateHz;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function DriveJourney() {
  const p = useDrivePlayer();
  const [endOpen, setEndOpen] = useState(false);
  const frame = p.frame;

  const stage = frame?.stage ?? "calibrating";
  const inOutage = p.index >= p.outage.start && p.index < p.outage.end;

  const stats = useMemo(() => {
    if (!frame) return null;
    return {
      speed: frame.speedMps * 3.6,
      heading: frame.headingDeg,
      sigma: frame.sigmaM,
      err: frame.errorM,
      drDist: frame.drState.distanceM,
      matched: frame.drState.mapMatched,
      motion: frame.motion,
      source: frame.source,
    };
  }, [frame]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 px-3 pb-24 pt-3 sm:px-4">
      {/* Header: what is being played */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-ink-900 sm:text-lg">
            Recorded drive - verification mode
          </h1>
          <p className="truncate text-xs text-ink-600">
            {p.recording.source} - collected on UK test tracks - GNSS withheld{" "}
            {fmtClock(p.outage.start, p.rateHz)} to {fmtClock(p.outage.end, p.rateHz)}. For Indian
            roads, use Live navigation: it runs this same estimator on your phone's sensors.
          </p>
        </div>
        <Badge tone={inOutage ? "amber" : "gray"}>
          {inOutage ? "GNSS outage window" : "Recorded data"}
        </Badge>
      </div>

      {/* Map: dominant */}
      <div className="map-surface relative h-[46vh] min-h-[300px] overflow-hidden rounded-[10px] border border-line sm:h-[52vh] lg:h-[56vh]">
        <DriveMap route={p.route} frame={frame} className="h-full w-full" />
      </div>

      {/* Pipeline stage rail: the architecture, live */}
      <div className="rounded-[10px] border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <RailStep n={1} label="Sensor input" active={!!frame} />
          <span aria-hidden className="text-ink-500">&rarr;</span>
          <RailStep n={2} label="GNSS health monitor" active={!!frame} warn={inOutage} />
          <span aria-hidden className="text-ink-500">&rarr;</span>
          <RailStep n={3} label="AI motion estimation" active={!!frame} warn={inOutage} />
          <span aria-hidden className="text-ink-500">&rarr;</span>
          <RailStep n={4} label="Sensor fusion (ES-EKF + NHC + ZUPT)" active={!!frame} warn={inOutage} />
          <span aria-hidden className="text-ink-500">&rarr;</span>
          <RailStep n={5} label="Map matching" active={!!frame} ok={stats?.matched} />
          <span aria-hidden className="text-ink-500">&rarr;</span>
          <RailStep n={6} label="Position + confidence" active={!!frame} warn={inOutage} />
        </div>
      </div>

      {/* Primary status: one glance while driving */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Speed" value={stats ? `${stats.speed.toFixed(0)} km/h` : "--"} />
        <Metric label="Heading" value={stats ? `${stats.heading.toFixed(0)}°` : "--"} />
        <Metric
          label="Confidence"
          value={stats ? `±${stats.sigma.toFixed(0)} m` : "--"}
          tone={stats ? (stats.sigma > 25 ? "amber" : stats.sigma > 10 ? "warn" : "ok") : "dim"}
        />
        <Metric
          label="Positioning"
          value={stats ? (stats.source === "gnss" ? "GNSS" : stats.source === "fused" ? "Fused" : "Inertial (DR)") : "--"}
          tone={stats && stats.source === "ins" ? "amber" : "ok"}
        />
      </div>

      {/* Controls + timeline */}
      <div className="rounded-[10px] border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {p.playState !== "playing" ? (
            <Button onClick={p.play}>{p.playState === "idle" ? "Start drive" : "Resume"}</Button>
          ) : (
            <Button onClick={p.pause}>Pause</Button>
          )}
          <Button variant="outline" onClick={p.restart}>
            Restart
          </Button>
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Playback speed">
            {[1, 2, 4, 8].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => p.setSpeed(m)}
                aria-pressed={p.speedMultiplier === m}
                className={`rounded-[8px] border px-2.5 py-1.5 text-xs font-semibold ${
                  p.speedMultiplier === m
                    ? "border-navy-700 bg-navy-700 text-white"
                    : "border-line bg-white text-ink-700 hover:bg-steel-50"
                }`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="tabular w-12 text-xs font-semibold text-ink-700">
            {fmtClock(p.index, p.rateHz)}
          </span>
          <input
            type="range"
            min={0}
            max={p.totalSamples - 1}
            value={p.index}
            onChange={(e) => p.scrubTo(Number(e.target.value))}
            aria-label="Timeline: scrub through the recorded drive"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-sunken accent-[#16406a]"
          />
          <span className="tabular w-12 text-right text-xs font-semibold text-ink-700">
            {fmtClock(p.totalSamples, p.rateHz)}
          </span>
        </div>
      </div>

      {/* Estimator detail (collapsible) */}
      <details className="rounded-[10px] border border-line bg-white p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink-900">
          Pipeline detail (fusion, model, matching)
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Detail label="Motion class (AI filter)" value={frame ? frame.motion : "--"} />
          <Detail label="Estimator source" value={stats ? stats.source : "--"} />
          <Detail label="Map matched" value={stats ? (stats.matched ? "Yes" : "Coasting") : "--"} />
          <Detail label="Distance estimated" value={stats ? `${stats.drDist.toFixed(0)} m total` : "--"} />
          <Detail
            label="DR vs recorded truth"
            value={stats && stats.err !== null && stats.err !== undefined ? `${stats.err.toFixed(1)} m now` : "GNSS aided"}
          />
          <Detail label="Alignment mount" value={frame ? "dashboard (calibrated)" : "--"} />
        </dl>
        <p className="mt-3 text-xs text-ink-600">
          Speed is estimated by the online regression model from IMU windows (trained on this
          recording&apos;s clean-GNSS stretch); position by the fusion filter with non-holonomic
          constraints and zero-velocity updates; heading by bias-calibrated yaw integration with
          course-over-ground aiding. During the outage window the recorded GNSS is withheld from
          the estimator and shown only as the hollow comparison marker.
        </p>
      </details>

      <p className="text-xs text-ink-600">
        Navigation-assistance prototype. Not a safety-certified positioning system.
      </p>

      {endOpen && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-navy-950/50 p-4">
          <div className="w-full max-w-sm rounded-[10px] bg-white p-4">
            <h2 className="text-base font-bold text-ink-900">Stop this drive?</h2>
            <p className="mt-1 text-sm text-ink-600">
              The estimator state resets; restarting replays the recording from the beginning.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => {
                  p.restart();
                  setEndOpen(false);
                }}
              >
                Stop and reset
              </Button>
              <Button variant="outline" onClick={() => setEndOpen(false)}>
                Keep driving
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RailStep({
  n,
  label,
  active,
  warn,
  ok,
}: {
  n: number;
  label: string;
  active?: boolean;
  warn?: boolean;
  ok?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
          warn
            ? "bg-amber-degraded text-white"
            : ok
              ? "bg-trust-600 text-white"
              : active
                ? "bg-navy-700 text-white"
                : "bg-surface-sunken text-ink-500"
        }`}
      >
        {n}
        {active && <span className="sr-only"> (active)</span>}
      </span>
      <span className={active ? "font-semibold text-ink-900" : "text-ink-600"}>{label}</span>
    </span>
  );
}

function Metric({
  label,
  value,
  tone = "dim",
}: {
  label: string;
  value: string;
  tone?: "ok" | "amber" | "warn" | "dim";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-strong"
      : tone === "warn"
        ? "text-warn-600"
        : tone === "ok"
          ? "text-trust-600"
          : "text-ink-900";
  return (
    <div className="rounded-[10px] border border-line bg-white p-3">
      <dt className="text-xs font-medium text-ink-600">{label}</dt>
      <dd className={`tabular mt-0.5 text-xl font-bold ${toneClass}`}>{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
      <dt className="text-xs font-medium text-ink-600">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
