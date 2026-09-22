"use client";

import { useEffect } from "react";

/**
 * Registers the DHRUVA service worker (installed from /sw.js in public/).
 * Kept client-only and rendered once from the root layout.
 *
 * Production only: in dev the worker's tile interception breaks Leaflet image
 * loads (worker-context CORS fetch fails for the raster <img> requests), so
 * registering it here would make every dev session render the tile fallback.
 * The offline/tile-cache layer is a production concern; dev runs without it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") {
      // Dev: make sure no stale production registration lingers from a prior
      // build served on this origin, then do nothing.
      navigator.serviceWorker?.getRegistrations?.().then((regs) => {
        for (const r of regs) void r.unregister();
      });
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failure is non-fatal: the app still works without the
        // offline layer. Nothing is logged to the console per our QA bar.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
