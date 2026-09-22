import type { Metadata } from "next";
import Link from "next/link";
import { LIMITATION_STATEMENT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "FAQ about DHRUVA: tunnel navigation, permissions, privacy, offline behavior, NavIC and the limits of the prototype.",
  alternates: { canonical: "/faq" },
};

const FAQS = [
  {
    q: "What exactly does DHRUVA do in a tunnel?",
    a: "When satellite positioning degrades or fails, DHRUVA keeps estimating your position from phone motion sensors, constrained to the road corridor, and shows an uncertainty corridor that widens the longer the outage lasts. When satellites return, fixes are quality-checked before being blended back in.",
  },
  {
    q: "Is the demo showing real data?",
    a: "No. Demo Replay Mode is a deterministic simulation, labeled DEMO DATA everywhere it appears. Live Device Mode uses your browser's real location, but browsers do not expose satellite internals like HDOP or NavIC status, so those fields are shown as not available rather than made up.",
  },
  {
    q: "Why does the app need location and motion permissions?",
    a: "Location shows where you are; motion sensors keep an estimate alive during signal loss. In this web prototype only location is available to browsers. Permission is requested explicitly, explained in context, and nothing is transmitted.",
  },
  {
    q: "Does it work offline?",
    a: "Demo Replay Mode works fully offline: the route geometry and estimation model are bundled with the application. Live Device Mode needs whatever location source your browser can use, which may degrade without network assistance.",
  },
  {
    q: "Does DHRUVA support NavIC?",
    a: "The design treats NavIC as a first-class positioning source, and the architecture exposes it when a device reports it. This web prototype cannot display NavIC status because browsers do not expose constellation information; that requires a native Android application.",
  },
  {
    q: "How accurate is the position inside a tunnel?",
    a: "It depends on outage duration and sensor quality. The prototype does not claim a number: instead of a made-up accuracy figure, it shows a growing uncertainty corridor and raises a low-confidence advisory during long outages. Measured accuracy on real drives is future work.",
  },
  {
    q: "What happens if the outage lasts longer than the tunnel?",
    a: "Uncertainty keeps growing and the confidence state drops to Low, with an explicit advisory to follow road signs. The system is designed for short outages; it is honest about declining quality rather than pretending precision.",
  },
  {
    q: "Is my location data stored or shared?",
    a: "No. In this prototype location is processed in your browser, never transmitted, and nothing is stored after you close the tab. See the privacy policy for the full detail.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Frequently asked questions</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Short, factual answers about tunnels, permissions, privacy and limits.
        </p>
      </header>

      <section aria-label="Questions and answers" className="space-y-3">
        {FAQS.map((f, i) => (
          <details
            key={i}
            className="group rounded-[10px] border border-line bg-white px-4 py-3 open:bg-surface-raised"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900 marker:hidden">
              <span className="flex items-center justify-between gap-3">
                {f.q}
                <span aria-hidden className="text-navy-600 transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-2 text-sm leading-6 text-ink-600">{f.a}</p>
          </details>
        ))}
      </section>

      <p className="text-sm text-ink-600">
        More questions? <Link className="text-navy-700 underline underline-offset-2" href="/contact">Contact us</Link>.
      </p>
      <p className="text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
