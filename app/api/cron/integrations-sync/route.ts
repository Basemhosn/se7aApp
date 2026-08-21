import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { syncStravaForUser } from "@/lib/stravaSync";
import { syncWhoopForUser } from "@/lib/whoopSync";

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
    .select("user_id, provider")
    .in("provider", ["strava", "whoop"]);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, users: 0 });
  }

  let stravaInserted = 0;
  let whoopInserted = 0;
  const errors: string[] = [];
  for (const row of rows) {
    if (row.provider === "strava") {
      const r = await syncStravaForUser(admin, row.user_id);
      stravaInserted += r.inserted;
      if (r.error) errors.push(`strava:${row.user_id}: ${r.error}`);
    } else if (row.provider === "whoop") {
      const r = await syncWhoopForUser(admin, row.user_id);
      whoopInserted += r.workouts_inserted;
      if (r.error) errors.push(`whoop:${row.user_id}: ${r.error}`);
    }
  }

  return NextResponse.json({
    ok: true,
    users: rows.length,
    strava_inserted: stravaInserted,
    whoop_inserted: whoopInserted,
    errors,
  });
}
