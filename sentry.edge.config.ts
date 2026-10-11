import * as Sentry from "@sentry/nextjs";

const release = process.env.VERCEL_GIT_COMMIT_SHA
  ? `se7a@${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
  : undefined;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? "development",
  release,
});
