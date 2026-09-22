import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LIMITATION_STATEMENT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Feasibility and validation",
  description:
    "What the DHRUVA prototype demonstrates, what is literature-supported, what has been measured, and what still requires validation.",
  alternates: { canonical: "/feasibility" },
};

export default function FeasibilityPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Feasibility and validation</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-600">
          An honest account of what is demonstrated by this prototype, what is supported by
          published literature, what has been measured, and what still requires validation.
          No invented percentages appear anywhere on this page.
        </p>
      </header>

      <Card>
        <CardHeader title="Demonstrated by this prototype" action={<Badge tone="green">Working code</Badge>} />
        <ul className="list-disc space-y-1.5 px-8 py-4 text-sm leading-6 text-ink-600">
          <li>A complete GNSS-outage journey replay: healthy positioning, degradation, dead-reckoning takeover, low-confidence advisory, quality-gated reacquisition and restoration.</li>
          <li>Deterministic behavior: the same replay always produces the same trajectory and telemetry, suitable for evaluation and regression testing.</li>
          <li>Uncertainty visualization that widens during the outage and narrows only after verified fixes, and never disappears inside the tunnel.</li>
          <li>Seven-state positioning mode machine with a timeline of transitions in the results view.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Literature-supported concepts" action={<Badge tone="blue">Published research</Badge>} />
        <ul className="list-disc space-y-1.5 px-8 py-4 text-sm leading-6 text-ink-600">
          <li>Automotive dead reckoning using consumer inertial sensors is an established research area; typical systems bound drift with vehicle and map constraints.</li>
          <li>Map matching against road networks is standard practice in navigation-grade estimators.</li>
          <li>Quality-gated GNSS reacquisition, rejecting fixes by reported accuracy before blending, follows standard filter practice.</li>
          <li>Smartphone-class sensors are adequate for short outages but accumulate error quadratically without absolute correction, which is why honesty about uncertainty is central to this design.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Measured in this project" action={<Badge tone="gray">Limited</Badge>} />
        <ul className="list-disc space-y-1.5 px-8 py-4 text-sm leading-6 text-ink-600">
          <li>Replay-metric integrity: outage duration, estimated distance inside the tunnel and peak uncertainty are computed by the engine and covered by automated tests.</li>
          <li>Endpoint error, drift per outage second and real-device sensor performance: <strong>Not measured in this run</strong>. These require real drives with ground truth, which this prototype has not performed.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Requires future validation" action={<Badge tone="amber">Planned</Badge>} />
        <ul className="list-disc space-y-1.5 px-8 py-4 text-sm leading-6 text-ink-600">
          <li>Real-world drives through representative Indian tunnels with surveyed ground truth.</li>
          <li>NavIC-capable device behavior across chipset vendors, since Android exposes constellation support unevenly.</li>
          <li>Battery and thermal impact of continuous high-rate sensor sampling during navigation.</li>
          <li>Cross-device sensor quality variance across entry-level, mid-range and flagship Android hardware.</li>
          <li>Long-outage behavior beyond the demo scenario, where uncertainty growth demands user-facing handoff to road signage.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Supported device assumptions" />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Device assumptions for DHRUVA estimation</caption>
            <thead>
              <tr className="text-xs text-ink-600">
                <th scope="col" className="py-1.5 font-medium">Assumption</th>
                <th scope="col" className="py-1.5 font-medium">Why it matters</th>
                <th scope="col" className="py-1.5 font-medium">If absent</th>
              </tr>
            </thead>
            <tbody className="border-t border-line">
              <tr className="border-b border-line">
                <th scope="row" className="py-2 font-medium text-ink-900">3-axis accelerometer</th>
                <td className="py-2 text-ink-600">Longitudinal motion</td>
                <td className="py-2 text-ink-600">Estimation quality drops sharply</td>
              </tr>
              <tr className="border-b border-line">
                <th scope="row" className="py-2 font-medium text-ink-900">3-axis gyroscope</th>
                <td className="py-2 text-ink-600">Turn-rate for heading</td>
                <td className="py-2 text-ink-600">Dead reckoning is disabled</td>
              </tr>
              <tr className="border-b border-line">
                <th scope="row" className="py-2 font-medium text-ink-900">Magnetometer</th>
                <td className="py-2 text-ink-600">Absolute heading reference</td>
                <td className="py-2 text-ink-600">Heading drifts; gyro-only mode</td>
              </tr>
              <tr>
                <th scope="row" className="py-2 font-medium text-ink-900">GNSS chip</th>
                <td className="py-2 text-ink-600">Absolute positioning</td>
                <td className="py-2 text-ink-600">No anchor; estimate-only mode</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Callout tone="info" title="Validation roadmap">
        Next steps in order: instrumented test drives with ground truth, published accuracy
        distributions per tunnel class, device-lab sensor benchmarking, then a field pilot with
        volunteer drivers. Each step gates the next; none may be skipped to claim readiness.
      </Callout>

      <div className="flex flex-wrap gap-2">
        <Link href="/journey?mode=demo"><Button>Run the demonstration</Button></Link>
        <Link href="/how-it-works"><Button variant="outline">Read the methodology</Button></Link>
      </div>

      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
