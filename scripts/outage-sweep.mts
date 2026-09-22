/**
 * Outage sweep: runs the IDR benchmark at several outage positions and
 * durations over IO-VNBD V-S1 to show drift robustness rather than a single
 * cherry-picked window. Evidence, not decoration.
 *
 * Usage: npx tsx scripts/outage-sweep.mts [csvPath]
 */
import { readFileSync } from "node:fs";
import { parseIovnbdCsv } from "../src/engine/iov/iov-load.ts";
import { runIdrPipeline } from "../src/engine/iov/pipeline.ts";
import { haversine } from "../src/engine/geo.ts";
import type { MatchRoute } from "../src/engine/iov/map-matching.ts";

const csvPath = process.argv[2] ?? "data/iov/V-S1.csv";
const ds = parseIovnbdCsv(readFileSync(csvPath, "utf8"));
const rateHz = Math.round(1 / ds.medianDt);

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

const windows: Array<[number, number]> = [
  [0.15, 30],
  [0.2, 60],
  [0.35, 60],
  [0.5, 90],
  [0.65, 120],
];

console.log("start-at | duration | outage-dist | drift | drift % | verdict");
for (const [frac, durS] of windows) {
  const start = Math.floor(ds.samples.length * frac);
  const end = start + rateHz * durS;
  if (end >= ds.samples.length) continue;
  const res = runIdrPipeline(ds.samples, { route, rateHz, outageStart: start, outageEnd: end, frameStride: 5 });
  const endIdx = end - 1;
  const k = Math.floor(endIdx / 5);
  const last = res.frames[k];
  const truth = ds.samples[endIdx];
  const drift = haversine({ lat: last.drState.lat, lng: last.drState.lng }, { lat: truth.lat, lng: truth.lng });
  const outDist = route.cumulativeM[endIdx] - route.cumulativeM[start];
  const pct = (drift / Math.max(1, outDist)) * 100;
  console.log(
    `${Math.floor((start / rateHz / 60))}m${String(Math.floor((start / rateHz) % 60)).padStart(2, "0")}s    | ${String(durS).padStart(3)}s     | ${outDist.toFixed(0).padStart(6)}m   | ${drift.toFixed(1).padStart(6)}m | ${pct.toFixed(1).padStart(6)}% | ${pct < 10 ? "PASS" : "FAIL"}`,
  );
}
