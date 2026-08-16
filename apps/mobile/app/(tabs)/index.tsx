import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Wordmark } from "@/components/Wordmark";
import { WaterRing } from "@/components/WaterRing";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { usePushRegistration } from "@/lib/usePushRegistration";
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

export default function Home() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  usePushRegistration();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerTodayResponse | null>(null);
  const [workout, setWorkout] = useState<CurrentWorkoutResponse | null>(null);
  const [water, setWater] = useState<WaterTodayResponse | null>(null);
  const [dayStatus, setDayStatus] = useState<DayStatusResponse | null>(null);
  const [fasting, setFasting] = useState<FastingActiveResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [
      { data: profileData },
      ledgerRes,
      workoutRes,
      waterRes,
      dayRes,
      fastingRes,
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

  return (
    <Screen>
      <View style={styles.head}>
        <Wordmark size={22} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable onPress={() => router.push("/language")} hitSlop={12}>
            <Ionicons name="language-outline" size={20} color={colors.dim} />
          </Pressable>
          <Pressable onPress={signOut} hitSlop={12}>
            <Text style={styles.signout}>{t("common.sign_out")}</Text>
          </Pressable>
        </View>
      </View>

      <View>
        <Text style={styles.kicker}>
          {profile.display_name || user?.email?.split("@")[0]}
        </Text>
        <Text style={styles.heroKicker}>
          {dayStatus?.kind === "lift"
            ? t("home.lift_day_remaining")
            : dayStatus?.kind === "rest" && dayStatus.delta_applied !== 0
              ? t("home.rest_day_remaining")
              : t("home.remaining_today")}
        </Text>
        <View style={styles.heroRow}>
          <Text style={styles.heroNum}>
            {Math.round(ledger.remaining.kcal.low)}
          </Text>
          <Text style={styles.heroDash}>–</Text>
          <Text style={styles.heroNum}>
            {Math.round(ledger.remaining.kcal.high)}
          </Text>
          <Text style={styles.heroUnit}> {t("common.kcal")}</Text>
        </View>
        <Text style={styles.heroSub}>
          {t("home.of_target", {
            target: dayStatus?.adjusted_target ?? profile.daily_kcal_target,
          })}
          {ledger.totals.items.length > 0
            ? ` · ${t("home.ate_range", { low: Math.round(ledger.totals.kcal.low), high: Math.round(ledger.totals.kcal.high) })}`
            : ""}
        </Text>
      </View>

      <View style={styles.macros}>
        <Macro label={t("home.protein")} value={profile.daily_protein_g} unit={t("common.g")} />
        <Macro label={t("home.carbs")} value={profile.daily_carb_g} unit={t("common.g")} />
        <Macro label={t("home.fat")} value={profile.daily_fat_g} unit={t("common.g")} />
      </View>

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
    </Screen>
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

function formatFastElapsed(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
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
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
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
