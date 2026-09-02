import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CalorieRing } from "@/components/CalorieRing";
import { QuickLogFab } from "@/components/QuickLogFab";
import { api } from "@/lib/api";
import {
  clearOptimisticLogItems,
  markDayDirty,
  peekOptimisticLogItems,
} from "@/lib/calendarCache";
import { useRamadan, useRamadanScheduling } from "@/lib/useRamadan";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { useEntitlement } from "@/lib/EntitlementContext";
import { usePushRegistration } from "@/lib/usePushRegistration";
import { rescheduleWeeklyRituals } from "@/lib/weeklyRitualScheduler";
import { useNotificationDeepLinks } from "@/lib/useNotificationDeepLinks";
import { useHealthSync } from "@/lib/useHealthSync";
import { useWidgetToken } from "@/lib/useWidgetToken";
import type { LedgerDayResponse, MealSlot, Profile } from "@/types";
import { SLOTS, SLOT_META } from "@/lib/slot";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Home tab — Cal.ai-inspired swipeable pager (2026-09-03 revamp).
 *
 * Replaced the previous ~18-widget vertical stack with three
 * horizontally-paged metric views (Nutrition / Wellness / Activity).
 * All prior widgets survived — they moved to whichever page they
 * belong to, or to header pills, or to the footer below the meals
 * list. Nothing was removed.
 *
 * Layout:
 *   [ SE7A · pills · streak · avatar ]           header row
 *   [ Ramadan banner (active only) ]
 *   [ 7-day date strip ]
 *   [ day-status chip (lift/rest/planned) ]
 *   [ swipeable pager: Nutrition / Wellness / Activity ]
 *   [ dot indicator ]
 *   [ Today's meals — 4 slots, collapsible ]
 *   [ Report card + Wrapped card ]
 *   [ Streak card ]
 *   FAB (unchanged 7 quick-log actions)
 */

// ── Types (unchanged from prior Home) ──────────────────────────────

interface WaterTodayResponse {
  total_ml: number;
  target_ml: number;
  entries: number;
}

interface DayStatusResponse {
  kind: "lift" | "rest" | "none";
  base_target: number | null;
  delta_applied: number;
  adjusted_target: number | null;
}

interface FastingActiveResponse {
  active: { id: number; started_at: string; target_hours: number } | null;
}

interface StreakResponse {
  current_days: number;
  longest_days: number;
  days_this_week: number;
  todays_status: "logged" | "not_yet";
  freezes_available_this_month: number;
  freezes_monthly_budget: number;
  freezable_days: string[];
}

interface SleepTodayResponse {
  last_night: {
    night_date: string;
    duration_minutes: number;
    sleep_score: number | null;
    hrv_ms: number | null;
    resting_hr_bpm: number | null;
    source: string;
  } | null;
  seven_day: {
    nights_logged: number;
    avg_duration_minutes: number | null;
  };
  recovery: {
    day: string;
    score: number;
    band: "poor" | "compromised" | "primed" | null;
    source: string;
  } | null;
}

interface CardioTodayResponse {
  sessions: {
    id: number;
    kind: string;
    duration_min: number;
    distance_km: number | null;
    kcal_burned: number | null;
  }[];
  totals: {
    duration_min: number;
    distance_km: number;
    kcal_burned: number;
  };
  activity: {
    steps: number;
    active_kcal: number;
  };
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 60;

// ────────────────────────────────────────────────────────────────────
// Component

export default function Home() {
  const { user } = useAuth();
  const { ent } = useEntitlement();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const isPro = ent.is_pro;
  usePushRegistration();
  useNotificationDeepLinks();
  useHealthSync(user?.id);
  useWidgetToken(user?.id);
  const { status: ramadan } = useRamadan();
  useRamadanScheduling(ramadan);

  const [anniversary, setAnniversary] = useState<
    "anniv_30d" | "anniv_60d" | "anniv_90d" | null
  >(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerDayResponse | null>(null);
  const [viewOffset, setViewOffset] = useState(0);
  const [water, setWater] = useState<WaterTodayResponse | null>(null);
  const [dayStatus, setDayStatus] = useState<DayStatusResponse | null>(null);
  const [fasting, setFasting] = useState<FastingActiveResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [cardio, setCardio] = useState<CardioTodayResponse | null>(null);
  const [sleep, setSleep] = useState<SleepTodayResponse | null>(null);
  const [reportMeta, setReportMeta] = useState<{
    week_index: number;
    total_weeks: number;
    checkpoints_met: number[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [streakSheetOpen, setStreakSheetOpen] = useState(false);

  const viewDateIso = useMemo(() => isoOffset(viewOffset), [viewOffset]);
  const isToday = viewOffset === 0;
  const dateStrip = useMemo(() => buildDateStrip(viewOffset), [viewOffset]);

  // ── Weekly ritual scheduler (idempotent) ─────────────────────────
  useEffect(() => {
    rescheduleWeeklyRituals().catch(() => {});
  }, []);

  // ── Anniversary badge check ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api<{
      badges: { key: string; earned_at: string | null; seen: boolean }[];
    }>("/api/badges")
      .then((res) => {
        const unseen = res.badges
          .filter((b) => b.key.startsWith("anniv_") && b.earned_at && !b.seen)
          .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))[0];
        if (unseen) {
          setAnniversary(
            unseen.key as "anniv_30d" | "anniv_60d" | "anniv_90d"
          );
        }
      })
      .catch(() => {});
  }, [user]);

  const dismissAnniversary = useCallback(async () => {
    if (!anniversary) return;
    const key = anniversary;
    setAnniversary(null);
    try {
      await api("/api/badges", {
        method: "POST",
        body: JSON.stringify({ mark_seen: [key] }),
      });
    } catch {
      /* silent */
    }
  }, [anniversary]);

  // ── Data load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const ledgerPath = isToday
      ? `/api/ledger/today?tz_offset_min=${tzOffsetMin}`
      : `/api/ledger/today?date=${viewDateIso}&tz_offset_min=${tzOffsetMin}`;
    const [
      { data: profileData },
      ledgerRes,
      waterRes,
      dayRes,
      fastingRes,
      streakRes,
      cardioRes,
      sleepRes,
      reportRes,
    ] = await Promise.all([
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
      api<DayStatusResponse>("/api/day/status").catch(() => null),
      api<FastingActiveResponse>("/api/fasting/current").catch(() => ({
        active: null,
      })),
      api<StreakResponse>(
        `/api/streaks?tz_offset_min=${tzOffsetMin}`
      ).catch(() => null),
      api<CardioTodayResponse>("/api/cardio/today").catch(() => null),
      api<SleepTodayResponse>("/api/sleep/today").catch(() => null),
      api<{
        report: {
          week_index: number;
          total_weeks: number;
          checkpoints_met?: number[];
        } | null;
      }>("/api/reports/current").catch(() => ({ report: null })),
    ]);
    if (profileData && !profileData.onboarded_at) {
      router.replace("/onboarding");
      return;
    }
    setProfile(profileData as Profile);
    setLedger(ledgerRes);
    setWater(waterRes);
    setDayStatus(dayRes);
    setFasting(fastingRes);
    setStreak(streakRes);
    setCardio(cardioRes);
    setSleep(sleepRes);
    setReportMeta(
      reportRes.report
        ? {
            week_index: reportRes.report.week_index,
            total_weeks: reportRes.report.total_weeks,
            checkpoints_met: reportRes.report.checkpoints_met ?? [],
          }
        : null
    );
    setLoading(false);
  }, [user, isToday, viewDateIso]);

  useFocusEffect(
    useCallback(() => {
      const pending = peekOptimisticLogItems();
      if (pending.length > 0) {
        setLedger((prev) =>
          prev ? mergePendingIntoLedger(prev, pending) : prev
        );
        clearOptimisticLogItems();
      }
      load();
    }, [load])
  );

  const addWater = async (ml: number) => {
    if (!water) return;
    const prev = water;
    setWater({ ...water, total_ml: water.total_ml + ml, entries: water.entries + 1 });
    try {
      await api("/api/water/log", {
        method: "POST",
        body: JSON.stringify({ ml }),
      });
      markDayDirty();
    } catch {
      setWater(prev);
    }
  };

  const applyFreeze = useCallback(async () => {
    if (!streak || streak.freezes_available_this_month <= 0) return;
    const target = streak.freezable_days[0];
    if (!target) return;
    Alert.alert(
      isArabic ? "تجميد اليوم؟" : "Freeze this day?",
      isArabic
        ? `سنستخدم واحدًا من ${streak.freezes_available_this_month} تجميدات لهذا الشهر.`
        : `We'll use one of your ${streak.freezes_available_this_month} freezes this month.`,
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "تجميد" : "Freeze",
          onPress: async () => {
            try {
              await api("/api/streaks/freeze", {
                method: "POST",
                body: JSON.stringify({ day: target }),
              });
              load();
            } catch {
              /* silent */
            }
          },
        },
      ]
    );
  }, [streak, isArabic, load]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived values ───────────────────────────────────────────────
  const kcalTarget =
    dayStatus?.adjusted_target ??
    dayStatus?.base_target ??
    profile?.daily_kcal_target ??
    2200;
  const totals = ledger?.totals;
  const kcalLow = totals?.kcal.low ?? 0;
  const kcalHigh = totals?.kcal.high ?? 0;

  return (
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxl * 3 }}
      >
        <Header
          streakDays={streak?.current_days ?? 0}
          onStreakTap={() => setStreakSheetOpen(true)}
          fastingActive={fasting?.active ?? null}
          isPro={isPro}
          isArabic={isArabic}
        />
        {ramadan?.active ? (
          <RamadanBanner status={ramadan} isArabic={isArabic} />
        ) : null}
        <DateStrip
          days={dateStrip}
          selectedOffset={viewOffset}
          onSelect={setViewOffset}
          isArabic={isArabic}
        />
        {isToday && dayStatus?.kind && dayStatus.kind !== "none" ? (
          <DayStatusChip status={dayStatus} isArabic={isArabic} />
        ) : null}
        {!isToday && ledger?.planned_items && ledger.planned_items.length > 0 ? (
          <PlannedChip isArabic={isArabic} />
        ) : null}

        <MetricPager
          pageIndex={pageIndex}
          onPageChange={setPageIndex}
          nutrition={{
            target: kcalTarget,
            eatenLow: kcalLow,
            eatenHigh: kcalHigh,
            protein: {
              value: Math.round(midOf(totals?.protein_g)),
              target: profile?.daily_protein_g ?? 0,
            },
            carbs: {
              value: Math.round(midOf(totals?.carb_g)),
              target: profile?.daily_carb_g ?? 0,
            },
            fat: {
              value: Math.round(midOf(totals?.fat_g)),
              target: profile?.daily_fat_g ?? 0,
            },
          }}
          wellness={{
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
            sleep: isToday ? sleep : null,
          }}
          activity={{
            steps: isToday ? cardio?.activity.steps ?? null : null,
            burnedKcal: isToday
              ? (cardio?.activity.active_kcal ?? 0) +
                (cardio?.sessions.reduce(
                  (s, x) => s + (x.kcal_burned ?? 0),
                  0
                ) ?? 0)
              : null,
            waterMl: isToday ? water?.total_ml ?? 0 : 0,
            waterTarget: water?.target_ml ?? 2500,
            onAddWater: () => addWater(250),
          }}
          isArabic={isArabic}
        />

        <MealsList
          totals={totals}
          plannedItems={ledger?.planned_items ?? []}
          expanded={expandedSlots}
          onToggle={(slot) =>
            setExpandedSlots((prev) => {
              const next = new Set(prev);
              if (next.has(slot)) next.delete(slot);
              else next.add(slot);
              return next;
            })
          }
          isToday={isToday}
          isArabic={isArabic}
        />

        {isToday ? (
          <View style={styles.footerCards}>
            <ReportCard
              meta={reportMeta}
              isPro={isPro}
              isArabic={isArabic}
              t={t}
            />
            {isWrappedWindow(new Date()) ? (
              <WrappedCard isArabic={isArabic} />
            ) : null}
            {streak ? (
              <StreakCardCompact
                streak={streak}
                onTap={() => setStreakSheetOpen(true)}
                isArabic={isArabic}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {isToday ? (
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
      ) : null}

      <AnniversaryModal
        badge={anniversary}
        streakDays={streak?.current_days ?? 0}
        mealCount={ledger?.totals.items.length ?? 0}
        onDismiss={dismissAnniversary}
        t={t}
        isArabic={isArabic}
      />

      <StreakSheet
        open={streakSheetOpen}
        onClose={() => setStreakSheetOpen(false)}
        streak={streak}
        onFreeze={applyFreeze}
        isArabic={isArabic}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header

function Header({
  streakDays,
  onStreakTap,
  fastingActive,
  isPro,
  isArabic,
}: {
  streakDays: number;
  onStreakTap: () => void;
  fastingActive: { started_at: string; target_hours: number } | null;
  isPro: boolean;
  isArabic: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.headerLogo}>SE7A</Text>
      <View style={styles.headerRight}>
        {fastingActive ? (
          <Pressable
            style={styles.fastingPill}
            onPress={() => router.push("/fasting")}
          >
            <Ionicons name="hourglass" size={12} color={colors.gold} />
            <Text style={styles.fastingPillText}>
              {formatFastElapsed(fastingActive.started_at)}
            </Text>
          </Pressable>
        ) : null}
        {!isPro ? (
          <Pressable
            style={styles.planPill}
            onPress={() => router.push("/paywall")}
          >
            <Text style={styles.planPillText}>
              {isArabic ? "مجاني" : "Free"}
            </Text>
            <Text style={styles.planPillArrow}>→</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.streakChip} onPress={onStreakTap}>
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
// Ramadan banner (live iftar/suhoor countdown)

function RamadanBanner({
  status,
  isArabic,
}: {
  status: NonNullable<ReturnType<typeof useRamadan>["status"]>;
  isArabic: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const t = status.today;
  if (!t) return null;
  // Use whichever countdown is smaller (nearer event).
  const inFast = t.in_fast_window;
  const baseSecs = inFast
    ? (t.seconds_until_maghrib ?? 0)
    : (t.seconds_until_fajr ?? 0);
  const seconds = Math.max(
    0,
    baseSecs - Math.floor((now - Date.now()) / 1000)
  );
  return (
    <View style={styles.ramadanBanner}>
      <Ionicons name="moon" size={14} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={styles.ramadanKicker}>
          {isArabic
            ? `رمضان · يوم ${status.day_num ?? "—"}/${status.total_days ?? "—"}`
            : `RAMADAN · DAY ${status.day_num ?? "—"}/${status.total_days ?? "—"}`}
        </Text>
        <Text style={styles.ramadanBody}>
          {inFast
            ? isArabic
              ? `الإفطار خلال ${formatHms(seconds)}`
              : `Iftar in ${formatHms(seconds)}`
            : isArabic
              ? `الفجر خلال ${formatHms(seconds)}`
              : `Suhoor closes in ${formatHms(seconds)}`}
        </Text>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Date strip (7 days)

interface DateStripDay {
  offset: number;
  labelEn: string;
  day: number;
  isToday: boolean;
}

function buildDateStrip(viewOffset: number): DateStripDay[] {
  const today = new Date();
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days: DateStripDay[] = [];
  for (let i = viewOffset - 3; i <= viewOffset + 3; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      offset: i,
      labelEn: labels[d.getDay()],
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
                d.isToday && !selected && styles.dateLabelToday,
              ]}
            >
              {isArabic ? arLabels[d.labelEn] : d.labelEn}
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
// Day-status chip (Lift day / Rest day)

function DayStatusChip({
  status,
  isArabic,
}: {
  status: DayStatusResponse;
  isArabic: boolean;
}) {
  const label =
    status.kind === "lift"
      ? isArabic
        ? "يوم تمرين"
        : "Lift day"
      : status.kind === "rest"
        ? isArabic
          ? "يوم راحة"
          : "Rest day"
        : "";
  if (!label) return null;
  const deltaLabel =
    status.delta_applied !== 0
      ? ` · ${status.delta_applied > 0 ? "+" : ""}${status.delta_applied} kcal`
      : "";
  return (
    <View style={styles.dayChipRow}>
      <View style={styles.dayChip}>
        <Ionicons
          name={status.kind === "lift" ? "barbell" : "moon"}
          size={12}
          color={colors.dim}
        />
        <Text style={styles.dayChipText}>
          {label}
          {deltaLabel}
        </Text>
      </View>
    </View>
  );
}

function PlannedChip({ isArabic }: { isArabic: boolean }) {
  return (
    <View style={styles.dayChipRow}>
      <Pressable
        style={styles.dayChip}
        onPress={() => router.push("/meal-plan")}
      >
        <Ionicons name="calendar" size={12} color={colors.gold} />
        <Text style={[styles.dayChipText, { color: colors.gold }]}>
          {isArabic ? "معاينة الخطة" : "Plan preview"}
        </Text>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Metric pager

interface NutritionData {
  target: number;
  eatenLow: number;
  eatenHigh: number;
  protein: { value: number; target: number };
  carbs: { value: number; target: number };
  fat: { value: number; target: number };
}

interface WellnessData {
  fiber: { value: number; target: number };
  sugar: { value: number; target: number };
  sodium: { value: number; target: number };
  sleep: SleepTodayResponse | null;
}

interface ActivityData {
  steps: number | null;
  burnedKcal: number | null;
  waterMl: number;
  waterTarget: number;
  onAddWater: () => void;
}

function MetricPager({
  pageIndex,
  onPageChange,
  nutrition,
  wellness,
  activity,
  isArabic,
}: {
  pageIndex: number;
  onPageChange: (idx: number) => void;
  nutrition: NutritionData;
  wellness: WellnessData;
  activity: ActivityData;
  isArabic: boolean;
}) {
  const listRef = useRef<FlatList>(null);
  const pages = ["nutrition", "wellness", "activity"] as const;
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
          if (item === "wellness")
            return <WellnessPage data={wellness} isArabic={isArabic} />;
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
      <View style={styles.tileRow}>
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
            { width: `${Math.min(100, pct)}%`, backgroundColor: tint },
          ]}
        />
      </View>
      <Text style={styles.macroPct}>{pct}%</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page 1 — Wellness (micros + sleep summary)

function WellnessPage({
  data,
  isArabic,
}: {
  data: WellnessData;
  isArabic: boolean;
}) {
  const sleep = data.sleep?.last_night;
  const recovery = data.sleep?.recovery;
  return (
    <View style={[styles.page, { width: SCREEN_WIDTH }]}>
      <View style={styles.tileRow}>
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
      {sleep || recovery ? (
        <View style={styles.wellnessCard}>
          <Text style={styles.wellnessKicker}>
            {isArabic ? "النوم والتعافي" : "SLEEP · RECOVERY"}
          </Text>
          <View style={styles.wellnessRow}>
            {sleep ? (
              <View style={styles.wellnessStat}>
                <Ionicons name="moon" size={16} color={colors.mint} />
                <Text style={styles.wellnessValue}>
                  {formatHm(sleep.duration_minutes)}
                </Text>
                <Text style={styles.wellnessLabel}>
                  {isArabic ? "الليلة الماضية" : "Last night"}
                </Text>
              </View>
            ) : null}
            {recovery ? (
              <View style={styles.wellnessStat}>
                <Ionicons name="heart" size={16} color={colors.coral} />
                <Text style={styles.wellnessValue}>{recovery.score}</Text>
                <Text style={styles.wellnessLabel}>
                  {isArabic ? "التعافي" : "Recovery"}
                </Text>
              </View>
            ) : null}
            {data.sleep?.seven_day.avg_duration_minutes != null ? (
              <View style={styles.wellnessStat}>
                <Ionicons name="trending-up" size={16} color={colors.gold} />
                <Text style={styles.wellnessValue}>
                  {formatHm(data.sleep.seven_day.avg_duration_minutes)}
                </Text>
                <Text style={styles.wellnessLabel}>
                  {isArabic ? "متوسط ٧ أيام" : "7-day avg"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.wellnessCard}>
          <Text style={styles.wellnessKicker}>
            {isArabic ? "النوم" : "SLEEP"}
          </Text>
          <Text style={styles.placeholderNote}>
            {isArabic
              ? "قم بتوصيل الصحة لرؤية النوم والتعافي هنا."
              : "Connect Health to see sleep + recovery here."}
          </Text>
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page 2 — Activity (steps / burned / water)

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
      <View style={styles.tileRow}>
        <View style={styles.activityTile}>
          <Ionicons name="walk" size={20} color={colors.mint} />
          <Text style={styles.activityValue}>
            {data.steps != null ? data.steps.toLocaleString() : "—"}
          </Text>
          <Text style={styles.activityLabel}>
            {isArabic ? "خطوات" : "Steps"}
          </Text>
        </View>
        <View style={styles.activityTile}>
          <Ionicons name="flame" size={20} color={colors.coral} />
          <Text style={styles.activityValue}>
            {data.burnedKcal != null ? Math.round(data.burnedKcal) : "—"}
          </Text>
          <Text style={styles.activityLabel}>
            {isArabic ? "محروقة" : "Burned"}
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
          <View style={[styles.waterBarFill, { width: `${waterPct}%` }]} />
        </View>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Meals list

function MealsList({
  totals,
  plannedItems,
  expanded,
  onToggle,
  isToday,
  isArabic,
}: {
  totals: LedgerDayResponse["totals"] | undefined;
  plannedItems: NonNullable<LedgerDayResponse["planned_items"]>;
  expanded: Set<string>;
  onToggle: (slot: string) => void;
  isToday: boolean;
  isArabic: boolean;
}) {
  const items = totals?.items ?? [];
  const usePlanned = !isToday && plannedItems.length > 0;
  return (
    <View style={styles.mealsWrap}>
      <View style={styles.mealsHeadRow}>
        <Text style={styles.mealsHead}>
          {usePlanned
            ? isArabic
              ? "الوجبات المخططة"
              : "Planned meals"
            : isArabic
              ? "وجبات اليوم"
              : "Today's meals"}
        </Text>
      </View>
      <View style={styles.mealsCard}>
        {SLOTS.map((slot, i) => {
          const meta = SLOT_META[slot];
          const slotItems = items.filter((it) => it.meal_slot === slot);
          const slotPlanned = usePlanned
            ? plannedItems.filter((p) => p.slot === slot)
            : [];
          const displayCount = usePlanned ? slotPlanned.length : slotItems.length;
          const displayKcal = usePlanned
            ? Math.round(
                slotPlanned.reduce(
                  (s, p) => s + (p.kcal_low + p.kcal_high) / 2,
                  0
                )
              )
            : Math.round(
                slotItems.reduce(
                  (s, it) => s + (it.kcal_low + it.kcal_high) / 2,
                  0
                )
              );
          const displayProtein = usePlanned
            ? Math.round(
                slotPlanned.reduce(
                  (s, p) => s + (p.protein_g_low + p.protein_g_high) / 2,
                  0
                )
              )
            : Math.round(
                slotItems.reduce(
                  (s, it) => s + (it.protein_g_low + it.protein_g_high) / 2,
                  0
                )
              );
          const isExpanded = expanded.has(slot);
          const emptyPress = () => {
            if (usePlanned) {
              router.push("/meal-plan");
            } else if (isToday) {
              router.push({ pathname: "/meals-suggest", params: { slot } });
            }
          };
          return (
            <View key={slot}>
              <Pressable
                style={[
                  styles.mealRow,
                  i < SLOTS.length - 1 && !isExpanded && styles.mealRowDivider,
                ]}
                onPress={() =>
                  displayCount > 0 ? onToggle(slot) : emptyPress()
                }
              >
                <View
                  style={[
                    styles.mealIcon,
                    { backgroundColor: meta.tint + "22" },
                  ]}
                >
                  <Ionicons name={meta.icon} size={16} color={meta.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mealName}>
                    {isArabic
                      ? meta.ar
                      : capitalize(meta.en.toLowerCase())}
                  </Text>
                  <Text style={styles.mealMeta}>
                    {displayCount === 0
                      ? isToday
                        ? isArabic
                          ? "لم يُسجّل بعد"
                          : "Not logged"
                        : isArabic
                          ? "لا شيء"
                          : "Nothing"
                      : `${displayKcal} kcal · P${displayProtein}g · ${displayCount}`}
                  </Text>
                </View>
                <Ionicons
                  name={
                    displayCount === 0
                      ? "add"
                      : isExpanded
                        ? "chevron-up"
                        : "chevron-forward"
                  }
                  size={18}
                  color={colors.dim}
                />
              </Pressable>
              {isExpanded && !usePlanned
                ? slotItems.map((it, idx) => (
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
                  ))
                : null}
              {isExpanded && usePlanned
                ? slotPlanned.map((p, idx) => (
                    <View
                      key={`p-${slot}-${idx}`}
                      style={[
                        styles.mealItemRow,
                        idx < slotPlanned.length - 1 && styles.mealRowDivider,
                      ]}
                    >
                      <Text style={styles.mealItemName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.mealItemMeta}>
                        {Math.round((p.kcal_low + p.kcal_high) / 2)} kcal
                      </Text>
                    </View>
                  ))
                : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Report card + Wrapped card + Streak card (compact footer versions)

function ReportCard({
  meta,
  isPro,
  isArabic,
  t,
}: {
  meta: { week_index: number; total_weeks: number } | null;
  isPro: boolean;
  isArabic: boolean;
  t: (key: string) => string;
}) {
  return (
    <Pressable
      style={styles.footerCard}
      onPress={() => router.push("/report")}
    >
      <View style={[styles.footerRule, { backgroundColor: colors.gold }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.footerKicker}>
          {meta
            ? isArabic
              ? `أسبوع ${meta.week_index} من ${meta.total_weeks}`
              : `WEEK ${meta.week_index} OF ${meta.total_weeks}`
            : isArabic
              ? "خطة الـ٩٠ يومًا"
              : "90-DAY PLAN"}
        </Text>
        <Text style={styles.footerTitle}>
          {meta
            ? isArabic
              ? "افتح خطتك"
              : "Open your plan"
            : isPro
              ? isArabic
                ? "افتح خطتك"
                : "Unlock your plan"
              : isArabic
                ? "احصل على خطتك"
                : "Get your plan"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.dim} />
    </Pressable>
  );
}

function WrappedCard({ isArabic }: { isArabic: boolean }) {
  return (
    <Pressable
      style={styles.footerCard}
      onPress={() => router.push("/weekly-wrapped")}
    >
      <View style={[styles.footerRule, { backgroundColor: colors.mint }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.footerKicker, { color: colors.mint }]}>
          {isArabic ? "الملخص الأسبوعي" : "WEEKLY WRAPPED"}
        </Text>
        <Text style={styles.footerTitle}>
          {isArabic ? "ماذا حدث الأسبوع الماضي" : "Last week at a glance"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.dim} />
    </Pressable>
  );
}

function StreakCardCompact({
  streak,
  onTap,
  isArabic,
}: {
  streak: StreakResponse;
  onTap: () => void;
  isArabic: boolean;
}) {
  return (
    <Pressable style={styles.footerCard} onPress={onTap}>
      <View style={[styles.footerRule, { backgroundColor: colors.coral }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.footerKicker, { color: colors.coral }]}>
          {isArabic ? "السلسلة" : "STREAK"}
        </Text>
        <Text style={styles.footerTitle}>
          {isArabic
            ? `${streak.current_days} ${streak.current_days === 1 ? "يوم" : "أيام"}`
            : `${streak.current_days} ${streak.current_days === 1 ? "day" : "days"}`}
          {streak.days_this_week > 0
            ? ` · ${streak.days_this_week}/7 ${isArabic ? "هذا الأسبوع" : "this week"}`
            : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.dim} />
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Streak sheet (bottom modal)

function StreakSheet({
  open,
  onClose,
  streak,
  onFreeze,
  isArabic,
}: {
  open: boolean;
  onClose: () => void;
  streak: StreakResponse | null;
  onFreeze: () => void;
  isArabic: boolean;
}) {
  if (!streak) return null;
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable style={styles.sheetCard} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetKicker}>
            {isArabic ? "سلسلتك" : "YOUR STREAK"}
          </Text>
          <Text style={styles.sheetBig}>{streak.current_days}</Text>
          <Text style={styles.sheetUnit}>
            {isArabic ? "أيام متتالية" : "consecutive days"}
          </Text>
          <View style={styles.sheetStatsRow}>
            <View style={styles.sheetStat}>
              <Text style={styles.sheetStatValue}>
                {streak.days_this_week}/7
              </Text>
              <Text style={styles.sheetStatLabel}>
                {isArabic ? "هذا الأسبوع" : "This week"}
              </Text>
            </View>
            <View style={styles.sheetStat}>
              <Text style={styles.sheetStatValue}>{streak.longest_days}</Text>
              <Text style={styles.sheetStatLabel}>
                {isArabic ? "الأفضل" : "Best"}
              </Text>
            </View>
            <View style={styles.sheetStat}>
              <Text style={styles.sheetStatValue}>
                {streak.freezes_available_this_month}/{streak.freezes_monthly_budget}
              </Text>
              <Text style={styles.sheetStatLabel}>
                {isArabic ? "تجميدات" : "Freezes"}
              </Text>
            </View>
          </View>
          {streak.freezes_available_this_month > 0 &&
          streak.freezable_days.length > 0 ? (
            <Pressable style={styles.sheetFreezeBtn} onPress={onFreeze}>
              <Ionicons name="snow" size={16} color={colors.bg} />
              <Text style={styles.sheetFreezeText}>
                {isArabic
                  ? `تجميد ${streak.freezable_days[0]}`
                  : `Freeze ${streak.freezable_days[0]}`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
            <Text style={styles.sheetCloseText}>
              {isArabic ? "إغلاق" : "Close"}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────
// Anniversary modal

function AnniversaryModal({
  badge,
  streakDays,
  mealCount,
  onDismiss,
  t,
  isArabic,
}: {
  badge: "anniv_30d" | "anniv_60d" | "anniv_90d" | null;
  streakDays: number;
  mealCount: number;
  onDismiss: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
  isArabic: boolean;
}) {
  if (!badge) return null;
  const days = badge === "anniv_30d" ? 30 : badge === "anniv_60d" ? 60 : 90;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.annivBg}>
        <View style={styles.annivCard}>
          <Text style={styles.annivKicker}>
            {isArabic ? "إنجاز" : "MILESTONE"}
          </Text>
          <Text style={styles.annivBig}>{days}</Text>
          <Text style={styles.annivUnit}>
            {isArabic ? "أيام مع SE7A" : "DAYS WITH SE7A"}
          </Text>
          <View style={styles.annivRule} />
          <View style={styles.annivStatsRow}>
            <View style={styles.annivStat}>
              <Text style={styles.annivStatValue}>{streakDays}</Text>
              <Text style={styles.annivStatLabel}>
                {isArabic ? "سلسلة" : "STREAK"}
              </Text>
            </View>
            <View style={styles.annivStat}>
              <Text style={styles.annivStatValue}>{mealCount}</Text>
              <Text style={styles.annivStatLabel}>
                {isArabic ? "وجبات اليوم" : "TODAY MEALS"}
              </Text>
            </View>
          </View>
          <Pressable style={styles.annivCta} onPress={onDismiss}>
            <Text style={styles.annivCtaText}>
              {isArabic ? "متابعة" : "Continue"}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() =>
              Share.share({
                message: isArabic
                  ? `${days} يومًا مع SE7A 🔥`
                  : `${days} days with SE7A 🔥`,
              })
            }
          >
            <Text style={styles.annivShareText}>
              {isArabic ? "شارك" : "Share"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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

function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function formatHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.max(0, seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatFastElapsed(startedAt: string): string {
  const now = Date.now();
  const start = new Date(startedAt).getTime();
  const min = Math.max(0, Math.floor((now - start) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function isWrappedWindow(d: Date): boolean {
  const dow = d.getDay(); // 0=Sun ... 6=Sat
  return dow >= 1 && dow <= 3; // Mon-Wed
}

/**
 * Splice optimistic just-logged items into an existing LedgerDayResponse
 * so the ring can update within a frame of the log screen navigating
 * back. Recomputes totals by summing every field the pager reads. The
 * fresh server ledger arrives via setLedger(ledgerRes) shortly after.
 */
function mergePendingIntoLedger(
  prev: LedgerDayResponse,
  pending: ReturnType<typeof peekOptimisticLogItems>
): LedgerDayResponse {
  if (pending.length === 0) return prev;
  const nowIso = new Date().toISOString();
  let nextId = -1;
  const injected = pending.map((p) => ({
    id: nextId--,
    name: p.name ?? "logged item",
    portion_estimate: null,
    source: "optimistic",
    confidence: null as null,
    eaten_at: nowIso,
    meal_slot: (p.meal_slot ?? null) as MealSlot | null,
    scan_id: null as string | null,
    photo_url: null as string | null,
    kcal_low: p.kcal_low,
    kcal_high: p.kcal_high,
    protein_g_low: p.protein_g_low,
    protein_g_high: p.protein_g_high,
    carb_g_low: p.carb_g_low,
    carb_g_high: p.carb_g_high,
    fat_g_low: p.fat_g_low,
    fat_g_high: p.fat_g_high,
    sodium_mg_low: p.sodium_mg_low ?? null,
    sodium_mg_high: p.sodium_mg_high ?? null,
    fiber_g_low: p.fiber_g_low ?? null,
    fiber_g_high: p.fiber_g_high ?? null,
    sugar_g_low: p.sugar_g_low ?? null,
    sugar_g_high: p.sugar_g_high ?? null,
    saturated_fat_g_low: p.saturated_fat_g_low ?? null,
    saturated_fat_g_high: p.saturated_fat_g_high ?? null,
  }));
  const items = [...prev.totals.items, ...injected];
  const sum = (
    getter: (
      it: (typeof items)[number]
    ) => { low: number; high: number } | null
  ) => {
    let low = 0;
    let high = 0;
    for (const it of items) {
      const r = getter(it);
      if (r) {
        low += r.low;
        high += r.high;
      }
    }
    return { low, high };
  };
  return {
    ...prev,
    totals: {
      items,
      kcal: sum((it) => ({ low: it.kcal_low, high: it.kcal_high })),
      protein_g: sum((it) => ({ low: it.protein_g_low, high: it.protein_g_high })),
      carb_g: sum((it) => ({ low: it.carb_g_low, high: it.carb_g_high })),
      fat_g: sum((it) => ({ low: it.fat_g_low, high: it.fat_g_high })),
      sodium_mg: sum((it) =>
        it.sodium_mg_low != null && it.sodium_mg_high != null
          ? { low: it.sodium_mg_low, high: it.sodium_mg_high }
          : null
      ),
      fiber_g: sum((it) =>
        it.fiber_g_low != null && it.fiber_g_high != null
          ? { low: it.fiber_g_low, high: it.fiber_g_high }
          : null
      ),
      sugar_g: sum((it) =>
        it.sugar_g_low != null && it.sugar_g_high != null
          ? { low: it.sugar_g_low, high: it.sugar_g_high }
          : null
      ),
      saturated_fat_g: sum((it) =>
        it.saturated_fat_g_low != null && it.saturated_fat_g_high != null
          ? { low: it.saturated_fat_g_low, high: it.saturated_fat_g_high }
          : null
      ),
    },
  };
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
  headerLogo: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 22,
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  fastingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold,
  },
  fastingPillText: {
    color: colors.gold,
    fontFamily: font.bodyBold,
    fontSize: 11,
  },
  planPill: {
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
  planPillText: {
    color: colors.dim,
    fontFamily: font.bodyBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  planPillArrow: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
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
  // Ramadan banner
  ramadanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gold + "12",
    borderWidth: 1,
    borderColor: colors.gold + "44",
  },
  ramadanKicker: {
    color: colors.gold,
    fontFamily: font.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  ramadanBody: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
    marginTop: 2,
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
  dateLabelToday: {
    color: colors.ink,
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
  // Day status chip
  dayChipRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: spacing.sm,
  },
  dayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayChipText: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.5,
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
  // Tile row
  tileRow: {
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
  // Wellness
  wellnessCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  wellnessKicker: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  wellnessRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  wellnessStat: {
    flex: 1,
    alignItems: "flex-start",
    gap: 4,
  },
  wellnessValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 18,
  },
  wellnessLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  placeholderNote: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
  },
  // Activity
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
  mealsHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  mealsHead: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 16,
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
  // Footer cards
  footerCards: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    overflow: "hidden",
  },
  footerRule: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    marginRight: spacing.xs,
  },
  footerKicker: {
    color: colors.gold,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  footerTitle: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 14,
    marginTop: 2,
  },
  // Streak sheet
  sheetBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  sheetKicker: {
    color: colors.gold,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  sheetBig: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 64,
    lineHeight: 68,
  },
  sheetUnit: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  sheetStatsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetStat: {
    alignItems: "center",
    gap: 4,
  },
  sheetStatValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 18,
  },
  sheetStatLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sheetFreezeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  sheetFreezeText: {
    color: colors.bg,
    fontFamily: font.bodyBold,
    fontSize: 13,
  },
  sheetCloseBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sheetCloseText: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 13,
  },
  // Anniversary modal
  annivBg: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  annivCard: {
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 320,
  },
  annivKicker: {
    color: colors.gold,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  annivBig: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 96,
    lineHeight: 100,
  },
  annivUnit: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  annivRule: {
    width: 40,
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.md,
  },
  annivStatsRow: {
    flexDirection: "row",
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  annivStat: {
    alignItems: "center",
    gap: 4,
  },
  annivStatValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  annivStatLabel: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  annivCta: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    marginBottom: spacing.sm,
  },
  annivCtaText: {
    color: colors.bg,
    fontFamily: font.bodyBold,
    fontSize: 14,
  },
  annivShareText: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textDecorationLine: "underline",
  },
});
