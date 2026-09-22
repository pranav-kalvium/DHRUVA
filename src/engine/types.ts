/** Core data contracts for the DHRUVA estimation engine and replay. */

export interface LatLng {
  lat: number;
  lng: number;
}

export type PositioningMode =
  | "POSITION_UNAVAILABLE"
  | "GNSS_AVAILABLE"
  | "GNSS_DEGRADING"
  | "DHRUVA_ACTIVE"
  | "GNSS_REACQUIRING"
  | "GNSS_RESTORED"
  | "CONFIDENCE_LOW";

export type JourneyStage =
  | "BEFORE_TUNNEL"
  | "TUNNEL_ENTRY"
  | "INSIDE_TUNNEL"
  | "TUNNEL_EXIT"
  | "JOURNEY_COMPLETE";

export type MotionState =
  | "STOPPED"
  | "ACCELERATING"
  | "CRUISING"
  | "DECELERATING";

export type ConfidenceLevel = "HIGH" | "MODERATE" | "LOW";

export type GnssQuality = "NO_FIX" | "POOR" | "FAIR" | "GOOD";

export type MessageId =
  | "INITIALIZING"
  | "TUNNEL_AHEAD"
  | "SIGNAL_WEAK"
  | "TAKEOVER"
  | "LOW_CONFIDENCE"
  | "VERIFYING_FIXES"
  | "RESTORED"
  | "COMPLETE";

export type MessageSeverity = "info" | "amber" | "green" | "red";

export interface EngineMessage {
  id: MessageId;
  title: string;
  body: string;
  severity: MessageSeverity;
}

export interface GnssSample {
  quality: GnssQuality;
  hdop: number;
  satellites: number;
  /** Raw, noisy fix position. null when the receiver reports no fix. */
  rawFix: LatLng | null;
  /** True when this fix passes the DHRUVA quality gate (hdop <= max). */
  passesGate: boolean;
}

export interface EngineFrame extends EstimatorFrame {}

export interface EstimatorFrame {
  t: number;
  stage: JourneyStage;
  mode: PositioningMode;
  confidence: ConfidenceLevel;
  /** Constrained (map-matched) estimate shown as the vehicle position. */
  position: LatLng;
  heading: number;
  speedMps: number;
  motionState: MotionState;
  gnss: GnssSample;
  /** Distance travelled along the route, meters. */
  distance: number;
  uncertaintyMeters: number;
  /** Dead-reckoning counters while GNSS is unavailable. */
  drElapsedS: number;
  drDistanceM: number;
  /** 0..1 progress through the tunnel zone. */
  tunnelProgress: number;
  messageId: MessageId | null;
  /** Simulated on-device telemetry for the demo run. */
  sensorHz: number;
  latencyMs: number;
  matches: number;
}

export interface TimelineEvent {
  t: number;
  label: string;
  kind: "info" | "amber" | "green" | "red";
}

export interface JourneyResults {
  continuityPct: number;
  outageDurationS: number;
  drDistanceM: number;
  reacquisitionJumpM: number;
  maxUncertaintyM: number;
  recoveryBlendS: number;
  processingLatencyMs: number;
  timeline: TimelineEvent[];
  baselines: {
    gnssOnly: {
      staleSeconds: number;
      visualJumpM: number;
    };
    naiveImu: {
      finalOffsetFromRouteM: number;
      finalHeadingErrorDeg: number;
    };
    dhruva: {
      finalOffsetFromRouteM: number;
    };
  };
}

export interface SpeedPoint {
  /** Fraction of total route distance (0..1). */
  at: number;
  /** Target speed in km/h. */
  speedKmh: number;
}

export interface RouteData {
  id: string;
  kind: "highway" | "urban";
  name: string;
  region: string;
  description: string;
  /** Illustrative corridor geometry. Not a surveyed alignment. */
  points: LatLng[];
  /** Index of the polyline point where the tunnel portal sits. */
  tunnelEntryIndex: number;
  tunnelExitIndex: number;
  tunnelName: string;
  elevation?: string;
}

export interface RouteSummary {
  id: string;
  name: string;
  region: string;
  description: string;
  tunnelName: string;
  tunnelLengthM: number;
  totalDistanceM: number;
  durationS: number;
}
