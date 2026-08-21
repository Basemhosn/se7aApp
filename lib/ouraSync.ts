import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDailyActivity,
  fetchWorkouts,
  mapOuraKind,
  refreshToken as refreshOuraToken,
} from "./oura";

/**
 * Sync one user's Oura data:
 *   - workouts        → cardio_sessions (deduped via provider_activity_id)
 *   - daily activity  → daily_activity (steps + active_calories)
 *
 * Auto-refreshes tokens 60s before expiry.
 */
export async function syncOuraForUser(
  admin: SupabaseClient,
  userId: string
): Promise<{
  workouts_inserted: number;
  days_upserted: number;
  error?: string;
}> {
  const { data: integration } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "oura")
    .maybeSingle();

  if (!integration) {
    return { workouts_inserted: 0, days_upserted: 0, error: "not_connected" };
  }

  let accessToken = integration.access_token as string;

  const expiresAt = integration.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;
  if (!expiresAt || expiresAt - 60_000 <= Date.now()) {
    if (!integration.refresh_token) {
      return {
        workouts_inserted: 0,
        days_upserted: 0,
        error: "no_refresh_token",
      };
    }
    try {
      const refreshed = await refreshOuraToken(integration.refresh_token);
      accessToken = refreshed.access_token;
      await admin
        .from("user_integrations")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(
            Date.now() + refreshed.expires_in * 1000
          ).toISOString(),
        })
        .eq("user_id", userId)
        .eq("provider", "oura");
    } catch (e) {
      return {
        workouts_inserted: 0,
        days_upserted: 0,
        error: `refresh_failed: ${(e as Error).message}`,
      };
    }
  }

  const lastSyncMs = integration.last_sync_at
    ? new Date(integration.last_sync_at).getTime()
    : Date.now() - 30 * 24 * 3600 * 1000;
  const sinceIso = new Date(lastSyncMs - 60_000).toISOString();

  let workouts_inserted = 0;
  let days_upserted = 0;

  // Workouts
  try {
    const workouts = await fetchWorkouts(accessToken, sinceIso);
    for (const w of workouts) {
      const durationMin = Math.round(
        (new Date(w.end_datetime).getTime() -
          new Date(w.start_datetime).getTime()) /
          60_000
      );
      if (durationMin <= 0) continue;
      const distanceKm =
        typeof w.distance === "number" && w.distance > 0
          ? Math.round((w.distance / 1000) * 100) / 100
          : null;
      const row = {
        user_id: userId,
        kind: mapOuraKind(w.activity),
        started_at: w.start_datetime,
        duration_min: durationMin,
        distance_km: distanceKm,
        kcal_burned:
          typeof w.calories === "number" ? Math.round(w.calories) : null,
        avg_hr: null,
        source: "oura" as const,
        provider_activity_id: w.id,
        notes: w.label ?? null,
      };
      const { error } = await admin.from("cardio_sessions").upsert(row, {
        onConflict: "user_id,source,provider_activity_id",
      });
      if (!error) workouts_inserted += 1;
    }
  } catch (e) {
    return {
      workouts_inserted,
      days_upserted,
      error: `workouts_failed: ${(e as Error).message}`,
    };
  }

  // Daily activity — steps + active kcal. Merge with any existing row
  // so we don't clobber values from HealthKit / Whoop that may have
  // written first.
  try {
    const days = await fetchDailyActivity(accessToken, sinceIso);
    for (const d of days) {
      const { data: existing } = await admin
        .from("daily_activity")
        .select("steps, active_kcal")
        .eq("user_id", userId)
        .eq("day", d.day)
        .maybeSingle();
      const { error } = await admin.from("daily_activity").upsert(
        {
          user_id: userId,
          day: d.day,
          // Prefer whichever source has a higher value — Oura and HK can
          // disagree on step counts by a few percent; we take the max
          // so a partial-wear ring doesn't clobber a full-day iPhone.
          steps: Math.max(existing?.steps ?? 0, d.steps ?? 0) || null,
          active_kcal:
            Math.max(existing?.active_kcal ?? 0, d.active_calories ?? 0) ||
            null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,day" }
      );
      if (!error) days_upserted += 1;
    }
  } catch {
    /* secondary; don't fail the whole sync */
  }

  await admin
    .from("user_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "oura");

  return { workouts_inserted, days_upserted };
}
