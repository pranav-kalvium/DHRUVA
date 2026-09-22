"use client";

import { useEffect, useState } from "react";
import { MonitorDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "dhruva-install-dismissed";

/**
 * Install affordance for the PWA. When the browser fires
 * beforeinstallprompt, offer a one-tap "Install app"; otherwise show a short
 * hint pointing at the browser's own "Add to Home screen" menu. Dismissal is
 * remembered for the session so the banner never nags.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // If the event never fires (Firefox/iOS), surface the manual hint after a
    // short delay so the affordance exists everywhere but is not instantaneous.
    const t = window.setTimeout(() => {
      if (!installed) setVisible(true);
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(t);
    };
  }, [installed]);

  if (installed || !visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        sessionStorage.setItem(DISMISS_KEY, "1");
      }
      setVisible(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Install the app"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[10px] border border-line bg-white p-3 shadow-xl sm:inset-x-auto sm:right-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-navy-900">
        <MonitorDown className="h-4.5 w-4.5 text-white" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">Install DHRUVA</p>
        <p className="text-xs text-ink-600">
          {deferred
            ? "Add the journey dashboard to your home screen. Works offline."
            : "Use your browser menu: Add to Home screen to install the app."}
        </p>
      </div>
      {deferred && (
        <Button size="sm" onClick={install}>
          Install
        </Button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-ink-600 hover:bg-surface-sunken"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
