import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  // Skip auth-token-dependent build steps unless SENTRY_AUTH_TOKEN is set.
  silent: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
