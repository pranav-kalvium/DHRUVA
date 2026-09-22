"use client";

import { DrivePlayerProvider } from "@/lib/drive-player-context";
import { DriveJourney } from "@/components/drive/drive-journey";

/**
 * Journey screen: the real IDR pipeline running over a recorded drive
 * (IO-VNBD V-S1, 10 Hz). There is no demo mode: playback of recorded sensor
 * data with the recorded GNSS outage is the app's operating mode, matching
 * how the estimator behaves on a phone during a tunnel.
 */
export function JourneyClient() {
  return (
    <DrivePlayerProvider>
      <DriveJourney />
    </DrivePlayerProvider>
  );
}
