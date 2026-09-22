"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MonitorSmartphone,
  PlayCircle,
  Satellite,
  WifiOff,
} from "lucide-react";
import { ROUTES } from "@/engine/routes";
import { replayDurationS } from "@/engine/engine";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { LIMITATION_STATEMENT } from "@/lib/constants";
import {
  detectCapabilities,
  queryLocationPermission,
  type CapabilityReport,
  type PermissionState,
} from "@/lib/device-capabilities";
import { formatMeters, formatSeconds, cn } from "@/lib/utils";

type Mode = "live" | "recorded";

export function SetupClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "recorded" ? "recorded" : "live",
  );
  const [routeId, setRouteId] = useState<string>(ROUTES[0].id);
  const [caps, setCaps] = useState<CapabilityReport | null>(null);
  const [perm, setPerm] = useState<PermissionState>("unsupported");
  const [online, setOnline] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setCaps(detectCapabilities());
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    queryLocationPermission().then(setPerm);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const route = ROUTES.find((r) => r.id === routeId) ?? ROUTES[0];
  const unsupportedLive =
    mode === "live" && caps !== null && !caps.geolocationSupported;
  const livePermissionIssue = mode === "live" && perm === "denied";

  const start = () => {
    setStarting(true);
    router.push(mode === "live" ? "/live" : `/journey?route=${routeId}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Journey setup</h1>
        <p className="mt-1 text-sm text-ink-600">
          Choose how to run DHRUVA and review device readiness before starting.
        </p>
      </header>

      {!online && (
        <Callout tone="amber" title="You are offline">
          Live navigation works offline: positioning runs on this device's sensors, and any
          map tiles you cached render without a network. The recorded drive also works offline.
        </Callout>
      )}

      {/* Mode selection */}
      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading" className="text-sm font-semibold text-ink-900">Mode</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <ModeCard
            selected={mode === "live"}
            onSelect={() => setMode("live")}
            icon={<MonitorSmartphone className="h-5 w-5" aria-hidden />}
            title="Live navigation"
            description="Real position, speed and inertial estimation from this device's sensors, on the map."
            badge={
              caps && !caps.geolocationSupported ? (
                <StatusPill tone="red">Unsupported</StatusPill>
              ) : perm === "denied" ? (
                <StatusPill tone="amber">Permission denied</StatusPill>
              ) : (
                <StatusPill tone="blue">Recommended</StatusPill>
              )
            }
          />
          <ModeCard
            selected={mode === "recorded"}
            onSelect={() => setMode("recorded")}
            icon={<PlayCircle className="h-5 w-5" aria-hidden />}
            title="Recorded drive"
            description="Replay a logged IO-VNBD drive through the same estimator, with GNSS withheld where it was logged to drop. Verifies the pipeline without a vehicle."
            badge={<StatusPill tone="gray">Verification</StatusPill>}
          />
        </div>
      </section>

      {/* Route selection (recorded mode only) */}
      {mode === "recorded" && (
        <section aria-labelledby="route-heading">
          <h2 id="route-heading" className="text-sm font-semibold text-ink-900">
            Recorded drive
          </h2>
          <div className="mt-2 space-y-2">
            {ROUTES.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[8px] border p-3 transition-colors",
                  routeId === r.id
                    ? "border-navy-700 bg-steel-50"
                    : "border-line bg-white hover:bg-surface-raised",
                )}
              >
                <input
                  type="radio"
                  name="route"
                  className="mt-1 h-4 w-4 accent-[#16406a]"
                  checked={routeId === r.id}
                  onChange={() => setRouteId(r.id)}
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink-900">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-600">{r.description}</span>
                  <span className="mt-1 block text-xs font-medium text-ink-500">
                    tunnel: {r.tunnelName} · about {formatSeconds(replayDurationS(r))}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Device readiness */}
      <section aria-labelledby="readiness-heading">
        <h2 id="readiness-heading" className="text-sm font-semibold text-ink-900">
          Device readiness
        </h2>
        <Card className="mt-2 divide-y divide-line">
          <ReadinessRow
            icon={caps?.geolocationSupported ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden /> : <XCircle className="h-4 w-4 text-red-700" aria-hidden />}
            label="Location (GNSS) support"
            detail={
              caps === null
                ? "Checking..."
                : caps.geolocationSupported
                  ? "This browser exposes the Geolocation API."
                  : "No Geolocation API: live positioning cannot run here. The recorded drive still works."
            }
            ok={caps?.geolocationSupported ?? false}
          />
          <ReadinessRow
            icon={perm === "granted" ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden /> : perm === "denied" ? <XCircle className="h-4 w-4 text-red-700" aria-hidden /> : <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />}
            label="Location permission"
            detail={
              perm === "granted"
                ? "Granted. Position can start immediately."
                : perm === "denied"
                  ? "Denied. Enable location for this app in system settings to run live mode."
                  : "You will be asked once, on start, with an explanation of why it is needed."
            }
            ok={perm === "granted"}
          />
          <ReadinessRow
            icon={online ? <WifiOff className="h-4 w-4 text-emerald-700" aria-hidden /> : <WifiOff className="h-4 w-4 text-amber-700" aria-hidden />}
            label="Network"
            detail={
              online
                ? "Online: live map tiles load as you move. Cache the area before a tunnel drive."
                : "Offline: fine. Cached tiles render and all estimation runs on-device."
            }
            ok
          />
        </Card>
        {livePermissionIssue && (
          <Callout tone="red" title="Location permission is disabled">
            Enable location access for this app in your device settings, then reload this page,
            to start Live Navigation.
          </Callout>
        )}
        {unsupportedLive && (
          <Callout tone="red" title="This device cannot run live positioning">
            The browser does not expose the Geolocation API, so live positioning cannot run
            here. Use the recorded drive to explore DHRUVA, or open the app on a phone.
          </Callout>
        )}
      </section>

      {/* Start */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button size="lg" onClick={start} disabled={starting || unsupportedLive || livePermissionIssue}>
          <Satellite className="h-5 w-5" aria-hidden />
          {starting ? "Starting..." : mode === "live" ? "Start live navigation" : "Start recorded drive"}
        </Button>
        <p className="text-xs text-ink-500">{LIMITATION_STATEMENT}</p>
      </div>
    </div>
  );
}

function ModeCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-[10px] border p-4 text-left transition-colors",
        selected ? "border-navy-700 bg-steel-50 ring-1 ring-navy-700" : "border-line bg-white hover:bg-surface-raised",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-ink-900">
          {icon}
          {title}
        </span>
        {badge}
      </span>
      <span className="mt-1.5 block text-xs leading-5 text-ink-600">{description}</span>
    </button>
  );
}

function ReadinessRow({
  icon,
  label,
  detail,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className={cn("text-sm font-semibold", ok ? "text-ink-900" : "text-ink-900")}>{label}</p>
        <p className="mt-0.5 text-xs text-ink-600">{detail}</p>
      </div>
    </div>
  );
}
