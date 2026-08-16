import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { setLocale, type Locale } from "@/lib/i18n";
import { colors, font, radius, spacing } from "@/lib/theme";

const OPTIONS: { value: Locale; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "ar", label: "العربية", native: "Arabic" },
];

export default function Language() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState<Locale | null>(null);

  const pick = async (loc: Locale) => {
    if (loc === i18n.language) return;
    setBusy(loc);
    const restartNeeded = await setLocale(loc);
    setBusy(null);
    if (restartNeeded) {
      Alert.alert(
        loc === "ar" ? "أعد تشغيل التطبيق" : "Restart required",
        loc === "ar"
          ? "أغلق SE7A وأعد فتحه لرؤية التغييرات على شاشة اليمين-إلى-اليسار."
          : "Close SE7A and reopen it to see right-to-left layout changes.",
        [{ text: loc === "ar" ? "حسنًا" : "OK" }]
      );
    } else {
      router.back();
    }
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.title}>{t("language.title")}</Text>
      <Text style={styles.sub}>
        {t("language.title") === "اللغة"
          ? "SE7A يدعم العربية والإنجليزية. اختر ما يناسبك."
          : "SE7A supports Arabic and English. Pick whichever fits."}
      </Text>

      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const active = i18n.language === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => pick(opt.value)}
              disabled={busy !== null}
              style={[styles.row, active && styles.rowActive]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                  {opt.label}
                </Text>
                {opt.label !== opt.native && (
                  <Text style={styles.rowNative}>{opt.native}</Text>
                )}
              </View>
              {active && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  list: { gap: spacing.sm, marginTop: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  rowActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.06)",
  },
  rowLabel: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  rowLabelActive: { color: colors.gold },
  rowNative: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  check: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.gold,
  },
});
