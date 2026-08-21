import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";

type Kind = "run" | "walk" | "ride" | "swim" | "row" | "elliptical" | "hike" | "other";

const KINDS: {
  v: Kind;
  icon: keyof typeof Ionicons.glyphMap;
  en: string;
  ar: string;
}[] = [
  { v: "run", icon: "walk-outline", en: "Run", ar: "جري" },
  { v: "walk", icon: "footsteps-outline", en: "Walk", ar: "مشي" },
  { v: "ride", icon: "bicycle-outline", en: "Ride", ar: "دراجة" },
  { v: "swim", icon: "water-outline", en: "Swim", ar: "سباحة" },
  { v: "row", icon: "boat-outline", en: "Row", ar: "تجديف" },
  { v: "elliptical", icon: "sync-outline", en: "Elliptical", ar: "بيضاوي" },
  { v: "hike", icon: "trail-sign-outline", en: "Hike", ar: "مشي جبلي" },
  { v: "other", icon: "ellipsis-horizontal-outline", en: "Other", ar: "غير ذلك" },
];

export default function LogCardio() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [kind, setKind] = useState<Kind | null>(null);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [kcal, setKcal] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const canSave = !!kind && Number(duration) > 0;

  const save = async () => {
    if (!kind || Number(duration) <= 0) return;
    setSaving(true);
    setErr("");
    try {
      await api("/api/cardio", {
        method: "POST",
        body: JSON.stringify({
          kind,
          duration_min: Number(duration),
          distance_km: distance ? Number(distance) : undefined,
          kcal_burned: kcal ? Number(kcal) : undefined,
          source: "manual",
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save — try again.");
      Alert.alert(isArabic ? "خطأ" : "Error", (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{isArabic ? "كارديو" : "CARDIO"}</Text>
      <Text style={styles.h1}>
        {isArabic ? "سجّل نشاطك" : "Log your session"}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "المدة أهم من المسافة — أدخل ما تعرفه فقط."
          : "Duration is what matters most — fill only what you know."}
      </Text>

      <Text style={styles.sectionKicker}>
        {isArabic ? "النوع" : "TYPE"}
      </Text>
      <View style={styles.kindGrid}>
        {KINDS.map((k) => {
          const on = kind === k.v;
          return (
            <Pressable
              key={k.v}
              onPress={() => setKind(k.v)}
              style={[styles.kindTile, on && styles.kindTileOn]}
            >
              <View style={[styles.kindIcon, on && styles.kindIconOn]}>
                <Ionicons
                  name={k.icon}
                  size={20}
                  color={on ? colors.gold : colors.dim}
                />
              </View>
              <Text style={[styles.kindLabel, on && styles.kindLabelOn]}>
                {isArabic ? k.ar : k.en}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.formCard}>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>
            {isArabic ? "المدة" : "DURATION"}
          </Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
            <Text style={styles.unit}>min</Text>
          </View>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>
            {isArabic ? "المسافة (اختياري)" : "DISTANCE (OPTIONAL)"}
          </Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={distance}
              onChangeText={setDistance}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
            <Text style={styles.unit}>km</Text>
          </View>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>
            {isArabic ? "السعرات المحروقة (اختياري)" : "KCAL BURNED (OPTIONAL)"}
          </Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={kcal}
              onChangeText={setKcal}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
            <Text style={styles.unit}>kcal</Text>
          </View>
        </View>
      </View>

      {!!err && <Text style={styles.err}>{err}</Text>}

      <Btn
        label={
          saving
            ? isArabic
              ? "جارٍ الحفظ…"
              : "Saving…"
            : isArabic
              ? "احفظ"
              : "Save session"
        }
        onPress={save}
        loading={saving}
        disabled={!canSave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  sectionKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  kindGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  kindTile: {
    width: "22%",
    aspectRatio: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  kindTileOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.08)",
  },
  kindIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  kindIconOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.12)",
  },
  kindLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  kindLabelOn: { color: colors.gold, fontFamily: font.monoBold },
  formCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  formRow: { gap: 4 },
  formLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  unit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
