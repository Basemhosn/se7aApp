import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Past dishes the user has logged at a given restaurant. Powers the
 * "you liked these last time" section on the menu-scan review screen
 * so a return visit doesn't have to re-analyze the whole menu to
 * remember what was worth ordering.
 *
 * Matching: case-insensitive equality on restaurant_name. Fuzzy
 * matching (Al Baik vs AlBaik) is left to the client — it should
 * send the same tag the user confirmed when logging, so drift is
 * self-inflicted rather than server-imposed.
 *
 * Aggregation: group by lower(dish name), keep the most recent
 * kcal + macro range as the "canonical" values (user portion
 * edits are captured on that latest row), count occurrences, and
 * return the last-logged date so the client can render "3 times ·
 * last Thu" hints.
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
  const name = (searchParams.get("name") ?? "").trim();
  const limit = clamp(Number(searchParams.get("limit") ?? "6"), 1, 20);
  if (name.length === 0) {
    return NextResponse.json({ restaurant: null, dishes: [] });
  }

  // Pull up to 100 recent items at this restaurant, then group in JS.
  // 100 covers ~6-12 months of active use for a favorite spot; if a
  // user routinely exceeds that we can server-aggregate later.
  const { data, error } = await supabase
    .from("meal_items")
    .select(
      "name, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, portion_estimate, eaten_at"
    )
    .eq("user_id", user.id)
    .ilike("restaurant_name", name)
    .order("eaten_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  interface Aggregated {
    name: string;
    kcal_low: number;
    kcal_high: number;
    protein_g_low: number;
    protein_g_high: number;
    carb_g_low: number;
    carb_g_high: number;
    fat_g_low: number;
    fat_g_high: number;
    portion_estimate: string | null;
    times_logged: number;
    last_logged_at: string;
  }

  const grouped = new Map<string, Aggregated>();
  for (const row of data ?? []) {
    const dishName = String(row.name ?? "").trim();
    if (!dishName) continue;
    const key = dishName.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.times_logged += 1;
      continue;
    }
    grouped.set(key, {
      name: dishName,
      kcal_low: Number(row.kcal_low ?? 0),
      kcal_high: Number(row.kcal_high ?? 0),
      protein_g_low: Number(row.protein_g_low ?? 0),
      protein_g_high: Number(row.protein_g_high ?? 0),
      carb_g_low: Number(row.carb_g_low ?? 0),
      carb_g_high: Number(row.carb_g_high ?? 0),
      fat_g_low: Number(row.fat_g_low ?? 0),
      fat_g_high: Number(row.fat_g_high ?? 0),
      portion_estimate: row.portion_estimate as string | null,
      times_logged: 1,
      last_logged_at: row.eaten_at as string,
    });
  }

  // Sort by most-recent + times-logged (recent wins as tiebreak);
  // sliced to the requested limit.
  const dishes = [...grouped.values()]
    .sort((a, b) => {
      const dt = new Date(b.last_logged_at).getTime() -
        new Date(a.last_logged_at).getTime();
      if (dt !== 0) return dt;
      return b.times_logged - a.times_logged;
    })
    .slice(0, limit);

  return NextResponse.json({
    restaurant: name,
    dishes,
    total_visits: countUniqueDays(data ?? []),
  });
}

function countUniqueDays(
  rows: { eaten_at: unknown }[]
): number {
  const days = new Set<string>();
  for (const r of rows) {
    const iso = String(r.eaten_at ?? "").slice(0, 10);
    if (iso) days.add(iso);
  }
  return days.size;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
