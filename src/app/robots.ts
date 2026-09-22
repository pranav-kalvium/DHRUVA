import type { MetadataRoute } from "next";

// Required for `output: "export"` (static export used by the Android build).
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/journey", "/journey/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
