import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Deep-link landing for the magic-link redirect. Supabase emails the
 * user a link like se7a://auth/callback?code=...; we exchange the code
 * for a session, then route to onboarding or dashboard depending on
 * profile state.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string }>();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code =
        typeof params.code === "string" ? params.code : extractCodeFromInitialUrl();
      const codeStr = await code;
      if (!codeStr) {
        if (!cancelled) setErr(t("auth.callback.missing_code"));
        return;
      }
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(codeStr);
        if (cancelled) return;
        if (error) {
          Sentry.captureException(error, {
            tags: { where: "auth/callback:exchangeCodeForSession" },
            extra: {
              supabaseUrlSet: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
              supabaseUrlHost: safeHost(process.env.EXPO_PUBLIC_SUPABASE_URL),
              anonKeySet: !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
              errorName: error.name,
              errorStatus: (error as { status?: number }).status,
            },
          });
          setErr(
            `${error.message}\n(host: ${safeHost(process.env.EXPO_PUBLIC_SUPABASE_URL)})`
          );
          return;
        }
      } catch (e) {
        Sentry.captureException(e, {
          tags: { where: "auth/callback:threw" },
          extra: {
            supabaseUrlSet: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
            supabaseUrlHost: safeHost(process.env.EXPO_PUBLIC_SUPABASE_URL),
          },
        });
        setErr(
          `${(e as Error)?.message ?? "unknown"}\n(host: ${safeHost(process.env.EXPO_PUBLIC_SUPABASE_URL)})`
        );
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErr(t("auth.callback.no_user"));
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      // Fresh-signup detection: no profile row = user just created
      // their account via the magic link; row exists but no
      // onboarded_at = they signed up before but never finished;
      // onboarded_at present = returning login. Only fire
      // signup_completed on the first case so analytics distinguishes
      // "signups/day" from "logins/day".
      if (!profile) {
        track("signup_completed", { method: "email" });
      }
      router.replace(profile?.onboarded_at ? "/" : "/onboarding");
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code, t]);

  return (
    <View style={styles.center}>
      {err ? (
        <>
          <Text style={styles.err}>{err}</Text>
          <Pressable
            onPress={() => router.replace("/login")}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>{t("auth.callback.back_to_login")}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.text}>{t("auth.callback.signing_in")}</Text>
        </>
      )}
    </View>
  );
}

function safeHost(u: string | undefined): string {
  if (!u) return "unset";
  try {
    return new URL(u).host;
  } catch {
    return "invalid";
  }
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
    padding: spacing.lg,
  },
  text: { color: colors.dim, fontFamily: font.body, fontSize: 14 },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  backBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.08)",
  },
  backBtnText: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
