import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Macro = "kcal" | "protein" | "carb" | "fat";

interface Aggregated {
  name: string;
  total_low: number;
  total_high: number;
  times_logged: number;
  last_logged_at: string;
  avg_per_serving_low: number;
  avg_per_serving_high: number;
}

/**
 * Top foods by macro contribution over a lookback window.
 *
 * "Which foods are driving my calories/protein/carbs/fat?" — actionable
 * for coaching: users often can't guess that foul or laban is 25% of
 * their fat budget until they see it broken out.
 *
 * Aggregation is done in JS after pulling raw rows because Supabase's
 * client doesn't do GROUP BY cleanly, and a 30-90 day window per user
 * is a few hundred rows max — cheaper than a stored function.
 *
 * Group key is `lower(name)` — same normalization pattern the
 * /api/restaurants/dishes endpoint uses. Display name is the most
 * recent variant (so "Chicken Kabsa" wins over "chicken kabsa").
 *
 * Ranking is by `total_high` — the top of each item's honest range.
 * The list shows the mid-range value to the user (matches the rest of
 * the app's honest-ranges brand: `340–420 kcal`).
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
  const days = clamp(Number(searchParams.get("days") ?? "30"), 7, 365);
  const macro = (searchParams.get("macro") ?? "kcal") as Macro;
  const limit = clamp(Number(searchParams.get("limit") ?? "5"), 1, 20);
  if (!isMacro(macro)) {
    return NextResponse.json({ error: "invalid_macro" }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const columns = macroColumns(macro);
  // Static literal select — Supabase's typed .select() rejects
  // interpolated column names because it parses the string at
  // compile time. Cheaper to pull the whole macro row (small) than
  // fight the parser.
  const { data, error } = await supabase
    .from("meal_items")
    .select(
      "name, eaten_at, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high"
    )
    .eq("user_id", user.id)
    .gte("eaten_at", since.toISOString())
    .order("eaten_at", { ascending: false })
    .limit(1500);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  const grouped = new Map<string, Aggregated>();
  for (const row of data ?? []) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const low = Number(
      (row as unknown as Record<string, unknown>)[columns.low] ?? 0
    );
    const high = Number(
      (row as unknown as Record<string, unknown>)[columns.high] ?? 0
    );
    if (low === 0 && high === 0) continue;
    const key = name.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.total_low += low;
      existing.total_high += high;
      existing.times_logged += 1;
      // rows come DESC by eaten_at so first one wins as "canonical" name
      continue;
    }
    grouped.set(key, {
      name,
      total_low: low,
      total_high: high,
      times_logged: 1,
      last_logged_at: row.eaten_at as string,
      avg_per_serving_low: 0,
      avg_per_serving_high: 0,
    });
  }

  const sorted = [...grouped.values()]
    .map((a) => ({
      ...a,
      avg_per_serving_low: a.total_low / a.times_logged,
      avg_per_serving_high: a.total_high / a.times_logged,
    }))
    .sort((a, b) => b.total_high - a.total_high)
    .slice(0, limit);

  // Total across all rows for the "X% of your Y" context on the client.
  const totalHigh = [...grouped.values()].reduce(
    (s, a) => s + a.total_high,
    0
  );

  return NextResponse.json({
    days,
    macro,
    unit: macro === "kcal" ? "kcal" : "g",
    total_all: Math.round(totalHigh),
    foods: sorted.map((a) => ({
      name: a.name,
      total_low: Math.round(a.total_low),
      total_high: Math.round(a.total_high),
      times_logged: a.times_logged,
      last_logged_at: a.last_logged_at,
      avg_per_serving_low: Math.round(a.avg_per_serving_low * 10) / 10,
      avg_per_serving_high: Math.round(a.avg_per_serving_high * 10) / 10,
      share_pct: totalHigh > 0
        ? Math.round((a.total_high / totalHigh) * 100)
        : 0,
    })),
  });
}

function macroColumns(m: Macro): { low: string; high: string } {
  switch (m) {
    case "kcal":
      return { low: "kcal_low", high: "kcal_high" };
    case "protein":
      return { low: "protein_g_low", high: "protein_g_high" };
    case "carb":
      return { low: "carb_g_low", high: "carb_g_high" };
    case "fat":
      return { low: "fat_g_low", high: "fat_g_high" };
  }
}

function isMacro(v: string): v is Macro {
  return v === "kcal" || v === "protein" || v === "carb" || v === "fat";
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
