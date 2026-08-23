import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface NutrientRow {
  key:
    | "kcal"
    | "protein_g"
    | "carb_g"
    | "fat_g"
    | "fiber_g"
    | "sugar_g"
    | "sodium_mg"
    | "saturated_fat_g";
  label: string;
  unit: string;
  avg_low: number;
  avg_high: number;
  target: number | null;
  /**
   * Whether high values are BAD (sodium, sugar, sat fat) or GOOD
   * (protein, fiber). The client uses this to pick coral vs mint
   * for the target color. Neutral for kcal/carb/fat.
   */
  polarity: "over_warn" | "want_hit" | "neutral";
  pct_of_target: number | null; // avg_high / target * 100
}

/**
 * Daily-average nutrient breakdown over a rolling window. Powers the
 * Progress > Nutrients card (MFP-style Nutrients tab).
 *
 * Averages: sum across the window ÷ number of days in the window
 * (NOT days-with-data). Matching "what's your typical daily intake"
 * rather than "what did you average on days you logged" — a user who
 * only logs 3 of 7 days should see a lower average, not one that
 * hides the gap.
 *
 * Ranges preserved end-to-end — avg_low and avg_high are separate.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = clamp(Number(searchParams.get("days") ?? "30"), 1, 365);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [{ data: profile }, { data: items, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, daily_sodium_mg, daily_fiber_g, daily_sugar_g, daily_saturated_fat_g"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_items")
      .select(
        "kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, sodium_mg_low, sodium_mg_high, fiber_g_low, fiber_g_high, sugar_g_low, sugar_g_high, saturated_fat_g_low, saturated_fat_g_high"
      )
      .eq("user_id", user.id)
      .gte("eaten_at", since.toISOString()),
  ]);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  const rows = items ?? [];
  const sum = (key: string): { low: number; high: number } => {
    let low = 0;
    let high = 0;
    for (const r of rows) {
      const v = r as unknown as Record<string, number | null>;
      low += Number(v[`${key}_low`] ?? 0);
      high += Number(v[`${key}_high`] ?? 0);
    }
    return { low, high };
  };

  const asAvg = (
    key: NutrientRow["key"],
    label: string,
    unit: string,
    target: number | null | undefined,
    polarity: NutrientRow["polarity"]
  ): NutrientRow => {
    const s = sum(key);
    const avg_low = s.low / days;
    const avg_high = s.high / days;
    const t = typeof target === "number" ? target : null;
    return {
      key,
      label,
      unit,
      avg_low: round(avg_low, key === "sodium_mg" ? 0 : 1),
      avg_high: round(avg_high, key === "sodium_mg" ? 0 : 1),
      target: t,
      polarity,
      pct_of_target: t !== null && t > 0 ? Math.round((avg_high / t) * 100) : null,
    };
  };

  const nutrients: NutrientRow[] = [
    asAvg("kcal", "Calories", "kcal", profile?.daily_kcal_target, "neutral"),
    asAvg("protein_g", "Protein", "g", profile?.daily_protein_g, "want_hit"),
    asAvg("carb_g", "Carbs", "g", profile?.daily_carb_g, "neutral"),
    asAvg("fat_g", "Fat", "g", profile?.daily_fat_g, "neutral"),
    asAvg("fiber_g", "Fiber", "g", profile?.daily_fiber_g, "want_hit"),
    asAvg("sugar_g", "Sugar", "g", profile?.daily_sugar_g, "over_warn"),
    asAvg("sodium_mg", "Sodium", "mg", profile?.daily_sodium_mg, "over_warn"),
    asAvg(
      "saturated_fat_g",
      "Sat fat",
      "g",
      profile?.daily_saturated_fat_g,
      "over_warn"
    ),
  ];

  return NextResponse.json({ days, nutrients });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
