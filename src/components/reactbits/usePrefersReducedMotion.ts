"use client";

import { useEffect, useState } from "react";

/**
 * Watches the prefers-reduced-motion media query. DHRUVA requires that
 * decorative motion be suppressed when the user asks for reduced motion, so
 * the GSAP-based entrance components render their final state instead.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
