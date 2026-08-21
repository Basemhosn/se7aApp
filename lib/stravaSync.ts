import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchActivities,
  mapStravaKind,
  refreshToken as refreshStravaToken,
} from "./strava";

/**
 * Sync one user's Strava activities into cardio_sessions.
 * Auto-refreshes the access token if expired. Returns the number of
 * activities inserted (dedup via provider_activity_id unique index).
 *
 * `admin` must be a service-role client so we can update the token
 * columns bypassing RLS.
 */
export async function syncStravaForUser(
  admin: SupabaseClient,
  userId: string
): Promise<{
  inserted: number;
  skipped: number;
  error?: string;
}> {
  const { data: integration } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .maybeSingle();

  if (!integration) {
    return { inserted: 0, skipped: 0, error: "not_connected" };
  }

  let accessToken = integration.access_token as string;

  // Refresh if expired (or within 60s of expiry).
  const expiresAt = integration.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;
  if (!expiresAt || expiresAt - 60_000 <= Date.now()) {
    if (!integration.refresh_token) {
      return { inserted: 0, skipped: 0, error: "no_refresh_token" };
    }
    try {
      const refreshed = await refreshStravaToken(integration.refresh_token);
      accessToken = refreshed.access_token;
      await admin
        .from("user_integrations")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
        })
        .eq("user_id", userId)
        .eq("provider", "strava");
    } catch (e) {
      return {
        inserted: 0,
        skipped: 0,
        error: `refresh_failed: ${(e as Error).message}`,
      };
    }
  }

  // Pull activities since last sync (default: 30 days for first sync).
  const lastSyncMs = integration.last_sync_at
    ? new Date(integration.last_sync_at).getTime()
    : Date.now() - 30 * 24 * 3600 * 1000;
  // Give ourselves a small overlap so backdated edits aren't missed.
  const afterUnixSec = Math.floor((lastSyncMs - 60_000) / 1000);

  let activities;
  try {
    activities = await fetchActivities(accessToken, afterUnixSec);
  } catch (e) {
    return {
      inserted: 0,
      skipped: 0,
      error: `fetch_failed: ${(e as Error).message}`,
    };
  }

  let inserted = 0;
  let skipped = 0;
  for (const a of activities) {
    const row = {
      user_id: userId,
      kind: mapStravaKind(a),
      started_at: a.start_date,
      duration_min: Math.round(a.elapsed_time / 60),
      distance_km:
        a.distance > 0 ? Math.round((a.distance / 1000) * 100) / 100 : null,
      kcal_burned:
        typeof a.calories === "number" ? Math.round(a.calories) : null,
      avg_hr:
        typeof a.average_heartrate === "number"
          ? Math.round(a.average_heartrate)
          : null,
      source: "strava" as const,
      provider_activity_id: String(a.id),
      notes: a.name?.slice(0, 500) ?? null,
    };
    const { error } = await admin
      .from("cardio_sessions")
      .upsert(row, {
        onConflict: "user_id,source,provider_activity_id",
      });
    if (error) skipped += 1;
    else inserted += 1;
  }

  await admin
    .from("user_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "strava");

  return { inserted, skipped };
}
