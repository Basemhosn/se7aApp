import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { useEntitlement } from "@/lib/EntitlementContext";
import { useRamadan } from "@/lib/useRamadan";
import type { Profile } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

interface StreakResponse {
  current_days: number;
  longest_days: number;
}

interface WeightTrend {
  points: { weight_kg: number; logged_at: string }[];
}

interface CycleStatus {
  prefs: { enabled: boolean };
}

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * "More" hub — every feature has a home here so users can find the
 * ones they don't hit daily (fasting, cycle, recipes, measurements).
 * Header shows identity + the two numbers users check most (streak,
 * weight delta). Grouped rows mirror how users think about the app:
 * habits, progress artifacts, food, account.
 */
export default function More() {
  const { user, signOut } = useAuth();
  const { i18n } = useTranslation();
  const { ent } = useEntitlement();
  const isPro = ent.is_pro;
  const isArabic = i18n.language === "ar";
  const { status: ramadan } = useRamadan();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [weightDelta, setWeightDelta] = useState<number | null>(null);
  const [cycleEnabled, setCycleEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const [{ data: profileData }, streakRes, trendRes, cycleRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        api<StreakResponse>(
          `/api/streaks?tz_offset_min=${tzOffsetMin}`
        ).catch(() => null),
        api<WeightTrend>("/api/weight/trend?days=30").catch(() => null),
        api<CycleStatus>("/api/cycle/status").catch(() => null),
      ]);
    setProfile(profileData as Profile | null);
    setStreak(streakRes);
    if (trendRes && trendRes.points.length >= 2) {
      const first = Number(trendRes.points[0]!.weight_kg);
      const last = Number(
        trendRes.points[trendRes.points.length - 1]!.weight_kg
      );
      setWeightDelta(Math.round((last - first) * 10) / 10);
    } else {
      setWeightDelta(null);
    }
    setCycleEnabled(!!cycleRes?.prefs.enabled);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  const displayName =
    profile?.display_name || user?.email?.split("@")[0] || "SE7A";
  const initial = (displayName[0] ?? "S").toUpperCase();

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Identity header ───────────────────────────────────────── */}
        <View style={styles.head}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {streak?.current_days ?? 0}
            </Text>
            <Text style={styles.statLabel}>
              {isArabic ? "أيام السلسلة" : "STREAK · DAYS"}
            </Text>
          </View>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <View style={styles.stat}>
            <Text
              style={[
                styles.statValue,
                weightDelta !== null &&
                  weightDelta < 0 && { color: colors.mint },
                weightDelta !== null &&
                  weightDelta > 0 && { color: colors.coral },
              ]}
            >
              {weightDelta !== null
                ? `${weightDelta > 0 ? "+" : ""}${weightDelta}`
                : "—"}
            </Text>
            <Text style={styles.statLabel}>
              {isArabic ? "٣٠ يوم · كجم" : "30-DAY · KG"}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {!isPro && (
          <Pressable
            onPress={() => router.push("/paywall")}
            style={styles.proCard}
          >
            <Ionicons name="star" size={16} color={colors.gold} />
            <Text style={styles.proText}>
              {isArabic ? "فعّل SE7A Pro" : "Activate SE7A Pro"}
            </Text>
            <Text style={styles.proArrow}>→</Text>
          </Pressable>
        )}

        {/* ── Featured: Weekly Wrapped ─────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/weekly-wrapped")}
          style={styles.wrappedFeatured}
        >
          <View style={styles.wrappedIcon}>
            <Ionicons name="sparkles" size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.wrappedKicker}>
              {isArabic ? "أسبوعك · ملخص" : "YOUR WEEK · WRAPPED"}
            </Text>
            <Text style={styles.wrappedTitle}>
              {isArabic ? "شاهد الملخص" : "See your recap"}
            </Text>
          </View>
          <Text style={styles.chevGold}>→</Text>
        </Pressable>

        {/* ── Habits ───────────────────────────────────────────────── */}
        <SectionHeader
          label={isArabic ? "العادات" : "Habits"}
          isArabic={isArabic}
        />
        <MoreRow
          icon="restaurant-outline"
          label={isArabic ? "خطة الوجبات" : "Meal plan"}
          onPress={() => router.push("/meal-plan")}
        />
        <MoreRow
          icon="hourglass-outline"
          label={isArabic ? "الصيام" : "Fasting"}
          onPress={() => router.push("/fasting")}
        />
        {cycleEnabled && (
          <MoreRow
            icon="water-outline"
            label={isArabic ? "الدورة" : "Cycle"}
            onPress={() => router.push("/cycle")}
          />
        )}
        {ramadan?.active && (
          <MoreRow
            icon="moon-outline"
            label={isArabic ? "وضع رمضان" : "Ramadan mode"}
            onPress={() => router.push("/settings")}
            hint={
              ramadan.day_num !== null && ramadan.total_days !== null
                ? isArabic
                  ? `يوم ${ramadan.day_num} من ${ramadan.total_days}`
                  : `Day ${ramadan.day_num} of ${ramadan.total_days}`
                : undefined
            }
          />
        )}

        {/* ── Progress ─────────────────────────────────────────────── */}
        <SectionHeader
          label={isArabic ? "التقدم" : "Progress"}
          isArabic={isArabic}
        />
        <MoreRow
          icon="calendar-outline"
          label={isArabic ? "التقويم" : "Calendar"}
          onPress={() => router.push("/calendar")}
        />
        <MoreRow
          icon="images-outline"
          label={isArabic ? "صور التقدم" : "Progress photos"}
          onPress={() => router.push("/progress-photos")}
        />
        <MoreRow
          icon="body-outline"
          label={isArabic ? "القياسات" : "Body measurements"}
          onPress={() => router.push("/measurements")}
        />

        {/* ── Food ─────────────────────────────────────────────────── */}
        <SectionHeader
          label={isArabic ? "الطعام" : "Food"}
          isArabic={isArabic}
        />
        <MoreRow
          icon="reader-outline"
          label={isArabic ? "الوصفات" : "Recipes"}
          onPress={() => router.push("/recipes")}
        />
        <MoreRow
          icon="cart-outline"
          label={isArabic ? "قائمة التسوق" : "Shopping list"}
          onPress={() => router.push("/shopping-list")}
        />
        <MoreRow
          icon="add-circle-outline"
          label={isArabic ? "أضف يدوياً" : "Log meal manually"}
          onPress={() => router.push("/manual-meal")}
        />

        {/* ── Account ──────────────────────────────────────────────── */}
        <SectionHeader
          label={isArabic ? "الحساب" : "Account"}
          isArabic={isArabic}
        />
        <MoreRow
          icon="settings-outline"
          label={isArabic ? "الإعدادات" : "Settings"}
          onPress={() => router.push("/settings")}
        />
        <MoreRow
          icon="language-outline"
          label={isArabic ? "اللغة" : "Language"}
          onPress={() => router.push("/language")}
        />
        <MoreRow
          icon="log-out-outline"
          label={isArabic ? "تسجيل الخروج" : "Sign out"}
          onPress={signOut}
          tint={colors.coral}
          last
        />

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

function SectionHeader({
  label,
  isArabic: _isArabic,
}: {
  label: string;
  isArabic: boolean;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function MoreRow({
  icon,
  label,
  hint,
  onPress,
  tint,
  last,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  tint?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, last && { borderBottomWidth: 0 }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={tint ?? colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, tint ? { color: tint } : null]}>
          {label}
        </Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stat: { alignItems: "center", gap: 2, minWidth: 72 },
  statValue: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.gold,
  },
  name: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  proText: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.gold,
    flex: 1,
  },
  proArrow: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.gold,
  },
  wrappedFeatured: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  wrappedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  wrappedKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  wrappedTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 2,
  },
  chevGold: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.gold,
  },
  sectionHead: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  rowHint: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  chev: {
    fontFamily: font.body,
    fontSize: 22,
    color: colors.dim,
    marginLeft: 4,
  },
});
