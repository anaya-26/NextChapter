import "dotenv/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * The app's public address. When it differs from where the server runs — GitHub Codespaces,
 * a tunnel, a proxy that forwards its own host — Server Actions and dev assets must accept it.
 */
const publicOrigin = (() => {
  try {
    return process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : null;
  } catch {
    return null;
  }
})();
// localhost is always allowed for dev assets; Server Actions compare host *and* port, so add it whenever set.
const needsDevOrigin = !!publicOrigin && !["localhost", "127.0.0.1"].includes(publicOrigin.hostname);

const nextConfig: NextConfig = {
  // Lets end-to-end tests run a separate dev server without clashing with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Heavy server-only libraries are loaded from node_modules at runtime instead of bundled.
  serverExternalPackages: ["tesseract.js", "unpdf", "mammoth", "@prisma/client", "pg"],
  ...(needsDevOrigin ? { allowedDevOrigins: [publicOrigin!.hostname] } : {}),
  experimental: {
    serverActions: { bodySizeLimit: "30mb", ...(publicOrigin ? { allowedOrigins: [publicOrigin.host] } : {}) },
    // Proxy buffers request bodies; keep this above the Server Action limit so uploads are never truncated.
    // Large media uploads go to /api/uploads, which the proxy matcher excludes.
    proxyClientMaxBodySize: "32mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
