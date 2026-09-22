"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useReplay } from "@/lib/replay-context";
import { LIMITATION_STATEMENT } from "@/lib/constants";

interface SensorRow {
  name: string;
  status: string;
  detail: string;
  ok: boolean;
}

export function TelemetryPanel() {
  const { frame, mode } = useReplay();
  const [open, setOpen] = useState(false);
  const panelId = "telemetry-details";

  const rows: SensorRow[] = [
    { name: "Accelerometer", status: "Simulated", detail: "Synthetic motion profile, 100-200 Hz", ok: true },
    { name: "Gyroscope", status: "Simulated", detail: "Synthetic turn-rate, drives heading", ok: true },
    { name: "Magnetometer", status: "Simulated", detail: "Synthetic absolute heading reference", ok: true },
    { name: "Location (GNSS)", status: "Simulated", detail: "Modeled receiver with HDOP and satellite count", ok: true },
    { name: "Barometer", status: "Not simulated", detail: "Not required for this tunnel scenario", ok: false },
  ];

  return (
    <section aria-labelledby="telemetry-heading" className="rounded-[10px] border border-line bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 id="telemetry-heading" className="text-sm font-semibold text-ink-900">
          Technical telemetry
        </h3>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-[6px] px-2.5 text-xs font-semibold text-navy-700 hover:bg-steel-100"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide details" : "Show details"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pb-3 text-xs sm:grid-cols-3">
        <Metric label="Estimation status" value={labelFor(frame.mode)} />
        <Metric label="Map matching" value={`Aligned (${frame.matches} snaps)`} />
        <Metric label="Confidence" value={frame.confidence.toLowerCase()} />
        <Metric label="Update frequency" value={`${frame.sensorHz} Hz`} />
        <Metric label="Processing latency" value={`${frame.latencyMs} ms`} />
        <Metric label="Sensor timestamp" value={lastSensorStamp(frame.t)} />
      </div>

      <div id={panelId} hidden={!open} className="border-t border-line px-4 py-3">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Sensor availability for this run</caption>
          <thead>
            <tr className="text-ink-600">
              <th scope="col" className="py-1 font-medium">Sensor</th>
              <th scope="col" className="py-1 font-medium">Status</th>
              <th scope="col" className="hidden py-1 font-medium sm:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <th scope="row" className="py-1.5 font-medium text-ink-900">{r.name}</th>
                <td className="py-1.5">
                  <Badge tone={r.ok ? "blue" : "gray"}>{r.status}</Badge>
                </td>
                <td className="hidden py-1.5 text-ink-600 sm:table-cell">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-600">
          {mode === "demo"
            ? "All values in this panel are simulated for the demonstration replay. They are not live sensor readings."
            : "Live values are only shown for sensors the browser exposes; others read Not available."}
          {" "}{LIMITATION_STATEMENT}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-600">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

function labelFor(mode: string): string {
  switch (mode) {
    case "GNSS_AVAILABLE": return "GNSS positioning";
    case "GNSS_DEGRADING": return "Weighted fusion";
    case "DHRUVA_ACTIVE": return "Dead reckoning";
    case "GNSS_REACQUIRING": return "Gated blending";
    case "GNSS_RESTORED": return "GNSS + DR blend";
    case "CONFIDENCE_LOW": return "DR, low confidence";
    default: return "Unavailable";
  }
}

function lastSensorStamp(t: number): string {
  const total = Math.floor(t);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `T+${mm}:${String(ss).padStart(2, "0")}`;
}
