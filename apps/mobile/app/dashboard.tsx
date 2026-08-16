import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import type { LedgerTodayResponse, Profile } from "@/types";
import type { Program, Session } from "@/lib/programs";

interface CurrentWorkoutResponse {
  active: boolean;
  program?: Program;
  next_session?: Session;
  next_session_index?: number;
  completed_this_week?: number;
  orphaned?: boolean;
}
import { colors, font, radius, spacing } from "@/lib/theme";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerTodayResponse | null>(null);
  const [workout, setWorkout] = useState<CurrentWorkoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: profileData }, ledgerRes, workoutRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      api<LedgerTodayResponse>("/api/ledger/today"),
      api<CurrentWorkoutResponse>("/api/workouts/current").catch(() => ({
        active: false,
      })),
    ]);
    if (profileData && !profileData.onboarded_at) {
      router.replace("/onboarding");
      return;
    }
    setProfile(profileData as Profile);
    setLedger(ledgerRes);
    setWorkout(workoutRes);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setLoading(false));
    }, [load])
  );

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  };

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
        <Pressable onPress={signOut}>
          <Text style={styles.signout}>SIGN OUT</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.kicker}>TODAY{"’"}S TARGETS</Text>
        <Text style={styles.h1}>
          {profile.display_name || user?.email?.split("@")[0]}
        </Text>
      </View>

      <View style={styles.macros}>
        <Macro label="Calories" value={profile.daily_kcal_target} unit="kcal" hi />
        <Macro label="Protein" value={profile.daily_protein_g} unit="g" />
        <Macro label="Carbs" value={profile.daily_carb_g} unit="g" />
        <Macro label="Fat" value={profile.daily_fat_g} unit="g" />
      </View>

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
            TODAY{"’"}S SESSION · {workout.completed_this_week ?? 0} DONE THIS WEEK
          </Text>
          <Text style={styles.workoutName}>{workout.next_session.name}</Text>
          <Text style={styles.workoutFocus}>{workout.next_session.focus}</Text>
          <Text style={styles.workoutMeta}>
            {workout.next_session.exercises.length} exercises · {workout.program.name}
          </Text>
          <Text style={[styles.ctaArrow, { color: colors.mint }]}>→</Text>
        </Pressable>
      )}

      <View style={styles.ctaCol}>
        <CTA
          kicker="AFTER YOU EAT"
          title="Scan a plate"
          subtitle="Snap your meal. Honest ranges, logged to today."
          onPress={() => router.push("/scan/plate")}
          tint={colors.gold}
        />
        <CTA
          kicker="BEFORE YOU ORDER"
          title="Scan a menu"
          subtitle="We rank dishes against your remaining budget."
          onPress={() => router.push("/scan/menu")}
          tint={colors.mint}
        />
        <CTA
          kicker="WHERE YOU ARE"
          title="Body scan"
          subtitle="Honest body-fat range, weeks-to-goal. Photo not stored."
          onPress={() => router.push("/scan/body")}
          tint={colors.coral}
        />
      </View>

      <View style={styles.ledgerRow}>
        <LedgerCard
          title="Eaten today"
          low={ledger.totals.kcal.low}
          high={ledger.totals.kcal.high}
          unit="kcal"
        />
        <LedgerCard
          title="Remaining"
          low={ledger.remaining.kcal.low}
          high={ledger.remaining.kcal.high}
          unit="kcal"
          remaining
        />
      </View>

      {ledger.totals.items.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today{"’"}s log</Text>
          {ledger.totals.items.map((it) => (
            <View key={it.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{it.name}</Text>
                <Text style={styles.rowMeta}>
                  {it.portion_estimate || ""}{" "}
                  {it.confidence ? `· ${it.confidence}` : ""}
                </Text>
              </View>
              <Text style={styles.rowKcal}>
                {it.kcal_low}–{it.kcal_high} kcal
              </Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => router.push("/onboarding")}
        style={styles.redoRow}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.redoLabel}>Change my plan</Text>
          <Text style={styles.redoSub}>
            Redo the intake if your goal, equipment, or schedule shifted.
          </Text>
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

function CTA({
  kicker,
  title,
  subtitle,
  onPress,
  tint,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  tint: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.cta}>
      <Text style={[styles.kicker, { color: tint }]}>{kicker}</Text>
      <Text style={styles.ctaTitle}>{title}</Text>
      <Text style={styles.ctaSub}>{subtitle}</Text>
      <Text style={[styles.ctaArrow, { color: tint }]}>→</Text>
    </Pressable>
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

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
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
  h1: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    marginTop: 4,
  },
  macros: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  macro: {
    flexGrow: 1,
    flexBasis: "47%",
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
  ctaCol: { gap: spacing.sm },
  cta: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    position: "relative",
  },
  ctaTitle: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 4,
  },
  ctaSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
  },
  ctaArrow: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.md,
    fontFamily: font.displayBold,
    fontSize: 22,
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
  cardTitle: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  rangeRow: { flexDirection: "row", alignItems: "baseline" },
  rangeNum: { fontFamily: font.displayBold, fontSize: 24 },
  rangeDash: { color: colors.dim, marginHorizontal: 4 },
  rangeUnit: { color: colors.dim, fontFamily: font.body, fontSize: 13 },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
  },
  rowName: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowMeta: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginTop: 2 },
  rowKcal: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  workoutCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.mint,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    position: "relative",
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
