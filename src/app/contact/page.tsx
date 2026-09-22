import type { Metadata } from "next";
import { ContactClient } from "./contact-client";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the DHRUVA prototype team: email, response expectations and an issue report form.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Contact</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Email: <a className="text-navy-700 underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </header>
      <ContactClient />
    </div>
  );
}
