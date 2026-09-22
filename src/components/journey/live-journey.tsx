"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  watchPosition,
  detectCapabilities,
  type CapabilityReport,
} from "@/lib/device-capabilities";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { LIMITATION_STATEMENT } from "@/lib/constants";
import { formatHeading } from "@/lib/utils";

interface LiveFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  timestamp: number;
}

/**
 * Live Device Mode. Consumes only what the browser genuinely provides.
 * Browsers do not expose HDOP, satellite counts or raw IMU at fixed rates:
 * those rows say "Not exposed by browser" instead of fabricated values.
 */
export function LiveJourney() {
  const [caps] = useState<CapabilityReport>(() => detectCapabilities());
  const [permission, setPermission] = useState<"idle" | "granted" | "denied" | "error">("idle");
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<LiveFix[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (permission !== "granted") return;
    const stop = watchPosition(
      (p) => {
        setFix(p);
        setPermission("granted");
        setErrorMsg(null);
        setHistory((prev) => [...prev.slice(-119), p]);
      },
      (code, message) => {
        if (code === 1) setPermission("denied");
        else setErrorMsg(message || "Location updates stopped. Check that location is on and try again.");
      },
    );
    stopRef.current = stop;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      stop();
      stopRef.current = null;
      clearInterval(timer);
    };
  }, [permission]);

  const heading = history.length >= 2 ? bearingBetween(history[history.length - 2], history[history.length - 1]) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="blue">Live device mode</StatusPill>
          {permission === "granted" && fix && <StatusPill tone="green">Location updating</StatusPill>}
          {permission === "denied" && <StatusPill tone="red">Permission denied</StatusPill>}
        </div>

        {permission === "idle" && (
          <div className="mt-3">
            <p className="text-sm text-ink-600">
              DHRUVA needs your location to show your position. Location is processed on this
              device only and is never transmitted. Motion sensors, where available, are used to
              keep an estimate during signal loss.
            </p>
            <Button className="mt-3" onClick={() => setPermission("granted")}>
              Allow location and start
            </Button>
            <p className="mt-2 text-xs text-ink-600">
              Your browser will ask for permission; nothing is collected before you allow it.
            </p>
          </div>
        )}

        {permission === "denied" && (
          <Callout tone="red" title="Location permission is disabled">
            Enable location access for this site to use Live Device Mode. Demo Replay Mode needs
            no permission and remains available.
          </Callout>
        )}

        {errorMsg && (
          <Callout tone="amber" title="Location updates are not arriving">
            {errorMsg} You can continue watching, or switch to Demo Replay Mode.
          </Callout>
        )}

        {fix && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <LiveMetric label="Latitude" value={fix.lat.toFixed(5)} />
            <LiveMetric label="Longitude" value={fix.lng.toFixed(5)} />
            <LiveMetric label="Reported accuracy" value={fix.accuracyM !== null ? `±${Math.round(fix.accuracyM)} m` : "Not provided"} />
            <LiveMetric label="Heading (from track)" value={heading !== null ? formatHeading(heading) : "Waiting for movement"} />
            <LiveMetric label="Last fix time" value={new Date(fix.timestamp).toLocaleTimeString()} />
            <LiveMetric label="Session elapsed" value={`${elapsed} s`} />
            <LiveMetric label="Fixes received" value={String(history.length)} />
            <LiveMetric label="Update rate" value={history.length > 1 ? `${(history.length / Math.max(1, elapsed)).toFixed(1)} Hz avg` : "Measuring"} />
          </dl>
        )}
      </div>

      <Callout tone="amber" title="Live mode limitations in a browser">
        <ul className="list-disc space-y-1 pl-4">
          <li>GNSS quality (HDOP, satellite count, NavIC status) is not exposed by browsers, so it cannot be shown here.</li>
          <li>Raw accelerometer and gyroscope streams are not available at fixed rates in most browsers; motion-derived values are omitted rather than simulated.</li>
          <li>Tunnel dead-reckoning quality on a phone requires native sensor access. This page demonstrates the interface, not full DHRUVA estimation.</li>
        </ul>
      </Callout>

      {!caps.deviceMotionSupported && (
        <Callout tone="info" title="Motion sensors not exposed by this browser">
          The DeviceMotion API is unavailable here. DHRUVA live estimation would be limited on
          this device.
        </Callout>
      )}

      <div className="flex gap-2">
        <Link href="/setup?mode=live"><Button variant="outline">Setup</Button></Link>
        <Link href="/journey?mode=demo"><Button variant="outline">Switch to demo replay</Button></Link>
      </div>
      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}

function LiveMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface-raised p-2.5">
      <dt className="text-xs font-medium text-ink-600">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function bearingBetween(a: LiveFix, b: LiveFix): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
