import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCycles,
  fetchWorkouts,
  mapWhoopKind,
  refreshToken as refreshWhoopToken,
} from "./whoop";

/**
 * Sync one user's Whoop data:
 *   - workouts → cardio_sessions (deduped via provider_activity_id)
 *   - cycles   → daily_activity.active_kcal (kilojoule / 4.184)
 *
 * Auto-refreshes tokens 60s before expiry.
 */
export async function syncWhoopForUser(
  admin: SupabaseClient,
  userId: string
): Promise<{
  workouts_inserted: number;
  cycles_upserted: number;
  error?: string;
}> {
  const { data: integration } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "whoop")
    .maybeSingle();

  if (!integration) {
    return { workouts_inserted: 0, cycles_upserted: 0, error: "not_connected" };
  }

  let accessToken = integration.access_token as string;

  // Refresh if token expired (or within 60s of expiry).
  const expiresAt = integration.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;
  if (!expiresAt || expiresAt - 60_000 <= Date.now()) {
    if (!integration.refresh_token) {
      return {
        workouts_inserted: 0,
        cycles_upserted: 0,
        error: "no_refresh_token",
      };
    }
    try {
      const refreshed = await refreshWhoopToken(integration.refresh_token);
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
        .eq("provider", "whoop");
    } catch (e) {
      return {
        workouts_inserted: 0,
        cycles_upserted: 0,
        error: `refresh_failed: ${(e as Error).message}`,
      };
    }
  }

  const lastSyncMs = integration.last_sync_at
    ? new Date(integration.last_sync_at).getTime()
    : Date.now() - 30 * 24 * 3600 * 1000;
  const sinceIso = new Date(lastSyncMs - 60_000).toISOString();

  let workouts_inserted = 0;
  let cycles_upserted = 0;

  // Workouts
  try {
    const workouts = await fetchWorkouts(accessToken, sinceIso);
    for (const w of workouts) {
      const durationMin = Math.round(
        (new Date(w.end).getTime() - new Date(w.start).getTime()) / 60_000
      );
      if (durationMin <= 0) continue;
      const kj = w.score?.kilojoule;
      const kcal = typeof kj === "number" ? Math.round(kj / 4.184) : null;
      const distanceKm =
        typeof w.score?.distance_meter === "number" &&
        w.score.distance_meter > 0
          ? Math.round((w.score.distance_meter / 1000) * 100) / 100
          : null;
      const row = {
        user_id: userId,
        kind: mapWhoopKind(w),
        started_at: w.start,
        duration_min: durationMin,
        distance_km: distanceKm,
        kcal_burned: kcal,
        avg_hr:
          typeof w.score?.average_heart_rate === "number"
            ? Math.round(w.score.average_heart_rate)
            : null,
        source: "whoop" as const,
        provider_activity_id: w.id,
        notes: null,
      };
      const { error } = await admin.from("cardio_sessions").upsert(row, {
        onConflict: "user_id,source,provider_activity_id",
      });
      if (!error) workouts_inserted += 1;
    }
  } catch (e) {
    return {
      workouts_inserted,
      cycles_upserted,
      error: `workouts_failed: ${(e as Error).message}`,
    };
  }

  // Cycles → daily_activity (active_kcal from kilojoule)
  try {
    const cycles = await fetchCycles(accessToken, sinceIso);
    for (const c of cycles) {
      const kj = c.score?.kilojoule;
      if (typeof kj !== "number") continue;
      const activeKcal = Math.round(kj / 4.184);
      const startDate = new Date(c.start);
      const day = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
      // Upsert — don't overwrite steps if some other source (HealthKit)
      // already wrote them; we only touch active_kcal.
      const { data: existing } = await admin
        .from("daily_activity")
        .select("steps")
        .eq("user_id", userId)
        .eq("day", day)
        .maybeSingle();
      const { error } = await admin.from("daily_activity").upsert(
        {
          user_id: userId,
          day,
          active_kcal: activeKcal,
          steps: existing?.steps ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,day" }
      );
      if (!error) cycles_upserted += 1;
    }
  } catch {
    /* cycles are secondary; don't fail the whole sync on this */
  }

  await admin
    .from("user_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "whoop");

  return { workouts_inserted, cycles_upserted };
}
