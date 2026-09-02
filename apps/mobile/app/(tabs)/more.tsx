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

interface BadgeShelfItem {
  key: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  earned_at: string | null;
  seen: boolean;
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
  const [reportMeta, setReportMeta] = useState<{
    week_index: number;
    total_weeks: number;
  } | null>(null);
  const [badges, setBadges] = useState<BadgeShelfItem[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const [
      { data: profileData },
      streakRes,
      trendRes,
      cycleRes,
      reportRes,
      badgesRes,
    ] = await Promise.all([
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
      api<{
        report: {
          week_index: number;
          total_weeks: number;
          checkpoints_met?: number[];
        } | null;
      }>("/api/reports/current").catch(() => ({ report: null })),
      api<{ badges: BadgeShelfItem[] }>("/api/badges").catch(() => ({
        badges: [] as BadgeShelfItem[],
      })),
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
    setReportMeta(reportRes.report);
    setBadges(badgesRes.badges ?? []);
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

        {/* ── Featured: 90-Day Plan ────────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/report")}
          style={styles.reportFeatured}
        >
          <View style={styles.reportRule} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reportKicker}>
              {reportMeta
                ? isArabic
                  ? `أسبوع ${reportMeta.week_index} من ${reportMeta.total_weeks}`
                  : `WEEK ${reportMeta.week_index} OF ${reportMeta.total_weeks}`
                : isArabic
                  ? "خطة الـ ٩٠ يومًا"
                  : "90-DAY PLAN"}
            </Text>
            <Text style={styles.reportTitle}>
              {reportMeta
                ? isArabic
                  ? "افتح خطتك"
                  : "View your plan"
                : isPro
                  ? isArabic
                    ? "أنشئ خطتك"
                    : "Generate your plan"
                  : isArabic
                    ? "احصل عليها · ١٩ درهم"
                    : "Get it · 19 AED"}
            </Text>
          </View>
          <Text style={styles.chevGold}>→</Text>
        </Pressable>

        {/* ── Featured: Weekly Wrapped ─────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/weekly-wrapped")}
          style={styles.wrappedFeatured}
        >
          <View style={styles.wrappedRule} />
          <View style={{ flex: 1 }}>
            <Text style={styles.wrappedKicker}>
              {isArabic ? "المراجعة الأسبوعية" : "WEEKLY REVIEW"}
            </Text>
            <Text style={styles.wrappedTitle}>
              {isArabic ? "شاهد الملخص" : "See your week"}
            </Text>
          </View>
          <Text style={styles.chevGold}>→</Text>
        </Pressable>

        {/* ── Badges shelf ─────────────────────────────────────────── */}
        {badges.length > 0 && (
          <>
            <SectionHeader
              label={
                isArabic
                  ? `الإنجازات · ${badges.filter((b) => b.earned_at).length}`
                  : `ACHIEVEMENTS · ${badges.filter((b) => b.earned_at).length}`
              }
              isArabic={isArabic}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgeShelf}
            >
              {badges.map((b) => {
                const earned = !!b.earned_at;
                const tint =
                  b.tier === "gold"
                    ? colors.gold
                    : b.tier === "platinum"
                      ? colors.mint
                      : b.tier === "silver"
                        ? colors.ink
                        : colors.coral;
                // Two-letter mark derived from the badge key so every
                // achievement reads as a small typographic token, not
                // a game icon. Tier only tints the dot when earned.
                const mark = badgeMark(b.key);
                return (
                  <View
                    key={b.key}
                    style={[
                      styles.badgeItem,
                      earned && { borderColor: tint },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeItemMark,
                        { color: earned ? tint : colors.line },
                      ]}
                    >
                      {mark}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── Preview (dev) ────────────────────────────────────────── */}
        <SectionHeader
          label={isArabic ? "معاينة" : "Preview"}
          isArabic={isArabic}
        />
        <MoreRow
          icon="sparkles-outline"
          label={isArabic ? "الشاشة الرئيسية (POC)" : "Home tab (POC)"}
          hint={isArabic ? "تصميم جديد" : "New layout preview"}
          onPress={() => router.push("/home-poc")}
          tint={colors.gold}
        />

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
          icon="sparkles-outline"
          label={isArabic ? "الأنماط" : "Patterns"}
          hint={isArabic ? "ما لاحظه SE7A" : "What SE7A noticed"}
          onPress={() => router.push("/insights")}
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

/**
 * Turns a badge_key into a short typographic mark for the shelf.
 * Rules: pick a domain letter + a number/tier suffix so every mark
 * reads deterministically ("S7" streak-7-day, "P1" plan-week-1, etc.)
 * without needing per-badge design.
 */
function badgeMark(key: string): string {
  if (key.startsWith("streak_")) return "S" + key.replace("streak_", "").replace("d", "");
  if (key.startsWith("anniv_")) return "D" + key.replace("anniv_", "").replace("d", "");
  if (key.startsWith("plan_week")) return "W1";
  if (key === "plan_month1_complete") return "M1";
  if (key === "plan_finished") return "P✓";
  if (key === "logged_100") return "L2";
  if (key === "logged_1000") return "L3";
  if (key === "workouts_10") return "W2";
  if (key.startsWith("first_")) {
    const rest = key.replace("first_", "");
    return "1·" + rest[0]!.toUpperCase();
  }
  // Fallback: first two letters of the key.
  return key.slice(0, 2).toUpperCase();
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
  badgeShelf: {
    gap: spacing.xs,
    paddingHorizontal: 2,
    paddingVertical: spacing.xs,
  },
  badgeItem: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeItemMark: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  reportFeatured: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  reportRule: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: colors.gold,
  },
  reportKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  reportTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 2,
  },
  wrappedFeatured: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  wrappedRule: {
    width: 2,
    alignSelf: "stretch",
    backgroundColor: colors.line,
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
