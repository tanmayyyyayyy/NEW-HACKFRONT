import type { MetadataRoute } from "next";
import { siteOrigin } from "../lib/site-url";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (!origin || !origin.startsWith("https://")) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/workspace", "/graph", "/api/"] },
    sitemap: origin + "/sitemap.xml",
  };
}
