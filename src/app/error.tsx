"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a production build this would go to telemetry; the prototype only logs.
    console.error("DHRUVA render error:", error.message);
  }, [error]);

  const errorId = error.digest ?? "unknown";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-600">Something went wrong</p>
      <h1 className="mt-1 text-2xl font-bold text-ink-900">This view failed to load</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        An unexpected application error stopped this screen. Your data was not affected: the
        prototype stores nothing. You can retry this screen or return to the dashboard.
      </p>
      <p className="mt-3 rounded-[6px] bg-surface-sunken px-3 py-2 text-xs text-ink-600">
        Technical identifier for support: <span className="tabular font-semibold">{errorId}</span>
        {error.message ? <span className="mt-1 block">Detail: {error.message}</span> : null}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>Retry this screen</Button>
        <Link href="/journey?mode=demo"><Button variant="outline">Return to dashboard</Button></Link>
        <Link href="/"><Button variant="ghost">Back to introduction</Button></Link>
      </div>
    </div>
  );
}
