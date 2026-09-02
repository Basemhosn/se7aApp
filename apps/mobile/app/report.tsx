import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { Btn } from "@/components/Btn";
import { api } from "@/lib/api";
import { useEntitlement } from "@/lib/EntitlementContext";
import { fetchReportPriceString, purchaseReport } from "@/lib/rc";
import { exportReportAsPdf } from "@/lib/reportPdf";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * SE7A 90-Day Plan viewer.
 *
 * Restructured 2026-09-01 from a single-page dump into a 5-tab layout:
 *   • General   — hero + current phase/week banner + safety + this-week card
 *   • Nutrition — phase-selector → macros + adjustments · meals · grocery · eating out
 *   • Training  — phase-selector → sessions with warmup/exercises/subs/cooldown
 *   • Habits    — phase-selector → habits + sleep · contingencies · cravings · tracking
 *   • Roadmap   — week filter (Full · W1..Wn) → weeks + monthly reviews + benchmarks
 *
 * Data schema: matches lib/schemas/report.ts (phased). Old reports missing
 * the `training.phases` marker are auto-deleted by /api/reports/current
 * and the user regenerates on next visit.
 */

// ── Types (mirror server schema) ────────────────────────────────────
interface Range {
  low: number;
  high: number;
}
interface NutritionPhase {
  phase_index: number;
  weeks: string;
  name: string;
  focus: string;
  daily_kcal: Range;
  protein_g: Range;
  carb_g: Range;
  fat_g: Range;
  adjustment_rules: string[];
}
interface HabitPhase {
  phase_index: number;
  weeks: string;
  name: string;
  focus: string;
  daily_habits: string[];
  sleep_recovery_rules: string[];
}
interface HardScenario {
  category: string;
  title: string;
  rule: string;
}
interface Exercise {
  name: string;
  sets: string;
  reps: string;
  rest_seconds: number;
  notes: string;
  substitutions: string[];
}
interface WorkoutSession {
  day_index: number;
  focus: string;
  warmup: string;
  cooldown: string;
  exercises: Exercise[];
  duration_min: number;
}
interface TrainingPhase {
  phase_index: number;
  weeks: string;
  name: string;
  focus: string;
  weekly_sessions: WorkoutSession[];
  progression_rules: string[];
}
interface Meal {
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  portion: string;
  kcal: Range;
  swap_ideas: string[];
}
interface Benchmark {
  week_index: number;
  name: string;
  how: string;
  target: string;
}

interface CompletionRow {
  done_at: string | null;
  value_json: unknown;
}

interface Report {
  id: number;
  generated_at: string;
  duration_days: number;
  week_index: number;
  total_weeks: number;
  plan: {
    hero: { headline: string; tldr: string; safety_notes: string[] };
    nutrition: { rationale: string; phases: NutritionPhase[] };
    meals: {
      days: { day_of_week: number; meals: Meal[] }[];
      grocery_staples: string[];
      eating_out_rules: string[];
    };
    training: {
      phases: TrainingPhase[];
      general_notes: string;
      deload_rule: string;
      cardio_prescription: string;
    };
    habits: {
      phases: HabitPhase[];
      hard_scenarios: HardScenario[];
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
      benchmarks: Benchmark[];
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
  checkpoints_met: number[];
  completions: Record<string, CompletionRow>;
}

// ── Item key naming convention (mirror server) ──────────────────────
// habit:{phase}:{index}:{yyyy-mm-dd}
// sleep:{phase}:{index}:{yyyy-mm-dd}
// grocery:{index}
// benchmark:{week}:{slug}
// session:{phase}:{day_index}:{yyyy-mm-dd}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
const itemKey = {
  habit: (phase: number, index: number) => `habit:${phase}:${index}:${todayIso()}`,
  sleep: (phase: number, index: number) => `sleep:${phase}:${index}:${todayIso()}`,
  grocery: (index: number) => `grocery:${index}`,
  benchmark: (week: number, name: string) => `benchmark:${week}:${slugify(name)}`,
  session: (phase: number, day: number) => `session:${phase}:${day}:${todayIso()}`,
};

type T = (k: string, o?: Record<string, string | number>) => string;

type TabKey = "general" | "nutrition" | "training" | "habits" | "roadmap";

// ── Utilities ───────────────────────────────────────────────────────

/**
 * Parse a phase's `weeks` string ("1-3", "4-6") and return whether the
 * given absolute week falls inside it. Tolerant of dashes / whitespace.
 */
function weekInPhase(weeks: string, weekIndex: number): boolean {
  const parts = weeks
    .split(/[–\-]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return false;
  const lo = parts[0]!;
  const hi = parts.length > 1 ? parts[1]! : parts[0]!;
  return weekIndex >= lo && weekIndex <= hi;
}

function pickCurrentPhaseIndex<P extends { phase_index: number; weeks: string }>(
  phases: P[],
  weekIndex: number
): number {
  const match = phases.find((p) => weekInPhase(p.weeks, weekIndex));
  return match?.phase_index ?? phases[0]?.phase_index ?? 1;
}

/**
 * Today's index in Monday-first form (0=Mon .. 6=Sun) to match the
 * meal plan's `day_of_week`.
 */
function todayMondayFirst(): number {
  return (new Date().getDay() + 6) % 7;
}

export default function ReportScreen() {
  const { t } = useTranslation();
  const { ent } = useEntitlement();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [priceString, setPriceString] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("general");

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

  useEffect(() => {
    if (ent.is_pro) return;
    fetchReportPriceString().then(setPriceString).catch(() => {});
  }, [ent.is_pro]);

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
      // Streaming response: server sends `\n` heartbeats then either
      // { id, generated_at, plan } on success or { error, details }
      // on failure — both with HTTP 200. Client checks body for error.
      // Response can also parse to null if the stream was truncated —
      // handle defensively so we don't crash reading .error on null.
      const res = await api<{
        id?: number;
        error?: string;
        details?: string;
      } | null>("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ duration_days: 90 }),
      });
      if (!res) {
        throw new Error("empty_response");
      }
      if (res.error) {
        throw new Error(res.details || res.error);
      }
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

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const downloadPdf = useCallback(async () => {
    if (!report || downloadingPdf) return;
    setDownloadingPdf(true);
    const res = await exportReportAsPdf({
      plan: report.plan as unknown as Record<string, unknown>,
      weekIndex: report.week_index,
      totalWeeks: report.total_weeks,
      generatedAt: report.generated_at,
    });
    setDownloadingPdf(false);
    if ("error" in res) {
      Alert.alert(t("common.error"), t("report.download_failed"));
    }
  }, [report, downloadingPdf, t]);

  /**
   * Generic item toggle — writes to report_item_completions via
   * /api/reports/item. Optimistically updates local `completions`
   * map; rolls back on failure. Used by habits, sleep rules, grocery,
   * workout sessions.
   */
  const toggleItem = useCallback(
    async (key: string, done: boolean) => {
      if (!report) return;
      const reportId = report.id;
      const prevCompletion = report.completions[key];
      setReport((prev) =>
        prev
          ? {
              ...prev,
              completions: done
                ? {
                    ...prev.completions,
                    [key]: {
                      done_at: new Date().toISOString(),
                      value_json: prevCompletion?.value_json ?? null,
                    },
                  }
                : Object.fromEntries(
                    Object.entries(prev.completions).filter(([k]) => k !== key)
                  ),
            }
          : prev
      );
      try {
        await api("/api/reports/item", {
          method: "POST",
          body: JSON.stringify({
            action: "toggle",
            report_id: reportId,
            item_key: key,
            done,
          }),
        });
      } catch {
        setReport((prev) =>
          prev
            ? {
                ...prev,
                completions: prevCompletion
                  ? { ...prev.completions, [key]: prevCompletion }
                  : Object.fromEntries(
                      Object.entries(prev.completions).filter(([k]) => k !== key)
                    ),
              }
            : prev
        );
      }
    },
    [report]
  );

  /**
   * Log a value against an item (e.g. benchmark result). Also marks
   * the item done. Same optimistic pattern.
   */
  const logItem = useCallback(
    async (key: string, value: Record<string, unknown>) => {
      if (!report) return;
      const reportId = report.id;
      const prevCompletion = report.completions[key];
      setReport((prev) =>
        prev
          ? {
              ...prev,
              completions: {
                ...prev.completions,
                [key]: {
                  done_at: new Date().toISOString(),
                  value_json: value,
                },
              },
            }
          : prev
      );
      try {
        await api("/api/reports/item", {
          method: "POST",
          body: JSON.stringify({
            action: "log",
            report_id: reportId,
            item_key: key,
            value_json: value,
          }),
        });
      } catch {
        setReport((prev) =>
          prev
            ? {
                ...prev,
                completions: prevCompletion
                  ? { ...prev.completions, [key]: prevCompletion }
                  : Object.fromEntries(
                      Object.entries(prev.completions).filter(([k]) => k !== key)
                    ),
              }
            : prev
        );
      }
    },
    [report]
  );

  const toggleCheckpoint = useCallback(
    async (weekIndex: number, met: boolean) => {
      setReport((prev) =>
        prev
          ? {
              ...prev,
              checkpoints_met: met
                ? Array.from(new Set([...prev.checkpoints_met, weekIndex]))
                : prev.checkpoints_met.filter((w) => w !== weekIndex),
            }
          : prev
      );
      try {
        await api("/api/reports/checkpoint", {
          method: "POST",
          body: JSON.stringify({ week_index: weekIndex, met }),
        });
      } catch {
        setReport((prev) =>
          prev
            ? {
                ...prev,
                checkpoints_met: met
                  ? prev.checkpoints_met.filter((w) => w !== weekIndex)
                  : Array.from(new Set([...prev.checkpoints_met, weekIndex])),
              }
            : prev
        );
      }
    },
    []
  );

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
          <Text style={styles.emptyKicker}>90-DAY PLAN</Text>
          <View style={styles.emptyRule} />
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
                    ? t("report.generate_cta_free_priced", { price: priceString })
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
      <TabBar active={activeTab} onChange={setActiveTab} t={t} />
      {activeTab === "general" && (
        <GeneralTab
          report={report}
          onShare={share}
          onDownloadPdf={downloadPdf}
          downloadingPdf={downloadingPdf}
          t={t}
        />
      )}
      {activeTab === "nutrition" && (
        <NutritionTab report={report} onToggleItem={toggleItem} t={t} />
      )}
      {activeTab === "training" && (
        <TrainingTab report={report} onToggleItem={toggleItem} t={t} />
      )}
      {activeTab === "habits" && (
        <HabitsTab report={report} onToggleItem={toggleItem} t={t} />
      )}
      {activeTab === "roadmap" && (
        <RoadmapTab
          report={report}
          onToggleCheckpoint={toggleCheckpoint}
          onLogItem={logItem}
          t={t}
        />
      )}
    </Screen>
  );
}

// ── Tab bar (horizontal scrollable, 5 tabs) ─────────────────────────

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "general", label: "report.tabs.general", icon: "sparkles-outline" },
  { key: "nutrition", label: "report.tabs.nutrition", icon: "restaurant-outline" },
  { key: "training", label: "report.tabs.training", icon: "barbell-outline" },
  { key: "habits", label: "report.tabs.habits", icon: "leaf-outline" },
  { key: "roadmap", label: "report.tabs.roadmap", icon: "map-outline" },
];

function TabBar({
  active,
  onChange,
  t,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  t: T;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabBar}
      contentContainerStyle={styles.tabBarContent}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tabBtn, isActive && styles.tabBtnActive]}
          >
            <Ionicons
              name={tab.icon}
              size={14}
              color={isActive ? colors.gold : colors.dim}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {t(tab.label)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Phase segmented control (Training / Nutrition / Habits) ─────────

function PhaseSelector<P extends { phase_index: number; name: string; weeks: string }>({
  phases,
  selected,
  onSelect,
  t,
}: {
  phases: P[];
  selected: number;
  onSelect: (idx: number) => void;
  t: T;
}) {
  return (
    <View style={styles.phaseRow}>
      {phases.map((p) => {
        const isActive = p.phase_index === selected;
        return (
          <Pressable
            key={p.phase_index}
            onPress={() => onSelect(p.phase_index)}
            style={[styles.phaseChip, isActive && styles.phaseChipActive]}
          >
            <Text
              style={[styles.phaseChipLabel, isActive && styles.phaseChipLabelActive]}
            >
              {t("report.phase.short", { n: p.phase_index })}
            </Text>
            <Text
              style={[styles.phaseChipWeeks, isActive && styles.phaseChipWeeksActive]}
            >
              W{p.weeks}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── General tab ─────────────────────────────────────────────────────

function GeneralTab({
  report,
  onShare,
  onDownloadPdf,
  downloadingPdf,
  t,
}: {
  report: Report;
  onShare: () => void;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
  t: T;
}) {
  const currentTrainingPhase = useMemo(
    () => pickCurrentPhaseIndex(report.plan.training.phases, report.week_index),
    [report.plan.training.phases, report.week_index]
  );
  const currentPhaseObj = report.plan.training.phases.find(
    (p) => p.phase_index === currentTrainingPhase
  );
  const thisWeek = report.plan.roadmap.weeks.find(
    (w) => w.week_index === report.week_index
  );
  return (
    <View>
      <Text style={styles.kicker}>
        {t("report.kicker", {
          week: report.week_index,
          total: report.total_weeks,
        })}
      </Text>
      <Text style={styles.h1}>{report.plan.hero.headline}</Text>
      <Text style={styles.tldr}>{report.plan.hero.tldr}</Text>

      {/* Current phase banner */}
      {currentPhaseObj && (
        <View style={styles.phaseBanner}>
          <Text style={styles.phaseBannerKicker}>
            {t("report.general.now_in_phase", {
              n: currentPhaseObj.phase_index,
              name: currentPhaseObj.name,
            })}
          </Text>
          <Text style={styles.phaseBannerBody}>{currentPhaseObj.focus}</Text>
        </View>
      )}

      {/* This week's roadmap card */}
      {thisWeek && (
        <View style={styles.thisWeekCard}>
          <Text style={styles.thisWeekKicker}>
            {t("report.general.this_week")}
          </Text>
          <Text style={styles.thisWeekTheme}>{thisWeek.theme}</Text>
          <Text style={styles.thisWeekFocus}>{thisWeek.focus}</Text>
          <Text style={styles.thisWeekCheckpoint}>{thisWeek.checkpoint}</Text>
        </View>
      )}

      {/* Weekly summary if present */}
      {report.weekly_summary && (
        <WeeklySummaryCard summary={report.weekly_summary} t={t} />
      )}

      {/* Safety notes */}
      {report.plan.hero.safety_notes.length > 0 && (
        <View style={[styles.section, styles.safetySection]}>
          <SectionHeader label={t("report.section.safety")} />
          {report.plan.hero.safety_notes.map((n, i) => (
            <BulletRow key={i} icon="alert-circle" tint={colors.coral} text={n} />
          ))}
        </View>
      )}

      <View style={styles.actionsRow}>
        <Btn
          label={
            downloadingPdf
              ? t("report.download_pdf_working")
              : t("report.download_pdf")
          }
          onPress={onDownloadPdf}
          disabled={downloadingPdf}
        />
        <Btn label={t("report.share")} variant="ghost" onPress={onShare} />
      </View>
    </View>
  );
}

// ── Nutrition tab ───────────────────────────────────────────────────

function NutritionTab({
  report,
  onToggleItem,
  t,
}: {
  report: Report;
  onToggleItem: (key: string, done: boolean) => void;
  t: T;
}) {
  const phases = report.plan.nutrition.phases;
  const [selectedPhase, setSelectedPhase] = useState(
    pickCurrentPhaseIndex(phases, report.week_index)
  );
  const phase =
    phases.find((p) => p.phase_index === selectedPhase) ?? phases[0];
  const dayNames = t("report.days", { returnObjects: true } as never) as unknown as string[];

  // One day at a time — default to today (Monday-first index).
  const days = report.plan.meals.days;
  const todayIdx = todayMondayFirst();
  const initialDay =
    days.find((d) => d.day_of_week === todayIdx)?.day_of_week ??
    days[0]?.day_of_week ??
    0;
  const [selectedDay, setSelectedDay] = useState<number>(initialDay);
  const day = days.find((d) => d.day_of_week === selectedDay) ?? days[0];

  const dayLabel = (idx: number) =>
    Array.isArray(dayNames) && dayNames[idx] ? dayNames[idx].slice(0, 3) : `D${idx + 1}`;

  return (
    <View style={{ gap: spacing.md }}>
      <TodayStrip
        kicker={t("report.today.kicker")}
        body={
          phase
            ? `${phase.daily_kcal.low}–${phase.daily_kcal.high} kcal · ${phase.protein_g.low}–${phase.protein_g.high}g protein · Phase ${phase.phase_index}`
            : ""
        }
      />

      <PhaseSelector
        phases={phases}
        selected={selectedPhase}
        onSelect={setSelectedPhase}
        t={t}
      />

      {phase && (
        <View style={styles.section}>
          <Text style={styles.phaseName}>
            {t("report.phase.label", { n: phase.phase_index })} · {phase.name}
          </Text>
          <Text style={styles.body}>{phase.focus}</Text>

          <View style={styles.kcalBig}>
            <Text style={styles.kcalBigValue}>
              {phase.daily_kcal.low}–{phase.daily_kcal.high}
            </Text>
            <Text style={styles.kcalBigUnit}>{t("common.kcal")}</Text>
          </View>
          <View style={styles.macroGrid}>
            <MacroCell
              label={t("report.macro.protein")}
              low={phase.protein_g.low}
              high={phase.protein_g.high}
            />
            <MacroCell
              label={t("report.macro.carbs")}
              low={phase.carb_g.low}
              high={phase.carb_g.high}
            />
            <MacroCell
              label={t("report.macro.fat")}
              low={phase.fat_g.low}
              high={phase.fat_g.high}
            />
          </View>

          {phase.adjustment_rules.length > 0 && (
            <>
              <Text style={styles.blockH}>
                {t("report.nutrition.adjust_rules")}
              </Text>
              {phase.adjustment_rules.map((r, i) => (
                <BulletRow key={i} icon="chevron-forward" tint={colors.gold} text={r} />
              ))}
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader label={t("report.section.meals")} />
        <ChipRow
          options={days.map((d) => ({
            key: d.day_of_week,
            label: dayLabel(d.day_of_week),
          }))}
          selected={selectedDay}
          onSelect={(k) => setSelectedDay(Number(k))}
        />
        {day && (
          <View style={styles.mealDay}>
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
        )}
      </View>

      <Collapsible title={t("report.meals.grocery")}>
        <View style={styles.chipRow}>
          {report.plan.meals.grocery_staples.map((s, i) => {
            const key = itemKey.grocery(i);
            const done = !!report.completions[key]?.done_at;
            return (
              <Pressable
                key={i}
                onPress={() => onToggleItem(key, !done)}
                style={[
                  styles.chip,
                  styles.groceryChip,
                  done && styles.groceryChipDone,
                ]}
              >
                <Ionicons
                  name={done ? "checkmark-circle" : "ellipse-outline"}
                  size={12}
                  color={done ? colors.gold : colors.dim}
                />
                <Text
                  style={[
                    styles.chipText,
                    done && { color: colors.dim, textDecorationLine: "line-through" },
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Collapsible>

      <Collapsible title={t("report.meals.eating_out")}>
        {report.plan.meals.eating_out_rules.map((r, i) => (
          <BulletRow key={i} icon="restaurant" tint={colors.mint} text={r} />
        ))}
      </Collapsible>

      <Collapsible title={t("report.nutrition.why_this")}>
        <Text style={styles.body}>{report.plan.nutrition.rationale}</Text>
      </Collapsible>
    </View>
  );
}

// ── Training tab ────────────────────────────────────────────────────

function TrainingTab({
  report,
  onToggleItem,
  t,
}: {
  report: Report;
  onToggleItem: (key: string, done: boolean) => void;
  t: T;
}) {
  const phases = report.plan.training.phases;
  const [selectedPhase, setSelectedPhase] = useState(
    pickCurrentPhaseIndex(phases, report.week_index)
  );
  const phase =
    phases.find((p) => p.phase_index === selectedPhase) ?? phases[0];

  // One session at a time. Default to the session whose day_index maps
  // to today (Mon-first), otherwise the first session in this phase.
  const sessions = phase?.weekly_sessions ?? [];
  const todayIdx = todayMondayFirst();
  const initialSession =
    sessions.find((s) => s.day_index === todayIdx)?.day_index ??
    sessions[0]?.day_index ??
    0;
  const [selectedSession, setSelectedSession] = useState<number>(initialSession);
  // Re-anchor when phase changes so we don't stay on a session that
  // doesn't exist in the newly selected phase.
  useEffect(() => {
    if (!sessions.length) return;
    if (!sessions.some((s) => s.day_index === selectedSession)) {
      setSelectedSession(sessions[0]!.day_index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhase]);
  const session = sessions.find((s) => s.day_index === selectedSession) ?? sessions[0];

  return (
    <View style={{ gap: spacing.md }}>
      <TodayStrip
        kicker={t("report.today.kicker")}
        body={
          session
            ? `${session.focus} · ~${session.duration_min} min · Phase ${phase?.phase_index ?? 1}`
            : ""
        }
      />

      <PhaseSelector
        phases={phases}
        selected={selectedPhase}
        onSelect={setSelectedPhase}
        t={t}
      />

      {phase && (
        <View style={styles.section}>
          <Text style={styles.phaseName}>
            {t("report.phase.label", { n: phase.phase_index })} · {phase.name}
          </Text>
          <Text style={styles.body}>{phase.focus}</Text>

          {sessions.length > 1 && (
            <ChipRow
              options={sessions.map((s) => ({
                key: s.day_index,
                label: t("report.training.session_short", { n: s.day_index + 1 }),
              }))}
              selected={selectedSession}
              onSelect={(k) => setSelectedSession(Number(k))}
            />
          )}

          {session && (() => {
            const sessKey = itemKey.session(phase!.phase_index, session.day_index);
            const sessDone = !!report.completions[sessKey]?.done_at;
            return (
            <View style={styles.trainingSession}>
              <View style={styles.trainingSessionHead}>
                <Text style={styles.trainingSessionTitle}>
                  {t("report.training.session", {
                    n: session.day_index + 1,
                    focus: session.focus,
                  })}
                </Text>
                {session.duration_min ? (
                  <Text style={styles.trainingSessionDuration}>
                    {t("report.training.duration", { min: session.duration_min })}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => onToggleItem(sessKey, !sessDone)}
                style={[styles.markDoneBtn, sessDone && styles.markDoneBtnDone]}
              >
                <Ionicons
                  name={sessDone ? "checkmark-circle" : "ellipse-outline"}
                  size={14}
                  color={sessDone ? colors.bg : colors.gold}
                />
                <Text
                  style={[
                    styles.markDoneLabel,
                    sessDone && { color: colors.bg },
                  ]}
                >
                  {sessDone
                    ? t("report.training.done_today")
                    : t("report.training.mark_done")}
                </Text>
              </Pressable>

              {!!session.warmup && (
                <View style={styles.warmupCoolBlock}>
                  <Text style={styles.warmupCoolLabel}>
                    {t("report.training.warmup")}
                  </Text>
                  <Text style={styles.warmupCoolBody}>{session.warmup}</Text>
                </View>
              )}

              {session.exercises.map((ex, ei) => (
                <View key={ei} style={styles.exerciseRow}>
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
                  {ex.notes ? (
                    <Text style={styles.exerciseNotes}>{ex.notes}</Text>
                  ) : null}
                  {ex.substitutions?.length > 0 && (
                    <Text style={styles.exerciseSubs}>
                      {t("report.training.substitutions")}: {ex.substitutions.join(" · ")}
                    </Text>
                  )}
                </View>
              ))}

              {!!session.cooldown && (
                <View style={styles.warmupCoolBlock}>
                  <Text style={styles.warmupCoolLabel}>
                    {t("report.training.cooldown")}
                  </Text>
                  <Text style={styles.warmupCoolBody}>{session.cooldown}</Text>
                </View>
              )}
            </View>
            );
          })()}

          {phase.progression_rules.length > 0 && (
            <>
              <Text style={styles.blockH}>
                {t("report.training.phase_progression")}
              </Text>
              {phase.progression_rules.map((r, i) => (
                <BulletRow key={i} icon="trending-up" tint={colors.gold} text={r} />
              ))}
            </>
          )}
        </View>
      )}

      <Collapsible title={t("report.training.general_notes")}>
        <Text style={styles.body}>{report.plan.training.general_notes}</Text>
      </Collapsible>
      <Collapsible title={t("report.training.deload")}>
        <Text style={styles.body}>{report.plan.training.deload_rule}</Text>
      </Collapsible>
      <Collapsible title={t("report.training.cardio")}>
        <Text style={styles.body}>{report.plan.training.cardio_prescription}</Text>
      </Collapsible>
    </View>
  );
}

// ── Habits tab (includes tracking + cravings) ───────────────────────

function HabitsTab({
  report,
  onToggleItem,
  t,
}: {
  report: Report;
  onToggleItem: (key: string, done: boolean) => void;
  t: T;
}) {
  const phases = report.plan.habits.phases;
  const [selectedPhase, setSelectedPhase] = useState(
    pickCurrentPhaseIndex(phases, report.week_index)
  );
  const phase =
    phases.find((p) => p.phase_index === selectedPhase) ?? phases[0];

  return (
    <View style={{ gap: spacing.md }}>
      <TodayStrip
        kicker={t("report.today.kicker")}
        body={phase ? `Phase ${phase.phase_index} · ${phase.name}` : ""}
      />

      <PhaseSelector
        phases={phases}
        selected={selectedPhase}
        onSelect={setSelectedPhase}
        t={t}
      />

      {phase && (
        <View style={styles.section}>
          <Text style={styles.phaseName}>
            {t("report.phase.label", { n: phase.phase_index })} · {phase.name}
          </Text>
          <Text style={styles.body}>{phase.focus}</Text>

          <Text style={styles.blockH}>{t("report.habits.daily")}</Text>
          {phase.daily_habits.map((h, i) => {
            const k = itemKey.habit(phase.phase_index, i);
            const done = !!report.completions[k]?.done_at;
            return (
              <CheckRow
                key={i}
                done={done}
                text={h}
                onToggle={() => onToggleItem(k, !done)}
              />
            );
          })}

          {phase.sleep_recovery_rules.length > 0 && (
            <>
              <Text style={styles.blockH}>{t("report.habits.sleep")}</Text>
              {phase.sleep_recovery_rules.map((r, i) => {
                const k = itemKey.sleep(phase.phase_index, i);
                const done = !!report.completions[k]?.done_at;
                return (
                  <CheckRow
                    key={i}
                    done={done}
                    text={r}
                    onToggle={() => onToggleItem(k, !done)}
                  />
                );
              })}
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader label={t("report.habits.contingencies")} />
        {report.plan.habits.hard_scenarios.map((s, i) => (
          <Collapsible key={i} title={s.title} badge={s.category}>
            <Text style={styles.scenarioRule}>{s.rule}</Text>
          </Collapsible>
        ))}
      </View>

      <Collapsible title={t("report.habits.cravings")}>
        {report.plan.habits.cravings_playbook.map((c, i) => (
          <BulletRow key={i} icon="flame" tint={colors.coral} text={c} />
        ))}
      </Collapsible>

      <View style={styles.section}>
        <SectionHeader label={t("report.section.tracking")} />
        <Text style={styles.blockH}>{t("report.tracking.measurements")}</Text>
        {report.plan.tracking.measurements.map((m, i) => (
          <View key={i} style={styles.measureRow}>
            <Text style={styles.measureName}>{m.name}</Text>
            <Text style={styles.measureFreq}>{m.how_often}</Text>
          </View>
        ))}
        <Text style={styles.blockH}>{t("report.tracking.weekly_questions")}</Text>
        {report.plan.tracking.weekly_review_questions.map((q, i) => (
          <BulletRow key={i} icon="help-circle" tint={colors.gold} text={q} />
        ))}
        <Text style={styles.blockH}>{t("report.tracking.trend_rules")}</Text>
        {report.plan.tracking.trend_interpretation_rules.map((r, i) => (
          <BulletRow key={i} icon="stats-chart" tint={colors.mint} text={r} />
        ))}
      </View>
    </View>
  );
}

// ── Roadmap tab (week filter) ───────────────────────────────────────

function RoadmapTab({
  report,
  onToggleCheckpoint,
  onLogItem,
  t,
}: {
  report: Report;
  onToggleCheckpoint: (weekIndex: number, met: boolean) => void;
  onLogItem: (key: string, value: Record<string, unknown>) => void;
  t: T;
}) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(
    report.week_index
  );
  const weeks = report.plan.roadmap.weeks;
  const visibleWeeks =
    selectedWeek === null ? weeks : weeks.filter((w) => w.week_index === selectedWeek);
  const met = new Set(report.checkpoints_met);
  const benchmarks =
    selectedWeek === null
      ? report.plan.roadmap.benchmarks
      : report.plan.roadmap.benchmarks.filter(
          (b) => b.week_index === selectedWeek
        );
  const thisWeek = weeks.find((w) => w.week_index === report.week_index);

  return (
    <View style={{ gap: spacing.md }}>
      <TodayStrip
        kicker={t("report.today.week_kicker", {
          week: report.week_index,
          total: report.total_weeks,
        })}
        body={thisWeek ? thisWeek.theme : ""}
      />
      {/* Week filter — chip row, scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekChipRow}
      >
        <Pressable
          onPress={() => setSelectedWeek(null)}
          style={[styles.weekChip, selectedWeek === null && styles.weekChipActive]}
        >
          <Text
            style={[
              styles.weekChipLabel,
              selectedWeek === null && styles.weekChipLabelActive,
            ]}
          >
            {t("report.roadmap.full")}
          </Text>
        </Pressable>
        {weeks.map((w) => {
          const isActive = w.week_index === selectedWeek;
          return (
            <Pressable
              key={w.week_index}
              onPress={() => setSelectedWeek(w.week_index)}
              style={[styles.weekChip, isActive && styles.weekChipActive]}
            >
              <Text
                style={[styles.weekChipLabel, isActive && styles.weekChipLabelActive]}
              >
                W{w.week_index}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.section}>
        {visibleWeeks.map((w) => {
          const isMet = met.has(w.week_index);
          return (
            <View key={w.week_index} style={styles.roadmapWeek}>
              <View style={styles.roadmapWeekHead}>
                <Text style={styles.roadmapWeekLabel}>
                  {t("report.roadmap.week", { n: w.week_index })}
                </Text>
                <Pressable
                  onPress={() => onToggleCheckpoint(w.week_index, !isMet)}
                  hitSlop={10}
                  style={[
                    styles.checkpointCircle,
                    isMet && styles.checkpointCircleMet,
                  ]}
                >
                  {isMet ? (
                    <Ionicons name="checkmark" size={14} color={colors.bg} />
                  ) : null}
                </Pressable>
              </View>
              <Text style={styles.roadmapTheme}>{w.theme}</Text>
              <Text style={styles.roadmapFocus}>{w.focus}</Text>
              <Text style={styles.roadmapCheckpoint}>{w.checkpoint}</Text>
              <Pressable
                onPress={() => promptWeightLog(t)}
                style={styles.logWeightBtn}
              >
                <Ionicons name="scale-outline" size={12} color={colors.gold} />
                <Text style={styles.logWeightLabel}>
                  {t("report.roadmap.log_weight")}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {benchmarks.length > 0 && (
        <View style={styles.section}>
          <SectionHeader label={t("report.roadmap.benchmarks")} />
          {benchmarks.map((b, i) => {
            const key = itemKey.benchmark(b.week_index, b.name);
            const logged = report.completions[key];
            const loggedValue = (logged?.value_json as {
              result?: string;
              notes?: string;
            } | undefined) ?? undefined;
            return (
              <Collapsible
                key={i}
                title={b.name}
                badge={`W${b.week_index}`}
              >
                <Text style={styles.benchmarkBody}>{b.how}</Text>
                <Text style={styles.benchmarkTarget}>{b.target}</Text>
                <BenchmarkForm
                  itemKeyStr={key}
                  existing={loggedValue}
                  onLog={onLogItem}
                  t={t}
                />
              </Collapsible>
            );
          })}
        </View>
      )}

      {selectedWeek === null && (
        <View style={styles.section}>
          <SectionHeader label={t("report.roadmap.monthly_reviews")} />
          {report.plan.roadmap.monthly_reviews.map((m) => (
            <Collapsible
              key={m.month_index}
              title={t("report.roadmap.month", { n: m.month_index })}
            >
              <Text style={styles.body}>{m.prompt}</Text>
            </Collapsible>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Shared subcomponents ────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionH}>{label}</Text>;
}

/**
 * Tap-to-toggle checkbox with optimistic update. `done` is derived
 * from the parent's `completions` map; parent handles rollback if
 * the API call fails.
 */
function Checkbox({
  done,
  onToggle,
  size = 22,
}: {
  done: boolean;
  onToggle: () => void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={[
        styles.checkboxBase,
        { width: size, height: size, borderRadius: size / 2 },
        done && styles.checkboxDone,
      ]}
    >
      {done ? (
        <Ionicons name="checkmark" size={size * 0.6} color={colors.bg} />
      ) : null}
    </Pressable>
  );
}

/**
 * Native iOS Alert.prompt for logging weight from the roadmap week
 * card. Non-blocking — inserts into `weight_logs` server-side which
 * also retunes the profile's daily targets.
 */
function promptWeightLog(t: T) {
  Alert.prompt(
    t("report.roadmap.log_weight_title"),
    t("report.roadmap.log_weight_body"),
    async (text) => {
      if (!text) return;
      const num = parseFloat(text.replace(",", "."));
      if (!Number.isFinite(num) || num <= 0 || num > 500) {
        Alert.alert(t("common.error"), t("report.roadmap.log_weight_invalid"));
        return;
      }
      try {
        await api("/api/weight", {
          method: "POST",
          body: JSON.stringify({ weight_kg: num }),
        });
        Alert.alert(t("common.saved"), t("report.roadmap.log_weight_saved", { kg: num.toFixed(1) }));
      } catch {
        Alert.alert(t("common.error"), t("report.roadmap.log_weight_failed"));
      }
    },
    "plain-text",
    "",
    "decimal-pad"
  );
}

/**
 * Inline form inside a benchmark's collapsible body. Two fields —
 * result (short measurement string like "18 reps", "72 cm") and
 * notes — with a Save button that logs both under the benchmark's
 * item_key. Renders any previously-logged value pre-filled.
 */
function BenchmarkForm({
  itemKeyStr,
  existing,
  onLog,
  t,
}: {
  itemKeyStr: string;
  existing?: { result?: string; notes?: string };
  onLog: (key: string, value: Record<string, unknown>) => void;
  t: T;
}) {
  const [result, setResult] = useState(existing?.result ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const dirty =
    result !== (existing?.result ?? "") || notes !== (existing?.notes ?? "");
  const submit = () => {
    if (!result.trim()) return;
    onLog(itemKeyStr, {
      result: result.trim(),
      notes: notes.trim(),
      logged_at: new Date().toISOString(),
    });
  };
  return (
    <View style={styles.benchmarkForm}>
      <Text style={styles.benchmarkFormLabel}>
        {t("report.roadmap.benchmark_result")}
      </Text>
      <TextInput
        style={styles.benchmarkInput}
        value={result}
        onChangeText={setResult}
        placeholder={t("report.roadmap.benchmark_result_ph")}
        placeholderTextColor={colors.dim}
      />
      <Text style={styles.benchmarkFormLabel}>
        {t("report.roadmap.benchmark_notes")}
      </Text>
      <TextInput
        style={[styles.benchmarkInput, styles.benchmarkInputMulti]}
        value={notes}
        onChangeText={setNotes}
        placeholder={t("report.roadmap.benchmark_notes_ph")}
        placeholderTextColor={colors.dim}
        multiline
      />
      <Pressable
        onPress={submit}
        disabled={!dirty || !result.trim()}
        style={[
          styles.benchmarkSaveBtn,
          (!dirty || !result.trim()) && { opacity: 0.5 },
        ]}
      >
        <Text style={styles.benchmarkSaveLabel}>
          {existing?.result
            ? t("report.roadmap.benchmark_update")
            : t("report.roadmap.benchmark_save")}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Row layout: checkbox + text, stacked as a bullet-style entry.
 * Line-throughs the text when done for stronger visual feedback.
 */
function CheckRow({
  done,
  text,
  onToggle,
}: {
  done: boolean;
  text: string;
  onToggle: () => void;
}) {
  return (
    <View style={styles.checkRow}>
      <Checkbox done={done} onToggle={onToggle} size={18} />
      <Text
        style={[
          styles.bulletText,
          done && { color: colors.dim, textDecorationLine: "line-through" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * A horizontal scrollable chip row for picking one option from a list.
 * Used for day-of-week (Nutrition), training-session, and other filters.
 */
function ChipRow<TOption extends { key: string | number; label: string }>({
  options,
  selected,
  onSelect,
}: {
  options: TOption[];
  selected: string | number;
  onSelect: (key: string | number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.weekChipRow}
    >
      {options.map((opt) => {
        const isActive = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            style={[styles.weekChip, isActive && styles.weekChipActive]}
          >
            <Text
              style={[styles.weekChipLabel, isActive && styles.weekChipLabelActive]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Tap-to-expand card. Title always visible with a chevron; body renders
 * only when expanded. Used for contingencies, benchmarks, monthly reviews.
 */
function Collapsible({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.collapsibleCard}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.collapsibleHead}
        hitSlop={6}
      >
        {badge && (
          <View style={styles.scenarioCatBadge}>
            <Text style={styles.scenarioCatText}>{badge}</Text>
          </View>
        )}
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.dim}
        />
      </Pressable>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

/**
 * Small always-visible context strip shown at top of each tab.
 * Kicker + one-line body. Purpose: user instantly knows "where they
 * are" (current week + phase) without scrolling.
 */
function TodayStrip({ kicker, body }: { kicker: string; body: string }) {
  return (
    <View style={styles.todayStrip}>
      <Text style={styles.todayStripKicker}>{kicker}</Text>
      <Text style={styles.todayStripBody} numberOfLines={2}>
        {body}
      </Text>
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

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  empty: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.8,
  },
  emptyRule: {
    width: 40,
    height: 1,
    backgroundColor: colors.gold,
    marginVertical: spacing.md,
  },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 34,
    color: colors.ink,
    lineHeight: 38,
  },
  emptySub: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    lineHeight: 23,
    marginBottom: spacing.lg,
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
    lineHeight: 19,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },

  // Tab bar
  tabBar: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    maxHeight: 44,
  },
  tabBarContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabBtnActive: {
    backgroundColor: colors.goldDim,
    borderColor: colors.gold,
  },
  tabLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  tabLabelActive: { color: colors.gold },

  // Phase segmented control
  phaseRow: {
    flexDirection: "row",
    gap: 6,
  },
  phaseChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    gap: 1,
  },
  phaseChipActive: {
    backgroundColor: colors.goldDim,
    borderColor: colors.gold,
  },
  phaseChipLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  phaseChipLabelActive: { color: colors.gold },
  phaseChipWeeks: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  phaseChipWeeksActive: { color: colors.gold },
  phaseName: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.ink,
  },

  // Week chip filter (Roadmap)
  weekChipRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
  weekChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekChipActive: {
    backgroundColor: colors.goldDim,
    borderColor: colors.gold,
  },
  weekChipLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  weekChipLabelActive: { color: colors.gold },

  // General tab
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
    marginTop: spacing.xs,
  },
  phaseBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    gap: 6,
  },
  phaseBannerKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  phaseBannerBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  thisWeekCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderRadius: radius.md,
    gap: 4,
  },
  thisWeekKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  thisWeekTheme: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.ink,
  },
  thisWeekFocus: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  thisWeekCheckpoint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    fontStyle: "italic",
    marginTop: 2,
  },

  // Shared section
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
    borderTopColor: colors.coral,
  },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.4,
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

  // Nutrition (macros)
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

  // Meals
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

  // Training
  trainingSession: {
    borderLeftWidth: 3,
    borderLeftColor: colors.mint,
    paddingLeft: spacing.sm,
    marginTop: spacing.sm,
    gap: 6,
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
  warmupCoolBlock: {
    backgroundColor: colors.panel2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  warmupCoolLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 1.2,
  },
  warmupCoolBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  exerciseRow: {
    paddingVertical: 4,
  },
  exerciseName: {
    fontFamily: font.bodyBold,
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
  exerciseSubs: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.mint,
    marginTop: 2,
  },

  // Habits
  scenarioCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
    marginTop: 4,
  },
  scenarioCatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  scenarioCatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scenarioCatText: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.gold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  scenarioTitle: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.ink,
    flex: 1,
  },
  scenarioRule: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },

  // Tracking (inside habits tab now)
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

  // Roadmap
  roadmapWeek: {
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: spacing.sm,
    gap: 2,
  },
  roadmapWeekHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roadmapWeekLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  checkpointCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkpointCircleMet: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
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
  benchmarkCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.mint,
    borderRadius: radius.md,
    gap: 4,
  },
  benchmarkHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  benchmarkWeek: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 1.2,
  },
  benchmarkName: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  benchmarkBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  benchmarkTarget: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    fontStyle: "italic",
    marginTop: 2,
  },

  // Weekly summary card
  summaryCard: {
    marginTop: spacing.md,
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

  // Today summary strip (top of each tab)
  todayStrip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    gap: 3,
  },
  todayStripKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  todayStripBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },

  // Interactive components
  checkboxBase: {
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxDone: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  checkRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  groceryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  groceryChipDone: {
    borderColor: colors.goldDim,
    backgroundColor: colors.panel,
  },
  markDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "transparent",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  markDoneBtnDone: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  markDoneLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  logWeightBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  logWeightLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.gold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  benchmarkForm: {
    marginTop: spacing.sm,
    gap: 6,
    padding: spacing.sm,
    backgroundColor: colors.panel2,
    borderRadius: radius.sm,
  },
  benchmarkFormLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  benchmarkInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 8,
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  benchmarkInputMulti: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  benchmarkSaveBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    marginTop: 6,
  },
  benchmarkSaveLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.bg,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  // Collapsible card (tap-to-expand)
  collapsibleCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  collapsibleHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  collapsibleTitle: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.ink,
  },
  collapsibleBody: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: 0,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
