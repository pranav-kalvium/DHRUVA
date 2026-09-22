/**
 * IO-VNBD dataset loader.
 *
 * Parses the "Synchronised V and S datasets" CSV published with
 * IO-VNBD: Inertial and Odometry benchmark dataset for ground vehicle
 * positioning (https://github.com/onyekpeu/IO-VNBD).
 *
 * The loader is dependency-free and synchronous over a string, so the same
 * module runs in Node (edge deployment, training scripts) and in the browser
 * (on-device inference over a user-provided recording).
 *
 * Dataset credit: Onyekpe et al., IO-VNBD (CC BY 4.0). The benchmark run used
 * here is V-S1 (suburban drive, University of Nottingham campus roads).
 */

/** One 10 Hz sample of the synchronised vehicle + GNSS channels. */
export interface IovnbdSample {
  /** GNSS satellites in view at this sample. */
  satellites: number;
  /** Seconds since start of day. */
  t: number;
  /** Degrees. */
  lat: number;
  /** Degrees. */
  lng: number;
  /** GNSS-derived ground speed, km/h. */
  gnssSpeedKmh: number;
  /** Degrees, true north referenced. */
  heading: number;
  /** Kilometres above mean sea level. */
  heightKm: number;
  /** Seconds between this sample and the previous one in the file. */
  dt: number;
  /** deg/s, right-hand positive. */
  yawRateDegPerSec: number;
  /** km/h from the vehicle indicator cluster. */
  indicatedSpeedKmh: number;
  /** g units, forward positive. */
  longitudinalAccelG: number;
  /** g units, right positive. */
  lateralAccelG: number;
  /** 0 or 1. */
  handbrake: number;
  /** 1-5, 0 when not reported. */
  gear: number;
  /** rev/min. */
  engineRpm: number;
  /** 0 or 1. */
  brake: number;
}

/** Parsed dataset plus derived constants used by the estimator modules. */
export interface IovnbdDataset {
  samples: IovnbdSample[];
  /** Median sample period in seconds (should be ~0.1 s for 10 Hz). */
  medianDt: number;
  durationS: number;
  totalDistanceM: number;
  source: string;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const NUM = (s: string): number => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Parse the raw CSV text. Column order follows the published header
 * (29 columns); see the IO-VNBD repository for the full description.
 */
export function parseIovnbdCsv(csv: string): IovnbdDataset {
  const lines = csv.split(/\r?\n/);
  // Row 0 is the header; row 1 is the first sample.
  const rows = lines.slice(1).filter((l) => l.trim().length > 0);
  const samples: IovnbdSample[] = [];

  for (const row of rows) {
    const c = row.split(",");
    if (c.length < 29) continue;
    samples.push({
      satellites: NUM(c[0]),
      t: NUM(c[1]),
      lat: NUM(c[2]),
      lng: NUM(c[3]),
      gnssSpeedKmh: NUM(c[4]),
      heading: NUM(c[5]),
      heightKm: NUM(c[6]),
      dt: NUM(c[8]),
      yawRateDegPerSec: NUM(c[14]),
      indicatedSpeedKmh: NUM(c[15]),
      longitudinalAccelG: NUM(c[16]),
      lateralAccelG: NUM(c[17]),
      handbrake: NUM(c[18]),
      gear: NUM(c[19]),
      engineRpm: NUM(c[21]),
      brake: NUM(c[25]),
    });
  }

  const dts = samples.slice(1).map((s) => s.dt).filter((d) => d > 0);
  const medianDt = median(dts);
  let totalDistanceM = 0;
  const toRad = Math.PI / 180;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dLat = (b.lat - a.lat) * toRad;
    const dLng = (b.lng - a.lng) * toRad;
    const latM = dLat * 6_371_000;
    const lngM = dLng * 6_371_000 * Math.cos((a.lat * toRad));
    totalDistanceM += Math.hypot(latM, lngM);
  }

  return {
    samples,
    medianDt,
    durationS: samples.length > 0 ? samples[samples.length - 1].t - samples[0].t : 0,
    totalDistanceM,
    source: "IO-VNBD V-S1 (Synchronised V and S datasets)",
  };
}
