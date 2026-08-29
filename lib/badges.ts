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

export interface BadgeDef {
  key: string;
  icon: string; // Ionicons glyph name — kept as string to avoid RN import in server code
  tier: "bronze" | "silver" | "gold" | "platinum";
}

export const BADGES: BadgeDef[] = [
  // First-time actions — bronze
  { key: "first_meal", icon: "restaurant", tier: "bronze" },
  { key: "first_plate_scan", icon: "camera", tier: "bronze" },
  { key: "first_menu_scan", icon: "list", tier: "bronze" },
  { key: "first_barcode", icon: "barcode", tier: "bronze" },
  { key: "first_voice_log", icon: "mic", tier: "bronze" },
  { key: "first_weighin", icon: "fitness", tier: "bronze" },

  // Streak — bronze/silver/gold/platinum ladder
  { key: "streak_7d", icon: "flame", tier: "bronze" },
  { key: "streak_30d", icon: "flame", tier: "silver" },
  { key: "streak_100d", icon: "flame", tier: "gold" },
  { key: "streak_365d", icon: "flame", tier: "platinum" },

  // Consistency volume
  { key: "logged_100", icon: "checkmark-done", tier: "silver" },
  { key: "logged_1000", icon: "checkmark-done", tier: "platinum" },

  // Plan milestones
  { key: "plan_week1_complete", icon: "sparkles", tier: "bronze" },
  { key: "plan_month1_complete", icon: "sparkles", tier: "silver" },
  { key: "plan_finished", icon: "trophy", tier: "gold" },

  // Fitness
  { key: "first_workout", icon: "barbell", tier: "bronze" },
  { key: "workouts_10", icon: "barbell", tier: "silver" },
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
}

/**
 * Pure function: given a snapshot, return the set of badge keys the
 * user has earned. Evaluator has no side effects; the API route
 * decides what to persist based on the diff against user_badges.
 */
export function evaluateBadges(snapshot: BadgeSnapshot): Set<string> {
  const earned = new Set<string>();

  if (snapshot.meal_count >= 1) earned.add("first_meal");
  if (snapshot.meal_count >= 100) earned.add("logged_100");
  if (snapshot.meal_count >= 1000) earned.add("logged_1000");

  if (snapshot.has_plate_scan) earned.add("first_plate_scan");
  if (snapshot.has_menu_scan) earned.add("first_menu_scan");
  if (snapshot.has_barcode) earned.add("first_barcode");
  if (snapshot.has_voice_log) earned.add("first_voice_log");

  if (snapshot.weigh_in_count >= 1) earned.add("first_weighin");

  if (snapshot.current_streak_days >= 7) earned.add("streak_7d");
  if (snapshot.current_streak_days >= 30) earned.add("streak_30d");
  if (snapshot.current_streak_days >= 100) earned.add("streak_100d");
  if (snapshot.current_streak_days >= 365) earned.add("streak_365d");

  if (snapshot.workout_count >= 1) earned.add("first_workout");
  if (snapshot.workout_count >= 10) earned.add("workouts_10");

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

  return earned;
}
