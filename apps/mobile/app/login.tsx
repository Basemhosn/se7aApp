import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Login supports three flows:
 *   1. Email + password (primary) — Sign In or Create Account.
 *      Create Account calls supabase.auth.signUp which emails a
 *      confirmation link to se7a://auth/callback?code=... The user
 *      must confirm before signing in.
 *   2. Google OAuth — see signInWithGoogle below.
 *   3. Sign in with Apple — TODO (required for App Store 4.8).
 *
 * All flows funnel through /auth/callback which handles code exchange
 * and routes to onboarding or home based on profile state.
 */

WebBrowser.maybeCompleteAuthSession();

type Mode = "signin" | "signup";

export default function Login() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(
    params.mode === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const anyBusy = busy || googleBusy;

  const submit = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setMsg(t("auth.login.invalid_email"));
      return;
    }
    if (password.length < 8) {
      setMsg(t("auth.login.password_too_short"));
      return;
    }
    setBusy(true);
    setMsg("");

    if (mode === "signup") {
      const emailRedirectTo = Linking.createURL("/auth/callback");
      const { data, error } = await supabase.auth.signUp({
        email: clean,
        password,
        options: { emailRedirectTo },
      });
      setBusy(false);
      if (error) {
        setMsg(error.message);
        return;
      }
      // When email confirmation is required, Supabase returns a user
      // but no session. Show the "check your inbox" message. If
      // confirmation is disabled, a session is returned immediately
      // and we route to onboarding.
      if (data.session) {
        track("signup_completed", { method: "password" });
        router.replace("/onboarding");
        return;
      }
      setSuccess(true);
      setMsg(t("auth.login.signup_sent", { email: clean }));
      return;
    }

    // Sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: clean,
      password,
    });
    if (error || !data.user) {
      setBusy(false);
      setMsg(error?.message ?? t("auth.login.signin_err"));
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("user_id", data.user.id)
      .maybeSingle();
    router.replace(profile?.onboarded_at ? "/" : "/onboarding");
    setBusy(false);
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setMsg("");
    const redirectTo = Linking.createURL("/auth/callback");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        setMsg(error?.message ?? t("auth.login.google_err"));
        setGoogleBusy(false);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") {
          setMsg(t("auth.login.google_cancelled"));
        } else {
          setMsg(t("auth.login.google_err"));
        }
        setGoogleBusy(false);
        return;
      }
      const code = extractCodeFromReturnUrl(result.url);
      if (!code) {
        setMsg(`${t("auth.login.google_err")} (no code in redirect)`);
        setGoogleBusy(false);
        return;
      }
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) {
        setMsg(`${t("auth.login.google_err")}: ${exErr.message}`);
        setGoogleBusy(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMsg(`${t("auth.login.google_err")} (no user after exchange)`);
        setGoogleBusy(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile) {
        track("signup_completed", { method: "google" });
      }
      router.replace(profile?.onboarded_at ? "/" : "/onboarding");
    } catch (e) {
      setMsg((e as Error).message || t("auth.login.google_err"));
    }
    setGoogleBusy(false);
  };

  function extractCodeFromReturnUrl(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl);
      const q = u.searchParams.get("code");
      if (q) return q;
      const frag = u.hash?.startsWith("#") ? u.hash.slice(1) : u.hash ?? "";
      if (frag) {
        const fragParams = new URLSearchParams(frag);
        const c = fragParams.get("code");
        if (c) return c;
      }
      return null;
    } catch {
      return null;
    }
  }

  const handleForgot = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setMsg(t("auth.login.forgot_need_email"));
      return;
    }
    setBusy(true);
    setMsg("");
    const redirectTo = Linking.createURL("/auth/callback");
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSuccess(true);
    setMsg(t("auth.login.forgot_sent", { email: clean }));
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Wordmark size={26} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => {
            setMode("signin");
            setSuccess(false);
            setMsg("");
          }}
          style={[styles.tab, mode === "signin" && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>
            {t("auth.login.tab_signin")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode("signup");
            setSuccess(false);
            setMsg("");
          }}
          style={[styles.tab, mode === "signup" && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
            {t("auth.login.tab_signup")}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.h1}>
        {mode === "signin" ? t("auth.login.h1_signin") : t("auth.login.h1_signup")}
      </Text>
      <Text style={styles.sub}>
        {mode === "signin" ? t("auth.login.sub_signin") : t("auth.login.sub_signup")}
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t("auth.login.email_label")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t("auth.login.email_placeholder")}
          placeholderTextColor={colors.dim}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!success && !anyBusy}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t("auth.login.password_label")}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t("auth.login.password_placeholder")}
          placeholderTextColor={colors.dim}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!success && !anyBusy}
          style={styles.input}
        />
      </View>

      {mode === "signin" && !success && (
        <Pressable onPress={handleForgot} disabled={anyBusy}>
          <Text style={styles.forgot}>{t("auth.login.forgot")}</Text>
        </Pressable>
      )}

      <Btn
        label={
          busy
            ? t("auth.login.submit_busy")
            : mode === "signin"
              ? t("auth.login.submit_signin")
              : t("auth.login.submit_signup")
        }
        onPress={submit}
        loading={busy}
        disabled={success || googleBusy}
      />

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("auth.login.or_divider")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        onPress={signInWithGoogle}
        disabled={anyBusy || success}
        style={({ pressed }) => [
          styles.googleBtn,
          (anyBusy || success) && styles.googleBtnDisabled,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="logo-google" size={18} color={colors.ink} />
        <Text style={styles.googleBtnText}>
          {googleBusy ? t("auth.login.google_busy") : t("auth.login.google")}
        </Text>
      </Pressable>

      {!!msg && (
        <Text style={[styles.note, success ? styles.ok : styles.err]}>{msg}</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.md, marginBottom: spacing.md },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    borderRadius: radius.md - 2,
  },
  tabActive: {
    backgroundColor: colors.panel,
  },
  tabText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.dim,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: colors.ink,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
  },
  sub: { color: colors.dim, fontFamily: font.body, fontSize: 14 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleBtnText: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  field: { gap: spacing.xs },
  label: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  forgot: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.gold,
    textAlign: "right",
    paddingVertical: spacing.xs,
  },
  note: { fontFamily: font.body, fontSize: 13 },
  ok: { color: colors.mint },
  err: { color: colors.coral },
});
