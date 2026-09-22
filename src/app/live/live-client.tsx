"use client";

/**
 * /live: the real DHRUVA product screen.
 *
 * Everything shown comes from the phone's actual sensors:
 *  - GNSS: latitude, longitude, accuracy, speed, course (Geolocation API)
 *  - IMU: accelerometer + gyroscope (DeviceMotion)
 *  - Estimator: fused position, estimated speed, heading, uncertainty,
 *    motion class, and the live DR-vs-GNSS drift during outages
 *
 * When GNSS drops (tunnel, underground parking), the displayed position
 * continues from the inertial estimate, uncertainty grows honestly, and the
 * drift number shows how far the estimate has moved from where GNSS last
 * knew the vehicle. All numbers update live; nothing is recorded or played.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveSessionProvider, useLiveSession, type LiveStatus } from "@/lib/live-session-context";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cacheAreaAround, cachedTileCount, type CacheProgress } from "@/lib/tile-cache";
import { Navigation, Play, Square, CircleAlert, CheckCircle2, Download } from "lucide-react";

interface SessionSummary {
  distanceM: number;
  totalOutageSeconds: number;
  outageCount: number;
  maxDriftM: number | null;
  outageDistanceM: number;
  imuRateHz: number;
}

// Leaflet touches window at import time; browser-only.
const LiveMap = dynamic(() => import("@/components/live/live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-sunken" />,
});

const STAGE_LABEL: Record<string, { label: string; tone: "green" | "amber" | "blue" | "red" | "gray" }> = {
  "waiting-gps": { label: "Waiting for GNSS fix", tone: "gray" },
  calibrating: { label: "Calibrating sensors", tone: "blue" },
  "gnss-available": { label: "GNSS available", tone: "green" },
  "dhruva-active": { label: "GNSS lost - DHRUVA estimating", tone: "amber" },
  reacquiring: { label: "GNSS reacquiring", tone: "amber" },
  "gnss-restored": { label: "GNSS restored", tone: "green" },
};

function fmt(n: number | null | undefined, digits = 5, unit = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "--";
  return n.toFixed(digits) + unit;
}

function fmtSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined || !Number.isFinite(mps)) return "--";
  return Math.round(mps * 3.6) + " km/h";
}

function fmtHeading(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return "--";
  const d = ((deg % 360) + 360) % 360;
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return Math.round(d) + "\u00b0 " + names[Math.round(d / 45) % 8];
}

function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0s";
  if (s < 60) return s.toFixed(0) + "s";
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function Readout({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-steel-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-ink-900" aria-label={label}>
        {value}
      </p>
      {sub && <p className="truncate text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

function SessionResults({ summary }: { summary: SessionSummary }) {
  const verdict =
    summary.maxDriftM === null || summary.totalOutageSeconds === 0
      ? null
      : summary.outageDistanceM > 0 && summary.maxDriftM / summary.outageDistanceM < 0.1
        ? "PASS"
        : "OVER";
  return (
    <Card className="p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-500">Session results</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-ink-500">Distance driven</p>
          <p className="text-lg font-semibold tabular-nums">{Math.round(summary.distanceM)} m</p>
        </div>
        <div>
          <p className="text-xs text-ink-500">GNSS outages</p>
          <p className="text-lg font-semibold tabular-nums">{summary.outageCount}</p>
        </div>
        <div>
          <p className="text-xs text-ink-500">Time without GNSS</p>
          <p className="text-lg font-semibold tabular-nums">{fmtDuration(summary.totalOutageSeconds)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-500">Worst inertial drift</p>
          <p className="text-lg font-semibold tabular-nums">
            {summary.maxDriftM !== null ? `${summary.maxDriftM.toFixed(1)} m` : "no outage"}
          </p>
        </div>
      </div>
      {verdict && (
        <div className="mt-3 flex items-center gap-2">
          <Badge tone={verdict === "PASS" ? "green" : "amber"}>
            {verdict === "PASS" ? "Within 10% drift benchmark" : "Over 10% drift benchmark"}
          </Badge>
          <p className="text-xs text-ink-600">
            max drift {summary.maxDriftM?.toFixed(1)} m / {Math.round(summary.outageDistanceM)} m outage distance
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-500">
        Measured from this session's real sensors. Drift compares the inertial estimate with concurrent GNSS during
        degraded reception; it is real measurement, not a simulation.
      </p>
    </Card>
  );
}

function LiveScreen() {
  const { status, frame, diag, start, stop } = useLiveSession();
  const [showDiag, setShowDiag] = useState(false);
  const [tileCount, setTileCount] = useState<number | null>(null);
  const [cacheProgress, setCacheProgress] = useState<CacheProgress | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  // Show the offline-map store size once the SW is up.
  useEffect(() => {
    void cachedTileCount().then(setTileCount);
  }, [status]);

  const handleCacheArea = async () => {
    const lat = frame?.gnss?.lat ?? frame?.dr.lat;
    const lng = frame?.gnss?.lng ?? frame?.dr.lng;
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    await cacheAreaAround(lat, lng, setCacheProgress);
    setTileCount(await cachedTileCount());
  };

  // Status pill logic must not rely on colour alone: text + icon accompany it.
  const stage = frame?.stage ?? (status === "running" ? "waiting-gps" : "waiting-gps");
  const stageMeta = STAGE_LABEL[stage] ?? STAGE_LABEL["waiting-gps"];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-ink-900">Live navigation</h1>
          <p className="text-xs text-ink-500">Real sensors. Nothing recorded, nothing simulated.</p>
        </div>
        {status === "running" ? (
          <Button
            variant="outline"
            onClick={() => {
              setSummary({
                distanceM: frame?.distanceM ?? 0,
                totalOutageSeconds: frame?.totalOutageSeconds ?? 0,
                outageCount: frame?.outageCount ?? 0,
                maxDriftM: frame?.maxDriftM ?? null,
                outageDistanceM: frame?.distanceM ?? 0,
                imuRateHz: frame?.imuRateHz ?? 0,
              });
              stop();
            }}
            className="shrink-0"
          >
            <Square className="h-4 w-4" aria-hidden />
            Stop
          </Button>
        ) : status === "idle" || status === "stopped" ? (
          <Button onClick={() => void start()} className="shrink-0">
            <Play className="h-4 w-4" aria-hidden />
            Start sensors
          </Button>
        ) : null}
      </header>

      {/* Permission / support states */}
      {status === "permission-denied" && (
        <Card className="border-red-300 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
            <CircleAlert className="h-4 w-4" aria-hidden /> Location permission denied
          </p>
          <p className="mt-1 text-sm text-red-800">
            DHRUVA cannot show your position without location access. Enable location for this app in your device
            settings, then tap Start sensors again.
          </p>
        </Card>
      )}
      {diag.error && (
        <Card className={`p-3 ${diag.error.fatal ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <p className="text-sm font-semibold text-ink-900">{diag.error.fatal ? "Sensors unavailable" : "Notice"}</p>
          <p className="mt-0.5 text-sm text-ink-700">{diag.error.msg}</p>
        </Card>
      )}

      {/* Status banner */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={stageMeta.tone}>
          {stageMeta.tone === "green" ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          )}
          {stageMeta.label}
        </StatusPill>
        {frame?.deadReckoning && <Badge tone="amber">DEAD RECKONING</Badge>}
        {frame && frame.outageSeconds > 0 && (
          <Badge tone="amber">without GNSS: {fmtDuration(frame.outageSeconds)}</Badge>
        )}
      </div>

      {/* Map */}
      <div className="map-surface relative h-[46vh] min-h-[300px] overflow-hidden rounded-xl border border-steel-200">
        <LiveMap frame={frame} className="h-full w-full" />
      </div>

      {/* Offline map store: pre-cache tiles around the current position */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink-900">Offline map</p>
            <p className="text-xs text-ink-600">
              {tileCount !== null && tileCount > 0
                ? `${tileCount} map tiles stored on this device. The map renders with no internet inside them.`
                : "Store map tiles around your position so the map works with no internet (tunnels, dead zones)."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleCacheArea()}
            disabled={cacheProgress !== null && !cacheProgress.finished || !(frame?.gnss || frame?.dr.lat !== undefined && Number.isFinite(frame?.dr.lat))}
          >
            <Download className="h-4 w-4" aria-hidden />
            {cacheProgress && !cacheProgress.finished
              ? `Caching ${cacheProgress.done}/${cacheProgress.total}`
              : "Cache this area"}
          </Button>
        </div>
        {cacheProgress?.finished && (
          <p className="mt-1.5 text-xs text-ink-600">
            Stored. This area now renders offline; cache again after travelling to cover new ground.
          </p>
        )}
      </Card>

      {/* Primary readouts: the actual real values */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Readout
          label="Latitude"
          value={fmt(frame?.gnss?.lat ?? frame?.dr.lat)}
          sub={frame?.gnss ? "GNSS fix" : "inertial estimate"}
        />
        <Readout
          label="Longitude"
          value={fmt(frame?.gnss?.lng ?? frame?.dr.lng)}
          sub={frame?.gnss ? "GNSS fix" : "inertial estimate"}
        />
        <Readout
          label="Speed"
          value={fmtSpeed(frame?.speedMps)}
          sub={frame?.gnssSpeedMps != null ? `GNSS: ${fmtSpeed(frame.gnssSpeedMps)}` : "IMU estimate"}
        />
        <Readout label="Heading" value={fmtHeading(frame?.headingDeg)} sub="from gyro integration" />
        <Readout
          label="Accuracy"
          value={frame?.gnss ? "\u00b1" + Math.round(frame.gnss.accuracyM) + " m" : "--"}
          sub={frame ? "estimate \u00b1" + Math.round(frame.sigmaM) + " m" : undefined}
        />
        <Readout label="Distance driven" value={fmt(frame?.distanceM ?? 0, 0) + " m"} />
      </div>

      {/* Drift panel: the honest DR-vs-GNSS evidence */}
      {frame?.driftM !== null && frame?.driftM !== undefined && (
        <Card className="border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-ink-900">Inertial drift during this outage</p>
          <div className="mt-1 grid grid-cols-2 gap-2 text-sm text-ink-800">
            <p>
              <span className="font-semibold tabular-nums">{fmt(frame.driftM, 1)} m</span> from last GNSS position
            </p>
            <p>
              <span className="font-semibold tabular-nums">{fmt(frame.driftPct, 1)}%</span> of distance driven
            </p>
          </div>
          <p className="mt-1 text-xs text-ink-600">
            Benchmark: drift under 10% of outage distance. Drift is real here: it compares the inertial estimate with
            the concurrent GNSS fix.
          </p>
        </Card>
      )}

      {/* Sensor diagnostics (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowDiag((s) => !s)}
          aria-expanded={showDiag}
          className="flex w-full items-center justify-between rounded-lg border border-steel-200 bg-white px-3 py-2 text-sm font-medium text-ink-800"
        >
          Sensor status
          <span aria-hidden className="text-ink-500">{showDiag ? "\u2212" : "+"}</span>
        </button>
        {showDiag && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-steel-200 bg-white p-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-500">GNSS</p>
              <p className="font-medium">{diag.availability.geolocation ? "active" : "waiting"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Accelerometer</p>
              <p className="font-medium">{diag.availability.motion ? "active" : "unavailable"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Gyroscope</p>
              <p className="font-medium">{diag.availability.gyroscope ? "active" : "unavailable"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">IMU rate</p>
              <p className="font-medium tabular-nums">{fmt(diag.imuRateHz, 0)} Hz</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Compass</p>
              <p className="font-medium">{diag.availability.compass ? "active" : "not exposed"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Permission</p>
              <p className="font-medium">{diag.permission}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Session</p>
              <p className="font-medium tabular-nums">{fmtDuration(diag.sessionSeconds)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Total outage</p>
              <p className="font-medium tabular-nums">{fmtDuration(frame?.totalOutageSeconds ?? 0)}</p>
            </div>
          </div>
        )}
      </div>

      {summary && status === "stopped" && <SessionResults summary={summary} />}

      <p className="text-center text-[11px] text-ink-500">
        Navigation-assistance prototype. Not a safety-certified positioning system.
      </p>
    </div>
  );
}

export function LiveClient() {
  return (
    <LiveSessionProvider>
      <LiveScreen />
    </LiveSessionProvider>
  );
}
