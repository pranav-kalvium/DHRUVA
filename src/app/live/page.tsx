import type { Metadata } from "next";
import { LiveClient } from "./live-client";

export const metadata: Metadata = {
  title: "Live navigation | DHRUVA",
  description:
    "Real-time device positioning: GNSS latitude, longitude, speed, heading and accuracy with inertial estimation when satellites drop.",
  alternates: { canonical: "/live" },
};

export default function LivePage() {
  return <LiveClient />;
}
