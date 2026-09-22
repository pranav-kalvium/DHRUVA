# Progress — SIH 26168 Intelligent Dead Reckoning (DHRUVA)

## Current phase
P-APP: production-grade mobile app running the real IDR pipeline on real IO-VNBD
data (user redirect 2026-09-17: no demo mode, real recorded data, AI functioning,
production UI, fixed CSS, Android-ready). Runs after the P0-P5 engine foundation
below, which is verified.

## Checklist
### PRIORITY 1 — engine deliverable (verified before the app redirect)
- [x] P0. Scaffold + data ingestion (how: `npx tsx scripts/bench-iovnbd.mts` ->
      "51746 samples @ 0.100 s | 86.2 min | 38044 m driven" on IO-VNBD V-S1)
- [x] P1+P2. Bias handling + mount alignment (gravity-rotation via alignment
      module; stationary-bias tracking with ZUPT re-anchoring; verified inside
      the benchmark, drift numbers below)
- [x] P3. AI velocity model (online ridge regression, IMU window features ->
      GNSS-Doppler speed labels, trains on clean-GPS segments, infers during
      outages; held-out behaviour visible in outage drift)
- [x] P4+P5. DR integrator + outage harness (`scripts/outage-sweep.mts`),
      drift = % of outage distance:
      | start | dur | outage dist | drift | % |
      |---|---|---|---|---|
      | 12m56s | 30s | 260 m | 45.8 m | 17.6% FAIL |
      | 17m14s | 60s | 540 m | 35.9 m | 6.7% PASS |
      | 30m11s | 60s | 480 m | 89.8 m | 18.7% FAIL |
      | 43m07s | 90s | 667 m | 31.8 m | 4.8% PASS |
      | 56m03s | 120s | 568 m | 199.9 m | 35.2% FAIL |
- [ ] P6. docs write-up of results (pending; feasibility page partially covers)

### PRIORITY 2 — app deliverable (this loop's focus)
- [x] A1. CSS/runtime breakage fixed. Two root causes found and verified:
      (1) dev-server chunk 404s — production `npm run build` wrote `.next/`
      alongside dev; next.config.ts now isolates dev to `.next-dev` (and the
      corrupted `.next` was cleared). Verified: dynamic drive-map chunk loads,
      Leaflet renders 6+ live OSM tiles, marker + 4 SVG overlays present.
      (2) The service worker intercepted OSM tile requests and its worker-context
      CORS fetch failed -> tile fallback everywhere. SW registration is now
      production-only and stale dev registrations self-unregister. Verified:
      zero console errors on /journey after reload (preview_logs).
- [x] A2. Demo mode removed. `grep "DEMO DATA\|REPLAY"` returns nothing in src.
      The app plays a real recorded drive (IO-VNBD V-S1, 10 Hz, 13 min lead-in
      + 60 s GNSS outage) through the streaming online pipeline
      (src/engine/iov/pipeline-online.ts): learned-speed regression, ES-EKF
      fusion, NHC, ZUPT, map matching all run per-tick in the browser.
- [x] A3. UI reworked to the pipeline flow: stage rail (Sensor input -> GNSS
      health monitor -> AI motion estimation -> Sensor fusion (ES-EKF + NHC +
      ZUPT) -> Map matching -> Position + confidence), live speed/heading/
      confidence/positioning readouts, real map with fused track, outage window
      badge, timeline scrub + speed control + start/pause/restart. Verified in
      preview: scrub to 10:55 shows "Inertial (DR)" at 35 km/h during outage,
      GNSS resumes after 11:00 with confidence tightening to ±2 m.
- [x] A4. Mobile production shell: recorded-data labelling ("Recorded drive",
      GNSS OUTAGE WINDOW badge, RECORDED DATA chip - honest, not "live"),
      safe-area viewport-fit, install prompt, no demo branding.
- [x] A5. Android: `npm run build` (17/17 pages) -> `npx cap sync android`
      succeeded (copy+update 2026-09-17). APK build command documented in
      .freebuff/run.md (mobile:apk).
- [ ] A6. docs write-up + screenshots

## Latest verified numbers
- APP DRIVE (v-s1-drive.json, 13 min lead-in + outage): drift 44 m / 8.1% of
  540 m outage distance -> PASS vs the <10% target. Verified in the running app
  at /journey/results (preview_evaluate, 2026-09-17). Same window with a short
  2 min lead-in drifted 23.4%: calibration time before the outage is the
  dominant factor, which matches real tunnel driving (phones navigate minutes
  before entering).
- See P4+P5 table above for the full-corpus outage sweep (short-lead-in runs).
- Full-journey regression: `npm test` -> 24/24 passing (2026-09-17).
- Typecheck: `npx tsc --noEmit` clean (2026-09-17).

## Log (most recent first)
- 2026-09-17 (loop 4) FULL AUDIT LOOP - 9 bugs found and fixed, 2 features,
  33/33 tests. Bugs: (1) time-base mismatch: Geolocation epoch vs
  performance.now session clock made every fix look stale; fixed with a
  single session clock + epoch offset conversion. (2) Throttle strict-
  inequality dropped every other frame at integer-rate feeds (517/1500
  accepted); epsilon-fixed. (3) ZUPT clamped a MOVING car to 0 when the IMU
  went quiet mid-drive (would freeze a real phone's speed at sensor dropout);
  ZUPT now requires speed < 2 m/s. (4) DR polyline layer leaked on every
  render; now one reusable layer. (5) Route rebuild discarded gyro-bias
  calibration; bias now carried across DeadReckoner instances (setGyroBias).
  (6) Unbounded track memory; capped at 8000 points. (7) State machine
  conflated degraded/active; added gnss-degraded stage. (8) Fixture noise
  was 10x too small in g units (0.0012 g vs real 0.01-0.03 g), which the
  classifier correctly read as stationary - fixture fixed, gates verified.
  (9) Offline test hung on fetch; bounded. Features: end-of-session results
  panel (distance, outage count/time, worst drift, <10% benchmark verdict);
  unit tests for live engine (7) + tile math (2). Setup page now live-first
  with honest readiness checks. Verified: tsc clean, 33/33 tests, build
  18/18, preview walkthrough of /live + /setup + /journey all healthy,
  APK rebuilt (5.3 MB) and re-served at http://192.168.1.21:3110/apk.
- 2026-09-17 (loop 3) LIVE MODE SHIPPED: the product is now the user's real
  phone sensors. New /live screen (src/app/live/): real Geolocation lat/lon/
  accuracy/speed, DeviceMotion accelerometer + gyro, compass availability
  probed honestly, LiveIdrEngine (src/engine/iov/live-engine.ts) runs the
  estimator stack on-device: calibration window, vibration-filter speed
  model, DR with self-route map matching, outage state machine, live
  DR-vs-GNSS drift in metres and % of outage distance. No recorded data in
  the default flow; /journey (IO-VNBD) is now the secondary verification tool.
  Home CTA is Start live navigation. SW v3: cache-first tiles when offline,
  /live served from cache with zero connectivity (core tunnel use case).
  Android permissions added (FINE/COARSE location, sensors). Verified: tsc
  clean, 24/24 tests, build 18/18, cap sync + gradle OK, new APK 5.3 MB
  copied to DHRUVA-debug.apk and served at http://192.168.1.21:3110/apk.
  Desktop preview shows honest '--' + Notice state (no GPS hardware there).
- 2026-09-17 (loop 2): A1-A5 completed with verification above. Play + scrub
  verified live: outage segment shows Inertial (DR) with learned-model speed,
  post-outage returns to GNSS with ±2 m confidence. `npm test` 24/24,
  tsc clean, production build 17/17, cap sync android OK.
- 2026-09-17 (loop 1): created PROGRESS.md; began A1-A5 app rework.

## Blockers
- Sweep windows 12m56s/30m11s/56m03s exceed 10% drift: heading drift after
  missed turns dominates; needs HMM transition-model tuning (Newson-Krumm) —
  tracked, not blocking the app work.

## NEXT STEPS (read this first on resume)
- A1: audit src/app/globals.css + journey-map CSS for Android WebView support
  (no color-mix/oklch/@property unless gated); verify on the live map screen.
- A2: replace replay-context demo driver with an IO-VNBD recording player:
  stream the real CSV (downsampled for the web), run src/engine/iov/pipeline.ts
  per tick, feed JourneyMap. Mode selection: dataset drives, no synthetic demo.
- A3: dashboard layout per user's flow diagram; results = pipeline-stage view.
- A4/A5: Capacitor build re-verified; production UI polish pass.
