import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { enrichWithPhotos, type MealItemRow } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * Distinct recent foods for the "quick re-log" UI. Dedupes by lowercase
 * name, keeps the most recent instance of each, ranks by usage frequency
 * over the last 30 days (ties broken by recency).
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
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 12)));

  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("meal_items")
    .select(
      "id, name, portion_estimate, source, confidence, eaten_at, scan_id, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high"
    )
    .eq("user_id", user.id)
    .gte("eaten_at", since.toISOString())
    .order("eaten_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  // Dedupe by lowercase name; count frequency; keep most recent representative.
  const map = new Map<
    string,
    { row: MealItemRow; count: number; last_eaten: string }
  >();
  for (const row of (data ?? []) as MealItemRow[]) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { row, count: 1, last_eaten: row.eaten_at });
    }
  }

  const ranked = [...map.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.last_eaten.localeCompare(a.last_eaten);
    })
    .slice(0, limit)
    .map((r) => ({ ...r.row, times_logged: r.count }));

  const enriched = await enrichWithPhotos(supabase, ranked);
  return NextResponse.json({ items: enriched });
}
