import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsClient } from "./results-client";

export const metadata: Metadata = {
  title: "Journey results",
  description:
    "Demonstration run results: continuity, outage duration, reacquisition behavior and simulated baseline comparison.",
  robots: { index: false, follow: true },
};

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ResultsClient />
    </Suspense>
  );
}
