import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { Btn } from "@/components/Btn";
import { api } from "@/lib/api";
import { useEntitlement } from "@/lib/EntitlementContext";
import { fetchReportPriceString, purchaseReport } from "@/lib/rc";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * SE7A 90-Day Plan viewer.
 *
 * Three states this screen handles:
 *   1. No report → show CTA + generate button. Generation is gated by
 *      Pro entitlement OR a consumable-IAP purchase (Phase 3 wires
 *      the purchase; this screen calls /api/reports/generate directly
 *      for Pro users and routes non-Pro users to the paywall).
 *   2. Report present, no weekly_summary → render plan + fire a
 *      one-shot /api/reports/weekly-refresh on mount (rate-limited to
 *      once/24h server-side).
 *   3. Report present + weekly_summary → render everything.
 */

interface Meal {
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  portion: string;
  kcal: { low: number; high: number };
  swap_ideas: string[];
}

interface Report {
  id: number;
  generated_at: string;
  duration_days: number;
  week_index: number;
  total_weeks: number;
  plan: {
    hero: { headline: string; tldr: string; safety_notes: string[] };
    nutrition: {
      daily_kcal: { low: number; high: number };
      protein_g: { low: number; high: number };
      carb_g: { low: number; high: number };
      fat_g: { low: number; high: number };
      rationale: string;
      weekly_adjustment_rules: string[];
    };
    meals: {
      days: { day_of_week: number; meals: Meal[] }[];
      grocery_staples: string[];
      eating_out_rules: string[];
    };
    training: {
      weekly_sessions: {
        day_index: number;
        focus: string;
        exercises: {
          name: string;
          sets: string;
          reps: string;
          rest_seconds: number;
          notes: string;
        }[];
        duration_min: number;
      }[];
      progression_rules: string[];
      deload_rule: string;
      cardio_prescription: string;
    };
    habits: {
      daily_habits: string[];
      hard_scenarios: { title: string; rule: string }[];
      missed_workout_rule: string;
      cravings_playbook: string[];
    };
    tracking: {
      measurements: { name: string; how_often: string }[];
      weekly_review_questions: string[];
      trend_interpretation_rules: string[];
    };
    roadmap: {
      weeks: { week_index: number; theme: string; focus: string; checkpoint: string }[];
      monthly_reviews: { month_index: number; prompt: string }[];
    };
  };
  weekly_summary: {
    week_index: number;
    headline: string;
    what_went_well: string[];
    what_to_change: string[];
    coach_take: string;
  } | null;
  weekly_summary_at: string | null;
}

export default function ReportScreen() {
  const { t } = useTranslation();
  const { ent } = useEntitlement();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [priceString, setPriceString] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ report: Report | null }>("/api/reports/current");
      setReport(res.report);
    } catch {
      /* silent — non-blocking */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch RC price so the CTA shows localized currency ("29 AED",
  // "$8", etc.). Runs alongside load; failures are silent — CTA falls
  // back to the hardcoded 19 AED string from i18n.
  useEffect(() => {
    if (ent.is_pro) return;
    fetchReportPriceString().then(setPriceString).catch(() => {});
  }, [ent.is_pro]);

  // Fire-and-forget weekly refresh on load if the plan is at least a
  // week old and no fresh summary. Rate-limited server-side to once/24h.
  useEffect(() => {
    if (!report) return;
    if (report.weekly_summary_at) {
      const staleMs = Date.now() - new Date(report.weekly_summary_at).getTime();
      if (staleMs < 24 * 3600 * 1000) return;
    }
    api("/api/reports/weekly-refresh", { method: "POST" })
      .then(() => load())
      .catch(() => {});
  }, [report, load]);

  const generate = useCallback(async () => {
    setErr("");
    // Non-Pro users must buy the consumable IAP first. Pro users skip
    // straight to generation. Purchase → generate happens on the same
    // tap so the user isn't stuck in a "you bought it, now tap again"
    // dead-end.
    if (!ent.is_pro) {
      const result = await purchaseReport();
      if (result.cancelled) return;
      if ("error" in result && result.error) {
        setErr(
          result.error === "product_unavailable"
            ? t("report.purchase_unavailable")
            : result.error === "billing_unavailable"
              ? t("report.purchase_unavailable")
              : t("report.purchase_err")
        );
        return;
      }
    }
    setGenerating(true);
    try {
      await api("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ duration_days: 90 }),
      });
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(
        msg === "onboarding_incomplete"
          ? t("report.onboarding_incomplete")
          : msg || t("report.generate_err")
      );
    }
    setGenerating(false);
  }, [ent.is_pro, load, t]);

  const share = useCallback(async () => {
    if (!report) return;
    const lines: string[] = [
      report.plan.hero.headline,
      "",
      report.plan.hero.tldr,
      "",
      `— SE7A ${report.duration_days}-Day Plan`,
    ];
    await Share.share({ message: lines.join("\n") }).catch(() => {});
  }, [report]);

  if (loading) {
    return (
      <Screen>
        <BackButton />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  if (!report) {
    return (
      <Screen>
        <BackButton />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles" size={44} color={colors.gold} />
          </View>
          <Text style={styles.emptyTitle}>{t("report.empty_title")}</Text>
          <Text style={styles.emptySub}>{t("report.empty_sub")}</Text>
          {!!err && <Text style={styles.err}>{err}</Text>}
          {generating ? (
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.generatingLabel}>{t("report.generating")}</Text>
              <Text style={styles.generatingSub}>
                {t("report.generating_sub")}
              </Text>
            </View>
          ) : (
            <Btn
              label={
                ent.is_pro
                  ? t("report.generate_cta_pro")
                  : priceString
                    ? t("report.generate_cta_free_priced", {
                        price: priceString,
                      })
                    : t("report.generate_cta_free")
              }
              onPress={generate}
              disabled={generating}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton />

      <Text style={styles.kicker}>
        {t("report.kicker", {
          week: report.week_index,
          total: report.total_weeks,
        })}
      </Text>
      <Text style={styles.h1}>{report.plan.hero.headline}</Text>
      <Text style={styles.tldr}>{report.plan.hero.tldr}</Text>

      {report.weekly_summary && (
        <WeeklySummaryCard summary={report.weekly_summary} t={t} />
      )}

      <NutritionSection plan={report.plan.nutrition} t={t} />
      <MealsSection plan={report.plan.meals} t={t} />
      <TrainingSection plan={report.plan.training} t={t} />
      <HabitsSection plan={report.plan.habits} t={t} />
      <TrackingSection plan={report.plan.tracking} t={t} />
      <RoadmapSection plan={report.plan.roadmap} t={t} />
      <SafetySection notes={report.plan.hero.safety_notes} t={t} />

      <View style={styles.actionsRow}>
        <Btn
          label={t("report.share")}
          variant="ghost"
          onPress={share}
        />
      </View>
    </Screen>
  );
}

type T = (k: string, o?: Record<string, string | number>) => string;

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionH}>{label}</Text>;
}

function WeeklySummaryCard({
  summary,
  t,
}: {
  summary: NonNullable<Report["weekly_summary"]>;
  t: T;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryKicker}>
        {t("report.weekly_summary.title")}
      </Text>
      <Text style={styles.summaryHeadline}>{summary.headline}</Text>
      <Text style={styles.summarySub}>
        {t("report.weekly_summary.went_well")}
      </Text>
      {summary.what_went_well.map((s, i) => (
        <BulletRow key={`w-${i}`} icon="checkmark-circle" tint={colors.mint} text={s} />
      ))}
      <Text style={styles.summarySub}>
        {t("report.weekly_summary.to_change")}
      </Text>
      {summary.what_to_change.map((s, i) => (
        <BulletRow key={`c-${i}`} icon="arrow-up-circle" tint={colors.gold} text={s} />
      ))}
      <Text style={styles.summarySub}>
        {t("report.weekly_summary.coach_take")}
      </Text>
      <Text style={styles.summaryTake}>{summary.coach_take}</Text>
    </View>
  );
}

function NutritionSection({
  plan,
  t,
}: {
  plan: Report["plan"]["nutrition"];
  t: T;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.nutrition")} />
      <Text style={styles.sectionLead}>{t("report.nutrition.targets")}</Text>
      <View style={styles.kcalBig}>
        <Text style={styles.kcalBigValue}>
          {plan.daily_kcal.low}–{plan.daily_kcal.high}
        </Text>
        <Text style={styles.kcalBigUnit}>{t("common.kcal")}</Text>
      </View>
      <View style={styles.macroGrid}>
        <MacroCell label="Protein" low={plan.protein_g.low} high={plan.protein_g.high} />
        <MacroCell label="Carbs" low={plan.carb_g.low} high={plan.carb_g.high} />
        <MacroCell label="Fat" low={plan.fat_g.low} high={plan.fat_g.high} />
      </View>
      <Text style={styles.blockH}>{t("report.nutrition.why_this")}</Text>
      <Text style={styles.body}>{plan.rationale}</Text>
      <Text style={styles.blockH}>{t("report.nutrition.adjust_rules")}</Text>
      {plan.weekly_adjustment_rules.map((r, i) => (
        <BulletRow key={i} icon="chevron-forward" tint={colors.gold} text={r} />
      ))}
    </View>
  );
}

function MacroCell({ label, low, high }: { label: string; low: number; high: number }) {
  return (
    <View style={styles.macroCell}>
      <Text style={styles.macroCellLabel}>{label}</Text>
      <Text style={styles.macroCellValue}>
        {Math.round(low)}–{Math.round(high)}
        <Text style={styles.macroCellUnit}> g</Text>
      </Text>
    </View>
  );
}

function MealsSection({
  plan,
  t,
}: {
  plan: Report["plan"]["meals"];
  t: T;
}) {
  const dayNames = t("report.days", { returnObjects: true } as never) as unknown as string[];
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.meals")} />
      {plan.days.map((day) => (
        <View key={day.day_of_week} style={styles.mealDay}>
          <Text style={styles.mealDayLabel}>
            {Array.isArray(dayNames) && dayNames[day.day_of_week]
              ? dayNames[day.day_of_week]
              : t("report.meals.day", { n: day.day_of_week + 1 })}
          </Text>
          {day.meals.map((m, i) => (
            <View key={i} style={styles.mealRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mealSlot}>
                  {t(`common.meal_slot.${m.slot}`)}
                </Text>
                <Text style={styles.mealName}>{m.name}</Text>
                <Text style={styles.mealPortion}>{m.portion}</Text>
                {m.swap_ideas.length > 0 && (
                  <Text style={styles.mealSwaps}>
                    {t("report.meals.swaps")}: {m.swap_ideas.join(" · ")}
                  </Text>
                )}
              </View>
              <Text style={styles.mealKcal}>
                {m.kcal.low}–{m.kcal.high}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.blockH}>{t("report.meals.grocery")}</Text>
      <View style={styles.chipRow}>
        {plan.grocery_staples.map((s, i) => (
          <View key={i} style={styles.chip}>
            <Text style={styles.chipText}>{s}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.blockH}>{t("report.meals.eating_out")}</Text>
      {plan.eating_out_rules.map((r, i) => (
        <BulletRow key={i} icon="restaurant" tint={colors.mint} text={r} />
      ))}
    </View>
  );
}

function TrainingSection({
  plan,
  t,
}: {
  plan: Report["plan"]["training"];
  t: T;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.training")} />
      {plan.weekly_sessions.map((s, i) => (
        <View key={i} style={styles.trainingSession}>
          <View style={styles.trainingSessionHead}>
            <Text style={styles.trainingSessionTitle}>
              {t("report.training.session", {
                n: s.day_index + 1,
                focus: s.focus,
              })}
            </Text>
            {s.duration_min ? (
              <Text style={styles.trainingSessionDuration}>
                {t("report.training.duration", { min: s.duration_min })}
              </Text>
            ) : null}
          </View>
          {s.exercises.map((ex, ei) => (
            <View key={ei} style={styles.exerciseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {t("report.training.sets_reps", {
                    sets: ex.sets,
                    reps: ex.reps,
                  })}
                  {ex.rest_seconds
                    ? "  ·  " +
                      t("report.training.rest", { sec: ex.rest_seconds })
                    : ""}
                </Text>
                {ex.notes ? <Text style={styles.exerciseNotes}>{ex.notes}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.blockH}>{t("report.training.progression")}</Text>
      {plan.progression_rules.map((r, i) => (
        <BulletRow key={i} icon="trending-up" tint={colors.gold} text={r} />
      ))}
      <Text style={styles.blockH}>{t("report.training.deload")}</Text>
      <Text style={styles.body}>{plan.deload_rule}</Text>
      <Text style={styles.blockH}>{t("report.training.cardio")}</Text>
      <Text style={styles.body}>{plan.cardio_prescription}</Text>
    </View>
  );
}

function HabitsSection({
  plan,
  t,
}: {
  plan: Report["plan"]["habits"];
  t: T;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.habits")} />
      <Text style={styles.blockH}>{t("report.habits.daily")}</Text>
      {plan.daily_habits.map((h, i) => (
        <BulletRow key={i} icon="ellipse-outline" tint={colors.gold} text={h} />
      ))}
      <Text style={styles.blockH}>{t("report.habits.hard_scenarios")}</Text>
      {plan.hard_scenarios.map((s, i) => (
        <View key={i} style={styles.scenarioCard}>
          <Text style={styles.scenarioTitle}>{s.title}</Text>
          <Text style={styles.scenarioRule}>{s.rule}</Text>
        </View>
      ))}
      <Text style={styles.blockH}>{t("report.habits.missed_workout")}</Text>
      <Text style={styles.body}>{plan.missed_workout_rule}</Text>
      <Text style={styles.blockH}>{t("report.habits.cravings")}</Text>
      {plan.cravings_playbook.map((c, i) => (
        <BulletRow key={i} icon="flame" tint={colors.coral} text={c} />
      ))}
    </View>
  );
}

function TrackingSection({
  plan,
  t,
}: {
  plan: Report["plan"]["tracking"];
  t: T;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.tracking")} />
      <Text style={styles.blockH}>{t("report.tracking.measurements")}</Text>
      {plan.measurements.map((m, i) => (
        <View key={i} style={styles.measureRow}>
          <Text style={styles.measureName}>{m.name}</Text>
          <Text style={styles.measureFreq}>{m.how_often}</Text>
        </View>
      ))}
      <Text style={styles.blockH}>{t("report.tracking.weekly_questions")}</Text>
      {plan.weekly_review_questions.map((q, i) => (
        <BulletRow key={i} icon="help-circle" tint={colors.gold} text={q} />
      ))}
      <Text style={styles.blockH}>{t("report.tracking.trend_rules")}</Text>
      {plan.trend_interpretation_rules.map((r, i) => (
        <BulletRow key={i} icon="stats-chart" tint={colors.mint} text={r} />
      ))}
    </View>
  );
}

function RoadmapSection({
  plan,
  t,
}: {
  plan: Report["plan"]["roadmap"];
  t: T;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader label={t("report.section.roadmap")} />
      {plan.weeks.map((w) => (
        <View key={w.week_index} style={styles.roadmapWeek}>
          <Text style={styles.roadmapWeekLabel}>
            {t("report.roadmap.week", { n: w.week_index })}
          </Text>
          <Text style={styles.roadmapTheme}>{w.theme}</Text>
          <Text style={styles.roadmapFocus}>{w.focus}</Text>
          <Text style={styles.roadmapCheckpoint}>{w.checkpoint}</Text>
        </View>
      ))}
      <Text style={styles.blockH}>{t("report.roadmap.monthly_reviews")}</Text>
      {plan.monthly_reviews.map((m) => (
        <View key={m.month_index} style={styles.monthReview}>
          <Text style={styles.monthReviewLabel}>Month {m.month_index}</Text>
          <Text style={styles.body}>{m.prompt}</Text>
        </View>
      ))}
    </View>
  );
}

function SafetySection({ notes, t }: { notes: string[]; t: T }) {
  if (notes.length === 0) return null;
  return (
    <View style={[styles.section, styles.safetySection]}>
      <SectionHeader label={t("report.section.safety")} />
      {notes.map((n, i) => (
        <BulletRow key={i} icon="alert-circle" tint={colors.coral} text={n} />
      ))}
    </View>
  );
}

function BulletRow({
  icon,
  tint,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  text: string;
}) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name={icon} size={14} color={tint} style={{ marginTop: 3 }} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(246,183,60,0.10)",
    borderWidth: 1,
    borderColor: colors.goldDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 21,
  },
  generatingLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.sm,
  },
  generatingSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.sm,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    lineHeight: 34,
  },
  tldr: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    lineHeight: 22,
  },
  section: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  safetySection: {
    borderColor: colors.coral,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  sectionLead: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: 4,
  },
  blockH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
  },
  body: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  bulletText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  kcalBig: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  kcalBigValue: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.gold,
  },
  kcalBigUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginBottom: 6,
  },
  macroGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  macroCell: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  macroCellLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  macroCellValue: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  macroCellUnit: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  mealDay: {
    borderLeftWidth: 3,
    borderLeftColor: colors.goldDim,
    paddingLeft: spacing.sm,
    marginTop: spacing.sm,
    gap: 6,
  },
  mealDayLabel: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  mealSlot: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  mealName: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 1,
  },
  mealPortion: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 1,
  },
  mealSwaps: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    fontStyle: "italic",
    marginTop: 2,
  },
  mealKcal: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: { fontFamily: font.body, fontSize: 12, color: colors.ink },
  trainingSession: {
    borderLeftWidth: 3,
    borderLeftColor: colors.mint,
    paddingLeft: spacing.sm,
    marginTop: spacing.sm,
    gap: 4,
  },
  trainingSessionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trainingSessionTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  trainingSessionDuration: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  exerciseRow: {
    paddingVertical: 4,
  },
  exerciseName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  exerciseMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 1,
  },
  exerciseNotes: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    fontStyle: "italic",
    marginTop: 2,
  },
  scenarioCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
    marginTop: 4,
  },
  scenarioTitle: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  scenarioRule: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },
  measureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  measureName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  measureFreq: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    flex: 1,
    textAlign: "right",
  },
  roadmapWeek: {
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: spacing.sm,
    gap: 2,
  },
  roadmapWeekLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  roadmapTheme: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  roadmapFocus: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  roadmapCheckpoint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    fontStyle: "italic",
    marginTop: 2,
  },
  monthReview: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    gap: 4,
  },
  monthReviewLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  summaryCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  summaryKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  summaryHeadline: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  summarySub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: 6,
  },
  summaryTake: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 20,
    fontStyle: "italic",
  },
  actionsRow: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
});
