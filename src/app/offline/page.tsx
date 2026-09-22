import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIMITATION_STATEMENT } from "@/lib/constants";
import { ReloadButton } from "./reload-button";

export const metadata: Metadata = {
  title: "Offline",
  description: "DHRUVA is offline. The cached demo replay remains available.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-line bg-surface-sunken">
          <WifiOff className="h-5 w-5 text-ink-600" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-600">Offline</p>
          <h1 className="text-2xl font-bold text-ink-900">No internet connection</h1>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-600">
        This page was not cached on this device. DHRUVA is designed for exactly this situation:
        the installed app and the demo replay keep working without a network, because the route
        geometry and the estimation engine run entirely on the device.
      </p>

      <div className="mt-5 rounded-[10px] border border-line bg-white p-4 text-sm">
        <h2 className="font-bold text-ink-900">What still works offline</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-600">
          <li>
            The demo replay of any route you opened before: play, pause, scrub and results are
            computed on-device.
          </li>
          <li>Map tiles of areas you already viewed are cached on this device.</li>
          <li>Live Device mode sensing, where the browser already granted permission.</li>
        </ul>
        <h2 className="mt-4 font-bold text-ink-900">What needs a connection</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-600">
          <li>Loading map tiles of areas not yet viewed.</li>
          <li>Opening pages you have not visited in this installed app before.</li>
        </ul>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/journey">
          <Button>Open the cached demo replay</Button>
        </Link>
        <ReloadButton />
      </div>

      <p className="mt-6 text-xs text-ink-600">{LIMITATION_STATEMENT}</p>
    </div>
  );
}
