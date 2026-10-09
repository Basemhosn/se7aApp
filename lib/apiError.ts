import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Build a 5xx response AND fire a Sentry event for it.
 *
 * Sentry's Next.js integration auto-captures *thrown* errors in route
 * handlers, but SE7A's routes typically catch failures and `return
 * NextResponse.json({ error: ... }, { status: 502 })` so the error
 * never reaches Sentry. This helper closes that gap — centralised so
 * every AI endpoint tags the same route + stage dimensions and the
 * dashboards work without per-site glue.
 *
 * Usage:
 *   return apiError({ route: "scan/plate", stage: "ai_vision", status: 502, body: {...}, error: e });
 */
export function apiError(opts: {
  route: string;
  stage: string;
  status: number;
  body: Record<string, unknown>;
  error: unknown;
  extra?: Record<string, unknown>;
}): NextResponse {
  Sentry.captureException(opts.error, {
    tags: {
      route: opts.route,
      stage: opts.stage,
      http_status: String(opts.status),
    },
    extra: opts.extra,
    level: opts.status >= 500 ? "error" : "warning",
  });
  return NextResponse.json(opts.body, { status: opts.status });
}
