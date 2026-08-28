import { z } from "zod";

/**
 * Schema for SE7A's 90-day transformation report.
 *
 * The full plan is stored / consumed as one object (`ReportPlan`), but
 * it's *generated* as two parallel `generateObject` calls because
 * Anthropic's constrained-decoding rejects the merged schema with
 * "The compiled grammar is too large". The split is arbitrary but
 * roughly:
 *   - foundation: hero, nutrition, habits, tracking (small, ~5-8k out)
 *   - tactical: meals, training, roadmap (large, ~12-16k out)
 *
 * Zod refinements are lean on purpose — Anthropic's grammar compiler
 * dislikes stacked constraints. String `.min()` and array `.min()` are
 * dropped throughout; server code post-validates required
 * non-emptiness after both halves return.
 *
 * Every string cap is generous — Claude routinely overshoots what
 * feels "reasonable" (see feedback memory: feedback_ai_schema_tightness).
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
  headline: z.string().max(200),
  tldr: z.string().max(600),
  safety_notes: z.array(z.string().max(400)),
});

const nutritionSchema = z.object({
  daily_kcal: rangeInt,
  protein_g: rangeNum,
  carb_g: rangeNum,
  fat_g: rangeNum,
  rationale: z.string().max(800),
  weekly_adjustment_rules: z.array(z.string().max(400)),
});

const habitsSchema = z.object({
  daily_habits: z.array(z.string().max(400)),
  hard_scenarios: z.array(
    z.object({
      title: z.string().max(140),
      rule: z.string().max(500),
    })
  ),
  missed_workout_rule: z.string().max(400),
  cravings_playbook: z.array(z.string().max(400)),
});

const trackingSchema = z.object({
  measurements: z.array(
    z.object({
      name: z.string().max(120),
      how_often: z.string().max(300),
    })
  ),
  weekly_review_questions: z.array(z.string().max(500)),
  trend_interpretation_rules: z.array(z.string().max(500)),
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
  portion: z.string().max(400),
  kcal: rangeInt,
  swap_ideas: z.array(z.string().max(200)),
});
const mealPlanSchema = z.object({
  days: z.array(
    z.object({
      day_of_week: z.number().int(),
      meals: z.array(mealSchema),
    })
  ),
  grocery_staples: z.array(z.string().max(140)),
  eating_out_rules: z.array(z.string().max(400)),
});

const workoutSessionSchema = z.object({
  day_index: z.number().int(),
  focus: z.string().max(140),
  exercises: z.array(
    z.object({
      name: z.string().max(140),
      sets: z.string().max(60),
      reps: z.string().max(60),
      rest_seconds: z.number().int(),
      notes: z.string().max(300),
    })
  ),
  duration_min: z.number().int(),
});
const trainingSchema = z.object({
  weekly_sessions: z.array(workoutSessionSchema),
  progression_rules: z.array(z.string().max(400)),
  deload_rule: z.string().max(400),
  cardio_prescription: z.string().max(500),
});

const roadmapSchema = z.object({
  weeks: z.array(
    z.object({
      week_index: z.number().int(),
      theme: z.string().max(140),
      focus: z.string().max(500),
      checkpoint: z.string().max(400),
    })
  ),
  monthly_reviews: z.array(
    z.object({
      month_index: z.number().int(),
      prompt: z.string().max(500),
    })
  ),
});

export const reportTacticalSchema = z.object({
  meals: mealPlanSchema,
  training: trainingSchema,
  roadmap: roadmapSchema,
});

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
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanInputSchema>;
