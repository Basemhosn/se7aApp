/**
 * Body-composition math: derives a target body-fat band from the user's
 * goal+sex, and estimates weeks to reach it as a RANGE.
 *
 * Both bounds of the input BF% range produce a bound of the output
 * weeks range — so the high end of the user's BF gives the conservative
 * (longer) weeks number, and the low end gives the optimistic (shorter)
 * weeks number.
 *
 * Assumptions:
 * - All weight lost is fat (best-case-for-the-user assumption; in
 *   practice some lean mass is lost too). We surface this honestly in
 *   the UI as "assuming all loss is fat".
 * - Weekly loss rate uses the user's profile.goal_rate_kg_per_week,
 *   clamped to a safe range. If the user is bulking/maintaining, we
 *   don't project weeks-to-goal — body comp goals don't apply.
 */
import type { Goal, Sex } from "./macros";

export interface BodyEstimate {
  body_fat_pct_low: number;
  body_fat_pct_high: number;
}

export interface ProjectionInput {
  weight_kg: number;
  sex: Sex;
  goal: Goal;
  goal_rate_kg_per_week: number;
  estimate: BodyEstimate;
}

export interface WeeksRange {
  weeks_low: number;
  weeks_high: number;
}

export interface BodyProjection {
  /** Target BF% band derived from sex + goal. */
  target_bf_pct_low: number;
  target_bf_pct_high: number;
  /** Lean mass at the midpoint BF estimate. */
  lean_mass_kg_estimate: number;
  /** Weeks-to-goal as a range. null when goal doesn't imply fat loss. */
  weeks_to_goal: WeeksRange | null;
  /** Status flag for the UI. */
  status: "below_target" | "in_target" | "above_target" | "not_applicable";
}

/** Sensible target body-fat brackets per sex + goal. */
export const TARGET_BF_BANDS: Record<Sex, Record<Goal, [number, number] | null>> = {
  male: {
    cut: [12, 15],
    recomp: [12, 18],
    maintain: [12, 22],
    bulk: [12, 18], // bulking past 18% is wasteful for most lifters
  },
  female: {
    cut: [20, 24],
    recomp: [20, 26],
    maintain: [20, 30],
    bulk: [20, 26],
  },
};

/** Cap weekly fat loss for projection sanity (0.05 kg ≈ 50 g/week floor). */
const MIN_WEEKLY_LOSS = 0.05;

export function project(input: ProjectionInput): BodyProjection {
  const [tLo, tHi] = TARGET_BF_BANDS[input.sex][input.goal] ?? [0, 0];
  const lo = input.estimate.body_fat_pct_low;
  const hi = input.estimate.body_fat_pct_high;
  const mid = (lo + hi) / 2;

  const leanMass = input.weight_kg * (1 - mid / 100);

  // Below target — eat more.
  if (hi < tLo) {
    return {
      target_bf_pct_low: tLo,
      target_bf_pct_high: tHi,
      lean_mass_kg_estimate: round1(leanMass),
      weeks_to_goal: null,
      status: "below_target",
    };
  }
  // Inside target.
  if (lo <= tHi && hi >= tLo) {
    return {
      target_bf_pct_low: tLo,
      target_bf_pct_high: tHi,
      lean_mass_kg_estimate: round1(leanMass),
      weeks_to_goal: null,
      status: "in_target",
    };
  }
  // Above target — project weeks to reach top of target band (tHi).
  // Only project for goals that imply fat loss; otherwise N/A.
  if (input.goal !== "cut" && input.goal !== "recomp") {
    return {
      target_bf_pct_low: tLo,
      target_bf_pct_high: tHi,
      lean_mass_kg_estimate: round1(leanMass),
      weeks_to_goal: null,
      status: "not_applicable",
    };
  }

  const weeklyLoss = Math.max(
    MIN_WEEKLY_LOSS,
    Math.abs(input.goal_rate_kg_per_week || 0.5)
  );

  // For each BF bound, compute the weight at the target BF band edge.
  // We project each bound separately:
  // - The HIGH BF bound (more fat now) → conservative weeks (slower).
  // - The LOW BF bound (less fat now) → optimistic weeks (sooner).
  // Lean mass is conserved (best case); target_weight = lean / (1 - target_pct).
  const weeksToHit = (bfNow: number, targetPct: number): number => {
    const lean = input.weight_kg * (1 - bfNow / 100);
    const targetWeight = lean / (1 - targetPct / 100);
    const dropKg = input.weight_kg - targetWeight;
    if (dropKg <= 0) return 0;
    return Math.round(dropKg / weeklyLoss);
  };

  // Optimistic: low BF now, easy reach to top of target band (tHi).
  const weeksLow = weeksToHit(lo, tHi);
  // Conservative: high BF now, harder reach to top of target band.
  const weeksHigh = weeksToHit(hi, tHi);

  return {
    target_bf_pct_low: tLo,
    target_bf_pct_high: tHi,
    lean_mass_kg_estimate: round1(leanMass),
    weeks_to_goal: { weeks_low: weeksLow, weeks_high: weeksHigh },
    status: "above_target",
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
