import type { Metadata } from "next";
import Link from "next/link";
import { LIMITATION_STATEMENT, CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What location and motion data DHRUVA processes, what stays on your device, what is stored and transmitted, and how to withdraw permission.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Privacy policy</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Applies to the DHRUVA web prototype. Written to be checked against the actual
          implementation, not to overpromise.
        </p>
      </header>

      <section aria-labelledby="processed">
        <h2 id="processed" className="text-base font-bold text-ink-900">What location information is processed</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-600">
          <li><strong>Live Device Mode:</strong> your browser's location fixes (latitude, longitude, reported accuracy, timestamp) are read after you explicitly grant permission, to display your position and motion.</li>
          <li><strong>Demo Replay Mode:</strong> no real location is read. The journey is a deterministic simulation stored with this application.</li>
          <li>Derived values shown in the interface (speed, heading from consecutive fixes) are computed from those fixes in your browser.</li>
        </ul>
      </section>

      <section aria-labelledby="ondevice">
        <h2 id="ondevice" className="text-base font-bold text-ink-900">Processing happens on your device</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Position computation, mode transitions and the estimation model run in your browser as
          part of the application code. The prototype has no positioning server.
        </p>
      </section>

      <section aria-labelledby="stored">
        <h2 id="stored" className="text-base font-bold text-ink-900">What is stored</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-600">
          <li>This prototype stores nothing: no trip history, no settings and no location data persist after you close the tab. Refreshing the page clears everything.</li>
          <li>Standard browser caches (application assets) may exist; they contain code, not your location.</li>
        </ul>
      </section>

      <section aria-labelledby="transmitted">
        <h2 id="transmitted" className="text-base font-bold text-ink-900">What is transmitted</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-600">
          <li>Location and motion values are never transmitted by this prototype. There is no analytics SDK, no advertising SDK and no third-party tracker in the codebase.</li>
          <li>Loading this site downloads the application code itself from web servers, which is standard for any website. Your location is not part of that.</li>
        </ul>
      </section>

      <section aria-labelledby="retention">
        <h2 id="retention" className="text-base font-bold text-ink-900">Retention</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Because nothing is stored or transmitted, there is no server-side retention of your
          location or motion data. Closing the tab ends all processing.
        </p>
      </section>

      <section aria-labelledby="controls">
        <h2 id="controls" className="text-base font-bold text-ink-900">Your controls</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-600">
          <li>Permission is requested at the moment you start Live Device Mode, with an explanation, and never silently.</li>
          <li>You can withdraw permission at any time in your browser's site settings; the app then shows a permission-denied state and stops reading location.</li>
          <li>You can use Demo Replay Mode, which needs no permission and reads nothing from your device, at any time.</li>
        </ul>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact" className="text-base font-bold text-ink-900">Contact</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Privacy questions: <a className="text-navy-700 underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the{" "}
          <Link className="text-navy-700 underline underline-offset-2" href="/terms">terms</Link> and the{" "}
          <Link className="text-navy-700 underline underline-offset-2" href="/contact">contact page</Link>.
        </p>
      </section>

      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
