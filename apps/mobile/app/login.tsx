import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { colors, font, radius, spacing } from "@/lib/theme";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
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

  return (
    <Screen>
      <View style={styles.head}>
        <Wordmark size={26} />
      </View>
      <Text style={styles.h1}>{t("auth.login.h1")}</Text>
      <Text style={styles.sub}>
        {t("auth.login.sub")}
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
          editable={!sent && !busy}
          style={styles.input}
        />
      </View>

      <Btn
        label={sent ? t("auth.login.sent") : t("auth.login.send")}
        onPress={send}
        loading={busy}
        disabled={sent}
      />

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
