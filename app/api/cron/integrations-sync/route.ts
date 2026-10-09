import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getAdminClient } from "@/lib/supabase/server";
import { syncStravaForUser } from "@/lib/stravaSync";
import { syncWhoopForUser } from "@/lib/whoopSync";
import { syncOuraForUser } from "@/lib/ouraSync";

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
    .in("provider", ["strava", "whoop", "oura"]);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, users: 0 });
  }

  let stravaInserted = 0;
  let whoopInserted = 0;
  let ouraInserted = 0;
  let sleepInserted = 0;
  let recoveryInserted = 0;
  const errors: string[] = [];
  for (const row of rows) {
    if (row.provider === "strava") {
      const r = await syncStravaForUser(admin, row.user_id);
      stravaInserted += r.inserted;
      if (r.error) errors.push(`strava:${row.user_id}: ${r.error}`);
    } else if (row.provider === "whoop") {
      const r = await syncWhoopForUser(admin, row.user_id);
      whoopInserted += r.workouts_inserted;
      sleepInserted += r.sleep_upserted;
      recoveryInserted += r.recovery_upserted;
      if (r.error) errors.push(`whoop:${row.user_id}: ${r.error}`);
    } else if (row.provider === "oura") {
      const r = await syncOuraForUser(admin, row.user_id);
      ouraInserted += r.workouts_inserted;
      sleepInserted += r.sleep_upserted;
      recoveryInserted += r.recovery_upserted;
      if (r.error) errors.push(`oura:${row.user_id}: ${r.error}`);
    }
  }

  // Surface persistent per-user sync errors to Sentry so a Whoop/Oura
  // token-refresh regression or integration-partner outage pages us
  // instead of silently dropping data. One Sentry event per bad user
  // (capped at 10 to avoid flooding) rather than one event per cron
  // run — grouping by provider shows which partner is actually broken.
  if (errors.length > 0) {
    Sentry.captureMessage("integrations_sync_errors", {
      level: "warning",
      tags: { route: "cron/integrations-sync", error_count: String(errors.length) },
      extra: { errors: errors.slice(0, 10) },
    });
  }

  return NextResponse.json({
    ok: true,
    users: rows.length,
    strava_inserted: stravaInserted,
    whoop_inserted: whoopInserted,
    oura_inserted: ouraInserted,
    sleep_inserted: sleepInserted,
    recovery_inserted: recoveryInserted,
    errors,
  });
}
