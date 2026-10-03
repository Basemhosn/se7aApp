/**
 * SE7A badge catalog + evaluator.
 *
 * Badges are static definitions here; the user_badges table just
 * tracks unlock timestamps. Adding a new badge is add-a-key +
 * update-evaluator; no migration required.
 *
 * Tiers loosely map to visual treatment on the client:
 *   bronze   = first steps
 *   silver   = sustained use
 *   gold     = notable milestone
 *   platinum = rare achievement
 */

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";
export type BadgeCategory =
  | "firsts"
  | "streaks"
  | "meals"
  | "water"
  | "goals"
  | "weight"
  | "workouts"
  | "referrals"
  | "fun"
  | "anniversaries";

export interface BadgeDef {
  key: string;
  icon: string; // Ionicons glyph name — kept as string to avoid RN import in server code
  tier: BadgeTier;
  category: BadgeCategory;
}

export const BADGES: BadgeDef[] = [
  // ── First-time actions ────────────────────────────────────────
  { key: "first_meal", icon: "restaurant", tier: "bronze", category: "firsts" },
  { key: "first_plate_scan", icon: "camera", tier: "bronze", category: "firsts" },
  { key: "first_menu_scan", icon: "list", tier: "bronze", category: "firsts" },
  { key: "first_barcode", icon: "barcode", tier: "bronze", category: "firsts" },
  { key: "first_voice_log", icon: "mic", tier: "bronze", category: "firsts" },
  { key: "first_weighin", icon: "fitness", tier: "bronze", category: "firsts" },
  { key: "first_water", icon: "water", tier: "bronze", category: "firsts" },
  { key: "first_workout", icon: "barbell", tier: "bronze", category: "firsts" },

  // ── Streaks ───────────────────────────────────────────────────
  { key: "streak_3d", icon: "flame", tier: "bronze", category: "streaks" },
  { key: "streak_7d", icon: "flame", tier: "bronze", category: "streaks" },
  { key: "streak_30d", icon: "flame", tier: "silver", category: "streaks" },
  { key: "streak_100d", icon: "flame", tier: "gold", category: "streaks" },
  { key: "streak_365d", icon: "flame", tier: "platinum", category: "streaks" },

  // ── Meal volume ───────────────────────────────────────────────
  { key: "logged_10", icon: "checkmark-done", tier: "bronze", category: "meals" },
  { key: "logged_50", icon: "checkmark-done", tier: "bronze", category: "meals" },
  { key: "logged_100", icon: "checkmark-done", tier: "silver", category: "meals" },
  { key: "logged_500", icon: "checkmark-done", tier: "gold", category: "meals" },
  { key: "logged_1000", icon: "checkmark-done", tier: "platinum", category: "meals" },
  { key: "clean_sweep", icon: "sparkles", tier: "bronze", category: "meals" },

  // ── Water ─────────────────────────────────────────────────────
  { key: "water_streak_3d", icon: "water", tier: "bronze", category: "water" },
  { key: "water_streak_10d", icon: "water", tier: "silver", category: "water" },

  // ── Daily kcal goal ───────────────────────────────────────────
  { key: "kcal_goal_hit_1", icon: "disc", tier: "bronze", category: "goals" },
  { key: "kcal_goal_streak_7d", icon: "disc", tier: "silver", category: "goals" },
  { key: "kcal_goal_streak_30d", icon: "disc", tier: "gold", category: "goals" },

  // ── Weight loss milestones ────────────────────────────────────
  { key: "weight_lost_1kg", icon: "trending-down", tier: "bronze", category: "weight" },
  { key: "weight_lost_5kg", icon: "trending-down", tier: "silver", category: "weight" },
  { key: "weight_lost_10kg", icon: "trending-down", tier: "gold", category: "weight" },
  { key: "weight_lost_25kg", icon: "trophy", tier: "platinum", category: "weight" },

  // ── Workouts ──────────────────────────────────────────────────
  { key: "workouts_10", icon: "barbell", tier: "silver", category: "workouts" },
  { key: "workouts_50", icon: "barbell", tier: "gold", category: "workouts" },

  // ── Plan milestones ───────────────────────────────────────────
  { key: "plan_week1_complete", icon: "calendar", tier: "bronze", category: "goals" },
  { key: "plan_month1_complete", icon: "calendar", tier: "silver", category: "goals" },
  { key: "plan_finished", icon: "trophy", tier: "gold", category: "goals" },

  // ── Referrals ─────────────────────────────────────────────────
  { key: "referral_1", icon: "person-add", tier: "bronze", category: "referrals" },
  { key: "referral_3", icon: "people", tier: "silver", category: "referrals" },
  { key: "referral_10", icon: "star", tier: "gold", category: "referrals" },

  // ── Fun ───────────────────────────────────────────────────────
  { key: "log_after_midnight", icon: "moon", tier: "bronze", category: "fun" },

  // ── Anniversaries ─────────────────────────────────────────────
  // Client watches for the seen_at=null case on these to trigger a
  // full-bleed modal.
  { key: "anniv_30d", icon: "gift", tier: "bronze", category: "anniversaries" },
  { key: "anniv_60d", icon: "gift", tier: "silver", category: "anniversaries" },
  { key: "anniv_90d", icon: "gift", tier: "gold", category: "anniversaries" },
];

/**
 * Snapshot of the user's data used to evaluate every badge in one
 * pass. Keep this shape minimal — anything not referenced by an
 * evaluator shouldn't be queried.
 */
export interface BadgeSnapshot {
  meal_count: number;
  first_meal_at: string | null;
  has_plate_scan: boolean;
  has_menu_scan: boolean;
  has_barcode: boolean;
  has_voice_log: boolean;
  weigh_in_count: number;
  current_streak_days: number;
  workout_count: number;
  active_plan_total_weeks: number | null;
  active_plan_checkpoints_met: number[];
  days_since_onboarded: number | null;
  // Oct 2026 catalog expansion extensions:
  water_log_days: string[]; // YYYY-MM-DD local days with water in last ~45d
  kcal_goal_hit_days: string[]; // local days where kcal landed in target range
  starting_weight_kg: number | null; // earliest weight_log overall
  current_weight_kg: number | null; // latest weight_log
  referral_count: number; // paid-referral conversions
  has_log_after_midnight: boolean;
  max_meals_in_a_day: number;
}

/**
 * Pure function: given a snapshot, return the set of badge keys the
 * user has earned. Evaluator has no side effects; the API route
 * decides what to persist based on the diff against user_badges.
 */
export function evaluateBadges(snapshot: BadgeSnapshot): Set<string> {
  const earned = new Set<string>();

  // Meal volume
  if (snapshot.meal_count >= 1) earned.add("first_meal");
  if (snapshot.meal_count >= 10) earned.add("logged_10");
  if (snapshot.meal_count >= 50) earned.add("logged_50");
  if (snapshot.meal_count >= 100) earned.add("logged_100");
  if (snapshot.meal_count >= 500) earned.add("logged_500");
  if (snapshot.meal_count >= 1000) earned.add("logged_1000");
  if (snapshot.max_meals_in_a_day >= 3) earned.add("clean_sweep");

  // First-use
  if (snapshot.has_plate_scan) earned.add("first_plate_scan");
  if (snapshot.has_menu_scan) earned.add("first_menu_scan");
  if (snapshot.has_barcode) earned.add("first_barcode");
  if (snapshot.has_voice_log) earned.add("first_voice_log");
  if (snapshot.weigh_in_count >= 1) earned.add("first_weighin");
  if (snapshot.water_log_days.length >= 1) earned.add("first_water");

  // Streaks
  if (snapshot.current_streak_days >= 3) earned.add("streak_3d");
  if (snapshot.current_streak_days >= 7) earned.add("streak_7d");
  if (snapshot.current_streak_days >= 30) earned.add("streak_30d");
  if (snapshot.current_streak_days >= 100) earned.add("streak_100d");
  if (snapshot.current_streak_days >= 365) earned.add("streak_365d");

  // Water (consecutive-day runs)
  const waterRun = longestConsecutiveRun(snapshot.water_log_days);
  if (waterRun >= 3) earned.add("water_streak_3d");
  if (waterRun >= 10) earned.add("water_streak_10d");

  // Kcal goal hits
  if (snapshot.kcal_goal_hit_days.length >= 1) earned.add("kcal_goal_hit_1");
  const goalRun = longestConsecutiveRun(snapshot.kcal_goal_hit_days);
  if (goalRun >= 7) earned.add("kcal_goal_streak_7d");
  if (goalRun >= 30) earned.add("kcal_goal_streak_30d");

  // Weight loss (relative to starting weight — only unlock on actual loss)
  if (
    snapshot.starting_weight_kg !== null &&
    snapshot.current_weight_kg !== null
  ) {
    const lost = snapshot.starting_weight_kg - snapshot.current_weight_kg;
    if (lost >= 1) earned.add("weight_lost_1kg");
    if (lost >= 5) earned.add("weight_lost_5kg");
    if (lost >= 10) earned.add("weight_lost_10kg");
    if (lost >= 25) earned.add("weight_lost_25kg");
  }

  // Workouts
  if (snapshot.workout_count >= 1) earned.add("first_workout");
  if (snapshot.workout_count >= 10) earned.add("workouts_10");
  if (snapshot.workout_count >= 50) earned.add("workouts_50");

  // Plan
  const met = snapshot.active_plan_checkpoints_met;
  if (met.includes(1)) earned.add("plan_week1_complete");
  if ([1, 2, 3, 4].every((w) => met.includes(w))) {
    earned.add("plan_month1_complete");
  }
  if (
    snapshot.active_plan_total_weeks !== null &&
    met.length >= snapshot.active_plan_total_weeks
  ) {
    earned.add("plan_finished");
  }

  // Referrals
  if (snapshot.referral_count >= 1) earned.add("referral_1");
  if (snapshot.referral_count >= 3) earned.add("referral_3");
  if (snapshot.referral_count >= 10) earned.add("referral_10");

  // Fun
  if (snapshot.has_log_after_midnight) earned.add("log_after_midnight");

  // Anniversaries
  if (snapshot.days_since_onboarded !== null) {
    if (snapshot.days_since_onboarded >= 30) earned.add("anniv_30d");
    if (snapshot.days_since_onboarded >= 60) earned.add("anniv_60d");
    if (snapshot.days_since_onboarded >= 90) earned.add("anniv_90d");
  }

  return earned;
}

/**
 * Longest run of consecutive local-day strings. Used for water +
 * kcal-goal streak evaluation. Days don't need to be sorted.
 */
function longestConsecutiveRun(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let longest = 0;
  for (const d of set) {
    // Only start counting from the beginning of a run.
    if (set.has(prevDay(d))) continue;
    let n = 1;
    let cur = d;
    while (set.has(nextDay(cur))) {
      cur = nextDay(cur);
      n++;
    }
    if (n > longest) longest = n;
  }
  return longest;
}

function prevDay(ymd: string): string {
  return shiftDay(ymd, -1);
}
function nextDay(ymd: string): string {
  return shiftDay(ymd, 1);
}
function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
