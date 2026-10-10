import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";
import {
  plannedMealSchema,
  regenerateMealSchema,
  type MealPlanResult,
  type PlannedMeal,
} from "@/lib/schemas/mealPlan";
import { MEAL_PLAN_SYSTEM_PROMPT } from "@/lib/prompts/mealPlan.v1";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { requirePro } from "@/lib/entitlement";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";
// Single-meal regen is ~5-15s on Haiku vs 30-60s for the full week.
// Shorter maxDuration keeps the UI responsive without over-reserving.
export const maxDuration = 60;

const MODEL_ID = "claude-haiku-4-5";

/**
 * Regenerate exactly one meal in an existing week plan. Used when a
 * user doesn't want eggs for the 4th day — they tap "Regenerate" on
 * a planned meal and get a fresh alternative that matches the same
 * macro budget. Everything else in the plan is untouched.
 *
 * Flow:
 *   1. Fetch the stored meal_plans row for the week
 *   2. Locate the (day_of_week, slot) meal and read its macro ranges
 *   3. Prompt Claude with an "alternative to this meal" instruction —
 *      pass the original name/portion so the model avoids repeating,
 *      and the macro budget so the alternative fits the day
 *   4. Validate against plannedMealSchema and splice back into the
 *      plan at the same (day, slot) index
 *   5. Upsert the plan
 *
 * Pro-gated like /generate. Shares the rate limiter.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gated = await requirePro(supabase, user.id, "meal_plan");
  if (gated) return gated;

  const rl = await checkScanLimits(user.id);
  if (!rl.ok) return rateLimitedResponse(rl);

  const json = await request.json().catch(() => null);
  const parsed = regenerateMealSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("allergies, excluded_ingredients, daily_kcal_target")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.daily_kcal_target) {
    return NextResponse.json(
      { error: "onboarding_incomplete" },
      { status: 412 }
    );
  }

  const { data: planRow } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", user.id)
    .eq("week_start", parsed.data.week_start)
    .maybeSingle();
  if (!planRow?.plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const plan = planRow.plan as MealPlanResult;
  const dayEntry = plan.days.find(
    (d) => d.day_of_week === parsed.data.day_of_week
  );
  if (!dayEntry) {
    return NextResponse.json({ error: "day_not_in_plan" }, { status: 404 });
  }
  const mealIdx = dayEntry.meals.findIndex((m) => m.slot === parsed.data.slot);
  if (mealIdx === -1) {
    return NextResponse.json({ error: "slot_not_in_day" }, { status: 404 });
  }
  const original = dayEntry.meals[mealIdx]!;

  // Macro budget — use the midpoint of the original's ranges so the
  // replacement lands in roughly the same calorie band. Allowing ±15%
  // gives the model enough room for a genuinely different dish
  // without blowing the day's total.
  const kcalMid = Math.round((original.kcal_low + original.kcal_high) / 2);
  const pMid = Math.round(
    (original.protein_g_low + original.protein_g_high) / 2
  );
  const cMid = Math.round((original.carb_g_low + original.carb_g_high) / 2);
  const fMid = Math.round((original.fat_g_low + original.fat_g_high) / 2);

  const allergies = Array.isArray(profile.allergies)
    ? (profile.allergies as string[])
    : [];
  const excluded = Array.isArray(profile.excluded_ingredients)
    ? (profile.excluded_ingredients as string[])
    : [];

  const userMsg = `
Give me ONE alternative ${original.slot} meal.

The user doesn't want this current option:
  Name: ${original.name}
  Portion: ${original.portion}
  Macros: ${kcalMid} kcal · ${pMid}g P · ${cMid}g C · ${fMid}g F

Rules for the alternative:
- Must be a genuinely different dish — don't just rename the same thing
- Target the same macro band (±15%): ~${kcalMid} kcal, ~${pMid}g P, ~${cMid}g C, ~${fMid}g F
- Same meal slot: ${original.slot}
- Include ingredients list so it can roll into the shopping list
${allergies.length ? `- ⚠️ ALLERGIES (HARD NO — never include, even trace amounts): ${allergies.join(", ")}` : ""}
${excluded.length ? `- Excluded ingredients (user preference — do not use): ${excluded.join(", ")}` : ""}

Return exactly one meal object.
`.trim();

  const locale = localeFromRequest(request);

  let fresh: PlannedMeal;
  try {
    const result = await generateObject({
      model: anthropic(MODEL_ID),
      schema: plannedMealSchema,
      system: `${MEAL_PLAN_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
      messages: [{ role: "user", content: userMsg }],
      maxOutputTokens: 1500,
    });
    fresh = result.object as PlannedMeal;
  } catch (e) {
    return apiError({
      route: "meal-plan/regenerate-meal",
      stage: "ai_generate",
      status: 502,
      body: { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      error: e,
    });
  }

  // Preserve the slot even if the model's output happened to pick a
  // different value — the user already said what slot they want.
  fresh.slot = original.slot;

  // Splice back into the plan at the same (day, slot) index.
  const updatedDays = plan.days.map((d) => {
    if (d.day_of_week !== parsed.data.day_of_week) return d;
    const nextMeals = d.meals.slice();
    nextMeals[mealIdx] = fresh;
    return { ...d, meals: nextMeals };
  });
  const updatedPlan: MealPlanResult = { ...plan, days: updatedDays };

  const { error: upsertErr } = await supabase
    .from("meal_plans")
    .upsert(
      {
        user_id: user.id,
        week_start: parsed.data.week_start,
        plan: updatedPlan,
      },
      { onConflict: "user_id,week_start" }
    );
  if (upsertErr) {
    return NextResponse.json(
      { error: "persist_failed", details: upsertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ meal: fresh });
}
