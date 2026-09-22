import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-600">Error 404</p>
      <h1 className="mt-1 text-2xl font-bold text-ink-900">This page does not exist</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        The address may be mistyped or the page may have moved. The journey dashboard and the
        introduction are both reachable below.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/journey"><Button>Open the journey dashboard</Button></Link>
        <Link href="/"><Button variant="outline">Back to introduction</Button></Link>
      </div>
    </div>
  );
}
