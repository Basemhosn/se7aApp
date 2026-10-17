import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public health probe for external uptime monitors (UptimeRobot etc.).
 * Returns 200 if the Next.js app is alive. Does not touch Supabase or
 * any provider — the point is to detect "web app is down" vs full
 * end-to-end integration health, which is monitored separately via
 * Sentry on real request paths.
 *
 * Keep this cheap and auth-less so monitors can hit it every 5 min
 * without consuming meaningful compute or triggering rate limits.
 */
export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
