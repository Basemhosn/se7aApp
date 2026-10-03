import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Edit Nutrition Goals — direct macro-target overrides. For most
 * users the onboarding-computed targets are fine, but someone
 * following a specific protocol (keto, cut-vs-recomp swap mid-plan,
 * coach-provided target) needs to set absolute numbers without
 * re-running the whole onboarding form.
 *
 * Rules enforced client-side (server also validates):
 *   • Each field is nullable → clearing it reverts to the
 *     onboarding-computed value on next profile read
 *   • Sanity ranges match the server zod schema (800-6000 kcal,
 *     20-400 P, 0-800 C, 10-300 F) — hard-stop invalid input
 */
export default function EditGoals() {
  const { t, i18n } = useTranslation();
  void t;
  const isArabic = i18n.language === "ar";

  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{
        daily_kcal_target: number | null;
        daily_protein_g: number | null;
        daily_carb_g: number | null;
        daily_fat_g: number | null;
      }>("/api/profile/prefs");
      setKcal(r.daily_kcal_target != null ? String(r.daily_kcal_target) : "");
      setProtein(
        r.daily_protein_g != null ? String(r.daily_protein_g) : ""
      );
      setCarb(r.daily_carb_g != null ? String(r.daily_carb_g) : "");
      setFat(r.daily_fat_g != null ? String(r.daily_fat_g) : "");
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parseField = (s: string): number | null => {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  };

  const save = async () => {
    const payload = {
      daily_kcal_target: parseField(kcal),
      daily_protein_g: parseField(protein),
      daily_carb_g: parseField(carb),
      daily_fat_g: parseField(fat),
    };
    setSaving(true);
    try {
      await api("/api/profile/prefs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      Alert.alert(
        isArabic ? "تم الحفظ" : "Saved",
        isArabic
          ? "ستظهر الأهداف الجديدة على الصفحة الرئيسية فوراً."
          : "Your new targets will appear on Home immediately.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(
        isArabic ? "لم يتم الحفظ" : "Save failed",
        (e as Error).message
      );
    }
    setSaving(false);
  };

  const macroKcal =
    (parseField(protein) ?? 0) * 4 +
    (parseField(carb) ?? 0) * 4 +
    (parseField(fat) ?? 0) * 9;
  const kcalTarget = parseField(kcal) ?? 0;
  const diff = kcalTarget - macroKcal;

  return (
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <View style={styles.headRow}>
        <BackButton />
        <Text style={styles.headTitle}>
          {isArabic ? "عدّل الأهداف" : "Edit goals"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sub}>
            {isArabic
              ? "اترك الحقل فارغاً لاستخدام القيم المحسوبة من إعداد الملف."
              : "Leave a field empty to use the onboarding-computed value."}
          </Text>

          <Field
            label={isArabic ? "السعرات اليومية" : "Daily calories"}
            unit="kcal"
            value={kcal}
            onChange={setKcal}
            tint={colors.gold}
          />
          <Field
            label={isArabic ? "البروتين" : "Protein"}
            unit="g"
            value={protein}
            onChange={setProtein}
            tint={colors.mint}
          />
          <Field
            label={isArabic ? "الكربوهيدرات" : "Carbs"}
            unit="g"
            value={carb}
            onChange={setCarb}
            tint={colors.gold}
          />
          <Field
            label={isArabic ? "الدهون" : "Fat"}
            unit="g"
            value={fat}
            onChange={setFat}
            tint={colors.coral}
          />

          {kcalTarget > 0 && macroKcal > 0 ? (
            <View
              style={[
                styles.hintCard,
                Math.abs(diff) > 100 && styles.hintCardWarn,
              ]}
            >
              <Ionicons
                name={Math.abs(diff) > 100 ? "warning" : "checkmark-circle"}
                size={16}
                color={Math.abs(diff) > 100 ? colors.coral : colors.mint}
              />
              <Text style={styles.hintText}>
                {isArabic
                  ? `الماكروز = ${macroKcal} سعرة · فرق ${diff > 0 ? "+" : ""}${diff}`
                  : `Macros sum to ${macroKcal} kcal (${diff > 0 ? "+" : ""}${diff} vs target)`}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.saveBtn, (loading || saving) && { opacity: 0.5 }]}
            disabled={loading || saving}
            onPress={save}
          >
            <Text style={styles.saveText}>
              {saving ? "…" : isArabic ? "احفظ" : "Save"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  tint,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  tint: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.fieldDot, { backgroundColor: tint }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={colors.dim}
        maxLength={5}
      />
      <Text style={styles.fieldUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  sub: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fieldLabel: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
  },
  fieldInput: {
    width: 70,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    color: colors.ink,
    fontFamily: font.monoBold,
    fontSize: 14,
    textAlign: "right",
  },
  fieldUnit: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 11,
    width: 28,
  },
  hintCard: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  hintCardWarn: {
    borderColor: colors.coral + "55",
    backgroundColor: colors.coral + "12",
  },
  hintText: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 12,
    flex: 1,
  },
  saveBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: "center",
  },
  saveText: {
    color: colors.bg,
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
