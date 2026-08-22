import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCycles,
  fetchRecovery,
  fetchSleep,
  fetchWorkouts,
  mapWhoopKind,
  refreshToken as refreshWhoopToken,
  type WhoopRecovery,
} from "./whoop";
import { bandForScore } from "./recovery";

/**
 * Sync one user's Whoop data:
 *   - workouts → cardio_sessions (deduped via provider_activity_id)
 *   - cycles   → daily_activity.active_kcal (kilojoule / 4.184)
 *   - sleep    → sleep_sessions (deduped via provider_session_id), with
 *                HRV + resting HR merged in from the recovery endpoint
 *   - recovery → recovery_scores (one per sleep session, day = wake date)
 *
 * Auto-refreshes tokens 60s before expiry.
 */
export async function syncWhoopForUser(
  admin: SupabaseClient,
  userId: string
): Promise<{
  workouts_inserted: number;
  cycles_upserted: number;
  sleep_upserted: number;
  recovery_upserted: number;
  error?: string;
}> {
  const { data: integration } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "whoop")
    .maybeSingle();

  if (!integration) {
    return {
      workouts_inserted: 0,
      cycles_upserted: 0,
      sleep_upserted: 0,
      recovery_upserted: 0,
      error: "not_connected",
    };
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
        sleep_upserted: 0,
        recovery_upserted: 0,
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
        sleep_upserted: 0,
        recovery_upserted: 0,
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
  let sleep_upserted = 0;
  let recovery_upserted = 0;

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
      sleep_upserted,
      recovery_upserted,
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

  // Sleep — with HRV + resting HR merged in from the recovery endpoint,
  // keyed by sleep_id. Recovery is optional (some accounts don't grant
  // the scope), so we degrade cleanly.
  try {
    const [sleeps, recoveries] = await Promise.all([
      fetchSleep(accessToken, sinceIso),
      fetchRecovery(accessToken, sinceIso).catch(
        () => [] as WhoopRecovery[]
      ),
    ]);
    const recoveryBySleep = new Map<string, WhoopRecovery>();
    for (const r of recoveries) recoveryBySleep.set(r.sleep_id, r);

    for (const s of sleeps) {
      if (s.nap) continue; // main-sleep only; naps skew the "last night" card
      const start = new Date(s.start);
      const end = new Date(s.end);
      const durationMs = end.getTime() - start.getTime();
      if (durationMs <= 0) continue;

      const stage = s.score?.stage_summary;
      const tibMs = stage?.total_in_bed_time_milli;
      const awakeMs = stage?.total_awake_time_milli;
      const lightMs = stage?.total_light_sleep_time_milli;
      const deepMs = stage?.total_slow_wave_sleep_time_milli;
      const remMs = stage?.total_rem_sleep_time_milli;
      // asleep = TIB - awake (or sum of stages) — prefer sum when available.
      const asleepMs =
        typeof lightMs === "number" &&
        typeof deepMs === "number" &&
        typeof remMs === "number"
          ? lightMs + deepMs + remMs
          : typeof tibMs === "number" && typeof awakeMs === "number"
            ? Math.max(0, tibMs - awakeMs)
            : durationMs;
      const durationMinutes = Math.round(asleepMs / 60_000);
      if (durationMinutes <= 0) continue;

      // Anchor to the wake date (matches Whoop's + Oura's convention).
      const wake = end;
      const nightDate = `${wake.getFullYear()}-${String(wake.getMonth() + 1).padStart(2, "0")}-${String(wake.getDate()).padStart(2, "0")}`;

      const rec = recoveryBySleep.get(s.id);
      const row = {
        user_id: userId,
        source: "whoop" as const,
        provider_session_id: s.id,
        night_date: nightDate,
        start_at: s.start,
        end_at: s.end,
        duration_minutes: durationMinutes,
        time_in_bed_minutes:
          typeof tibMs === "number" ? Math.round(tibMs / 60_000) : null,
        sleep_score:
          typeof s.score?.sleep_performance_percentage === "number"
            ? Math.round(s.score.sleep_performance_percentage)
            : null,
        deep_minutes:
          typeof deepMs === "number" ? Math.round(deepMs / 60_000) : null,
        rem_minutes:
          typeof remMs === "number" ? Math.round(remMs / 60_000) : null,
        light_minutes:
          typeof lightMs === "number" ? Math.round(lightMs / 60_000) : null,
        awake_minutes:
          typeof awakeMs === "number" ? Math.round(awakeMs / 60_000) : null,
        hrv_ms:
          typeof rec?.score?.hrv_rmssd_milli === "number"
            ? Math.round(rec.score.hrv_rmssd_milli * 10) / 10
            : null,
        resting_hr_bpm:
          typeof rec?.score?.resting_heart_rate === "number"
            ? Math.round(rec.score.resting_heart_rate)
            : null,
        respiratory_rate:
          typeof s.score?.respiratory_rate === "number"
            ? Math.round(s.score.respiratory_rate * 10) / 10
            : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("sleep_sessions").upsert(row, {
        onConflict: "user_id,source,provider_session_id",
      });
      if (!error) sleep_upserted += 1;

      // Persist the recovery score keyed on the wake date. Whoop
      // recovery is anchored to a sleep, not a day, so we use this
      // sleep's night_date as the day key.
      const score = rec?.score?.recovery_score;
      if (typeof score === "number") {
        const scoreInt = Math.round(score);
        const { error: recErr } = await admin
          .from("recovery_scores")
          .upsert(
            {
              user_id: userId,
              source: "whoop" as const,
              day: nightDate,
              score: scoreInt,
              band: bandForScore(scoreInt),
              hrv_ms:
                typeof rec?.score?.hrv_rmssd_milli === "number"
                  ? Math.round(rec.score.hrv_rmssd_milli * 10) / 10
                  : null,
              resting_hr_bpm:
                typeof rec?.score?.resting_heart_rate === "number"
                  ? Math.round(rec.score.resting_heart_rate)
                  : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,source,day" }
          );
        if (!recErr) recovery_upserted += 1;
      }
    }
  } catch {
    /* sleep is secondary; don't fail the whole sync on this */
  }

  await admin
    .from("user_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "whoop");

  return { workouts_inserted, cycles_upserted, sleep_upserted, recovery_upserted };
}
