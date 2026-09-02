import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CalorieRing } from "@/components/CalorieRing";
import { QuickLogFab } from "@/components/QuickLogFab";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import type { LedgerDayResponse, Profile } from "@/types";
import { SLOTS, SLOT_META } from "@/lib/slot";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Home POC (2026-09-03).
 *
 * A redesigned Home screen inspired by Cal.ai — three swipeable metric
 * pages (Nutrition / Micros+Health / Activity+Water) collapsing what
 * used to be an ~18-widget vertical stack. Kept side-by-side with the
 * shipped Home tab; user reaches it from More → "Home POC (preview)".
 *
 * Only the primary data sources are wired live (ledger, water, streak).
 * Placeholder tiles on pages 1–2 exist to prove the visual direction
 * before we invest in wiring the rest.
 */

interface WaterTodayResponse {
  total_ml: number;
  target_ml: number;
  entries: number;
}

interface StreakResponse {
  current_days: number;
  longest_days: number;
  days_this_week: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const PAGE_PADDING = spacing.lg;
const PAGE_WIDTH = SCREEN_WIDTH - PAGE_PADDING * 2;

export default function HomePoc() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerDayResponse | null>(null);
  const [water, setWater] = useState<WaterTodayResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  // 7-day strip anchored on today (rendered Sat–Fri in the mockup, but
  // in practice we just show the last 6 days plus today rolling).
  const [selectedOffset, setSelectedOffset] = useState(0);
  const dateStrip = useMemo(() => buildDateStrip(), []);

  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const targetIso = isoOffset(selectedOffset);
    const ledgerPath =
      selectedOffset === 0
        ? `/api/ledger/today?tz_offset_min=${tzOffsetMin}`
        : `/api/ledger/today?date=${targetIso}&tz_offset_min=${tzOffsetMin}`;
    const [{ data: profileData }, ledgerRes, waterRes, streakRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        api<LedgerDayResponse>(ledgerPath),
        api<WaterTodayResponse>("/api/water/today").catch(() => ({
          total_ml: 0,
          target_ml: 2500,
          entries: 0,
        })),
        api<StreakResponse>(
          `/api/streaks?tz_offset_min=${tzOffsetMin}`
        ).catch(() => null),
      ]);
    setProfile(profileData as Profile);
    setLedger(ledgerRes);
    setWater(waterRes);
    setStreak(streakRes);
    setLoading(false);
  }, [user, selectedOffset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  const addWater = async (ml: number) => {
    if (!water) return;
    const prev = water;
    setWater({ ...water, total_ml: water.total_ml + ml, entries: water.entries + 1 });
    try {
      await api("/api/water/log", {
        method: "POST",
        body: JSON.stringify({ ml }),
      });
    } catch {
      setWater(prev);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  const kcalTarget = profile?.daily_kcal_target ?? 2200;
  const totals = ledger?.totals;
  const kcalLow = totals?.kcal.low ?? 0;
  const kcalHigh = totals?.kcal.high ?? 0;
  const kcalMid = Math.round((kcalLow + kcalHigh) / 2);
  const proteinTarget = profile?.daily_protein_g ?? 0;
  const carbTarget = profile?.daily_carb_g ?? 0;
  const fatTarget = profile?.daily_fat_g ?? 0;

  return (
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxl * 4 }}
      >
        <Header
          streakDays={streak?.current_days ?? 0}
          isArabic={isArabic}
        />
        <DateStrip
          days={dateStrip}
          selectedOffset={selectedOffset}
          onSelect={setSelectedOffset}
          isArabic={isArabic}
        />
        <MetricPager
          pageIndex={pageIndex}
          onPageChange={setPageIndex}
          nutrition={{
            target: kcalTarget,
            eatenLow: kcalLow,
            eatenHigh: kcalHigh,
            eatenMid: kcalMid,
            protein: {
              value: Math.round(midOf(totals?.protein_g)),
              target: proteinTarget,
            },
            carbs: {
              value: Math.round(midOf(totals?.carb_g)),
              target: carbTarget,
            },
            fat: {
              value: Math.round(midOf(totals?.fat_g)),
              target: fatTarget,
            },
          }}
          micros={{
            fiber: {
              value: Math.round(midOf(totals?.fiber_g)),
              target: profile?.daily_fiber_g ?? 25,
            },
            sugar: {
              value: Math.round(midOf(totals?.sugar_g)),
              target: profile?.daily_sugar_g ?? 50,
            },
            sodium: {
              value: Math.round(midOf(totals?.sodium_mg)),
              target: profile?.daily_sodium_mg ?? 2300,
            },
          }}
          activity={{
            waterMl: water?.total_ml ?? 0,
            waterTarget: water?.target_ml ?? 2500,
            onAddWater: () => addWater(250),
          }}
          isArabic={isArabic}
        />
        <MealsList
          totals={totals}
          expandedSlot={expandedSlot}
          onToggle={(slot) =>
            setExpandedSlot((cur) => (cur === slot ? null : slot))
          }
          isArabic={isArabic}
        />
      </ScrollView>
      <QuickLogFab
        actions={[
          {
            key: "voice",
            label: isArabic ? "قل ما أكلت" : "Say what you ate",
            icon: "mic-outline",
            tint: colors.gold,
            onPress: () => router.push("/voice-log"),
          },
          {
            key: "plate",
            label: isArabic ? "امسح الطبق" : "Scan a plate",
            icon: "camera-outline",
            tint: colors.gold,
            onPress: () => router.push("/scan/plate"),
          },
          {
            key: "barcode",
            label: isArabic ? "الباركود" : "Barcode",
            icon: "barcode-outline",
            tint: colors.gold,
            onPress: () => router.push("/scan/barcode"),
          },
          {
            key: "manual",
            label: isArabic ? "إضافة يدوية" : "Add manually",
            icon: "create-outline",
            tint: colors.ink,
            onPress: () => router.push("/manual-meal"),
          },
          {
            key: "water",
            label: isArabic ? "أضف ماء" : "Add water",
            icon: "water-outline",
            tint: colors.mint,
            onPress: () => addWater(250),
          },
          {
            key: "weight",
            label: isArabic ? "سجل الوزن" : "Log weight",
            icon: "speedometer-outline",
            tint: colors.coral,
            onPress: () => router.push("/progress"),
          },
          {
            key: "cardio",
            label: isArabic ? "سجل الكارديو" : "Log cardio",
            icon: "walk-outline",
            tint: colors.mint,
            onPress: () => router.push("/log-cardio"),
          },
        ]}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header

function Header({
  streakDays,
  isArabic,
}: {
  streakDays: number;
  isArabic: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerBrand}>
        <Text style={styles.headerLogo}>SE7A</Text>
        <View style={styles.pocPill}>
          <Text style={styles.pocPillText}>POC</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <Pressable
          style={styles.streakChip}
          onPress={() => router.push("/(tabs)/more")}
        >
          <Ionicons name="flame" size={14} color={colors.gold} />
          <Text style={styles.streakChipText}>{streakDays}</Text>
        </Pressable>
        <Pressable
          style={styles.avatarBtn}
          onPress={() => router.push("/settings")}
        >
          <Ionicons name="person-outline" size={18} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Date strip

interface DateStripDay {
  offset: number;
  label: string;
  day: number;
  isToday: boolean;
}

function buildDateStrip(): DateStripDay[] {
  const today = new Date();
  const days: DateStripDay[] = [];
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = -3; i <= 3; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      offset: i,
      label: labels[d.getDay()],
      day: d.getDate(),
      isToday: i === 0,
    });
  }
  return days;
}

function DateStrip({
  days,
  selectedOffset,
  onSelect,
  isArabic,
}: {
  days: DateStripDay[];
  selectedOffset: number;
  onSelect: (offset: number) => void;
  isArabic: boolean;
}) {
  const arLabels: Record<string, string> = {
    Sun: "أحد",
    Mon: "إثن",
    Tue: "ثلاث",
    Wed: "أرب",
    Thu: "خم",
    Fri: "جم",
    Sat: "سبت",
  };
  return (
    <View style={styles.dateStrip}>
      {days.map((d) => {
        const selected = d.offset === selectedOffset;
        return (
          <Pressable
            key={d.offset}
            style={styles.dateCell}
            onPress={() => onSelect(d.offset)}
          >
            <Text
              style={[
                styles.dateLabel,
                selected && styles.dateLabelSelected,
              ]}
            >
              {isArabic ? arLabels[d.label] : d.label}
            </Text>
            <View
              style={[
                styles.dateCircle,
                selected && styles.dateCircleSelected,
              ]}
            >
              <Text
                style={[
                  styles.dateDay,
                  selected && styles.dateDaySelected,
                ]}
              >
                {d.day}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Metric pager

interface NutritionData {
  target: number;
  eatenLow: number;
  eatenHigh: number;
  eatenMid: number;
  protein: { value: number; target: number };
  carbs: { value: number; target: number };
  fat: { value: number; target: number };
}

interface MicrosData {
  fiber: { value: number; target: number };
  sugar: { value: number; target: number };
  sodium: { value: number; target: number };
}

interface ActivityData {
  waterMl: number;
  waterTarget: number;
  onAddWater: () => void;
}

function MetricPager({
  pageIndex,
  onPageChange,
  nutrition,
  micros,
  activity,
  isArabic,
}: {
  pageIndex: number;
  onPageChange: (idx: number) => void;
  nutrition: NutritionData;
  micros: MicrosData;
  activity: ActivityData;
  isArabic: boolean;
}) {
  const listRef = useRef<FlatList>(null);
  const pages = ["nutrition", "micros", "activity"] as const;
  return (
    <View>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(p) => p}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={SCREEN_WIDTH}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(
            e.nativeEvent.contentOffset.x / SCREEN_WIDTH
          );
          onPageChange(idx);
        }}
        renderItem={({ item }) => {
          if (item === "nutrition")
            return <NutritionPage data={nutrition} isArabic={isArabic} />;
          if (item === "micros")
            return <MicrosPage data={micros} isArabic={isArabic} />;
          return <ActivityPage data={activity} isArabic={isArabic} />;
        }}
      />
      <Dots count={3} active={pageIndex} />
    </View>
  );
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === active && styles.dotActive]}
        />
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page 0 — Nutrition

function NutritionPage({
  data,
  isArabic,
}: {
  data: NutritionData;
  isArabic: boolean;
}) {
  const remaining = Math.max(0, data.target - data.eatenMid);
  return (
    <View style={[styles.page, { width: SCREEN_WIDTH }]}>
      <View style={styles.ringWrap}>
        <CalorieRing
          target={data.target}
          eatenLow={data.eatenLow}
          eatenHigh={data.eatenHigh}
          size={220}
        />
      </View>
      <View style={styles.macroRow}>
        <MacroTile
          label={isArabic ? "بروتين" : "Protein"}
          value={data.protein.value}
          target={data.protein.target}
          unit="g"
          tint={colors.gold}
        />
        <MacroTile
          label={isArabic ? "كارب" : "Carbs"}
          value={data.carbs.value}
          target={data.carbs.target}
          unit="g"
          tint={colors.mint}
        />
        <MacroTile
          label={isArabic ? "دهون" : "Fat"}
          value={data.fat.value}
          target={data.fat.target}
          unit="g"
          tint={colors.coral}
        />
      </View>
    </View>
  );
}

function MacroTile({
  label,
  value,
  target,
  unit,
  tint,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  tint: string;
}) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  return (
    <View style={styles.macroTile}>
      <Text style={[styles.macroValue, { color: tint }]}>
        {value}
        <Text style={styles.macroUnit}>{unit}</Text>
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroBarBg}>
        <View
          style={[
            styles.macroBarFill,
            {
              width: `${Math.min(100, pct)}%`,
              backgroundColor: tint,
            },
          ]}
        />
      </View>
      <Text style={styles.macroPct}>{pct}%</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page 1 — Micros + Health Score

function MicrosPage({
  data,
  isArabic,
}: {
  data: MicrosData;
  isArabic: boolean;
}) {
  return (
    <View style={[styles.page, { width: SCREEN_WIDTH }]}>
      <View style={styles.healthCard}>
        <Text style={styles.healthKicker}>
          {isArabic ? "درجة الصحة" : "HEALTH SCORE"}
        </Text>
        <Text style={styles.healthValue}>82</Text>
        <View style={styles.sparkline}>
          {[3, 5, 4, 6, 5, 7, 8].map((h, i) => (
            <View
              key={i}
              style={[
                styles.sparkBar,
                { height: h * 4, opacity: 0.4 + i * 0.08 },
              ]}
            />
          ))}
        </View>
        <Text style={styles.placeholderNote}>
          {isArabic ? "قريباً" : "Coming soon"}
        </Text>
      </View>
      <View style={styles.macroRow}>
        <MacroTile
          label={isArabic ? "ألياف" : "Fiber"}
          value={data.fiber.value}
          target={data.fiber.target}
          unit="g"
          tint={colors.mint}
        />
        <MacroTile
          label={isArabic ? "سكر" : "Sugar"}
          value={data.sugar.value}
          target={data.sugar.target}
          unit="g"
          tint={colors.coral}
        />
        <MacroTile
          label={isArabic ? "صوديوم" : "Sodium"}
          value={data.sodium.value}
          target={data.sodium.target}
          unit="mg"
          tint={colors.gold}
        />
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page 2 — Activity + Water

function ActivityPage({
  data,
  isArabic,
}: {
  data: ActivityData;
  isArabic: boolean;
}) {
  const waterPct =
    data.waterTarget > 0
      ? Math.min(100, Math.round((data.waterMl / data.waterTarget) * 100))
      : 0;
  return (
    <View style={[styles.page, { width: SCREEN_WIDTH }]}>
      <View style={styles.activityRow}>
        <View style={styles.activityTile}>
          <Ionicons name="walk" size={20} color={colors.mint} />
          <Text style={styles.activityValue}>—</Text>
          <Text style={styles.activityLabel}>
            {isArabic ? "خطوات" : "Steps"}
          </Text>
          <Text style={styles.placeholderNote}>
            {isArabic ? "قريباً" : "Coming soon"}
          </Text>
        </View>
        <View style={styles.activityTile}>
          <Ionicons name="flame" size={20} color={colors.coral} />
          <Text style={styles.activityValue}>—</Text>
          <Text style={styles.activityLabel}>
            {isArabic ? "سعرات محروقة" : "Burned"}
          </Text>
          <Text style={styles.placeholderNote}>
            {isArabic ? "قريباً" : "Coming soon"}
          </Text>
        </View>
      </View>
      <View style={styles.waterCard}>
        <View style={styles.waterHead}>
          <Ionicons name="water" size={22} color={colors.mint} />
          <Text style={styles.waterValue}>
            {(data.waterMl / 1000).toFixed(1)}L
            <Text style={styles.waterTarget}>
              {" "}
              / {(data.waterTarget / 1000).toFixed(1)}L
            </Text>
          </Text>
          <Pressable style={styles.waterAddBtn} onPress={data.onAddWater}>
            <Text style={styles.waterAddText}>+250ml</Text>
          </Pressable>
        </View>
        <View style={styles.waterBarBg}>
          <View
            style={[
              styles.waterBarFill,
              { width: `${waterPct}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Meals list

function MealsList({
  totals,
  expandedSlot,
  onToggle,
  isArabic,
}: {
  totals: LedgerDayResponse["totals"] | undefined;
  expandedSlot: string | null;
  onToggle: (slot: string) => void;
  isArabic: boolean;
}) {
  const items = totals?.items ?? [];
  return (
    <View style={styles.mealsWrap}>
      <Text style={styles.mealsHead}>
        {isArabic ? "وجبات اليوم" : "Today's meals"}
      </Text>
      <View style={styles.mealsCard}>
        {SLOTS.map((slot, i) => {
          const meta = SLOT_META[slot];
          const slotItems = items.filter((it) => it.meal_slot === slot);
          const slotKcal = Math.round(
            slotItems.reduce(
              (sum, it) => sum + (it.kcal_low + it.kcal_high) / 2,
              0
            )
          );
          const slotProtein = Math.round(
            slotItems.reduce(
              (sum, it) => sum + (it.protein_g_low + it.protein_g_high) / 2,
              0
            )
          );
          const expanded = expandedSlot === slot;
          return (
            <View key={slot}>
              <Pressable
                style={[
                  styles.mealRow,
                  i < SLOTS.length - 1 && !expanded && styles.mealRowDivider,
                ]}
                onPress={() =>
                  slotItems.length > 0
                    ? onToggle(slot)
                    : router.push({
                        pathname: "/meals-suggest",
                        params: { slot },
                      })
                }
              >
                <View style={[styles.mealIcon, { backgroundColor: meta.tint + "22" }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mealName}>
                    {isArabic ? meta.ar : capitalize(meta.en.toLowerCase())}
                  </Text>
                  <Text style={styles.mealMeta}>
                    {slotItems.length === 0
                      ? isArabic
                        ? "لم يُسجّل بعد"
                        : "Not logged"
                      : `${slotKcal} kcal · P${slotProtein}g · ${slotItems.length} ${
                          isArabic ? "عنصر" : "items"
                        }`}
                  </Text>
                </View>
                <Ionicons
                  name={
                    slotItems.length === 0
                      ? "add"
                      : expanded
                      ? "chevron-up"
                      : "chevron-forward"
                  }
                  size={18}
                  color={colors.dim}
                />
              </Pressable>
              {expanded &&
                slotItems.map((it, idx) => (
                  <View
                    key={it.id}
                    style={[
                      styles.mealItemRow,
                      idx < slotItems.length - 1 && styles.mealRowDivider,
                    ]}
                  >
                    <Text style={styles.mealItemName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.mealItemMeta}>
                      {Math.round((it.kcal_low + it.kcal_high) / 2)} kcal
                    </Text>
                  </View>
                ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers

function midOf(range?: { low: number; high: number } | null): number {
  if (!range) return 0;
  return (range.low + range.high) / 2;
}

function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ────────────────────────────────────────────────────────────────────
// Styles

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerLogo: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 22,
    letterSpacing: 1.5,
  },
  pocPill: {
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pocPillText: {
    color: colors.bg,
    fontFamily: font.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  streakChipText: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 12,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  // Date strip
  dateStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  dateCell: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  dateLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  dateLabelSelected: {
    color: colors.gold,
    fontFamily: font.bodyBold,
  },
  dateCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCircleSelected: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "18",
  },
  dateDay: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 14,
  },
  dateDaySelected: {
    color: colors.gold,
  },
  // Pager
  page: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  ringWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
  },
  dotActive: {
    backgroundColor: colors.gold,
    width: 18,
  },
  // Macros
  macroRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  macroTile: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  macroValue: {
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  macroUnit: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
  },
  macroLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  macroBarBg: {
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
    overflow: "hidden",
  },
  macroBarFill: {
    height: 4,
    borderRadius: 2,
  },
  macroPct: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    textAlign: "right",
  },
  // Health card
  healthCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  healthKicker: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  healthValue: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 48,
  },
  sparkline: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 36,
    marginTop: 4,
  },
  sparkBar: {
    width: 6,
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  placeholderNote: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 4,
  },
  // Activity
  activityRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  activityTile: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  activityValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  activityLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // Water
  waterCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  waterHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  waterValue: {
    flex: 1,
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 20,
  },
  waterTarget: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 13,
  },
  waterAddBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.mint + "22",
    borderWidth: 1,
    borderColor: colors.mint,
  },
  waterAddText: {
    color: colors.mint,
    fontFamily: font.bodyBold,
    fontSize: 12,
  },
  waterBarBg: {
    height: 6,
    backgroundColor: colors.line,
    borderRadius: 3,
    overflow: "hidden",
  },
  waterBarFill: {
    height: 6,
    backgroundColor: colors.mint,
    borderRadius: 3,
  },
  // Meals
  mealsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  mealsHead: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  mealsCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  mealRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  mealIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mealName: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 14,
  },
  mealMeta: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    marginTop: 2,
  },
  mealItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md + 32 + spacing.sm,
  },
  mealItemName: {
    flex: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
  },
  mealItemMeta: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 12,
  },
});
