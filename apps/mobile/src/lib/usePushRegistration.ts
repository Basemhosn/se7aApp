import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";
import { supabase } from "./supabase";

/**
 * Fire-once-per-app-boot: request notification permission (if not already
 * decided), grab the Expo push token, and register it with our API so
 * weekly recap cron can find this device.
 *
 * No-op on simulator (push tokens aren't issued on emulators/simulators).
 * Safe to call every mount — the registration endpoint upserts by
 * (user_id, expo_token) and just bumps last_seen.
 */
export function usePushRegistration() {
  useEffect(() => {
    (async () => {
      if (!Device.isDevice) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const asked = await Notifications.requestPermissionsAsync();
        status = asked.status;
      }
      if (status !== "granted") return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      if (!projectId) return;

      try {
        const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
        const expoToken = tokenRes.data;
        if (!expoToken) return;
        await api("/api/push/register", {
          method: "POST",
          body: JSON.stringify({
            expo_token: expoToken,
            platform: Platform.OS === "ios" ? "ios" : "android",
          }),
        });
      } catch {
        // Non-critical — user just won't get push. Sentry will log it if it's
        // catastrophic; otherwise silent is fine.
      }
    })();
  }, []);
}
