import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { logPlanMealSchema, type PlannedMeal } from "@/lib/schemas/mealPlan";

export const runtime = "nodejs";

/**
 * Mark a planned meal as eaten. Writes the meal to meal_items (source=
 * "manual", tagged with the plan slot) and back-populates the plan's
 * meal.logged_meal_item_id so the UI can render it as done.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = logPlanMealSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { week_start, day_of_week, slot } = parsed.data;

  const { data: row } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", user.id)
    .eq("week_start", week_start)
    .maybeSingle();

  const plan = row?.plan as
    | { days: { day_of_week: number; meals: PlannedMeal[] }[] }
    | undefined;
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const day = plan.days.find((d) => d.day_of_week === day_of_week);
  const meal = day?.meals.find((m) => m.slot === slot);
  if (!meal) {
    return NextResponse.json({ error: "meal_not_found" }, { status: 404 });
  }
  if (meal.logged_meal_item_id) {
    return NextResponse.json(
      { error: "already_logged", details: "This meal is already logged." },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("meal_items")
    .insert({
      user_id: user.id,
      source: "manual",
      meal_slot: slot,
      name: meal.name,
      portion_estimate: meal.portion,
      kcal_low: meal.kcal_low,
      kcal_high: meal.kcal_high,
      protein_g_low: meal.protein_g_low,
      protein_g_high: meal.protein_g_high,
      carb_g_low: meal.carb_g_low,
      carb_g_high: meal.carb_g_high,
      fat_g_low: meal.fat_g_low,
      fat_g_high: meal.fat_g_high,
      // Carry planner-estimated micros through (nulls for legacy plans
      // generated before mealPlan.v3_micros landed).
      sodium_mg_low: meal.sodium_mg_low ?? null,
      sodium_mg_high: meal.sodium_mg_high ?? null,
      fiber_g_low: meal.fiber_g_low ?? null,
      fiber_g_high: meal.fiber_g_high ?? null,
      sugar_g_low: meal.sugar_g_low ?? null,
      sugar_g_high: meal.sugar_g_high ?? null,
      saturated_fat_g_low: meal.saturated_fat_g_low ?? null,
      saturated_fat_g_high: meal.saturated_fat_g_high ?? null,
      confidence: "high",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: "persist_failed", details: insertErr?.message },
      { status: 500 }
    );
  }

  // Back-populate the plan so UI can reflect eaten state.
  meal.logged_meal_item_id = inserted.id;
  const { error: updateErr } = await supabase
    .from("meal_plans")
    .update({ plan, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("week_start", week_start);

  if (updateErr) {
    return NextResponse.json(
      { error: "plan_update_failed", details: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, meal_item_id: inserted.id });
}
