const config = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "[::1]"],
  async headers() {
    const scriptPolicy = "script-src 'self' 'unsafe-inline'" +
      (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "");
    return [{source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " + scriptPolicy + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" }
    ] }];
  }
};
export default config;
