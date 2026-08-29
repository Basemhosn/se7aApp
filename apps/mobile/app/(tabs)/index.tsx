import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { WaterRing } from "@/components/WaterRing";
import { CalorieRing } from "@/components/CalorieRing";
import { useEntitlement } from "@/lib/EntitlementContext";
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
import { usePushRegistration } from "@/lib/usePushRegistration";
import { rescheduleWeeklyRituals } from "@/lib/weeklyRitualScheduler";
import { useNotificationDeepLinks } from "@/lib/useNotificationDeepLinks";
import { useHealthSync } from "@/lib/useHealthSync";
import { useWidgetToken } from "@/lib/useWidgetToken";
import type { LedgerDayResponse, Profile } from "@/types";
import type { Program, Session } from "@/lib/programs";
import { SLOTS, SLOT_META } from "@/lib/slot";
import { colors, font, radius, spacing } from "@/lib/theme";

interface CurrentWorkoutResponse {
  active: boolean;
  program?: Program;
  next_session?: Session;
  next_session_index?: number;
  completed_this_week?: number;
}

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
  freezable_days: string[]; // YYYY-MM-DD, most recent first
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

export default function Home() {
  const { user } = useAuth();
  const { ent } = useEntitlement();
  const { t } = useTranslation();
  usePushRegistration();
  useNotificationDeepLinks();
  useHealthSync(user?.id);
  useWidgetToken(user?.id);
  const { status: ramadan } = useRamadan();
  useRamadanScheduling(ramadan);

  // Register the two weekly ritual notifications (Sun 6pm Wrapped,
  // Mon 9am Summary) once per session. Idempotent — the scheduler
  // clears any prior weekly_ritual entries before writing new ones,
  // so a re-mount won't accumulate duplicates. No dependency on
  // plan/entitlement state — both notifications deep-link to
  // in-app screens that handle their own empty states.
  useEffect(() => {
    rescheduleWeeklyRituals().catch(() => {});
  }, []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerDayResponse | null>(null);
  // Offset in days from today. 0 = today, -1 = yesterday, +1 = tomorrow.
  // Chip taps shift this; ledger refetches for the new day. All the
  // "always today" widgets (streak, cardio, sleep, FAB) stay put and
  // only render when viewOffset === 0.
  const [viewOffset, setViewOffset] = useState(0);
  const [workout, setWorkout] = useState<CurrentWorkoutResponse | null>(null);
  const [water, setWater] = useState<WaterTodayResponse | null>(null);
  const [dayStatus, setDayStatus] = useState<DayStatusResponse | null>(null);
  const [fasting, setFasting] = useState<FastingActiveResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [cardio, setCardio] = useState<CardioTodayResponse | null>(null);
  const [sleep, setSleep] = useState<SleepTodayResponse | null>(null);
  const [reportMeta, setReportMeta] = useState<{
    week_index: number;
    total_weeks: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const viewDateIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + viewOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [viewOffset]);
  const isToday = viewOffset === 0;

  // Horizontal swipe to change day, with follow-finger drag + spring
  // snap so it feels responsive instead of "click on release." The
  // translateX animated value tracks the finger during move and
  // animates to commit (± screen width, then reset from opposite side)
  // or snaps back on release below threshold. useNativeDriver = true
  // so the animation runs on the UI thread even mid-fetch.
  //
  // PanResponder still only claims clearly-horizontal drags so the
  // vertical ScrollView keeps working; isAnimating ref prevents a
  // second swipe from starting while an animation is in flight.
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipeAnimating = useRef(false);
  const SCREEN_WIDTH = useMemo(() => Dimensions.get("window").width, []);
  const SWIPE_COMMIT_PX = 60;

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          !isSwipeAnimating.current &&
          Math.abs(g.dx) > 8 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderMove: (_e, g) => {
          translateX.setValue(
            Math.max(-SCREEN_WIDTH, Math.min(SCREEN_WIDTH, g.dx))
          );
        },
        onPanResponderRelease: (_e, g) => {
          const direction: -1 | 0 | 1 =
            g.dx <= -SWIPE_COMMIT_PX ? 1 : g.dx >= SWIPE_COMMIT_PX ? -1 : 0;
          if (direction === 0) {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 20,
              bounciness: 6,
            }).start();
            return;
          }
          isSwipeAnimating.current = true;
          Animated.timing(translateX, {
            toValue: -direction * SCREEN_WIDTH,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished) {
              isSwipeAnimating.current = false;
              return;
            }
            setViewOffset((v) => v + direction);
            translateX.setValue(direction * SCREEN_WIDTH);
            Animated.timing(translateX, {
              toValue: 0,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start(() => {
              isSwipeAnimating.current = false;
            });
          });
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 6,
          }).start();
        },
      }),
    [SCREEN_WIDTH, translateX]
  );

  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
    const ledgerPath = isToday
      ? `/api/ledger/today?tz_offset_min=${tzOffsetMin}`
      : `/api/ledger/today?date=${viewDateIso}&tz_offset_min=${tzOffsetMin}`;
    const [
      { data: profileData },
      ledgerRes,
      workoutRes,
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
      api<CurrentWorkoutResponse>("/api/workouts/current").catch(() => ({
        active: false,
      })),
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
        } | null;
      }>("/api/reports/current").catch(() => ({ report: null })),
    ]);
    if (profileData && !profileData.onboarded_at) {
      router.replace("/onboarding");
      return;
    }
    setProfile(profileData as Profile);
    setLedger(ledgerRes);
    setWorkout(workoutRes);
    setWater(waterRes);
    setDayStatus(dayRes);
    setFasting(fastingRes);
    setStreak(streakRes);
    setCardio(cardioRes);
    setSleep(sleepRes);
    setReportMeta(reportRes.report);
    setLoading(false);
  }, [user, isToday, viewDateIso]);

  const addWater = async (ml: number) => {
    if (!water) return;
    setWater({ ...water, total_ml: water.total_ml + ml, entries: water.entries + 1 });
    try {
      await api("/api/water/log", {
        method: "POST",
        body: JSON.stringify({ ml }),
      });
      markDayDirty();
    } catch {
      setWater(water);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Optimistic pre-merge: if a log flow just finished and pushed
      // items, splice them into ledger.totals RIGHT NOW so the ring
      // reflects the new totals within a frame — before the network
      // fetch has a chance to complete. Load() still runs in parallel
      // and replaces this with authoritative server data.
      const pending = peekOptimisticLogItems();
      if (pending.length > 0) {
        setLedger((prev) => (prev ? mergePendingIntoLedger(prev, pending) : prev));
      }
      load()
        .then(() => clearOptimisticLogItems())
        .catch(() => {
          clearOptimisticLogItems();
          setLoading(false);
        });
    }, [load])
  );

  if (loading || !profile || !ledger) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const displayName = profile.display_name || user?.email?.split("@")[0] || "";
  const nowDate = new Date();
  const viewedDate = new Date();
  viewedDate.setDate(viewedDate.getDate() + viewOffset);
  const viewedLabel =
    viewOffset === 0
      ? t("home.day_picker.today")
      : viewOffset === -1
        ? t("home.day_picker.yesterday")
        : viewOffset === 1
          ? t("home.day_picker.tomorrow")
          : viewedDate.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });

  // Future-day view: use planned_items from the meal plan (if any)
  // as the display source for the ring + slot grid. Today + past use
  // real meal_items via ledger.totals as before.
  const plannedItems = ledger.planned_items ?? [];
  const hasFuturePlan = viewOffset > 0 && plannedItems.length > 0;
  const displayKcal = hasFuturePlan
    ? plannedItems.reduce(
        (acc, p) => ({
          low: acc.low + Number(p.kcal_low ?? 0),
          high: acc.high + Number(p.kcal_high ?? 0),
        }),
        { low: 0, high: 0 }
      )
    : ledger.totals.kcal;
  const displayItemCount = hasFuturePlan
    ? plannedItems.length
    : ledger.totals.items.length;
  // Shim planned_items into meal-item-like shape so MealSlotGrid can
  // render them unchanged. Only the fields it reads matter.
  const plannedAsItems = plannedItems.map((p, i) => ({
    id: -1 - i, // negative ids so React keys don't collide with real items
    name: p.name,
    portion_estimate: p.portion,
    source: "planned",
    confidence: null,
    eaten_at: new Date().toISOString(),
    meal_slot: p.slot,
    kcal_low: p.kcal_low,
    kcal_high: p.kcal_high,
    protein_g_low: p.protein_g_low,
    protein_g_high: p.protein_g_high,
    carb_g_low: p.carb_g_low,
    carb_g_high: p.carb_g_high,
    fat_g_low: p.fat_g_low,
    fat_g_high: p.fat_g_high,
  }));

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={8}
          style={styles.avatar}
        >
          <Text style={styles.avatarInitial}>
            {(displayName[0] ?? "S").toUpperCase()}
          </Text>
        </Pressable>
        <View style={styles.headTitleCol}>
          <Text style={styles.headGreet} numberOfLines={1}>
            {greeting(nowDate) + (displayName ? `, ${displayName}` : "")}
          </Text>
          <Text style={styles.headDate}>
            {nowDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/settings")} hitSlop={12}>
          <Ionicons name="settings-outline" size={22} color={colors.dim} />
        </Pressable>
      </View>

      {/* Swipe-to-shift-day zone wraps all day-scoped content — ring,
          macros, micros, slot grid, streak, cardio, sleep, wrapped,
          fasting, workout, quick log — so the gesture is discoverable
          from anywhere on the page. Animated.View follows the finger
          on drag (translateX) then springs into commit or snap-back
          on release. Vertical scroll still works because PanResponder
          only claims clearly-horizontal drags (|dx| > 1.2·|dy|). */}
      <Animated.View
        {...swipeResponder.panHandlers}
        style={{ transform: [{ translateX }], gap: spacing.lg }}
      >
        <View style={styles.dayPickerRow}>
          <Pressable
            onPress={() => setViewOffset((v) => v - 1)}
            style={styles.dayChip}
            hitSlop={6}
          >
            <Ionicons name="chevron-back" size={14} color={colors.dim} />
            <Text style={styles.dayChipText}>{t("home.day_picker.prev")}</Text>
          </Pressable>
          <Pressable
            onPress={() => viewOffset !== 0 && setViewOffset(0)}
            style={[styles.dayChip, styles.dayChipOn]}
            hitSlop={6}
          >
            <Text style={[styles.dayChipText, styles.dayChipTextOn]}>
              {viewedLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewOffset((v) => v + 1)}
            style={styles.dayChip}
            hitSlop={6}
          >
            <Text style={styles.dayChipText}>{t("home.day_picker.next")}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.dim} />
          </Pressable>
        </View>

      {isToday && ramadan?.active && ramadan.today && (
        <RamadanBanner status={ramadan} />
      )}

      <Text style={styles.dayLabel}>
        {isToday
          ? dayStatus?.kind === "lift"
            ? t("home.lift_day_remaining")
            : dayStatus?.kind === "rest" && dayStatus.delta_applied !== 0
              ? t("home.rest_day_remaining")
              : t("home.remaining_today")
          : viewOffset < 0
            ? t("home.day_label.what_you_logged")
            : hasFuturePlan
              ? t("home.day_label.planned_for_day")
              : t("home.day_label.nothing_planned")}
      </Text>

      {isToday && (
        <View style={styles.planBadgeRow}>
          {ent.is_pro ? (
            <View style={[styles.planBadge, styles.planBadgePro]}>
              <Ionicons name="sparkles" size={11} color={colors.gold} />
              <Text style={styles.planBadgeProText}>
                {t("home.plan_badge.pro")}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={[styles.planBadge, styles.planBadgeFree]}
              hitSlop={8}
            >
              <Text style={styles.planBadgeFreeText}>
                {t("home.plan_badge.free")}
              </Text>
              <Text style={styles.planBadgeUpgradeText}>
                {t("home.plan_badge.upgrade_cta")}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={colors.gold}
              />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.ringRow}>
        <CalorieRing
          target={dayStatus?.adjusted_target ?? profile.daily_kcal_target ?? 2000}
          eatenLow={Math.round(displayKcal.low)}
          eatenHigh={Math.round(displayKcal.high)}
          size={220}
          planned={hasFuturePlan}
        />
        <View style={styles.ringSide}>
          <SideStat
            label={t("home.ring.target")}
            value={String(
              dayStatus?.adjusted_target ?? profile.daily_kcal_target
            )}
            unit={t("common.kcal")}
            tint={colors.dim}
          />
          <SideStat
            label={hasFuturePlan ? t("home.ring.planned") : t("home.ring.eaten")}
            value={
              displayItemCount === 0
                ? "—"
                : `${Math.round(displayKcal.low)}–${Math.round(displayKcal.high)}`
            }
            unit={t("common.kcal")}
            tint={colors.gold}
          />
          <SideStat
            label={t("home.ring.items")}
            value={String(displayItemCount)}
            unit={
              hasFuturePlan
                ? t("home.ring.planned_unit")
                : t("home.ring.logged")
            }
            tint={colors.dim}
          />
        </View>
      </View>

      <View style={styles.macros}>
        <Macro label={t("home.protein")} value={profile.daily_protein_g} unit={t("common.g")} />
        <Macro label={t("home.carbs")} value={profile.daily_carb_g} unit={t("common.g")} />
        <Macro label={t("home.fat")} value={profile.daily_fat_g} unit={t("common.g")} />
      </View>

      <MicrosRow profile={profile} totals={ledger.totals} t={t} />

      <MealSlotGrid
        items={hasFuturePlan ? plannedAsItems : ledger.totals.items}
        planned={hasFuturePlan}
        t={t}
      />

      {isToday && <ReportCard meta={reportMeta} isPro={ent.is_pro} t={t} />}

      {isToday &&
        streak &&
        (streak.current_days > 0 ||
          streak.days_this_week > 0 ||
          (streak.freezable_days.length > 0 &&
            streak.freezes_available_this_month > 0)) && (
          <StreakCard
            streak={streak}
            t={t}
            onFrozen={() => {
              load().catch(() => {});
            }}
          />
        )}

      {isToday &&
        cardio &&
        (cardio.activity.steps > 0 ||
          cardio.activity.active_kcal > 0 ||
          cardio.sessions.length > 0) && (
          <Pressable
            onPress={() => router.push("/log-cardio")}
            style={styles.cardioRow}
          >
            <View style={styles.cardioStat}>
              <Ionicons name="footsteps" size={16} color={colors.mint} />
              <Text style={styles.cardioValue}>
                {cardio.activity.steps.toLocaleString()}
              </Text>
              <Text style={styles.cardioLabel}>steps</Text>
            </View>
            <View style={styles.cardioDivider} />
            <View style={styles.cardioStat}>
              <Ionicons name="flame" size={16} color={colors.coral} />
              <Text style={styles.cardioValue}>
                {cardio.activity.active_kcal + cardio.totals.kcal_burned}
              </Text>
              <Text style={styles.cardioLabel}>burned</Text>
            </View>
            <View style={styles.cardioDivider} />
            <View style={styles.cardioStat}>
              <Ionicons name="walk" size={16} color={colors.gold} />
              <Text style={styles.cardioValue}>
                {cardio.sessions.length}
              </Text>
              <Text style={styles.cardioLabel}>
                {cardio.sessions.length === 1 ? "session" : "sessions"}
              </Text>
            </View>
          </Pressable>
        )}

      {isToday && sleep?.last_night && (
        <View style={styles.cardioRow}>
          <View style={styles.cardioStat}>
            <Ionicons name="moon" size={16} color="#8b7dd6" />
            <Text style={styles.cardioValue}>
              {formatHm(sleep.last_night.duration_minutes)}
            </Text>
            <Text style={styles.cardioLabel}>last night</Text>
          </View>
          <View style={styles.cardioDivider} />
          <View style={styles.cardioStat}>
            <Ionicons
              name={
                sleep.recovery
                  ? "heart"
                  : sleep.last_night.sleep_score !== null
                    ? "ribbon"
                    : "pulse"
              }
              size={16}
              color={
                sleep.recovery
                  ? recoveryBandColor(sleep.recovery.band)
                  : colors.mint
              }
            />
            <Text style={styles.cardioValue}>
              {sleep.recovery
                ? sleep.recovery.score
                : sleep.last_night.sleep_score !== null
                  ? sleep.last_night.sleep_score
                  : sleep.last_night.hrv_ms !== null
                    ? Math.round(sleep.last_night.hrv_ms)
                    : sleep.last_night.resting_hr_bpm !== null
                      ? sleep.last_night.resting_hr_bpm
                      : "—"}
            </Text>
            <Text style={styles.cardioLabel}>
              {sleep.recovery
                ? "recovery"
                : sleep.last_night.sleep_score !== null
                  ? "score"
                  : sleep.last_night.hrv_ms !== null
                    ? "HRV ms"
                    : sleep.last_night.resting_hr_bpm !== null
                      ? "RHR bpm"
                      : "—"}
            </Text>
          </View>
          <View style={styles.cardioDivider} />
          <View style={styles.cardioStat}>
            <Ionicons name="trending-up" size={16} color={colors.gold} />
            <Text style={styles.cardioValue}>
              {sleep.seven_day.avg_duration_minutes !== null
                ? formatHm(sleep.seven_day.avg_duration_minutes)
                : "—"}
            </Text>
            <Text style={styles.cardioLabel}>{t("home.sleep_7day_avg")}</Text>
          </View>
        </View>
      )}

      {/* Weekly Wrapped — surface on Mon-Wed while last week's recap is fresh. */}
      {isToday && isWrappedWindow(nowDate) && (
        <Pressable
          onPress={() => router.push("/weekly-wrapped")}
          style={styles.wrappedCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.gold }]}>
              {t("home.wrapped_card.kicker")}
            </Text>
            <Text style={styles.suggestTitle}>
              {t("home.wrapped_card.title")}
            </Text>
            <Text style={styles.suggestSub}>
              {t("home.wrapped_card.sub")}
            </Text>
          </View>
          <Text style={[styles.suggestArrow, { color: colors.gold }]}>→</Text>
        </Pressable>
      )}

      {isToday && fasting?.active ? (
        <Pressable
          onPress={() => router.push("/fasting")}
          style={styles.fastingCard}
        >
          <Text style={[styles.kicker, { color: colors.gold }]}>
            {t("home.fasting_target", { hours: fasting.active.target_hours })}
          </Text>
          <Text style={styles.fastingBig}>
            {formatFastElapsed(fasting.active.started_at)}
          </Text>
          <Text style={styles.fastingSub}>{t("home.tap_to_end_fast")}</Text>
        </Pressable>
      ) : null}

      {isToday && workout?.active && workout.next_session && workout.program && (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/workout",
              params: {
                program_id: workout.program!.id,
                session_index: String(workout.next_session_index ?? 0),
              },
            })
          }
          style={styles.workoutCard}
        >
          <Text style={[styles.kicker, { color: colors.mint }]}>
            {t("home.todays_session", {
              count: workout.completed_this_week ?? 0,
            })}
          </Text>
          <Text style={styles.workoutName}>{workout.next_session.name}</Text>
          <Text style={styles.workoutFocus}>{workout.next_session.focus}</Text>
          <Text style={styles.workoutMeta}>
            {t("home.n_exercises_program", {
              count: workout.next_session.exercises.length,
              program: workout.program.name,
            })}
          </Text>
        </Pressable>
      )}

      {isToday && water && (
        <WaterRing
          totalMl={water.total_ml}
          targetMl={water.target_ml}
          onAdd={addWater}
        />
      )}

      {isToday && (
        <QuickLogFab
        actions={[
          {
            key: "voice",
            label: "Say what you ate",
            icon: "mic-outline",
            tint: colors.gold,
            onPress: () => router.push("/voice-log"),
          },
          {
            key: "plate",
            label: "Scan a plate",
            icon: "camera-outline",
            tint: colors.gold,
            onPress: () => router.push("/scan/plate"),
          },
          {
            key: "barcode",
            label: "Barcode",
            icon: "barcode-outline",
            tint: colors.gold,
            onPress: () => router.push("/scan/barcode"),
          },
          {
            key: "manual",
            label: "Add manually",
            icon: "create-outline",
            tint: colors.ink,
            onPress: () => router.push("/manual-meal"),
          },
          {
            key: "water",
            label: "Add water",
            icon: "water-outline",
            tint: colors.mint,
            onPress: () => addWater(250),
          },
          {
            key: "weight",
            label: "Log weight",
            icon: "speedometer-outline",
            tint: colors.coral,
            onPress: () => router.push("/progress"),
          },
          {
            key: "cardio",
            label: "Log cardio",
            icon: "walk-outline",
            tint: colors.mint,
            onPress: () => router.push("/log-cardio"),
          },
        ]}
      />
      )}
      </Animated.View>
    </Screen>
  );
}

/**
 * Splice optimistic just-logged items into an existing LedgerDayResponse
 * so the ring can update within a frame of the log screen navigating
 * back. Recomputes the totals block by summing every field the ring
 * + macros + micros row reads. When the fresh server ledger arrives,
 * it fully replaces this merged shape via setLedger(ledgerRes).
 */
function mergePendingIntoLedger(
  prev: LedgerDayResponse,
  pending: ReturnType<typeof peekOptimisticLogItems>
): LedgerDayResponse {
  if (pending.length === 0) return prev;
  const nowMs = Date.now();
  const pendingItems = pending.map((p, i) => ({
    id: -(nowMs + i), // negative synthetic id — never collides with server bigserial
    name: p.name,
    portion_estimate: p.portion_estimate ?? null,
    source: p.source,
    confidence: p.confidence ?? null,
    eaten_at: p.eaten_at,
    meal_slot: p.meal_slot ?? null,
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
  const nextItems = [...prev.totals.items, ...pendingItems];
  const bump = (
    range: { low: number; high: number },
    key: "kcal" | "protein_g" | "carb_g" | "fat_g" | "sodium_mg" | "fiber_g" | "sugar_g" | "saturated_fat_g"
  ) => {
    let low = range.low;
    let high = range.high;
    for (const it of pendingItems) {
      const lowKey = `${key}_low` as keyof typeof it;
      const highKey = `${key}_high` as keyof typeof it;
      low += Number(it[lowKey] ?? 0);
      high += Number(it[highKey] ?? 0);
    }
    return { low, high };
  };
  return {
    ...prev,
    totals: {
      ...prev.totals,
      items: nextItems,
      kcal: bump(prev.totals.kcal, "kcal"),
      protein_g: bump(prev.totals.protein_g, "protein_g"),
      carb_g: bump(prev.totals.carb_g, "carb_g"),
      fat_g: bump(prev.totals.fat_g, "fat_g"),
      sodium_mg: bump(prev.totals.sodium_mg, "sodium_mg"),
      fiber_g: bump(prev.totals.fiber_g, "fiber_g"),
      sugar_g: bump(prev.totals.sugar_g, "sugar_g"),
      saturated_fat_g: bump(prev.totals.saturated_fat_g, "saturated_fat_g"),
    },
  };
}

function SideStat({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: string;
  unit: string;
  tint: string;
}) {
  return (
    <View style={styles.sideStat}>
      <Text style={[styles.sideStatLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.sideStatValue}>
        {value}
        <Text style={styles.sideStatUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function Macro({
  label,
  value,
  unit,
  hi,
}: {
  label: string;
  value: number | null;
  unit: string;
  hi?: boolean;
}) {
  return (
    <View style={[styles.macro, hi && styles.macroHi]}>
      <Text style={styles.macroLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.macroValue, hi && { color: colors.gold }]}>
        {value ?? "—"}
        <Text style={styles.macroUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function LedgerCard({
  title,
  low,
  high,
  unit,
  remaining,
}: {
  title: string;
  low: number;
  high: number;
  unit: string;
  remaining?: boolean;
}) {
  const tint =
    remaining && high < 0
      ? colors.coral
      : remaining && low < 0
        ? colors.gold
        : colors.ink;
  return (
    <View style={[styles.card, { flex: 1 }]}>
      <Text style={styles.kicker}>{title.toUpperCase()}</Text>
      <View style={styles.rangeRow}>
        <Text style={[styles.rangeNum, { color: tint }]}>{Math.round(low)}</Text>
        <Text style={styles.rangeDash}>–</Text>
        <Text style={[styles.rangeNum, { color: tint }]}>{Math.round(high)}</Text>
        <Text style={styles.rangeUnit}> {unit}</Text>
      </View>
    </View>
  );
}

function RamadanBanner({
  status,
}: {
  status: {
    day_num: number | null;
    total_days: number | null;
    today: {
      fajr: string;
      maghrib: string;
      in_fast_window: boolean;
      seconds_until_maghrib: number | null;
      seconds_until_fajr: number | null;
    } | null;
  };
}) {
  // Live countdown — seed from server-provided seconds, tick locally.
  const seed = status.today?.in_fast_window
    ? (status.today?.seconds_until_maghrib ?? 0)
    : (status.today?.seconds_until_fajr ?? 0);
  const [remaining, setRemaining] = useState(seed);
  useEffect(() => {
    setRemaining(seed);
    const iv = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [seed]);
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const inFast = !!status.today?.in_fast_window;
  return (
    <View style={styles.ramadanBanner}>
      <View style={styles.ramadanIcon}>
        <Ionicons name="moon" size={22} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ramadanKicker}>
          RAMADAN · DAY {status.day_num}/{status.total_days}
        </Text>
        <Text style={styles.ramadanCountdown}>
          {inFast ? "Iftar in" : "Suhoor closes in"} {String(hh).padStart(2, "0")}:
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </Text>
        <Text style={styles.ramadanTimes}>
          Fajr {status.today?.fajr} · Maghrib {status.today?.maghrib}
        </Text>
      </View>
    </View>
  );
}

/**
 * Compact micronutrient strip below the macros row.
 * Hides when the day has no micros yet (legacy items still logging
 * before the plate-scan v2 prompt landed) — showing all zeros would
 * misread as "hit zero sodium today" which is bad noise.
 */
function MicrosRow({
  profile,
  totals,
  t,
}: {
  profile: import("@/types").Profile;
  totals: import("@/types").DailyTotals;
  t: (key: string) => string;
}) {
  // Defensive: an older deployed backend can respond without the
  // micronutrient totals, in which case totals.sodium_mg / etc. are
  // undefined even though the type says otherwise. Zero-fallback so
  // the client renders nothing rather than crashing the whole Home
  // tab via the ErrorBoundary.
  const zeroRange = { low: 0, high: 0 };
  const sodium = totals.sodium_mg ?? zeroRange;
  const fiber = totals.fiber_g ?? zeroRange;
  const sugar = totals.sugar_g ?? zeroRange;
  const satFat = totals.saturated_fat_g ?? zeroRange;

  const anyData =
    sodium.high > 0 ||
    fiber.high > 0 ||
    sugar.high > 0 ||
    satFat.high > 0;
  if (!anyData) return null;
  return (
    <View style={styles.microsRow}>
      <MicroCell
        label={t("home.micros.sodium")}
        low={sodium.low}
        high={sodium.high}
        target={profile.daily_sodium_mg ?? null}
        unit="mg"
        overWarn
      />
      <View style={styles.microDivider} />
      <MicroCell
        label={t("home.micros.fiber")}
        low={fiber.low}
        high={fiber.high}
        target={profile.daily_fiber_g ?? null}
        unit="g"
      />
      <View style={styles.microDivider} />
      <MicroCell
        label={t("home.micros.sugar")}
        low={sugar.low}
        high={sugar.high}
        target={profile.daily_sugar_g ?? null}
        unit="g"
        overWarn
      />
      <View style={styles.microDivider} />
      <MicroCell
        label={t("home.micros.sat_fat")}
        low={satFat.low}
        high={satFat.high}
        target={profile.daily_saturated_fat_g ?? null}
        unit="g"
        overWarn
      />
    </View>
  );
}

function MicroCell({
  label,
  low,
  high,
  target,
  unit,
  overWarn,
}: {
  label: string;
  low: number;
  high: number;
  target: number | null;
  unit: string;
  overWarn?: boolean;
}) {
  // Show the mid-range for the number (matches how kcal cards elsewhere
  // read); tint red when we're over the target on an over-warn metric
  // (sodium/sugar/sat fat), green when comfortably under the target on
  // fiber (which we want to hit, not avoid).
  const mid = (low + high) / 2;
  const overTarget = target !== null && high > target;
  const underFiber =
    !overWarn && target !== null && high < target * 0.5;
  const tint = overTarget
    ? colors.coral
    : underFiber
      ? colors.dim
      : colors.ink;
  return (
    <View style={styles.microCell}>
      <Text style={[styles.microLabel, overTarget && { color: colors.coral }]}>
        {label}
      </Text>
      <Text style={[styles.microValue, { color: tint }]}>
        {Math.round(mid).toLocaleString()}
        <Text style={styles.microUnit}> {unit}</Text>
      </Text>
      {target !== null && (
        <Text style={styles.microTarget}>/ {target.toLocaleString()}</Text>
      )}
    </View>
  );
}


/**
 * Meal-slot log grid — one row per slot (Breakfast/Lunch/Dinner/Snack).
 * MyFitnessPal-style: shows kcal range + item count when the slot has
 * items.
 *
 * Interaction split:
 *   • Tap the card body → toggle expanded item list (shows what you ate).
 *   • Tap the "+" button → open meals-suggest with slot pre-selected.
 *   • Empty slot: tapping anywhere opens meals-suggest (no items to
 *     show, so the card acts as one big log button).
 *
 * Bucketing is client-side from ledger.totals.items so no extra fetch.
 */
function MealSlotGrid({
  items,
  planned = false,
  t,
}: {
  items: import("@/types").MealItemRow[];
  /** True when the items came from a future-day meal plan preview.
   *  Swaps empty-state copy + CTA labels so the row reads as "here's
   *  what's on the plan" rather than "log this now." */
  planned?: boolean;
  t: (key: string) => string;
}) {
  const bySlot = new Map<
    "breakfast" | "lunch" | "dinner" | "snack",
    import("@/types").MealItemRow[]
  >();
  for (const s of SLOTS) bySlot.set(s, []);
  for (const it of items) {
    const slot = it.meal_slot;
    if (!slot) continue;
    if (bySlot.has(slot)) bySlot.get(slot)!.push(it);
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (s: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const goLog = (s: "breakfast" | "lunch" | "dinner" | "snack") =>
    router.push(
      planned
        ? { pathname: "/meal-plan" as const }
        : {
            pathname: "/meals-suggest" as const,
            params: { slot: s },
          }
    );

  return (
    <View style={styles.slotGrid}>
      {SLOTS.map((s) => {
        const rows = bySlot.get(s) ?? [];
        const meta = SLOT_META[s];
        const kcalLow = rows.reduce((sum, r) => sum + Number(r.kcal_low ?? 0), 0);
        const kcalHigh = rows.reduce(
          (sum, r) => sum + Number(r.kcal_high ?? 0),
          0
        );
        const hasRows = rows.length > 0;
        const isExpanded = expanded.has(s);
        // Empty slot → tapping the body is the log affordance (no items
        // to reveal). Populated slot → body tap toggles the list, and
        // the "+" button is the log affordance.
        const onBodyPress = () => (hasRows ? toggle(s) : goLog(s));
        return (
          <View
            key={s}
            style={[styles.slotCard, { borderLeftColor: meta.tint }]}
          >
            <Pressable style={styles.slotHead} onPress={onBodyPress}>
              <View style={styles.slotIcon}>
                <Ionicons name={meta.icon} size={16} color={meta.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.slotLabel, { color: meta.tint }]}>
                  {meta.en}
                  {planned && hasRows
                    ? "  " + t("home.slot_card.planned_suffix")
                    : ""}
                </Text>
                {hasRows ? (
                  <Text style={styles.slotStat}>
                    {Math.round(kcalLow)}–{Math.round(kcalHigh)}
                    <Text style={styles.slotUnit}> {t("common.kcal")} · </Text>
                    {rows.length}
                    <Text style={styles.slotUnit}>
                      {" "}
                      {rows.length === 1
                        ? t("home.slot_card.item_one")
                        : t("home.slot_card.item_other")}
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.slotEmpty}>
                    {planned
                      ? t("home.slot_card.not_planned")
                      : t("home.slot_card.nothing_logged")}
                  </Text>
                )}
              </View>
              {hasRows ? (
                <Pressable
                  onPress={() => goLog(s)}
                  hitSlop={10}
                  style={styles.slotPlus}
                >
                  <Ionicons name="add" size={20} color={colors.gold} />
                </Pressable>
              ) : (
                <Text style={styles.slotCta}>
                  {planned
                    ? t("home.slot_card.view_cta")
                    : t("home.slot_card.log_cta")}
                </Text>
              )}
            </Pressable>
            {hasRows && isExpanded && (
              <View style={styles.slotItems}>
                {rows.map((r) => (
                  <View key={r.id} style={styles.slotItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotItemName} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.portion_estimate ? (
                        <Text
                          style={styles.slotItemPortion}
                          numberOfLines={1}
                        >
                          {r.portion_estimate}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.slotItemKcal}>
                      {Math.round(Number(r.kcal_low ?? 0))}–
                      {Math.round(Number(r.kcal_high ?? 0))}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Home surface for the 90-Day Plan.
 * - No report yet: gold-accented CTA "Get your 90-Day Plan · 19 AED"
 *   (or "Get your plan" for Pro users). Tapping routes to /report.
 * - Report present: compact pill "Week X of N · View your 90-Day Plan"
 *   that opens the full viewer.
 * All copy pulls from i18n so the AR variant reads naturally.
 */
function ReportCard({
  meta,
  isPro,
  t,
}: {
  meta: { week_index: number; total_weeks: number } | null;
  isPro: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  if (meta) {
    return (
      <Pressable
        onPress={() => router.push("/report")}
        style={styles.reportActiveCard}
      >
        <View style={styles.reportActiveIcon}>
          <Ionicons name="sparkles" size={18} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportActiveKicker}>
            {t("report.home_cta.title_active", {
              week: meta.week_index,
              total: meta.total_weeks,
            })}
          </Text>
          <Text style={styles.reportActiveSub}>
            {t("report.home_cta.sub_active")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.dim} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => router.push("/report")}
      style={styles.reportNewCard}
    >
      <View style={styles.reportNewIcon}>
        <Ionicons name="sparkles" size={22} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.reportNewKicker}>
          {t("report.home_cta.kicker")}
        </Text>
        <Text style={styles.reportNewTitle}>
          {t("report.home_cta.title_new")}
        </Text>
        <Text style={styles.reportNewSub}>{t("report.home_cta.sub_new")}</Text>
      </View>
      <View style={styles.reportNewCta}>
        <Text style={styles.reportNewCtaText}>
          {isPro
            ? t("report.home_cta.cta_new_pro")
            : t("report.home_cta.cta_new")}
        </Text>
      </View>
    </Pressable>
  );
}

function StreakCard({
  streak,
  onFrozen,
  t,
}: {
  streak: StreakResponse;
  onFrozen: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  const [freezing, setFreezing] = useState(false);
  // Yesterday (in the user's local tz) in YYYY-MM-DD, matching how the
  // server buckets days. This is the anchor for the freeze CTA.
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Compute the longest run of consecutive freezable days starting
  // from yesterday and walking back, capped by remaining budget. This
  // is the "restore max" the CTA offers. Example: freezable_days =
  // [Fri, Thu] with budget 2 → CTA restores 2 days in one confirm.
  // freezable_days = [Fri] with budget 2 → CTA is a single-day freeze.
  const freezableSet = useMemo(
    () => new Set(streak.freezable_days),
    [streak.freezable_days]
  );
  const consecutiveFreezable = useMemo(() => {
    const out: string[] = [];
    let cursor = new Date();
    cursor.setDate(cursor.getDate() - 1);
    // Cap by budget so we never propose more than the user can afford.
    for (let i = 0; i < streak.freezes_available_this_month; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (!freezableSet.has(key)) break;
      out.push(key);
      cursor.setDate(cursor.getDate() - 1);
    }
    return out;
  }, [freezableSet, streak.freezes_available_this_month]);

  const canRestore = consecutiveFreezable.length > 0;
  const restoreCount = consecutiveFreezable.length;

  const applyFreeze = () => {
    const cost = restoreCount;
    const budgetRemaining = streak.freezes_available_this_month;
    const title =
      restoreCount === 1
        ? t("home.streak_card.prompt_save_title")
        : t("home.streak_card.prompt_restore_title", { count: restoreCount });
    const body =
      restoreCount === 1
        ? t(
            budgetRemaining === 1
              ? "home.streak_card.prompt_save_body_one"
              : "home.streak_card.prompt_save_body_other",
            { available: budgetRemaining }
          )
        : t("home.streak_card.prompt_restore_body", {
            cost,
            available: budgetRemaining,
            count: restoreCount,
          });
    Alert.alert(title, body, [
      { text: t("home.streak_card.prompt_cancel"), style: "cancel" },
      {
        text:
          restoreCount === 1
            ? t("home.streak_card.prompt_use_one")
            : t("home.streak_card.prompt_use_many", { count: cost }),
        style: "default",
        onPress: async () => {
          setFreezing(true);
          const tzOffsetMin = -new Date().getTimezoneOffset();
          try {
            await api("/api/streaks/freeze", {
              method: "POST",
              body: JSON.stringify({
                freeze_dates: consecutiveFreezable,
                tz_offset_min: tzOffsetMin,
              }),
            });
            onFrozen();
          } catch {
            Alert.alert(
              t("home.streak_card.error_title"),
              t("home.streak_card.error_body")
            );
          } finally {
            setFreezing(false);
          }
        },
      },
    ]);
  };

  return (
    <View
      style={[
        styles.streakCard,
        streak.current_days >= 7 && styles.streakCardHot,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.streakKicker}>
          {streak.todays_status === "logged"
            ? t("home.streak_card.kicker_today_logged")
            : canRestore && streak.current_days === 0
              ? restoreCount === 1
                ? t("home.streak_card.kicker_yesterday_missed")
                : t("home.streak_card.kicker_n_missed", { count: restoreCount })
              : t("home.streak_card.kicker_log_today")}
        </Text>
        <View style={styles.streakNumRow}>
          <Text style={styles.streakFlame}>
            {streak.current_days === 0
              ? "•"
              : streak.current_days >= 7
                ? "🔥"
                : "✦"}
          </Text>
          <Text style={styles.streakNum}>{streak.current_days}</Text>
          <Text style={styles.streakUnit}>
            {t(
              streak.current_days === 1
                ? "home.streak_card.unit_day_one"
                : "home.streak_card.unit_day_other"
            )}
          </Text>
        </View>
        <Text style={styles.streakSub}>
          {t("home.streak_card.week_progress", {
            count: streak.days_this_week,
          })}
          {streak.longest_days > streak.current_days &&
            t("home.streak_card.best_suffix", { count: streak.longest_days })}
          {streak.freezes_monthly_budget > 0 &&
            t("home.streak_card.freeze_budget_suffix", {
              available: streak.freezes_available_this_month,
              total: streak.freezes_monthly_budget,
            })}
        </Text>
        {canRestore && (
          <Pressable
            onPress={applyFreeze}
            disabled={freezing}
            style={styles.streakFreezeBtn}
          >
            <Text style={styles.streakFreezeBtnText}>
              {freezing
                ? t("home.streak_card.btn_saving")
                : restoreCount === 1
                  ? t("home.streak_card.btn_save_yesterday")
                  : t("home.streak_card.btn_restore_gap", {
                      count: restoreCount,
                    })}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function fmtDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFastElapsed(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.max(0, Math.round(minutes - h * 60));
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function recoveryBandColor(
  band: "poor" | "compromised" | "primed" | null
): string {
  if (band === "poor") return colors.coral;
  if (band === "primed") return colors.mint;
  return colors.gold;
}

/**
 * Wrapped is only surfaced on Mon–Wed local time — the recap covers
 * the just-completed Mon–Sun week, and it feels stale by Thursday.
 * Users can still open /weekly-wrapped directly outside this window.
 */
function isWrappedWindow(d: Date): boolean {
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ...
  return dow === 1 || dow === 2 || dow === 3;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(246,183,60,0.12)",
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.gold,
  },
  headTitleCol: {
    flex: 1,
    gap: 2,
  },
  headGreet: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  headDate: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  dayPickerRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  dayChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  dayChipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  dayChipText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  dayChipTextOn: {
    color: colors.gold,
    fontFamily: font.monoBold,
  },
  signout: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.5,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  heroKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  dayLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: 4,
  },
  planBadgeRow: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  planBadgeFree: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  planBadgePro: {
    borderColor: colors.gold,
    backgroundColor: colors.gold,
  },
  planBadgeFreeText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  planBadgeUpgradeText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  planBadgeProText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.bg,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  ringSide: {
    flex: 1,
    gap: spacing.md,
    paddingLeft: spacing.sm,
  },
  sideStat: { gap: 2 },
  sideStatLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  sideStatValue: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  sideStatUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  heroNum: {
    fontFamily: font.displayBold,
    fontSize: 52,
    color: colors.gold,
    lineHeight: 58,
  },
  heroDash: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.dim,
    marginHorizontal: 6,
  },
  heroUnit: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.dim,
    marginLeft: 4,
  },
  heroSub: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 6,
  },
  macros: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  microsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  microCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  microDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.line,
  },
  microLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  microValue: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.ink,
  },
  microUnit: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
  },
  microTarget: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
  },
  slotGrid: {
    gap: spacing.sm,
  },
  slotCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  slotHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  slotPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  slotItems: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  slotItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  slotItemName: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
  slotItemPortion: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.dim,
    marginTop: 1,
  },
  slotItemKcal: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
  },
  reportNewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  reportNewIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(246,183,60,0.10)",
    borderWidth: 1,
    borderColor: colors.goldDim,
    alignItems: "center",
    justifyContent: "center",
  },
  reportNewKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  reportNewTitle: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  reportNewSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    lineHeight: 17,
    marginTop: 2,
  },
  reportNewCta: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  reportNewCtaText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.bg,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  reportActiveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  reportActiveIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(246,183,60,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  reportActiveKicker: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  reportActiveSub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  slotIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  slotStat: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  slotUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  slotEmpty: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  slotCta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  macro: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  macroHi: { borderColor: colors.goldDim },
  macroLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  macroValue: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  macroUnit: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
  },
  ledgerRow: { flexDirection: "row", gap: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rangeRow: { flexDirection: "row", alignItems: "baseline" },
  rangeNum: { fontFamily: font.displayBold, fontSize: 24 },
  rangeDash: { color: colors.dim, marginHorizontal: 4 },
  rangeUnit: { color: colors.dim, fontFamily: font.body, fontSize: 13 },
  workoutCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.mint,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  workoutName: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 4,
  },
  workoutFocus: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    marginTop: 2,
  },
  workoutMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 6,
  },
  dayBanner: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  dayBannerKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  dayBannerBody: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    flex: 1,
  },
  fastingCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  fastingBig: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  fastingSub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  ramadanBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ramadanIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(246,183,60,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  ramadanKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  ramadanCountdown: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  ramadanTimes: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  cardioRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  cardioStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  cardioValue: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  cardioLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  cardioDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.line,
  },
  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  streakCardHot: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.05)",
  },
  streakKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  streakNumRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
    gap: 6,
  },
  streakFlame: {
    fontSize: 22,
  },
  streakNum: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
  },
  streakUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginLeft: 2,
  },
  streakSub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 4,
  },
  streakFreezeBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.panel,
  },
  streakFreezeBtnText: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.gold,
    letterSpacing: 0.3,
  },
  wrappedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  suggestTitle: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 4,
  },
  suggestSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  suggestArrow: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.gold,
  },
});
