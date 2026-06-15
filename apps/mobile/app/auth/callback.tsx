import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Deep-link landing for the magic-link redirect. Supabase emails the
 * user a link like se7a://auth/callback?code=...; we exchange the code
 * for a session, then route to onboarding or dashboard depending on
 * profile state.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code =
        typeof params.code === "string" ? params.code : extractCodeFromInitialUrl();
      const codeStr = await code;
      if (!codeStr) {
        if (!cancelled) setErr("Missing sign-in code.");
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(codeStr);
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErr("Sign-in succeeded but no user — try again.");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      router.replace(profile?.onboarded_at ? "/dashboard" : "/onboarding");
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.gold} />
      <Text style={styles.text}>
        {err ? err : "Signing you in…"}
      </Text>
    </View>
  );
}

async function extractCodeFromInitialUrl(): Promise<string | null> {
  const url = await Linking.getInitialURL();
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.searchParams.get("code");
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  text: { color: colors.dim, fontFamily: font.body, fontSize: 14 },
});
