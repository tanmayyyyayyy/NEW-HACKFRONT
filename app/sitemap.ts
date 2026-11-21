import type { MetadataRoute } from "next";
import { collections } from "./collections";
import { siteOrigin } from "../lib/site-url";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  if (!origin) return [];
  return ["/", "/library", ...collections.map(({ slug }) => "/demo/" + slug)].map(path => ({ url: origin + path }));
}
