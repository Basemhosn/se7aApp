import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Every /api/* response gets no-store. Was: mobile users saw the
    // Home ring lag 5-10 min after a log because iOS URLSession's
    // heuristic cache served stale /api/ledger/today responses.
    // The optimistic client update masked the lag briefly but then
    // the stale fetch overwrote it. Explicit no-store on the server
    // is authoritative for both iOS URLSession and any Vercel edge
    // caching. Widget endpoint is the one intentional exception —
    // it sets its own short public cache for iOS home-screen refresh.
    return [
      {
        source: "/api/:path((?!widget/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Skip auth-token-dependent build steps unless SENTRY_AUTH_TOKEN is set.
  silent: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
