import type { MessageId } from "@/engine/types";

export interface MessageContent {
  title: string;
  body: string;
  severity: "info" | "amber" | "green" | "red";
}

export const MESSAGES: Record<MessageId, MessageContent> = {
  INITIALIZING: {
    title: "Initializing positioning",
    body: "Acquiring satellite fixes and aligning sensors.",
    severity: "info",
  },
  TUNNEL_AHEAD: {
    title: "Tunnel ahead",
    body: "DHRUVA guidance ready. Signal will drop inside; guidance continues.",
    severity: "amber",
  },
  SIGNAL_WEAK: {
    title: "Signal weakening",
    body: "Satellite quality is falling near the portal. Preparing estimation.",
    severity: "amber",
  },
  TAKEOVER: {
    title: "DHRUVA guidance active",
    body: "Navigation continues using your phone's motion sensors and the road map.",
    severity: "amber",
  },
  LOW_CONFIDENCE: {
    title: "Position confidence is low",
    body: "Follow road signs. The estimate is approximate while the outage lasts.",
    severity: "red",
  },
  VERIFYING_FIXES: {
    title: "Checking returning satellite fixes",
    body: "Fixes are quality-gated before blending. Position snaps only after verification.",
    severity: "info",
  },
  RESTORED: {
    title: "Satellite positioning restored",
    body: "Confidence is rebuilding. Position blended without a visible jump.",
    severity: "green",
  },
  COMPLETE: {
    title: "Journey complete",
    body: "The vehicle exited the tunnel and confidence was rebuilt.",
    severity: "green",
  },
};
