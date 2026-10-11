import * as Sentry from "@sentry/nextjs";

const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
  ? `se7a-web@${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
  : undefined;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session replay stays off by default (privacy-first — we don't want
  // to capture a user's weight entry or voice-log transcript). But when
  // an error DOES fire, replaying the session that caused it is the
  // fastest path to a fix. "On error only" is free unless there are
  // errors, which is the whole point.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.VERCEL_ENV ?? "development",
  release,
});
