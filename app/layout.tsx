import type { Metadata, Viewport } from "next";
import { siteOrigin } from "../lib/site-url";
import { Footer } from "./Mast";
import "./globals.css";

const origin = siteOrigin();
const description = "Find the decisions behind code changes and follow the evidence back to GitHub.";
export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: { default: "SkillForge — Find the why behind the code", template: "%s | SkillForge" },
  description,
  applicationName: "SkillForge",
  openGraph: { title: "SkillForge", description, siteName: "SkillForge", type: "website" },
  twitter: { card: "summary_large_image", title: "SkillForge", description },
};

export const viewport: Viewport = { themeColor: "#111115", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<Footer /></body>
    </html>
  );
}
