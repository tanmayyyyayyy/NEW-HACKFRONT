export function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function mcpOrigin(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || (url.protocol === "http:" && isLoopback(url.hostname))) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* A partially entered URL is expected while typing. */ }
  return undefined;
}
