import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const isDev = process.env.NODE_ENV === "development";

// Without nonces: the site has no third-party scripts, so a static CSP is enough.
// 'unsafe-inline' for scripts is required by the pre-hydration theme script and the inline RSC payloads, which
// differ per request (so they cannot be hashed). Nonces would need per-request rendering of every page and
// give up the prerendered shells; reviewed 2026-11-22 and kept. Everything else is 'self' only.
// Vercel Web Analytics needs nothing extra in production: its script and the page-view requests use paths on
// this site (/_vercel/insights/*, /<unique-path>/*). Only `next dev` loads the debug script from
// va.vercel-scripts.com (it logs to the console and sends nothing), so that host is allowed in development only.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  // 'unsafe-inline' above is for <script> elements only: inline event-handler attributes (onclick=…) stay blocked.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // The site embeds no frames.
  "frame-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // No window this site opens or is opened by needs a handle to the other.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Dataset changes only when the ingest job runs (a few times per day).
  cacheLife: {
    dataset: { stale: 300, revalidate: 900, expire: 86_400 }
  },
  serverExternalPackages: ["pg"],
  // Pages that read data stream their metadata into <body> for most visitors. Search engines document <head> as
  // the place for rel=canonical, so Googlebot joins Next.js's default list of crawlers that get blocking metadata
  // in <head> (Bingbot is already on it). The default list is imported, so it follows Next.js upgrades.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|Googlebot`, HTML_LIMITED_BOT_UA_RE.flags),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

export default nextConfig;
