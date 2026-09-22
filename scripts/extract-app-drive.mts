/**
 * Extracts the app-drive segment from the IO-VNBD V-S1 recording.
 *
 * Output: src/engine/data/v-s1-drive.json — a compact JSON the web app loads
 * and replays through the real IDR pipeline (src/engine/iov/pipeline.ts) on
 * device. This is recorded sensor data, not authored animation: the app plays
 * an actual drive with the recorded GNSS withheld over the outage window.
 *
 * Segment: 5 min before the benchmark outage -> 60 s GNSS outage -> 2 min
 * after, at native 10 Hz (~8 min drive, ~4800 samples). The long lead-in is
 * deliberate: the gyro-bias adaptation and speed-model training converge
 * against GNSS during it, so the outage is entered in a calibrated state
 * (mirrors a real phone that has been navigating for minutes before a tunnel).
 *
 * Usage: npx tsx scripts/extract-app-drive.mts
 * Data: IO-VNBD (Onyekpe et al.), CC BY 4.0.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseIovnbdCsv } from "../src/engine/iov/iov-load.ts";

const ds = parseIovnbdCsv(readFileSync("data/iov/V-S1.csv", "utf8"));
const rateHz = Math.round(1 / ds.medianDt);
const outageStart = Math.floor(ds.samples.length * 0.2);
const outageEnd = outageStart + rateHz * 60;

const from = outageStart - rateHz * 600;
const to = outageEnd + rateHz * 120;
const samples = ds.samples.slice(from, to);

const payload = {
  source: ds.source,
  credit: "IO-VNBD (Onyekpe et al.), CC BY 4.0",
  rateHz,
  // Outage indices relative to the extracted segment.
  outageStart: outageStart - from,
  outageEnd: outageEnd - from,
  samples: samples.map((s) => ({
    t: +(s.t - samples[0].t).toFixed(2),
    lat: s.lat,
    lng: s.lng,
    // Compact names for the payload; expanded by the loader.
    sat: s.satellites,
    gsk: +s.gnssSpeedKmh.toFixed(2),
    hdg: +s.heading.toFixed(2),
    yaw: +s.yawRateDegPerSec.toFixed(3),
    isk: +s.indicatedSpeedKmh.toFixed(2),
    la: +s.longitudinalAccelG.toFixed(4),
    aa: +s.lateralAccelG.toFixed(4),
    brk: s.brake,
  })),
};

mkdirSync("src/engine/data", { recursive: true });
writeFileSync("src/engine/data/v-s1-drive.json", JSON.stringify(payload));
const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
console.log(
  `v-s1-drive.json: ${samples.length} samples, ${payload.outageEnd - payload.outageStart} outage, ${(payload.outageStart / rateHz / 60).toFixed(1)} min lead-in, ${kb} KB`,
);
