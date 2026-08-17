import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  readLatestBodyFatPct,
  readLatestWeightKg,
  requestHealthKitAuth,
} from "./healthkit";
import { api } from "./api";
import { supabase } from "./supabase";

const LAST_SYNC_KEY = "se7a_hk_last_sync";
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * On mount: request HealthKit auth (once per install), then pull the most
 * recent weight (and body-fat if present) from Apple Health. If it's newer
 * than our latest weight_logs row and hasn't already been synced in the
 * last 6 hours, insert it as a new weigh-in.
 *
 * Runs at most once per foreground session — guarded by a ref so tab
 * navigation doesn't re-fire it.
 */
export function useHealthSync(userId: string | undefined) {
  const ranThisSession = useRef(false);

  useEffect(() => {
    if (!userId || ranThisSession.current) return;
    ranThisSession.current = true;

    (async () => {
      // Debounce: if we synced in the last 6h, skip.
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      if (lastSync && Date.now() - Number(lastSync) < RECENT_WINDOW_MS) return;

      const authed = await requestHealthKitAuth();
      if (!authed) return;

      const [weight, bf] = await Promise.all([
        readLatestWeightKg(),
        readLatestBodyFatPct(),
      ]);
      if (!weight) return;

      // Skip if the HealthKit sample is older than our latest server row.
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

      // Skip if the exact same weight was just logged (within 1h) to avoid
      // duplicates from users who log manually + let HealthKit re-sync.
      if (
        latest?.weight_kg != null &&
        Math.abs(Number(latest.weight_kg) - weight.weight_kg) < 0.05 &&
        latest.logged_at &&
        Date.now() - new Date(latest.logged_at).getTime() < 60 * 60 * 1000
      ) {
        await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        return;
      }

      try {
        await api("/api/weight", {
          method: "POST",
          body: JSON.stringify({
            weight_kg: weight.weight_kg,
            body_fat_pct: bf?.body_fat_pct,
          }),
        });
        await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {
        /* silent — no big deal, tries again in 6h */
      }
    })();
  }, [userId]);
}
