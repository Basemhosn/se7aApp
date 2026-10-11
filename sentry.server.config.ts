import * as Sentry from "@sentry/nextjs";

// Release tracking: Sentry groups issues by release so a regression
// introduced by a specific deploy is immediately identifiable. Falls
// back to undefined in local dev (which is fine — Sentry just omits
// the release tag).
const release = process.env.VERCEL_GIT_COMMIT_SHA
  ? `se7a@${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
  : undefined;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // 10% transaction sampling gives us server-side latency visibility
  // (which endpoint is slow, which DB query is drifting) without the
  // bill from 100% capture. Bump up for a specific debugging push,
  // then back down.
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  release,
});
