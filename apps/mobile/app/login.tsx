import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Login supports two auth flows:
 *   1. Email magic link (existing) — Supabase sends a one-tap link;
 *      the app opens via se7a://auth/callback?code=... which the
 *      /auth/callback route exchanges for a session.
 *   2. Google OAuth (new) — supabase.auth.signInWithOAuth returns the
 *      Google authorize URL; expo-web-browser opens it in an in-app
 *      Safari sheet, user consents, Google redirects to Supabase's
 *      /auth/v1/callback, Supabase redirects back to se7a://auth/callback
 *      with the code. Same /auth/callback route handles the exchange.
 *
 * Both flows require se7a://auth/callback to be listed as an allowed
 * redirect URL in Supabase (Auth → URL Configuration).
 */

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setMsg(t("auth.login.invalid_email"));
      return;
    }
    setBusy(true);
    setMsg("");
    // Use the app's URL scheme so the link opens directly into the app.
    const redirectTo = Linking.createURL("/auth/callback");
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSent(true);
    setMsg(t("auth.login.sent_msg", { email: clean }));
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
        // User dismissed the sheet or the flow returned no result.
        // Not an error worth surfacing loudly unless there's a URL.
        if (result.type === "cancel" || result.type === "dismiss") {
          setMsg(t("auth.login.google_cancelled"));
        } else {
          setMsg(t("auth.login.google_err"));
        }
        setGoogleBusy(false);
        return;
      }
      // Success: the returned url is se7a://auth/callback?code=...
      // Extract code, exchange it. The /auth/callback screen handles
      // the same exchange when a magic link deep-links back — reuse
      // that path instead of duplicating the exchange here so profile
      // routing + onboarding redirect stay consistent.
      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      if (!code) {
        setMsg(t("auth.login.google_err"));
        setGoogleBusy(false);
        return;
      }
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) {
        setMsg(exErr.message);
        setGoogleBusy(false);
        return;
      }
      // Session is now live; AuthProvider picks it up and routes.
    } catch (e) {
      setMsg((e as Error).message || t("auth.login.google_err"));
    }
    setGoogleBusy(false);
  };

  const anyBusy = busy || googleBusy;

  return (
    <Screen>
      <View style={styles.head}>
        <Wordmark size={26} />
      </View>
      <Text style={styles.h1}>{t("auth.login.h1")}</Text>
      <Text style={styles.sub}>{t("auth.login.sub")}</Text>

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
          editable={!sent && !anyBusy}
          style={styles.input}
        />
      </View>

      <Btn
        label={sent ? t("auth.login.sent") : t("auth.login.send")}
        onPress={send}
        loading={busy}
        disabled={sent || googleBusy}
      />

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("auth.login.or_divider")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        onPress={signInWithGoogle}
        disabled={anyBusy || sent}
        style={({ pressed }) => [
          styles.googleBtn,
          (anyBusy || sent) && styles.googleBtnDisabled,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="logo-google" size={18} color={colors.ink} />
        <Text style={styles.googleBtnText}>
          {googleBusy ? t("auth.login.google_busy") : t("auth.login.google")}
        </Text>
      </Pressable>

      {!!msg && (
        <Text style={[styles.note, sent ? styles.ok : styles.err]}>{msg}</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.md, marginBottom: spacing.md },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
  },
  sub: { color: colors.dim, fontFamily: font.body, fontSize: 15 },
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
  note: { fontFamily: font.body, fontSize: 13 },
  ok: { color: colors.mint },
  err: { color: colors.coral },
});
