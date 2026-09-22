"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { DRIVE_RECORDING } from "@/engine/iov/drive-loader";
import { runIdrPipeline } from "@/engine/iov/pipeline";
import { haversine } from "@/engine/geo";
import type { MatchRoute } from "@/engine/iov/map-matching";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CountUp, FadeContent } from "@/components/reactbits";
import { LIMITATION_STATEMENT } from "@/lib/constants";

/**
 * Results for the real recorded drive: the same pipeline that runs in the
 * dashboard, evaluated over the whole recording with the recorded GNSS
 * withheld during the outage window. Metrics are computed on the fly from
 * the actual estimator output - nothing here is authored or simulated.
 */
function ResultsInner() {
  const results = useMemo(() => {
    const { samples, rateHz, outageStart, outageEnd } = DRIVE_RECORDING;
    const route: MatchRoute = {
      points: samples.map((s) => ({ lat: s.lat, lng: s.lng })),
      cumulativeM: (() => {
        const cum = [0];
        const toRad = Math.PI / 180;
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1];
          const b = samples[i];
          const n = (b.lat - a.lat) * toRad * 6_371_000;
          const e = (b.lng - a.lng) * toRad * 6_371_000 * Math.cos(a.lat * toRad);
          cum.push(cum[i - 1] + Math.hypot(n, e));
        }
        return cum;
      })(),
    };
    const run = runIdrPipeline(samples, { route, rateHz, outageStart, outageEnd, frameStride: 5 });
    const endIdx = outageEnd - 1;
    const k = Math.min(Math.floor(endIdx / 5), run.frames.length - 1);
    const lastDr = run.frames[k].drState;
    const truth = samples[endIdx];
    const driftM = haversine(
      { lat: lastDr.lat, lng: lastDr.lng },
      { lat: truth.lat, lng: truth.lng },
    );
    const outageDistM = route.cumulativeM[endIdx] - route.cumulativeM[outageStart];
    // Outage duration from the last DR source frame span.
    let drFrames = 0;
    for (const f of run.frames) if (f.deadReckoning) drFrames++;
    const outageDurS = drFrames * 5 / rateHz;
    return {
      driftM,
      driftPct: (driftM / Math.max(1, outageDistM)) * 100,
      outageDistM,
      outageDurS,
      durationS: samples.length / rateHz,
      distanceM: route.cumulativeM[route.cumulativeM.length - 1],
      frames: run.frames.length,
      mount: run.alignment.mount,
      confidence: run.alignment.confidence,
    };
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pass = results.driftPct < 10;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Drive results</h1>
          <p className="mt-1 text-sm text-ink-600">
            IO-VNBD V-S1 recorded drive · {fmt(results.durationS)} · {Math.round(results.distanceM)} m
          </p>
        </div>
        <Badge tone={pass ? "green" : "amber"}>
          {pass ? "Within 10% drift target" : "Above 10% drift target"}
        </Badge>
      </header>

      <Callout tone="amber" title="What these numbers are">
        Computed live from the real pipeline over the recorded drive: the estimator ran with GNSS
        withheld for the whole outage window, then its endpoint was compared against the recorded
        GNSS truth at the same instant. This is measured estimator performance on recorded data,
        not a simulation and not an in-vehicle validation.
      </Callout>

      <FadeContent duration={600} threshold={0.1}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Dead-reckoning drift"
            value={<><CountUp to={Math.round(results.driftM)} /> m</>}
            sub={`${results.driftPct.toFixed(1)}% of outage distance`}
            tone={pass ? "ok" : "amber"}
          />
          <Metric
            label="Outage distance"
            value={<><CountUp to={Math.round(results.outageDistM)} /> m</>}
            sub="GNSS withheld entirely"
            tone="plain"
          />
          <Metric
            label="Outage duration"
            value={<>{fmt(results.outageDurS)}</>}
            sub="estimated on IMU only"
            tone="plain"
          />
          <Metric
            label="Benchmark"
            value={pass ? "PASS" : "FAIL"}
            sub="target: drift < 10% of distance"
            tone={pass ? "ok" : "warn"}
          />
        </div>
      </FadeContent>

      <Card>
        <CardHeader
          title="How to read this"
          subtitle="Evidence, honestly bounded"
        />
        <div className="space-y-2 p-4 pt-0 text-sm text-ink-600">
          <p>
            <strong className="text-ink-900">Position continuity:</strong> the fused track never
            freezes or teleports through the outage; the map shows the fused estimate and the
            recorded truth side by side.
          </p>
          <p>
            <strong className="text-ink-900">Endpoint error:</strong> measured above - it is the
            distance between the estimated and recorded position when GNSS returns.
          </p>
          <p>
            <strong className="text-ink-900">Not measured here:</strong> drift behaviour on other
            road networks, per-satellite NavIC behaviour, and in-vehicle phone-mount variance.
            The <Link className="text-navy-700 underline underline-offset-2" href="/feasibility">feasibility page</Link>{" "}
            tracks what is validated and what is not.
          </p>
        </div>
      </Card>

      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>

      <div className="flex gap-2">
        <Link href="/journey">
          <Button>Back to the drive</Button>
        </Link>
        <Link href="/how-it-works">
          <Button variant="outline">How the pipeline works</Button>
        </Link>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: "ok" | "amber" | "warn" | "plain";
}) {
  const toneClass =
    tone === "ok" ? "text-trust-600" : tone === "amber" ? "text-amber-strong" : tone === "warn" ? "text-warn-600" : "text-ink-900";
  return (
    <div className="rounded-[10px] border border-line bg-white p-4">
      <p className="text-xs font-medium text-ink-600">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-600">{sub}</p>
    </div>
  );
}

export function ResultsClient() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink-600">Loading results…</div>}>
      <ResultsInner />
    </Suspense>
  );
}
