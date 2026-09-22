import Link from "next/link";
import {
  PRODUCT_NAME,
  LIMITATION_STATEMENT,
  CONTACT_EMAIL,
  PRODUCT_FULL_FORM,
} from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-raised">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm font-semibold text-ink-900">
          {PRODUCT_NAME} <span className="font-normal text-ink-600">| {PRODUCT_FULL_FORM}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-amber-strong" role="note">
          {LIMITATION_STATEMENT}
        </p>
        <nav aria-label="Footer" className="mt-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/live">Live navigation</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/journey">Recorded drive</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/how-it-works">How it works</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/feasibility">Feasibility</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/privacy">Privacy policy</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/terms">Terms</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/contact">Contact</Link></li>
            <li><Link className="text-navy-700 underline-offset-2 hover:underline" href="/faq">FAQ</Link></li>
          </ul>
        </nav>
        <p className="mt-4 text-xs text-ink-600">
          Questions: <a className="text-navy-700 underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Route geometry in the demo is illustrative and not a surveyed alignment.
        </p>
      </div>
    </footer>
  );
}
