import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as HK from "./healthkit";
import * as HC from "./healthConnect";
import { api } from "./api";
import { markDayDirty } from "./calendarCache";
import { supabase } from "./supabase";

const LAST_SYNC_KEY = "se7a_hk_last_sync";
const LAST_WORKOUT_SYNC_KEY = "se7a_hk_last_workout_sync";
const LAST_SLEEP_SYNC_KEY = "se7a_hc_last_sleep_sync";
const WEIGHT_HISTORY_DONE_KEY = "se7a_hk_weight_history_done";
// _v2 bump: v1 ran the HK daily-step read without period:1440, so the
// backfill stored just the final hour of each past day. Bumping the
// key re-runs the backfill with the correct code; the server upsert
// overwrites the wrong rows cleanly.
const ACTIVITY_HISTORY_DONE_KEY = "se7a_hk_activity_history_done_v2";
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const BACKFILL_MS = 90 * 86_400_000; // 90 days on first connect

/**
 * On mount: request platform-appropriate health auth (HealthKit on iOS,
 * Health Connect on Android), then run the sync paths in parallel —
 * each guarded by its own throttle so they don't hammer the store on
 * every tab focus:
 *
 *   1. Latest weight + body-fat → weight_logs (6h window)
 *   2. Today's steps + active kcal → daily_activity
 *   3. New cardio workouts since last sync → cardio_sessions
 *   4. New sleep sessions since last sync → sleep_sessions
 *      (Android only for now; HealthKit sleep import is a follow-up)
 *
 * All paths degrade silently on failure — auth denied, no data,
 * network error — none of them should ever surface to the user.
 * Calendar invalidation fires after any successful write so the day
 * dots re-fetch on next focus.
 */
export function useHealthSync(userId: string | undefined) {
  const ranThisSession = useRef(false);

  useEffect(() => {
    if (!userId || ranThisSession.current) return;

    (async () => {
      if (Platform.OS === "ios") {
        // requestHealthKitAuth returns { ok, error? } (build 65
        // diagnostic refactor). The old code did `if (!authed)`
        // against an object which was always truthy, so we silently
        // ran the sync paths even when auth failed. Real check now.
        const res = await HK.requestHealthKitAuth();
        if (!res.ok) {
          // Do NOT mark the session ran — if auth failed here (e.g.
          // Home mounted before the user tapped Enable in Settings)
          // we want the next Home focus in the same session to retry
          // once permission is granted. Otherwise the user would
          // have to force-quit the app to see data flow.
          console.warn("[healthkit] auth failed", res.error);
          return;
        }
        ranThisSession.current = true;
        await Promise.all([
          syncWeightAndBf(userId, "healthkit"),
          syncWeightHistoryOnce(userId, "healthkit"),
          syncTodayActivity("healthkit"),
          syncActivityHistoryOnce(userId, "healthkit"),
          syncRecentWorkouts("healthkit"),
          syncRecentSleep("healthkit"),
        ]);
      } else if (Platform.OS === "android") {
        const authed = await HC.requestHealthConnectAuth();
        if (!authed) return;
        ranThisSession.current = true;
        await Promise.all([
          syncWeightAndBf(userId, "health_connect"),
          syncWeightHistoryOnce(userId, "health_connect"),
          syncTodayActivity("health_connect"),
          syncActivityHistoryOnce(userId, "health_connect"),
          syncRecentWorkouts("health_connect"),
          syncRecentSleep("health_connect"),
        ]);
      }
    })();
  }, [userId]);
}

type Source = "healthkit" | "health_connect";

/**
 * Fast sync for just today's steps + active energy. Called from
 * Home's pull-to-refresh BEFORE the spinner drops so today's step
 * count matches the Health app immediately. One HK aggregate read
 * (~200ms) + one upsert. Heavier syncs (history, workouts, sleep,
 * external integrations) continue to run in the background.
 */
export async function syncTodayHealthNow(_userId: string): Promise<void> {
  const source: Source = Platform.OS === "ios" ? "healthkit" : "health_connect";
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    await syncTodayActivity(source);
  } catch {
    /* silent */
  }
}

/**
 * Trigger all sync paths for the current platform. Called from
 * Settings' Enable button after auth succeeds AND from Home's
 * pull-to-refresh so a manual refresh actually re-pulls health data
 * (rather than relying on the once-per-session ref).
 *
 * `force` drops the local throttles (weight 6h window, workout/sleep
 * "since last sync" cursors) so a manual refresh actually reaches
 * back to today's data. Server-side dedup keeps this idempotent.
 * Silent on failure — same policy as the auto-sync on Home.
 */
export async function syncHealthNow(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const source: Source = Platform.OS === "ios" ? "healthkit" : "health_connect";
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    if (opts.force) {
      // Drop the throttles so this refresh actually re-reads.
      await Promise.all([
        AsyncStorage.removeItem(LAST_SYNC_KEY),
        AsyncStorage.removeItem(LAST_WORKOUT_SYNC_KEY),
        AsyncStorage.removeItem(LAST_SLEEP_SYNC_KEY),
      ]);
    }
    await Promise.all([
      syncWeightAndBf(userId, source),
      syncWeightHistoryOnce(userId, source),
      syncTodayActivity(source),
      syncActivityHistoryOnce(userId, source),
      syncRecentWorkouts(source),
      syncRecentSleep(source),
    ]);
  } catch {
    /* silent */
  }
}

/**
 * One-shot 90-day historical weight backfill. Runs on first successful
 * connect (per platform, per install) so the trend chart has data
 * beyond just the samples logged since install. Server dedups by
 * ±1h so re-runs after a bug/reinstall don't duplicate.
 */
async function syncWeightHistoryOnce(
  _userId: string,
  source: Source
): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(WEIGHT_HISTORY_DONE_KEY);
    if (done === "1") return;

    const sinceIso = new Date(Date.now() - BACKFILL_MS).toISOString();
    const samples =
      source === "healthkit"
        ? await HK.readWeightSamplesSince(sinceIso)
        : await HC.readWeightSamplesSince(sinceIso);

    if (samples.length === 0) {
      // 0 samples might mean "no weight data in HK" OR "weight
      // permission wasn't granted this session". Leave DONE_KEY
      // unset so the next session re-checks after the user grants
      // more categories in iOS Settings. Cheap: just an empty read.
      return;
    }

    await api("/api/weight/bulk-import", {
      method: "POST",
      body: JSON.stringify({ samples }),
    });
    markDayDirty();
    await AsyncStorage.setItem(WEIGHT_HISTORY_DONE_KEY, "1");
  } catch {
    /* silent — WEIGHT_HISTORY_DONE_KEY stays unset so next boot retries */
  }
}

/**
 * One-shot 90-day activity history backfill. Reads per-day steps +
 * active energy from the health store and bulk-upserts daily_activity
 * so past-day Home views (swipe to yesterday, last week, etc.) show
 * the right numbers instead of dashes. Same 0-samples-retry policy
 * as the weight history backfill.
 */
async function syncActivityHistoryOnce(
  _userId: string,
  source: Source
): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(ACTIVITY_HISTORY_DONE_KEY);
    if (done === "1") return;

    const sinceIso = new Date(Date.now() - BACKFILL_MS).toISOString();
    const days =
      source === "healthkit"
        ? await HK.readActivityByDaySince(sinceIso)
        : await HC.readActivityByDaySince(sinceIso);

    if (days.length === 0) {
      // Retry next session if we got nothing — likely the user
      // hasn't granted the Steps or Active Energy categories yet.
      return;
    }

    await api("/api/activity/bulk-import", {
      method: "POST",
      body: JSON.stringify({ days }),
    });
    markDayDirty();
    await AsyncStorage.setItem(ACTIVITY_HISTORY_DONE_KEY, "1");
  } catch {
    /* silent — key stays unset so next boot retries */
  }
}

async function syncWeightAndBf(userId: string, source: Source) {
  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (lastSync && Date.now() - Number(lastSync) < RECENT_WINDOW_MS) return;

    const [weight, bf] = await Promise.all([
      source === "healthkit" ? HK.readLatestWeightKg() : HC.readLatestWeightKg(),
      source === "healthkit"
        ? HK.readLatestBodyFatPct()
        : HC.readLatestBodyFatPct(),
    ]);
    if (!weight) return;

    const { data: latest } = await supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      latest?.logged_at &&
      new Date(latest.logged_at).getTime() >=
        new Date(weight.measured_at).getTime()
    ) {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      return;
    }

    if (
      latest?.weight_kg != null &&
      Math.abs(Number(latest.weight_kg) - weight.weight_kg) < 0.05 &&
      latest.logged_at &&
      Date.now() - new Date(latest.logged_at).getTime() < 60 * 60 * 1000
    ) {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      return;
    }

    await api("/api/weight", {
      method: "POST",
      body: JSON.stringify({
        weight_kg: weight.weight_kg,
        body_fat_pct: bf?.body_fat_pct,
      }),
    });
    markDayDirty();
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    /* silent */
  }
}

async function syncTodayActivity(source: Source) {
  try {
    const [steps, activeKcal] = await Promise.all([
      source === "healthkit" ? HK.readTodaySteps() : HC.readTodaySteps(),
      source === "healthkit"
        ? HK.readTodayActiveEnergy()
        : HC.readTodayActiveEnergy(),
    ]);
    if (steps === 0 && activeKcal === 0) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await api("/api/activity/import", {
      method: "POST",
      body: JSON.stringify({ day, steps, active_kcal: activeKcal }),
    });
    markDayDirty();
  } catch {
    /* silent */
  }
}

async function syncRecentWorkouts(source: Source) {
  try {
    const lastRaw = await AsyncStorage.getItem(LAST_WORKOUT_SYNC_KEY);
    const sinceIso = lastRaw
      ? new Date(Number(lastRaw)).toISOString()
      : new Date(Date.now() - BACKFILL_MS).toISOString();

    if (source === "healthkit") {
      const workouts = await HK.readWorkoutsSince(sinceIso);
      if (workouts.length === 0) {
        await AsyncStorage.setItem(LAST_WORKOUT_SYNC_KEY, String(Date.now()));
        return;
      }
      for (const w of workouts) {
        await api("/api/cardio", {
          method: "POST",
          body: JSON.stringify({
            kind: w.kind,
            started_at: w.started_at,
            duration_min: w.duration_min,
            distance_km: w.distance_km,
            kcal_burned: w.kcal_burned,
            avg_hr: w.avg_hr,
            source: "healthkit",
            hk_uuid: w.hk_uuid,
          }),
        }).catch(() => {
          /* individual failure OK; other imports still run */
        });
      }
    } else {
      const workouts = await HC.readWorkoutsSince(sinceIso);
      if (workouts.length === 0) {
        await AsyncStorage.setItem(LAST_WORKOUT_SYNC_KEY, String(Date.now()));
        return;
      }
      for (const w of workouts) {
        await api("/api/cardio", {
          method: "POST",
          body: JSON.stringify({
            kind: w.kind,
            started_at: w.started_at,
            duration_min: w.duration_min,
            distance_km: w.distance_km,
            kcal_burned: w.kcal_burned,
            avg_hr: w.avg_hr,
            source: "health_connect",
            hc_uuid: w.hc_uuid,
          }),
        }).catch(() => {
          /* individual failure OK; other imports still run */
        });
      }
    }
    markDayDirty();
    await AsyncStorage.setItem(LAST_WORKOUT_SYNC_KEY, String(Date.now()));
  } catch {
    /* silent */
  }
}

/**
 * Read sleep from whichever store the platform exposes and batch-POST
 * to /api/sleep/import. HealthKit + Health Connect return equivalent
 * shapes (only the UUID field name differs); the mapper here
 * normalizes both into the sleep_sessions row shape.
 */
async function syncRecentSleep(source: Source) {
  try {
    const lastRaw = await AsyncStorage.getItem(LAST_SLEEP_SYNC_KEY);
    const sinceIso = lastRaw
      ? new Date(Number(lastRaw)).toISOString()
      : new Date(Date.now() - BACKFILL_MS).toISOString();

    const sessions =
      source === "healthkit"
        ? (await HK.readSleepSessionsSince(sinceIso)).map((s) => ({
            provider_session_id: s.hk_uuid,
            night_date: s.night_date,
            start_at: s.start_at,
            end_at: s.end_at,
            duration_minutes: s.duration_minutes,
            time_in_bed_minutes: s.time_in_bed_minutes,
            deep_minutes: s.deep_minutes,
            rem_minutes: s.rem_minutes,
            light_minutes: s.light_minutes,
            awake_minutes: s.awake_minutes,
          }))
        : (await HC.readSleepSessionsSince(sinceIso)).map((s) => ({
            provider_session_id: s.hc_uuid,
            night_date: s.night_date,
            start_at: s.start_at,
            end_at: s.end_at,
            duration_minutes: s.duration_minutes,
            time_in_bed_minutes: s.time_in_bed_minutes,
            deep_minutes: s.deep_minutes,
            rem_minutes: s.rem_minutes,
            light_minutes: s.light_minutes,
            awake_minutes: s.awake_minutes,
          }));

    if (sessions.length === 0) {
      await AsyncStorage.setItem(LAST_SLEEP_SYNC_KEY, String(Date.now()));
      return;
    }
    await api("/api/sleep/import", {
      method: "POST",
      body: JSON.stringify({ source, sessions }),
    }).catch(() => {
      /* silent */
    });
    markDayDirty();
    await AsyncStorage.setItem(LAST_SLEEP_SYNC_KEY, String(Date.now()));
  } catch {
    /* silent */
  }
}
