import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, spacing } from "@/lib/theme";

interface CyclePrefsShape {
  enabled: boolean;
  avg_cycle_length_days: number;
  avg_period_length_days: number;
  share_with_coach: boolean;
}

/**
 * Cycle tracking settings sub-screen. Separate from the /cycle route
 * (which is the actual period-tracking UI with phase + history).
 * This screen gates the feature on/off and controls whether the coach
 * is allowed to adjust nutrition + training recs based on phase. Once
 * enabled, a button drops the user into /cycle to log periods.
 */
export default function CycleSettingsScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [prefs, setPrefs] = useState<CyclePrefsShape | null>(null);

  const load = useCallback(() => {
    api<{ prefs: CyclePrefsShape }>("/api/cycle/status")
      .then((r) => setPrefs(r.prefs))
      .catch(() => setPrefs(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (p: Partial<CyclePrefsShape>) => {
      setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
      try {
        const res = await api<{ prefs: CyclePrefsShape }>(
          "/api/cycle/status",
          { method: "POST", body: JSON.stringify(p) }
        );
        setPrefs(res.prefs);
      } catch {
        load();
      }
    },
    [load]
  );

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الدورة الشهرية" : "Cycle tracking"}
      </Text>
      {!prefs ? (
        <View style={{ padding: spacing.md }}>
          <Text style={styles.rowValue}>{isArabic ? "…" : "Loading…"}</Text>
        </View>
      ) : (
        <View style={settingsStyles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>
                {isArabic ? "تفعيل" : "Track cycle"}
              </Text>
              <Text style={styles.rowValue}>
                {isArabic
                  ? "خصوصي وبيتحكم فيه. مغلق افتراضياً."
                  : "Private + opt-in. Off by default."}
              </Text>
            </View>
            <Switch
              value={prefs.enabled}
              onValueChange={(v) => patch({ enabled: v })}
              trackColor={{ true: colors.gold, false: colors.line }}
              thumbColor={colors.ink}
            />
          </View>
          {prefs.enabled && (
            <>
              <Pressable
                onPress={() => router.push("/cycle")}
                style={styles.row}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>
                    {isArabic ? "افتح الشاشة" : "Open cycle screen"}
                  </Text>
                  <Text style={styles.rowValue}>
                    {isArabic
                      ? "سجل بداية الدورة وشوف المرحلة الحالية"
                      : "Log period starts + see current phase"}
                  </Text>
                </View>
                <Text
                  style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}
                >
                  →
                </Text>
              </Pressable>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>
                    {isArabic ? "شارك مع المدرب" : "Share with coach"}
                  </Text>
                  <Text style={styles.rowValue}>
                    {isArabic
                      ? "يعدل نصائح التدريب والأكل حسب المرحلة"
                      : "Adjust training + nutrition advice by phase"}
                  </Text>
                </View>
                <Switch
                  value={prefs.share_with_coach}
                  onValueChange={(v) => patch({ share_with_coach: v })}
                  trackColor={{ true: colors.gold, false: colors.line }}
                  thumbColor={colors.ink}
                />
              </View>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
});
