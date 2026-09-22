import type { NextConfig } from "next";

/**
 * Dev and production builds must not share a build directory. Running
 * `next build` while `next dev` is serving writes production artifacts over the
 * dev server's manifest, which makes every stylesheet and chunk request 404 and
 * the running site renders unstyled. Keeping them apart makes both safe to run
 * at the same time.
 */
const isDevServer = process.env.NODE_ENV === "development";

/**
 * Static export (`output: "export"`) produces the `out/` directory that
 * Capacitor packages into the Android app. Every route is prerendered HTML;
 * interactivity is all client-side, so no server is needed on the phone.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: isDevServer ? ".next-dev" : ".next",
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
