/**
 * Loader for the extracted app-drive recording (scripts/extract-app-drive.mts
 * output). Converts the compact JSON payload into pipeline-ready samples.
 *
 * This is recorded IO-VNBD sensor data, not authored content: lat/lng/GNSS
 * come from the vehicle's logged receiver, inertial channels from the
 * reference IMU. The app runs the real estimation pipeline over it.
 */
import raw from "../data/v-s1-drive.json";
import type { IovnbdSample } from "./iov-load";

/** One 10 Hz sample of the recording, pipeline-ready. */
export type DriveSample = IovnbdSample;

export interface DriveRecording {
  source: string;
  credit: string;
  rateHz: number;
  /** Outage window in sample indices (GNSS withheld here during playback). */
  outageStart: number;
  outageEnd: number;
  samples: DriveSample[];
}

const d = raw as {
  source: string;
  credit: string;
  rateHz: number;
  outageStart: number;
  outageEnd: number;
  samples: Array<{
    t: number;
    lat: number;
    lng: number;
    sat: number;
    gsk: number;
    hdg: number;
    yaw: number;
    isk: number;
    la: number;
    aa: number;
    brk: number;
  }>;
};

export const DRIVE_RECORDING: DriveRecording = {
  source: d.source,
  credit: d.credit,
  rateHz: d.rateHz,
  outageStart: d.outageStart,
  outageEnd: d.outageEnd,
  samples: d.samples.map((s) => ({
    satellites: s.sat,
    t: s.t,
    lat: s.lat,
    lng: s.lng,
    gnssSpeedKmh: s.gsk,
    heading: s.hdg,
    heightKm: 0,
    dt: 1 / d.rateHz,
    yawRateDegPerSec: s.yaw,
    indicatedSpeedKmh: s.isk,
    longitudinalAccelG: s.la,
    lateralAccelG: s.aa,
    handbrake: 0,
    gear: 0,
    engineRpm: 0,
    brake: s.brk,
  })),
};
