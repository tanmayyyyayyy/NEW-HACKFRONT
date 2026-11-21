export function siteOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN || "");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // An unconfigured deployment has no canonical origin.
  }
}
