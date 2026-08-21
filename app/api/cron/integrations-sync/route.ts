import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { syncStravaForUser } from "@/lib/stravaSync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Hourly cron. Iterates every user with a Strava integration and pulls
 * new activities into cardio_sessions.
 *
 * Rate-limit note: Strava allows 200 req / 15 min per app. Each user
 * costs 1 (activities fetch) + potentially 1 (token refresh) request,
 * so an app with < 100 connected users has plenty of headroom.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: rows } = await admin
    .from("user_integrations")
    .select("user_id")
    .eq("provider", "strava");

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, users: 0 });
  }

  let totalInserted = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const result = await syncStravaForUser(admin, row.user_id);
    totalInserted += result.inserted;
    if (result.error) errors.push(`${row.user_id}: ${result.error}`);
  }

  return NextResponse.json({
    ok: true,
    users: rows.length,
    inserted: totalInserted,
    errors,
  });
}
