import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { InstallPrompt } from "@/components/pwa/install-prompt";
// LiveSessionProvider is mounted per-route (/live) rather than globally: the
// recorded-drive journey and marketing pages do not need sensor listeners.
import {
  PRODUCT_NAME,
  POSITIONING_STATEMENT,
  LIMITATION_STATEMENT,
} from "@/lib/constants";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
  title: {
    default: `${PRODUCT_NAME}: ${POSITIONING_STATEMENT}`,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: `${PRODUCT_NAME} is a navigation-assistance prototype demonstrating continuity during short GNSS outages such as tunnels. ${LIMITATION_STATEMENT}`,
  applicationName: PRODUCT_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME}: ${POSITIONING_STATEMENT}`,
    description: `A working journey dashboard demonstrates positioning continuity through a tunnel. ${LIMITATION_STATEMENT}`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${PRODUCT_NAME} product overview` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME}: ${POSITIONING_STATEMENT}`,
    description: `Navigation-assistance prototype. ${LIMITATION_STATEMENT}`,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0A2540",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[6px] focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
