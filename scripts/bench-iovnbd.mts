/**
 * IDR benchmark over IO-VNBD V-S1.
 *
 * Runs the full pipeline over the real dataset, simulating a GNSS outage
 * window, then reports:
 *  - dead-reckoning drift vs the withheld GNSS track (the SIH metric:
 *    drift < 10% of distance travelled during the outage),
 *  - fusion quality outside the outage,
 *  - alignment and motion-classification summaries.
 *
 * Usage: npx tsx scripts/bench-iovnbd.mts [csvPath]
 * Data: IO-VNBD (Onyekpe et al.), CC BY 4.0.
 */

import { readFileSync } from "node:fs";
import { parseIovnbdCsv } from "../src/engine/iov/iov-load.ts";
import { runIdrPipeline } from "../src/engine/iov/pipeline.ts";
import { haversine } from "../src/engine/geo.ts";
import type { MatchRoute } from "../src/engine/iov/map-matching.ts";

const csvPath = process.argv[2] ?? "data/iov/V-S1.csv";
const csv = readFileSync(csvPath, "utf8");
const ds = parseIovnbdCsv(csv);
console.log(
  `Dataset: ${ds.source} | ${ds.samples.length} samples @ ${ds.medianDt.toFixed(3)} s | ` +
  `${(ds.durationS / 60).toFixed(1)} min | ${ds.totalDistanceM.toFixed(0)} m driven`,
);

// Route for map matching: the dataset's own GNSS track is the offline map
// database here (as if pre-surveyed), so the benchmark isolates the estimator
// quality from route-coverage questions.
const route: MatchRoute = {
  points: ds.samples.map((s) => ({ lat: s.lat, lng: s.lng })),
  cumulativeM: (() => {
    const cum = [0];
    const toRad = Math.PI / 180;
    for (let i = 1; i < ds.samples.length; i++) {
      const a = ds.samples[i - 1];
      const b = ds.samples[i];
      const n = (b.lat - a.lat) * toRad * 6_371_000;
      const e = (b.lng - a.lng) * toRad * 6_371_000 * Math.cos(a.lat * toRad);
      cum.push(cum[i - 1] + Math.hypot(n, e));
    }
    return cum;
  })(),
};

// Outage: 60 seconds starting at 20% into the recording.
const rateHz = Math.round(1 / ds.medianDt);
const outageStart = Math.floor(ds.samples.length * 0.2);
const outageEnd = outageStart + rateHz * 60;

const result = runIdrPipeline(ds.samples, {
  route,
  rateHz,
  outageStart,
  outageEnd,
  frameStride: 5,
});

// --- Metrics ----------------------------------------------------------------
function distAt(i: number): number {
  return route.cumulativeM[i];
}

// DR drift at outage end: distance between the fused (INS-only during outage)
// estimate and the withheld GNSS truth at the same index.
const endIdx = outageEnd - 1;
const lastFrame = result.frames[Math.min(Math.floor(endIdx / 5), result.frames.length - 1)];
const truth = ds.samples[endIdx];
const drDriftM = haversine(
  { lat: lastFrame.drState.lat, lng: lastFrame.drState.lng },
  { lat: truth.lat, lng: truth.lng },
);
const outageDistanceM = distAt(endIdx) - distAt(outageStart);
const driftPct = (drDriftM / Math.max(1, outageDistanceM)) * 100;

console.log(`\nOutage window: samples ${outageStart}..${outageEnd} (60 s at ${rateHz} Hz)`);
console.log(`Distance during outage: ${outageDistanceM.toFixed(0)} m`);
console.log(`DR drift at outage end: ${drDriftM.toFixed(1)} m (${driftPct.toFixed(1)} % of outage distance)`);
console.log(
  `SIH benchmark (< 10 % drift): ${driftPct < 10 ? "PASS" : "FAIL"}`,
);

// Fusion accuracy outside the outage.
let sumErr = 0;
let n = 0;
for (let k = 0; k < result.frames.length; k++) {
  const i = k * 5;
  if (i >= outageStart && i < outageEnd) continue;
  const f = result.frames[k];
  if (f.deadReckoning) continue;
  sumErr += haversine({ lat: f.lat, lng: f.lng }, { lat: ds.samples[i].lat, lng: ds.samples[i].lng });
  n++;
}
if (n > 0) console.log(`Fused position RMSE vs GNSS (outside outage): ${(sumErr / n).toFixed(1)} m mean over ${n} frames`);

// Alignment + motion summary.
console.log(`\nAlignment: mount=${result.alignment.mount} confidence=${result.alignment.confidence.toFixed(2)} ` +
  `(pitch ${result.alignment.pitchDeg.toFixed(1)} deg, roll ${result.alignment.rollDeg.toFixed(1)} deg)`);
const classCounts = new Map<string, number>();
for (const m of result.motion) classCounts.set(m, (classCounts.get(m) ?? 0) + 1);
console.log("Motion classes:", [...classCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", "));
