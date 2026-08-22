import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { QuickLogFab } from "@/components/QuickLogFab";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { useRamadan, useRamadanScheduling } from "@/lib/useRamadan";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { usePushRegistration } from "@/lib/usePushRegistration";
import { useHealthSync } from "@/lib/useHealthSync";
import { useWidgetToken } from "@/lib/useWidgetToken";
import type { LedgerTodayResponse, Profile } from "@/types";
import type { Program, Session } from "@/lib/programs";
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
  const { t } = useTranslation();
  usePushRegistration();
  useHealthSync(user?.id);
  useWidgetToken(user?.id);
  const { status: ramadan } = useRamadan();
  useRamadanScheduling(ramadan);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerTodayResponse | null>(null);
  const [workout, setWorkout] = useState<CurrentWorkoutResponse | null>(null);
  const [water, setWater] = useState<WaterTodayResponse | null>(null);
  const [dayStatus, setDayStatus] = useState<DayStatusResponse | null>(null);
  const [fasting, setFasting] = useState<FastingActiveResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [cardio, setCardio] = useState<CardioTodayResponse | null>(null);
  const [sleep, setSleep] = useState<SleepTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const tzOffsetMin = -new Date().getTimezoneOffset();
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
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      api<LedgerTodayResponse>("/api/ledger/today"),
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
    setLoading(false);
  }, [user]);

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
      load().catch(() => setLoading(false));
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
  const y = new Date(nowDate);
  y.setDate(y.getDate() - 1);
  const yesterdayIso = fmtDateIso(y);
  const tomorrowRoute = { pathname: "/meal-plan" as const };

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

      <View style={styles.dayPickerRow}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/calendar" as const,
              params: { open: yesterdayIso },
            })
          }
          style={styles.dayChip}
        >
          <Ionicons name="chevron-back" size={14} color={colors.dim} />
          <Text style={styles.dayChipText}>Yesterday</Text>
        </Pressable>
        <View style={[styles.dayChip, styles.dayChipOn]}>
          <Text style={[styles.dayChipText, styles.dayChipTextOn]}>Today</Text>
        </View>
        <Pressable
          onPress={() => router.push(tomorrowRoute)}
          style={styles.dayChip}
        >
          <Text style={styles.dayChipText}>Tomorrow</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.dim} />
        </Pressable>
      </View>

      {ramadan?.active && ramadan.today && (
        <RamadanBanner status={ramadan} />
      )}

      <Text style={styles.dayLabel}>
        {dayStatus?.kind === "lift"
          ? t("home.lift_day_remaining")
          : dayStatus?.kind === "rest" && dayStatus.delta_applied !== 0
            ? t("home.rest_day_remaining")
            : t("home.remaining_today")}
      </Text>

      <View style={styles.ringRow}>
        <CalorieRing
          target={dayStatus?.adjusted_target ?? profile.daily_kcal_target ?? 2000}
          eatenLow={Math.round(ledger.totals.kcal.low)}
          eatenHigh={Math.round(ledger.totals.kcal.high)}
          size={220}
        />
        <View style={styles.ringSide}>
          <SideStat
            label="TARGET"
            value={String(
              dayStatus?.adjusted_target ?? profile.daily_kcal_target
            )}
            unit="kcal"
            tint={colors.dim}
          />
          <SideStat
            label="EATEN"
            value={
              ledger.totals.items.length === 0
                ? "—"
                : `${Math.round(ledger.totals.kcal.low)}–${Math.round(ledger.totals.kcal.high)}`
            }
            unit="kcal"
            tint={colors.gold}
          />
          <SideStat
            label="ITEMS"
            value={String(ledger.totals.items.length)}
            unit={ledger.totals.items.length === 1 ? "logged" : "logged"}
            tint={colors.dim}
          />
        </View>
      </View>

      <View style={styles.macros}>
        <Macro label={t("home.protein")} value={profile.daily_protein_g} unit={t("common.g")} />
        <Macro label={t("home.carbs")} value={profile.daily_carb_g} unit={t("common.g")} />
        <Macro label={t("home.fat")} value={profile.daily_fat_g} unit={t("common.g")} />
      </View>

      {streak &&
        (streak.current_days > 0 ||
          streak.days_this_week > 0 ||
          (streak.freezable_days.length > 0 &&
            streak.freezes_available_this_month > 0)) && (
          <StreakCard
            streak={streak}
            onFrozen={() => {
              load().catch(() => {});
            }}
          />
        )}

      {cardio &&
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

      {sleep?.last_night && (
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
            <Text style={styles.cardioLabel}>7-day avg</Text>
          </View>
        </View>
      )}

      <Pressable
        onPress={() => router.push("/meals-suggest")}
        style={styles.suggestCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.gold }]}>
            WHAT SHOULD I EAT?
          </Text>
          <Text style={styles.suggestTitle}>Ask SE7A</Text>
          <Text style={styles.suggestSub}>
            AI picks 3 dishes that fit your remaining budget.
          </Text>
        </View>
        <Text style={styles.suggestArrow}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/meal-plan")}
        style={styles.planCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.mint }]}>
            PLAN YOUR WEEK
          </Text>
          <Text style={styles.suggestTitle}>7-day meal plan</Text>
          <Text style={styles.suggestSub}>
            Hits your macros. Auto-shopping list included.
          </Text>
        </View>
        <Text style={[styles.suggestArrow, { color: colors.mint }]}>→</Text>
      </Pressable>

      {fasting?.active ? (
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

      {workout?.active && workout.next_session && workout.program && (
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

      {water && (
        <WaterRing
          totalMl={water.total_ml}
          targetMl={water.target_ml}
          onAdd={addWater}
        />
      )}

      {!fasting?.active && (
        <Pressable onPress={() => router.push("/fasting")} style={styles.miniLink}>
          <Text style={styles.miniLinkLabel}>{t("home.start_fast")}</Text>
          <Text style={styles.miniLinkArrow}>→</Text>
        </Pressable>
      )}

      <Pressable onPress={() => router.push("/onboarding")} style={styles.redoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.redoLabel}>{t("home.change_my_plan")}</Text>
          <Text style={styles.redoSub}>{t("home.change_my_plan_sub")}</Text>
        </View>
        <Text style={styles.redoArrow}>→</Text>
      </Pressable>

      <QuickLogFab
        actions={[
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
    </Screen>
  );
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

function StreakCard({
  streak,
  onFrozen,
}: {
  streak: StreakResponse;
  onFrozen: () => void;
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
        ? "Save your streak?"
        : `Restore ${restoreCount}-day gap?`;
    const body =
      restoreCount === 1
        ? `Use 1 of ${budgetRemaining} freeze${budgetRemaining === 1 ? "" : "s"} this month to protect yesterday.`
        : `Uses ${cost} of ${budgetRemaining} freezes this month to cover the last ${restoreCount} missed days in one go.`;
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      {
        text: restoreCount === 1 ? "Use freeze" : `Use ${cost} freezes`,
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
            Alert.alert("Couldn't apply freeze", "Try again in a moment.");
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
            ? "STREAK · TODAY LOGGED"
            : canRestore && streak.current_days === 0
              ? restoreCount === 1
                ? "STREAK · YESTERDAY MISSED"
                : `STREAK · ${restoreCount} DAYS MISSED`
              : "STREAK · LOG TODAY TO KEEP IT"}
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
            {streak.current_days === 1 ? "day" : "days"}
          </Text>
        </View>
        <Text style={styles.streakSub}>
          {streak.days_this_week}/7 this week
          {streak.longest_days > streak.current_days &&
            ` · best ${streak.longest_days}`}
          {streak.freezes_monthly_budget > 0 &&
            ` · ❄ ${streak.freezes_available_this_month}/${streak.freezes_monthly_budget}`}
        </Text>
        {canRestore && (
          <Pressable
            onPress={applyFreeze}
            disabled={freezing}
            style={styles.streakFreezeBtn}
          >
            <Text style={styles.streakFreezeBtnText}>
              {freezing
                ? "Saving…"
                : restoreCount === 1
                  ? "❄ Save yesterday's streak"
                  : `❄ Restore ${restoreCount}-day gap · ${restoreCount} freezes`}
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
  suggestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
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
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.mint,
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
  miniLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  miniLinkLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
  },
  miniLinkArrow: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.dim,
  },
  redoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  redoLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  redoSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 17,
  },
  redoArrow: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.dim,
  },
});
