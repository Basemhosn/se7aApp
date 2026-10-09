import type { MealItemRow } from "@/types";

/**
 * Deterministic 0-10 health score for a single meal (or a sum of meals
 * for a daily rollup). Not AI. Pure math on the logged macros/micros.
 *
 * Design principles — intentionally different from Cal AI:
 *   - DO NOT penalize being under calorie / carb / protein targets.
 *     SE7A's audience includes cutting users where a deficit is the
 *     point. Rewarding "under target" as "bad" would be hostile to
 *     the brand's weight-loss positioning.
 *   - Reward nutrient DENSITY per calorie (protein per kcal, fiber
 *     per kcal, micronutrient inclusion) rather than absolute amounts.
 *   - Penalize patterns that drive chronic-disease risk at the Gulf
 *     diet level: excess sodium, saturated fat, added-sugar-shaped
 *     carbs. Keep the thresholds Gulf-realistic (sodium bar is strict
 *     because regional diets routinely overshoot 3000mg+).
 *
 * Returns:
 *   score     — integer 0-10 (10 = ideal, 0 = concerning)
 *   label     — human-readable bucket for UI accent (great/good/fair/poor)
 *   factors   — contributions that pushed the score up or down, in
 *               plain language, so UIs can show "why" instead of a
 *               mystery number.
 */

export interface HealthScoreFactor {
  key:
    | "protein_density"
    | "fiber_density"
    | "sodium"
    | "sat_fat"
    | "sugar"
    | "calorie_dense";
  delta: number; // positive = pushed score up, negative = pulled it down
  message_en: string;
  message_ar: string;
}

export type HealthLabel = "great" | "good" | "fair" | "poor";

export interface HealthScore {
  score: number;
  label: HealthLabel;
  factors: HealthScoreFactor[];
}

/**
 * Macro + micro inputs. Fields use the same low/high range shape as
 * the DB so a caller can pass a MealItemRow directly OR a summed
 * daily rollup object. All micros are optional (legacy rows may lack
 * them); the score degrades gracefully when they're absent.
 */
export interface ScoreInput {
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fiber_g_low?: number | null;
  fiber_g_high?: number | null;
  sodium_mg_low?: number | null;
  sodium_mg_high?: number | null;
  sugar_g_low?: number | null;
  sugar_g_high?: number | null;
  saturated_fat_g_low?: number | null;
  saturated_fat_g_high?: number | null;
}

const BASE_SCORE = 7; // start at "good" and let factors push up/down

export function scoreMeal(input: ScoreInput): HealthScore {
  const kcal = mid(input.kcal_low, input.kcal_high);
  if (kcal <= 0) {
    return { score: 7, label: "good", factors: [] };
  }
  const protein = mid(input.protein_g_low, input.protein_g_high);
  const fat = mid(input.fat_g_low, input.fat_g_high);
  const fiber = midOpt(input.fiber_g_low, input.fiber_g_high);
  const sodium = midOpt(input.sodium_mg_low, input.sodium_mg_high);
  const sugar = midOpt(input.sugar_g_low, input.sugar_g_high);
  const satFat = midOpt(
    input.saturated_fat_g_low,
    input.saturated_fat_g_high
  );

  const factors: HealthScoreFactor[] = [];
  let delta = 0;

  // Protein density: g per 100 kcal. 10+ is very high protein, 5+ is
  // decent, below 3 is low-protein for a cutting-friendly meal.
  const proteinPer100 = (protein / kcal) * 100;
  if (proteinPer100 >= 10) {
    factors.push({
      key: "protein_density",
      delta: +2,
      message_en: "Excellent protein density",
      message_ar: "كثافة بروتين ممتازة",
    });
    delta += 2;
  } else if (proteinPer100 >= 5) {
    factors.push({
      key: "protein_density",
      delta: +1,
      message_en: "Good protein density",
      message_ar: "كثافة بروتين جيدة",
    });
    delta += 1;
  } else if (proteinPer100 < 3 && protein < 15) {
    factors.push({
      key: "protein_density",
      delta: -1,
      message_en: "Low protein for the calories",
      message_ar: "بروتين منخفض مقارنة بالسعرات",
    });
    delta -= 1;
  }

  // Fiber: anything meaningful is a win. 5g+ in a single meal = great,
  // 3g+ = good. Below 1g on a meal >200 kcal is a yellow flag.
  if (fiber != null) {
    if (fiber >= 5) {
      factors.push({
        key: "fiber_density",
        delta: +1,
        message_en: "High fiber",
        message_ar: "ألياف عالية",
      });
      delta += 1;
    } else if (fiber < 1 && kcal >= 200) {
      factors.push({
        key: "fiber_density",
        delta: -1,
        message_en: "Very low fiber",
        message_ar: "ألياف منخفضة جداً",
      });
      delta -= 1;
    }
  }

  // Sodium: single-meal cap of ~800mg aligns with ~2300mg daily target
  // split across 3 meals + snacks. Gulf dishes routinely blow past
  // this; the scoring reflects that reality so users see the signal.
  if (sodium != null) {
    if (sodium > 1500) {
      factors.push({
        key: "sodium",
        delta: -3,
        message_en: "Very high sodium",
        message_ar: "صوديوم مرتفع جداً",
      });
      delta -= 3;
    } else if (sodium > 800) {
      factors.push({
        key: "sodium",
        delta: -1,
        message_en: "High sodium",
        message_ar: "صوديوم مرتفع",
      });
      delta -= 1;
    } else if (sodium < 400 && kcal >= 200) {
      factors.push({
        key: "sodium",
        delta: +1,
        message_en: "Low sodium",
        message_ar: "صوديوم منخفض",
      });
      delta += 1;
    }
  }

  // Saturated fat: ratio to total fat matters more than absolute. If
  // sat-fat is >50% of fat AND fat is substantial, flag it.
  if (satFat != null && fat > 0) {
    const satRatio = satFat / fat;
    if (satRatio > 0.5 && satFat > 7) {
      factors.push({
        key: "sat_fat",
        delta: -1,
        message_en: "High saturated fat",
        message_ar: "دهون مشبعة مرتفعة",
      });
      delta -= 1;
    }
  }

  // Sugar: a loose proxy for added sugar (we don't have added-sugar
  // separately — the model estimates it per meal). 25g+ in one meal
  // is a sweet dessert / sugary drink territory.
  if (sugar != null) {
    if (sugar > 35) {
      factors.push({
        key: "sugar",
        delta: -2,
        message_en: "Very high sugar",
        message_ar: "سكر مرتفع جداً",
      });
      delta -= 2;
    } else if (sugar > 20) {
      factors.push({
        key: "sugar",
        delta: -1,
        message_en: "High sugar",
        message_ar: "سكر مرتفع",
      });
      delta -= 1;
    }
  }

  // Calorie density flag — not scored, just a factor shown if a meal
  // crosses 900 kcal (large portion) so the user sees context in the
  // explain-list. Don't penalize; cutting users may be meal-prepping
  // dinner intentionally large.
  if (kcal >= 900) {
    factors.push({
      key: "calorie_dense",
      delta: 0,
      message_en: `${Math.round(kcal)} kcal — large meal`,
      message_ar: `${Math.round(kcal)} سعرة — وجبة كبيرة`,
    });
  }

  const score = Math.max(0, Math.min(10, BASE_SCORE + delta));
  return { score, label: labelFor(score), factors };
}

/**
 * Daily rollup — sum all nutrient fields across the day's meals, then
 * run scoreMeal on the aggregate. Weighted by calories implicitly
 * because sums reflect totals. Returns the same shape as a single
 * meal score, with factors describing the overall day.
 */
export function scoreDay(items: MealItemRow[]): HealthScore {
  if (items.length === 0) {
    return { score: 7, label: "good", factors: [] };
  }
  const sum = (key: keyof MealItemRow): number =>
    items.reduce((acc, it) => acc + Number(it[key] ?? 0), 0);
  return scoreMeal({
    kcal_low: sum("kcal_low"),
    kcal_high: sum("kcal_high"),
    protein_g_low: sum("protein_g_low"),
    protein_g_high: sum("protein_g_high"),
    fat_g_low: sum("fat_g_low"),
    fat_g_high: sum("fat_g_high"),
    carb_g_low: sum("carb_g_low"),
    carb_g_high: sum("carb_g_high"),
    fiber_g_low: sum("fiber_g_low"),
    fiber_g_high: sum("fiber_g_high"),
    sodium_mg_low: sum("sodium_mg_low"),
    sodium_mg_high: sum("sodium_mg_high"),
    sugar_g_low: sum("sugar_g_low"),
    sugar_g_high: sum("sugar_g_high"),
    saturated_fat_g_low: sum("saturated_fat_g_low"),
    saturated_fat_g_high: sum("saturated_fat_g_high"),
  });
}

function labelFor(score: number): HealthLabel {
  if (score >= 9) return "great";
  if (score >= 7) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

function mid(low: number, high: number): number {
  return (low + high) / 2;
}

function midOpt(
  low: number | null | undefined,
  high: number | null | undefined
): number | null {
  if (low == null && high == null) return null;
  return ((low ?? 0) + (high ?? 0)) / 2;
}
