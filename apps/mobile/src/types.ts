/**
 * Mirrored API response types. Kept in sync by hand with the web's
 * lib/schemas/*.ts. Future: extract to packages/shared.
 */

export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "cut" | "recomp" | "maintain" | "bulk";
export type Confidence = "low" | "medium" | "high";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface Profile {
  user_id: string;
  display_name: string | null;
  sex: Sex | null;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  goal_rate_kg_per_week: number | null;
  daily_kcal_target: number | null;
  daily_protein_g: number | null;
  daily_carb_g: number | null;
  daily_fat_g: number | null;
  daily_sodium_mg: number | null;
  daily_fiber_g: number | null;
  daily_sugar_g: number | null;
  daily_saturated_fat_g: number | null;
  onboarded_at: string | null;
}

export interface MacroRange {
  low: number;
  high: number;
}

export interface MealItemRow {
  id: number;
  name: string;
  portion_estimate: string | null;
  source: string;
  confidence: Confidence | null;
  eaten_at: string;
  meal_slot: MealSlot | null;
  scan_id?: string | null;
  photo_url?: string | null;
  sodium_mg_low?: number | null;
  sodium_mg_high?: number | null;
  fiber_g_low?: number | null;
  fiber_g_high?: number | null;
  sugar_g_low?: number | null;
  sugar_g_high?: number | null;
  saturated_fat_g_low?: number | null;
  saturated_fat_g_high?: number | null;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

export interface DailyTotals {
  items: MealItemRow[];
  kcal: MacroRange;
  protein_g: MacroRange;
  carb_g: MacroRange;
  fat_g: MacroRange;
  sodium_mg: MacroRange;
  fiber_g: MacroRange;
  sugar_g: MacroRange;
  saturated_fat_g: MacroRange;
}

export interface LedgerTodayResponse {
  totals: DailyTotals;
  remaining: {
    kcal: MacroRange;
    protein_g: MacroRange;
    carb_g: MacroRange;
    fat_g: MacroRange;
  };
}

export interface PlateItem {
  name: string;
  portion_estimate: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

export interface PlateScanResult {
  identifiable: boolean;
  items: PlateItem[];
  confidence: Confidence;
  invisible_costs: string[];
  notes?: string;
}

export interface PlateScanResponse {
  ok: true;
  scan_id: string;
  result: PlateScanResult;
  image_stored: boolean;
}

export type MenuVerdict = "order" | "consider" | "skip";

export interface MenuDish {
  name: string;
  description?: string;
  verdict: MenuVerdict;
  reason: string;
  rank: number;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

export interface MenuScanResult {
  identifiable: boolean;
  restaurant_guess?: string;
  dishes: MenuDish[];
  confidence: Confidence;
  notes?: string;
}

export interface MenuScanBudget {
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

export interface MenuScanResponse {
  ok: true;
  scan_id: string;
  result: MenuScanResult;
  budget: MenuScanBudget;
  targets_known: boolean;
  image_stored: boolean;
}

export interface BodyScanResult {
  usable: boolean;
  body_fat_pct_low: number;
  body_fat_pct_high: number;
  visual_muscle_level: "low" | "avg" | "above_avg" | "high";
  visible_issues: string[];
  notes: string;
}

export interface BodyProjection {
  target_bf_pct_low: number;
  target_bf_pct_high: number;
  lean_mass_kg_estimate: number;
  weeks_to_goal: { weeks_low: number; weeks_high: number } | null;
  status: "below_target" | "in_target" | "above_target" | "not_applicable";
}

export interface BodyScanResponse {
  ok: true;
  scan_id: string;
  result: BodyScanResult;
  projection: BodyProjection | null;
}
