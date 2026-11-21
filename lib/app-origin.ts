const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

export function trustedAppOrigins(value: string): string[] {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
    if (!loopbackHosts.includes(url.hostname)) return [url.origin];
    const port = url.port ? ":" + url.port : "";
    return loopbackHosts.map(host => url.protocol + "//" + host + port);
  } catch {
    return [];
  }
}

export function matchesAppOrigin(origin: string | null | undefined, configured: string | undefined) {
  return Boolean(origin && configured && trustedAppOrigins(configured).includes(origin));
}
