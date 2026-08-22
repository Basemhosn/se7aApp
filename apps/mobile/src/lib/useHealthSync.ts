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
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

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
    ranThisSession.current = true;

    (async () => {
      if (Platform.OS === "ios") {
        const authed = await HK.requestHealthKitAuth();
        if (!authed) return;
        await Promise.all([
          syncWeightAndBf(userId, "healthkit"),
          syncTodayActivity("healthkit"),
          syncRecentWorkouts("healthkit"),
        ]);
      } else if (Platform.OS === "android") {
        const authed = await HC.requestHealthConnectAuth();
        if (!authed) return;
        await Promise.all([
          syncWeightAndBf(userId, "health_connect"),
          syncTodayActivity("health_connect"),
          syncRecentWorkouts("health_connect"),
          syncRecentSleep(),
        ]);
      }
    })();
  }, [userId]);
}

type Source = "healthkit" | "health_connect";

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
      : new Date(Date.now() - 14 * 86_400_000).toISOString();

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
 * Health Connect only for now — HealthKit sleep import is a follow-up.
 * Batches sessions into a single POST /api/sleep/import call so the
 * server can upsert them together.
 */
async function syncRecentSleep() {
  try {
    const lastRaw = await AsyncStorage.getItem(LAST_SLEEP_SYNC_KEY);
    const sinceIso = lastRaw
      ? new Date(Number(lastRaw)).toISOString()
      : new Date(Date.now() - 14 * 86_400_000).toISOString();

    const sessions = await HC.readSleepSessionsSince(sinceIso);
    if (sessions.length === 0) {
      await AsyncStorage.setItem(LAST_SLEEP_SYNC_KEY, String(Date.now()));
      return;
    }
    await api("/api/sleep/import", {
      method: "POST",
      body: JSON.stringify({
        source: "health_connect",
        sessions: sessions.map((s) => ({
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
        })),
      }),
    }).catch(() => {
      /* silent */
    });
    markDayDirty();
    await AsyncStorage.setItem(LAST_SLEEP_SYNC_KEY, String(Date.now()));
  } catch {
    /* silent */
  }
}
