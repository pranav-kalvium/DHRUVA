/** Product-wide constants and required copy. */

export const PRODUCT_NAME = "DHRUVA";
export const PRODUCT_FULL_FORM =
  "Dead-reckoning Hybrid Real-time Unified Vehicle Autonomy";

/** Required positioning statement (exact wording per the PRD brief). */
export const POSITIONING_STATEMENT =
  "Smartphone-native vehicle motion and positioning intelligence for short GNSS outages.";

/** Required limitation statement (exact wording per the PRD brief). */
export const LIMITATION_STATEMENT =
  "Navigation-assistance prototype. Not a safety-certified positioning system.";

export const CONTACT_EMAIL = "support@dhruva.app";

export const MODE_LABELS: Record<string, string> = {
  GNSS_AVAILABLE: "GNSS Available",
  GNSS_DEGRADING: "GNSS Degrading",
  DHRUVA_ACTIVE: "DHRUVA Active",
  GNSS_REACQUIRING: "GNSS Reacquiring",
  GNSS_RESTORED: "GNSS Restored",
  CONFIDENCE_LOW: "Confidence Low",
  POSITION_UNAVAILABLE: "Position Unavailable",
};

export const STAGE_LABELS: Record<string, string> = {
  BEFORE_TUNNEL: "Before Tunnel",
  TUNNEL_ENTRY: "Tunnel Entry",
  INSIDE_TUNNEL: "Inside Tunnel",
  TUNNEL_EXIT: "Tunnel Exit",
  JOURNEY_COMPLETE: "Journey Complete",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "High",
  MODERATE: "Moderate",
  LOW: "Low",
};

export const SPEEDS = [0.5, 1, 2, 4] as const;
