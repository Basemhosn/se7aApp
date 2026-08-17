import { useEffect } from "react";
import { Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";
import { supabase } from "./supabase";

const APP_GROUP = "group.app.se7a.mobile";
const TOKEN_KEY = "widget_token";

/**
 * Writes the current user's widget_token into shared UserDefaults so the
 * iOS home-screen widget can read it and hit /api/widget/status. Runs once
 * per authed session — no-op on Android.
 *
 * The widget_token column is auto-populated by a Postgres trigger on
 * profile insert (see migration 0010_widget_token.sql). We just read it
 * and hand it over.
 */
export function useWidgetToken(userId: string | undefined) {
  useEffect(() => {
    if (!userId || Platform.OS !== "ios") return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("widget_token")
        .eq("user_id", userId)
        .maybeSingle();
      const token = data?.widget_token as string | undefined;
      if (!token) return;
      try {
        await SharedGroupPreferences.setItem(TOKEN_KEY, token, APP_GROUP);
      } catch {
        // Non-critical; widget will show "Open SE7A to sync" until it works.
      }
    })();
  }, [userId]);
}
