import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    "[se7a] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — auth will fail."
  );
}

/**
 * Supabase client for the native app. Session persists via AsyncStorage,
 * auto-refreshes in foreground, and ignores URL detection (deep-link
 * exchange is handled manually in app/auth/callback.tsx).
 */
export const supabase = createClient(url ?? "", key ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
