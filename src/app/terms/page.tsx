import type { Metadata } from "next";
import Link from "next/link";
import { LIMITATION_STATEMENT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "Terms for using the DHRUVA prototype, including the safety disclaimer for navigation assistance during GNSS outages.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Terms of use</h1>
        <p className="mt-1.5 text-sm text-ink-600">Prototype evaluation terms, in plain language.</p>
      </header>

      <section aria-labelledby="prototype">
        <h2 id="prototype" className="text-base font-bold text-ink-900">This is a prototype</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          DHRUVA is a demonstration of navigation-assistance concepts during short GNSS outages.
          It is not a certified navigation product, and its estimates are not guaranteed to be
          accurate on any particular device, road or tunnel.
        </p>
      </section>

      <section aria-labelledby="safety">
        <h2 id="safety" className="text-base font-bold text-ink-900">Safety disclaimer</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-ink-900">
          DHRUVA is a navigation aid. Always follow traffic laws, road signs and road conditions.
          Do not operate the interface while driving: have a passenger manage it or pull over.
          The displayed position is an estimate with visible uncertainty, not a guarantee of
          where you are.
        </p>
      </section>

      <section aria-labelledby="demo">
        <h2 id="demo" className="text-base font-bold text-ink-900">Demo data</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Demo Replay Mode shows a simulated journey with simulated sensor values, clearly
          labeled as demo data. Baseline comparisons are simulated models for orientation only
          and must not be quoted as measured performance.
        </p>
      </section>

      <section aria-labelledby="liability">
        <h2 id="liability" className="text-base font-bold text-ink-900">No warranty</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          The prototype is provided as-is for evaluation. To the maximum extent permitted by law,
          no warranty of accuracy, availability or fitness for any purpose is offered. Do not use
          it as a primary navigation source in safety-critical situations.
        </p>
      </section>

      <section aria-labelledby="ip">
        <h2 id="ip" className="text-base font-bold text-ink-900">Contact</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Questions about these terms: see the <Link className="text-navy-700 underline underline-offset-2" href="/contact">contact page</Link> or
          the <Link className="text-navy-700 underline underline-offset-2" href="/privacy">privacy policy</Link>.
        </p>
      </section>

      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
