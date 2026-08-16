import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Full detail for a single day: meal items, workout sessions, weight, water.
 * Called when the user taps a day cell in the calendar month grid.
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
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "invalid_input", details: "date=YYYY-MM-DD required" },
      { status: 400 }
    );
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [mealsRes, workoutsRes, weightsRes, waterRes] = await Promise.all([
    supabase
      .from("meal_items")
      .select(
        "id, eaten_at, source, meal_slot, name, portion_estimate, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, confidence"
      )
      .eq("user_id", user.id)
      .gte("eaten_at", dayStart.toISOString())
      .lt("eaten_at", dayEnd.toISOString())
      .order("eaten_at", { ascending: true }),
    supabase
      .from("workout_sessions")
      .select("id, session_name, exercises, duration_min, completed_at")
      .eq("user_id", user.id)
      .gte("completed_at", dayStart.toISOString())
      .lt("completed_at", dayEnd.toISOString())
      .order("completed_at", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("id, weight_kg, body_fat_pct, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", dayStart.toISOString())
      .lt("logged_at", dayEnd.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("water_logs")
      .select("id, ml, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", dayStart.toISOString())
      .lt("logged_at", dayEnd.toISOString())
      .order("logged_at", { ascending: true }),
  ]);

  return NextResponse.json({
    date,
    meals: mealsRes.data ?? [],
    workouts: workoutsRes.data ?? [],
    weights: weightsRes.data ?? [],
    water: waterRes.data ?? [],
  });
}
