/**
 * SE7A "Fit Score" — a 0-10 assessment of how well a proposed meal
 * fits the user's day, given their daily targets and what they've
 * already logged.
 *
 * Explicitly NOT a "healthiness" score. The number reflects fit with
 * YOUR budget — not universal nutrition judgement — which keeps us
 * clear of orthorexia territory and matches SE7A's honesty ethos.
 *
 * Inputs use midpoints of ranges (since scans give ranges but the
 * user needs a single verdict). The verdict includes a plain-English
 * explanation so the score never feels opaque.
 */

export interface FitBudget {
  kcal_target: number;
  protein_target: number;
  carb_target: number;
  fat_target: number;
  kcal_consumed: number;
  protein_consumed: number;
  carb_consumed: number;
  fat_consumed: number;
}

export interface FitMeal {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FitResult {
  /** 0-10, integer. */
  score: number;
  /** One-line verdict — plain English, no jargon. */
  verdict: string;
  /** Ordered list of the biggest factors, best/worst first. */
  reasons: string[];
  /** True when targets aren't set — caller should hide the score UI. */
  unavailable?: boolean;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Compute the fit score. Pure function — no side effects, no async.
 * Safe to call inside a render pass.
 */
export function computeFitScore(
  meal: FitMeal,
  budget: FitBudget
): FitResult {
  // Guard: without a real kcal target we have no basis for a score.
  // Common for users who haven't finished onboarding.
  if (
    !budget.kcal_target ||
    budget.kcal_target <= 0 ||
    !budget.protein_target
  ) {
    return {
      score: 0,
      verdict: "",
      reasons: [],
      unavailable: true,
    };
  }

  const kcalRemaining = Math.max(
    1,
    budget.kcal_target - budget.kcal_consumed
  );
  const pRemaining = Math.max(1, budget.protein_target - budget.protein_consumed);
  const cRemaining = Math.max(1, budget.carb_target - budget.carb_consumed);
  const fRemaining = Math.max(1, budget.fat_target - budget.fat_consumed);

  const kcalRatio = meal.kcal / kcalRemaining;
  const pRatio = meal.protein / pRemaining;
  const cRatio = meal.carbs / cRemaining;
  const fRatio = meal.fat / fRemaining;

  // Component 1: Calorie fit (0-50 pts). Peak score at 20-40% of the
  // day's remaining budget (typical single meal). Sharp penalty over
  // 100% (pushes the user past their target).
  let kcalScore: number;
  if (kcalRatio > 1) {
    kcalScore = Math.max(0, 50 - 120 * (kcalRatio - 1));
  } else if (kcalRatio > 0.6) {
    kcalScore = 30 - 10 * ((kcalRatio - 0.6) / 0.4);
  } else if (kcalRatio >= 0.2) {
    // Sweet spot 20-40%; 40-60% still fine but easing down.
    kcalScore = kcalRatio <= 0.4 ? 50 : 50 - 20 * ((kcalRatio - 0.4) / 0.2);
  } else if (kcalRatio > 0.05) {
    kcalScore = 40 + 10 * ((kcalRatio - 0.05) / 0.15);
  } else {
    // Barely anything — a snack against a fresh day. Not "bad", just
    // not a meaningful meal.
    kcalScore = 25;
  }

  // Component 2: Protein contribution (0-30 pts). Higher score when
  // the meal delivers a chunk of remaining protein — most users
  // under-hit protein.
  let pScore: number;
  if (pRatio >= 0.3) {
    pScore = 30;
  } else if (pRatio >= 0.1) {
    pScore = 15 + 15 * ((pRatio - 0.1) / 0.2);
  } else {
    pScore = 15 * (pRatio / 0.1);
  }

  // Component 3: Balance (0-20 pts). Full points unless one macro
  // (in grams) eats a disproportionate share of what's left.
  let balScore = 20;
  if (cRatio > 0.6) balScore -= 10 * clamp((cRatio - 0.6) / 0.4, 0, 1);
  if (fRatio > 0.6) balScore -= 10 * clamp((fRatio - 0.6) / 0.4, 0, 1);

  const total = kcalScore + pScore + balScore;
  const score = clamp(Math.round(total / 10), 0, 10);

  const reasons: string[] = [];
  if (kcalRatio > 1) {
    reasons.push(
      `Pushes you ~${Math.round((kcalRatio - 1) * 100)}% over your remaining kcal.`
    );
  } else if (kcalRatio > 0.6) {
    reasons.push(
      `Uses ${Math.round(kcalRatio * 100)}% of the kcal you have left today.`
    );
  } else if (kcalRatio >= 0.2 && kcalRatio <= 0.4) {
    reasons.push(
      `Uses ~${Math.round(kcalRatio * 100)}% of your remaining kcal — meal-sized.`
    );
  }
  if (pRatio >= 0.3) {
    reasons.push(
      `Delivers ~${Math.round(pRatio * 100)}% of the protein you still need.`
    );
  } else if (pRatio < 0.1 && meal.kcal > 200) {
    reasons.push("Low protein for its calorie load.");
  }
  if (cRatio > 0.6) {
    reasons.push(
      `Carb-heavy for what's left — ${Math.round(cRatio * 100)}% of remaining.`
    );
  }
  if (fRatio > 0.6) {
    reasons.push(
      `Fat-heavy for what's left — ${Math.round(fRatio * 100)}% of remaining.`
    );
  }

  const verdict = verdictForScore(score);
  return { score, verdict, reasons };
}

function verdictForScore(score: number): string {
  if (score >= 9) return "Great fit for your day.";
  if (score >= 7) return "Solid fit.";
  if (score >= 5) return "Uses a lot of your day's budget.";
  if (score >= 3) return "Heavy for what's left.";
  return "Pushes you past your daily targets.";
}
