import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface DaySummary {
  date: string; // YYYY-MM-DD
  kcal_low: number;
  kcal_high: number;
  meals: number;
  workout: boolean;
  weight_kg: number | null;
  water_ml: number;
}

/**
 * Per-day activity summary for a calendar-month grid. Returns 28-31 rows.
 * Kept lightweight — for a specific day's details, hit /api/calendar/day.
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
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month")); // 1-12
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "invalid_input", details: "year and month (1-12) required" },
      { status: 400 }
    );
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const [mealsRes, workoutsRes, weightsRes, waterRes] = await Promise.all([
    supabase
      .from("meal_items")
      .select("eaten_at, kcal_low, kcal_high")
      .eq("user_id", user.id)
      .gte("eaten_at", monthStart.toISOString())
      .lt("eaten_at", monthEnd.toISOString()),
    supabase
      .from("workout_sessions")
      .select("completed_at")
      .eq("user_id", user.id)
      .gte("completed_at", monthStart.toISOString())
      .lt("completed_at", monthEnd.toISOString()),
    supabase
      .from("weight_logs")
      .select("logged_at, weight_kg")
      .eq("user_id", user.id)
      .gte("logged_at", monthStart.toISOString())
      .lt("logged_at", monthEnd.toISOString()),
    supabase
      .from("water_logs")
      .select("logged_at, ml")
      .eq("user_id", user.id)
      .gte("logged_at", monthStart.toISOString())
      .lt("logged_at", monthEnd.toISOString()),
  ]);

  const days = new Map<string, DaySummary>();
  const key = (iso: string) => iso.slice(0, 10);
  const bump = (k: string): DaySummary => {
    let d = days.get(k);
    if (!d) {
      d = {
        date: k,
        kcal_low: 0,
        kcal_high: 0,
        meals: 0,
        workout: false,
        weight_kg: null,
        water_ml: 0,
      };
      days.set(k, d);
    }
    return d;
  };

  for (const m of mealsRes.data ?? []) {
    const d = bump(key(m.eaten_at));
    d.kcal_low += m.kcal_low;
    d.kcal_high += m.kcal_high;
    d.meals += 1;
  }
  for (const w of workoutsRes.data ?? []) {
    bump(key(w.completed_at)).workout = true;
  }
  for (const w of weightsRes.data ?? []) {
    const d = bump(key(w.logged_at));
    d.weight_kg = Number(w.weight_kg);
  }
  for (const w of waterRes.data ?? []) {
    bump(key(w.logged_at)).water_ml += w.ml;
  }

  return NextResponse.json({
    year,
    month,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
}
