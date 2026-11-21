export function configuredAppUrl() {
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
  return process.env.APP_ORIGIN?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() ||
    (renderHost ? "https://" + renderHost : undefined);
}

export function siteOrigin() {
  try {
    const url = new URL(configuredAppUrl() || "");
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.origin;
  } catch {
    // An unconfigured deployment has no canonical origin.
  }
}
