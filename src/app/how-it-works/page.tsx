import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedContent } from "@/components/reactbits";
import { LIMITATION_STATEMENT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "How DHRUVA works",
  description:
    "The DHRUVA pipeline: smartphone sensors, motion estimation, error-state filtering with vehicle constraints, offline map matching and quality-gated GNSS blending.",
  alternates: { canonical: "/how-it-works" },
};

const PIPELINE = [
  {
    title: "Smartphone sensors",
    body: "Accelerometer, gyroscope and magnetometer track motion and turning; the GNSS receiver provides an absolute reference when signals are usable.",
  },
  {
    title: "Motion estimation",
    body: "Speed and heading changes are integrated over short intervals to predict where the vehicle moved, even when no fix arrives.",
  },
  {
    title: "Error-state filtering and vehicle constraints",
    body: "A filter blends sensor predictions with occasional fixes. Vehicle constraints reject impossible motion: cars do not jump lanes or reverse instantly.",
  },
  {
    title: "Offline map matching",
    body: "The estimate is snapped to the known road network so it stays on a realistic path. Route geometry for the demo is bundled, so this works offline.",
  },
  {
    title: "Position and uncertainty",
    body: "The output is a position plus an honest error radius. The uncertainty corridor widens the longer the outage lasts; it is never hidden.",
  },
  {
    title: "Navigation display",
    body: "The dashboard shows mode, confidence, speed, heading and tunnel progress, with status messages at each transition.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">How DHRUVA works</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-600">
          DHRUVA combines what the phone can sense with what the road allows. The pipeline below
          is implemented in this prototype as a deterministic estimation model that you can watch
          in the demo replay.
        </p>
      </header>

      <section aria-label="Pipeline">
        <ol className="space-y-2.5">
          {PIPELINE.map((step, i) => (
            <li key={step.title}>
              <AnimatedContent distance={32} duration={0.7} delay={i * 0.05} threshold={0.2}>
              <Card className="flex gap-3.5 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-sm font-bold text-ink-900">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink-600">{step.body}</p>
                </div>
              </Card>
              </AnimatedContent>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="boundaries-heading">
        <h2 id="boundaries-heading" className="text-lg font-bold text-ink-900">
          What each signal contributes
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink-900">GNSS: the absolute reference</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              When available, satellite fixes anchor the estimate to the real world. Quality is
              checked continuously; DHRUVA degrades to estimation before the signal fully fails.
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink-900">Motion sensors: the bridge</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              During degradation, motion sensing carries the estimate. It is relative: errors
              accumulate, which is why uncertainty grows and honesty about it matters.
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink-900">Road constraints: the sanity check</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Vehicles follow roads. Constraining the estimate to the mapped corridor removes
              unrealistic lateral drift during the outage.
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink-900">Quality gate: the discipline</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              Returning fixes are only blended if their reported quality passes a threshold.
              Weak, suspicious fixes are rejected, so recovery is calm instead of a jump.
            </p>
          </Card>
        </div>
      </section>

      <Callout tone="amber" title="Error still grows during long outages">
        Dead reckoning is not magic. Without absolute references, every estimate drifts; DHRUVA
        shows that drift as a widening corridor and raises a low-confidence advisory rather than
        pretending the position is still precise.
      </Callout>

      <div className="flex flex-wrap gap-2">
        <Link href="/journey?mode=demo"><Button>Watch the pipeline run</Button></Link>
        <Link href="/feasibility"><Button variant="outline">Validation status</Button></Link>
      </div>

      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
