import { NextResponse } from "next/server";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { syncStravaForUser } from "@/lib/stravaSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manually trigger a Strava sync for the current user. Used by the
 * Settings "Sync now" button and after a fresh OAuth connection.
 * Cron-based hourly sync uses lib/stravaSync directly.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const result = await syncStravaForUser(admin, user.id);
  return NextResponse.json(result);
}
