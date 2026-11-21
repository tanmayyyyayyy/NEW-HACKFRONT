import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkillForge",
    short_name: "SkillForge",
    description: "Trace and verify the decisions behind code changes.",
    display: "standalone",
    start_url: "/",
    background_color: "#111115",
    theme_color: "#111115",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
