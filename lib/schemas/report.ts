import { z } from "zod";

/**
 * Schema for SE7A's 90-day transformation report.
 *
 * The full plan is stored / consumed as one object (`ReportPlan`), but
 * it's *generated* as two parallel `generateObject`/`streamObject` calls
 * because Anthropic's constrained-decoding rejects the merged schema
 * with "The compiled grammar is too large". The split:
 *   - foundation: hero, nutrition (with phases), habits (with phases), tracking
 *   - tactical: meals, training (with phases), roadmap (with benchmarks)
 *
 * Zod refinements are lean on purpose — Anthropic's grammar compiler
 * dislikes stacked constraints. String `.min()` and array `.min()` are
 * dropped throughout; server code post-validates required
 * non-emptiness after both halves return.
 *
 * Every string cap is generous — Claude routinely overshoots what
 * feels "reasonable" (see feedback memory: feedback_ai_schema_tightness).
 *
 * ── Phased progression (added 2026-09-01) ───────────────────────────
 * Training, nutrition, and habits all include a `phases[]` array with
 * 4 blocks that progress across the 90 days: Accumulation, Intensification,
 * Realization, Deload/Retest. This mirrors how real periodized programs
 * work (Nippard, Renaissance Periodization, 5/3/1). Roadmap keeps its
 * per-week granularity for checkpoints + weekly themes.
 */

const rangeInt = z.object({
  low: z.number().int(),
  high: z.number().int(),
});
const rangeNum = z.object({
  low: z.number(),
  high: z.number(),
});

const generatePlanInputSchema = z.object({
  duration_days: z.number().int().min(28).max(180).default(90).optional(),
});

// --- Foundation half: hero, nutrition, habits, tracking ---

const heroSchema = z.object({
  headline: z.string().max(300),
  tldr: z.string().max(2000),
  safety_notes: z.array(z.string().max(800)),
});

const nutritionPhaseSchema = z.object({
  phase_index: z.number().int(),
  weeks: z.string().max(20),
  name: z.string().max(80),
  focus: z.string().max(1200),
  daily_kcal: rangeInt,
  protein_g: rangeNum,
  carb_g: rangeNum,
  fat_g: rangeNum,
  adjustment_rules: z.array(z.string().max(600)),
});

const nutritionSchema = z.object({
  rationale: z.string().max(2000),
  phases: z.array(nutritionPhaseSchema),
});

const habitPhaseSchema = z.object({
  phase_index: z.number().int(),
  weeks: z.string().max(20),
  name: z.string().max(80),
  focus: z.string().max(1200),
  daily_habits: z.array(z.string().max(600)),
  sleep_recovery_rules: z.array(z.string().max(600)),
});

const hardScenarioSchema = z.object({
  category: z.enum([
    "sick",
    "travel",
    "plateau",
    "injury",
    "missed_workout",
    "social_event",
    "high_stress",
    "other",
  ]),
  title: z.string().max(140),
  rule: z.string().max(1500),
});

const habitsSchema = z.object({
  phases: z.array(habitPhaseSchema),
  hard_scenarios: z.array(hardScenarioSchema),
  cravings_playbook: z.array(z.string().max(800)),
});

const trackingSchema = z.object({
  measurements: z.array(
    z.object({
      name: z.string().max(120),
      how_often: z.string().max(600),
    })
  ),
  weekly_review_questions: z.array(z.string().max(800)),
  trend_interpretation_rules: z.array(z.string().max(800)),
});

export const reportFoundationSchema = z.object({
  hero: heroSchema,
  nutrition: nutritionSchema,
  habits: habitsSchema,
  tracking: trackingSchema,
});

// --- Tactical half: meals, training, roadmap ---

const mealSchema = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().max(140),
  portion: z.string().max(500),
  kcal: rangeInt,
  swap_ideas: z.array(z.string().max(300)),
});
const mealPlanSchema = z.object({
  days: z.array(
    z.object({
      day_of_week: z.number().int(),
      meals: z.array(mealSchema),
    })
  ),
  grocery_staples: z.array(z.string().max(200)),
  eating_out_rules: z.array(z.string().max(600)),
});

const exerciseSchema = z.object({
  name: z.string().max(140),
  sets: z.string().max(60),
  reps: z.string().max(60),
  rest_seconds: z.number().int(),
  notes: z.string().max(300),
  substitutions: z.array(z.string().max(140)),
});

const workoutSessionSchema = z.object({
  day_index: z.number().int(),
  focus: z.string().max(300),
  warmup: z.string().max(800),
  cooldown: z.string().max(800),
  exercises: z.array(exerciseSchema),
  duration_min: z.number().int(),
});

const trainingPhaseSchema = z.object({
  phase_index: z.number().int(),
  weeks: z.string().max(20),
  name: z.string().max(80),
  focus: z.string().max(1200),
  weekly_sessions: z.array(workoutSessionSchema),
  progression_rules: z.array(z.string().max(600)),
});

const trainingSchema = z.object({
  phases: z.array(trainingPhaseSchema),
  general_notes: z.string().max(1500),
  deload_rule: z.string().max(800),
  cardio_prescription: z.string().max(800),
});

const benchmarkSchema = z.object({
  week_index: z.number().int(),
  name: z.string().max(140),
  how: z.string().max(600),
  target: z.string().max(500),
});

const roadmapSchema = z.object({
  weeks: z.array(
    z.object({
      week_index: z.number().int(),
      theme: z.string().max(140),
      focus: z.string().max(800),
      checkpoint: z.string().max(600),
    })
  ),
  monthly_reviews: z.array(
    z.object({
      month_index: z.number().int(),
      prompt: z.string().max(800),
    })
  ),
  benchmarks: z.array(benchmarkSchema),
});

export const reportTacticalSchema = z.object({
  meals: mealPlanSchema,
  training: trainingSchema,
  roadmap: roadmapSchema,
});

// Anthropic's grammar compiler rejects the combined tactical schema
// once training grew to 4 phases × sessions × exercises. We now do
// three parallel calls with these individual schemas and merge into
// the tactical shape client-side.
export const mealsOnlySchema = z.object({ meals: mealPlanSchema });
export const trainingOnlySchema = z.object({ training: trainingSchema });
export const roadmapOnlySchema = z.object({ roadmap: roadmapSchema });

// --- Full merged shape used by DB payload + consumers ---

export const reportPlanSchema = reportFoundationSchema.merge(
  reportTacticalSchema
);

// Weekly-refresh: regenerated Mondays from the past week's real logs.
export const weeklySummarySchema = z.object({
  week_index: z.number().int(),
  headline: z.string().max(200),
  what_went_well: z.array(z.string().max(300)),
  what_to_change: z.array(z.string().max(300)),
  coach_take: z.string().max(700),
});

export { generatePlanInputSchema };

export type ReportPlan = z.infer<typeof reportPlanSchema>;
export type ReportFoundation = z.infer<typeof reportFoundationSchema>;
export type ReportTactical = z.infer<typeof reportTacticalSchema>;
export type NutritionPhase = z.infer<typeof nutritionPhaseSchema>;
export type HabitPhase = z.infer<typeof habitPhaseSchema>;
export type TrainingPhase = z.infer<typeof trainingPhaseSchema>;
export type HardScenario = z.infer<typeof hardScenarioSchema>;
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanInputSchema>;
