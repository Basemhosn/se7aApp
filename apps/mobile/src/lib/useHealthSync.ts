import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  readLatestBodyFatPct,
  readLatestWeightKg,
  readTodayActiveEnergy,
  readTodaySteps,
  readWorkoutsSince,
  requestHealthKitAuth,
} from "./healthkit";
import { api } from "./api";
import { markDayDirty } from "./calendarCache";
import { supabase } from "./supabase";

const LAST_SYNC_KEY = "se7a_hk_last_sync";
const LAST_WORKOUT_SYNC_KEY = "se7a_hk_last_workout_sync";
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * On mount: request HealthKit auth (once per install), then run three
 * sync paths in parallel — each guarded by its own throttle so they
 * don't hammer HealthKit on every tab focus:
 *
 *   1. Latest weight + body-fat → weight_logs (6h window)
 *   2. Today's steps + active kcal → daily_activity
 *   3. New cardio workouts since last sync → cardio_sessions
 *
 * All paths degrade silently on failure — HealthKit auth denied, no
 * data, network error — none of them should ever surface to the user.
 * Calendar invalidation fires after any successful write so the day
 * dots re-fetch on next focus.
 */
export function useHealthSync(userId: string | undefined) {
  const ranThisSession = useRef(false);

  useEffect(() => {
    if (!userId || ranThisSession.current) return;
    ranThisSession.current = true;

    (async () => {
      const authed = await requestHealthKitAuth();
      if (!authed) return;

      await Promise.all([
        syncWeightAndBf(userId),
        syncTodayActivity(),
        syncRecentWorkouts(),
      ]);
    })();
  }, [userId]);
}

async function syncWeightAndBf(userId: string) {
  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (lastSync && Date.now() - Number(lastSync) < RECENT_WINDOW_MS) return;

    const [weight, bf] = await Promise.all([
      readLatestWeightKg(),
      readLatestBodyFatPct(),
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

async function syncTodayActivity() {
  try {
    const [steps, activeKcal] = await Promise.all([
      readTodaySteps(),
      readTodayActiveEnergy(),
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

async function syncRecentWorkouts() {
  try {
    const lastRaw = await AsyncStorage.getItem(LAST_WORKOUT_SYNC_KEY);
    const sinceIso = lastRaw
      ? new Date(Number(lastRaw)).toISOString()
      : new Date(Date.now() - 14 * 86_400_000).toISOString();

    const workouts = await readWorkoutsSince(sinceIso);
    if (workouts.length === 0) {
      await AsyncStorage.setItem(LAST_WORKOUT_SYNC_KEY, String(Date.now()));
      return;
    }

    // Server-side unique index on (user_id, hk_uuid) dedupes; each POST
    // is independent so a single failure doesn't abort the batch.
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
    markDayDirty();
    await AsyncStorage.setItem(LAST_WORKOUT_SYNC_KEY, String(Date.now()));
  } catch {
    /* silent */
  }
}
