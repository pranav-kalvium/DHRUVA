import type { Metadata } from "next";
import { Suspense } from "react";
import { JourneyClient } from "./journey-client";
import { LIMITATION_STATEMENT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Journey dashboard",
  description:
    "Live journey dashboard showing positioning mode, confidence corridor and tunnel progress during a simulated GNSS outage.",
  robots: { index: false, follow: true },
};

export default function JourneyPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <Suspense fallback={<JourneySkeleton />}>
        <JourneyClient />
      </Suspense>
      <p className="mt-4 text-center text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}

function JourneySkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-10 rounded-[8px] bg-surface-sunken" />
      <div className="h-[420px] rounded-[10px] bg-surface-sunken" />
      <div className="h-24 rounded-[10px] bg-surface-sunken" />
    </div>
  );
}
