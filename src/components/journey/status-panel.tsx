"use client";

import { Compass, Gauge, MapPin, Radio, Satellite, Timer } from "lucide-react";
import { StatusPill } from "@/components/ui/badge";
import { MODE_LABELS, STAGE_LABELS, CONFIDENCE_LABELS } from "@/lib/constants";
import { gnssQualityLabel } from "@/engine/engine";
import { formatHeading, formatKmh } from "@/lib/utils";
import { useReplay } from "@/lib/replay-context";

const MODE_TONE: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  GNSS_AVAILABLE: "green",
  GNSS_DEGRADING: "amber",
  DHRUVA_ACTIVE: "amber",
  GNSS_REACQUIRING: "blue",
  GNSS_RESTORED: "green",
  CONFIDENCE_LOW: "red",
  POSITION_UNAVAILABLE: "gray",
};

const CONF_TONE: Record<string, "green" | "amber" | "red"> = {
  HIGH: "green",
  MODERATE: "amber",
  LOW: "red",
};

export function StatusPanel() {
  const { frame, lastUpdate } = useReplay();
  const gnssTone =
    frame.gnss.quality === "GOOD" ? "green" : frame.gnss.quality === "FAIR" ? "blue" : frame.gnss.quality === "POOR" ? "amber" : "gray";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={MODE_TONE[frame.mode] ?? "gray"}>
          {MODE_LABELS[frame.mode] ?? frame.mode}
        </StatusPill>
        <StatusPill tone={CONF_TONE[frame.confidence]}>
          Confidence: {CONFIDENCE_LABELS[frame.confidence]}
        </StatusPill>
        <StatusPill tone={gnssTone}>
          GNSS: {gnssQualityLabel(frame.gnss.quality)} ({frame.gnss.satellites} sats)
        </StatusPill>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <Gauge className="h-3.5 w-3.5" aria-hidden /> Speed
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-ink-900">
            {formatKmh(frame.speedMps)} km/h
          </dd>
        </div>
        <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <Compass className="h-3.5 w-3.5" aria-hidden /> Heading
          </dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-ink-900">
            {formatHeading(frame.heading)}
          </dd>
        </div>
        <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Motion state
          </dt>
          <dd className="mt-0.5 text-lg font-semibold capitalize text-ink-900">
            {frame.motionState.toLowerCase()}
          </dd>
        </div>
        <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
            <Timer className="h-3.5 w-3.5" aria-hidden /> Journey stage
          </dt>
          <dd className="mt-0.5 text-sm font-semibold leading-5 text-ink-900">
            {STAGE_LABELS[frame.stage]}
          </dd>
        </div>
      </dl>

      {frame.tunnelProgress > 0 && frame.stage !== "JOURNEY_COMPLETE" && (
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-ink-600">
            <span>Tunnel progress</span>
            <span className="tabular">{Math.round(frame.tunnelProgress * 100)}%</span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.round(frame.tunnelProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tunnel progress"
          >
            <div
              className="h-full rounded-full bg-amber-degraded transition-[width] duration-150"
              style={{ width: `${Math.round(frame.tunnelProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5" aria-hidden />
          Last update:{" "}
          {lastUpdate ? lastUpdate.toLocaleTimeString() : "waiting"}
        </span>
        {frame.drElapsedS > 1 && (
          <span className="tabular font-semibold text-amber-strong">
            Estimating {Math.round(frame.drElapsedS)} s without GNSS
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        Positioning mode {MODE_LABELS[frame.mode]}. Confidence {CONFIDENCE_LABELS[frame.confidence]}.
      </p>
    </div>
  );
}
