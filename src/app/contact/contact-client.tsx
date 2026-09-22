"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { CONTACT_EMAIL } from "@/lib/constants";

const CATEGORIES = [
  "Bug report",
  "Question about methodology",
  "Data or privacy question",
  "Demo or evaluation request",
] as const;

export function ContactClient() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "offline">("idle");

  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (description.trim().length < 20)
      errs.push("Please describe the issue in at least 20 characters so we can act on it.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.push("Enter a valid email address so we can reply.");
    setErrors(errs);
    if (errs.length > 0) return;

    // The prototype has no backend: this form composes an email instead of
    // pretending to submit to a ticketing system that does not exist.
    const subject = encodeURIComponent(`[DHRUVA prototype] ${category}`);
    const body = encodeURIComponent(`${description.trim()}\n\nReply to: ${email.trim()}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(online ? "sent" : "offline");
  };

  if (status === "sent") {
    return (
      <Callout tone="green" title="Your email draft is ready">
        Your mail application should have opened with the message prepared. If it did not, write
        to <a className="underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> directly.
        <div className="mt-3">
          <Button variant="outline" onClick={() => setStatus("idle")}>Write another message</Button>
        </div>
      </Callout>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Report an issue or ask a question"
        subtitle="This prototype has no server. Submitting opens a pre-filled email in your mail application."
      />
      <form onSubmit={submit} noValidate className="space-y-4 p-4">
        {errors.length > 0 && (
          <div role="alert" className="rounded-[8px] border border-warn-500/40 bg-warn-50 p-3 text-sm text-warn-600">
            <p className="font-semibold">Please fix the following:</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink-900">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 h-11 w-full rounded-[6px] border border-line bg-white px-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            Your email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.some((er) => er.includes("email"))}
            className="mt-1 h-11 w-full rounded-[6px] border border-line px-3 text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-ink-900">
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={errors.some((er) => er.includes("20 characters"))}
            aria-describedby="description-hint"
            className="mt-1 w-full rounded-[6px] border border-line px-3 py-2 text-sm"
            placeholder="What happened, what you expected, and which mode you were using."
          />
          <p id="description-hint" className="mt-1 text-xs text-ink-600">
            Minimum 20 characters. Do not include location data you do not want to share.
          </p>
        </div>

        <Button type="submit" loading={status === "sending"} disabled={!online}>
          Prepare email
        </Button>
        {!online && (
          <p className="text-xs text-amber-strong">
            You appear to be offline. Reconnect to prepare the email.
          </p>
        )}
      </form>
    </Card>
  );
}
