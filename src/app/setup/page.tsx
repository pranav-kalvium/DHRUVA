import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupClient } from "./setup-client";

export const metadata: Metadata = {
  title: "Journey setup",
  description:
    "Choose demo replay or live device mode, review sensor readiness and start a DHRUVA demonstration journey.",
};

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupClient />
    </Suspense>
  );
}
