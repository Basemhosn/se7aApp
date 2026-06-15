import type { SupabaseClient } from "@supabase/supabase-js";

export interface MealItemRow {
  id: number;
  name: string;
  portion_estimate: string | null;
  source: string;
  confidence: "low" | "medium" | "high" | null;
  eaten_at: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

export interface MacroRange {
  low: number;
  high: number;
}

export interface DailyTotals {
  items: MealItemRow[];
  kcal: MacroRange;
  protein_g: MacroRange;
  carb_g: MacroRange;
  fat_g: MacroRange;
}

export interface RemainingBudget {
  kcal: MacroRange;
  protein_g: MacroRange;
  carb_g: MacroRange;
  fat_g: MacroRange;
}

function startOfDayUtc(d: Date = new Date()): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Pull today's meal_items for a user and aggregate into ranges.
 * Caller is responsible for auth — pass an already-authenticated client.
 *
 * TODO(phase-2): respect the user's timezone instead of UTC. The Gulf
 * launch is GST (+04), so a UTC midnight cutoff is acceptable now but
 * will eventually surprise users at the day boundary.
 */
export async function getTodayTotals(
  supabase: SupabaseClient,
  userId: string
): Promise<DailyTotals> {
  const dayStart = startOfDayUtc().toISOString();
  const { data, error } = await supabase
    .from("meal_items")
    .select(
      "id, name, portion_estimate, source, confidence, eaten_at, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high"
    )
    .eq("user_id", userId)
    .gte("eaten_at", dayStart)
    .order("eaten_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []) as MealItemRow[];
  const sum = (key: keyof MealItemRow) =>
    items.reduce((acc, it) => acc + Number(it[key] ?? 0), 0);

  return {
    items,
    kcal: { low: sum("kcal_low"), high: sum("kcal_high") },
    protein_g: { low: sum("protein_g_low"), high: sum("protein_g_high") },
    carb_g: { low: sum("carb_g_low"), high: sum("carb_g_high") },
    fat_g: { low: sum("fat_g_low"), high: sum("fat_g_high") },
  };
}

/**
 * Remaining = target − eaten. Use the midpoint of each macro range so
 * the user gets a single "remaining" number; ranges over ranges read as
 * noise. The UI still shows the eaten total as a range.
 */
export function computeRemaining(
  totals: DailyTotals,
  targets: {
    daily_kcal_target: number | null;
    daily_protein_g: number | null;
    daily_carb_g: number | null;
    daily_fat_g: number | null;
  }
): RemainingBudget {
  const mid = (r: MacroRange) => (r.low + r.high) / 2;
  const remain = (target: number | null, r: MacroRange): MacroRange => ({
    // Subtract the high from the target for the "low remaining" bound
    // (worst case: ate the most), and low from target for "high remaining"
    // (best case: ate the least). Reads honestly under uncertainty.
    low: Math.round((target ?? 0) - r.high),
    high: Math.round((target ?? 0) - r.low),
  });
  return {
    kcal: remain(targets.daily_kcal_target, totals.kcal),
    protein_g: remain(targets.daily_protein_g, totals.protein_g),
    carb_g: remain(targets.daily_carb_g, totals.carb_g),
    fat_g: remain(targets.daily_fat_g, totals.fat_g),
  };
}
