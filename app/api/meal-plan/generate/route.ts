import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  generatePlanSchema,
  mealPlanResultSchema,
} from "@/lib/schemas/mealPlan";
import { MEAL_PLAN_SYSTEM_PROMPT } from "@/lib/prompts/mealPlan.v1";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { requirePro } from "@/lib/entitlement";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL_ID = "claude-sonnet-4-6";

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
  const parsed = generatePlanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, goal, rest_day_kcal_delta, days_per_week"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.daily_kcal_target) {
    return NextResponse.json(
      { error: "onboarding_incomplete" },
      { status: 412 }
    );
  }

  const restrictions = parsed.data.restrictions ?? [];
  const userMsg = `
Build a 7-day meal plan starting Monday ${parsed.data.week_start}.

Daily targets (aim to hit these ±10% per day):
- kcal: ${profile.daily_kcal_target}
- protein: ${profile.daily_protein_g} g
- carbs: ${profile.daily_carb_g} g
- fat: ${profile.daily_fat_g} g

Goal: ${profile.goal ?? "unknown"}
Rest-day delta: ${profile.rest_day_kcal_delta ?? 0} kcal (apply on non-training days)
Training days per week: ${profile.days_per_week ?? "unknown"}
Dietary restrictions: ${restrictions.length ? restrictions.join(", ") : "none"}

3 main meals a day + optional snack. Include ingredients per meal so we
can compile a shopping list from the plan.
`.trim();

  const locale = localeFromRequest(request);

  let planObject;
  try {
    const result = await generateObject({
      model: anthropic(MODEL_ID),
      schema: mealPlanResultSchema,
      messages: [
        {
          role: "system",
          content: `${MEAL_PLAN_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
        },
        { role: "user", content: userMsg },
      ],
      maxOutputTokens: 4000,
    });
    planObject = result.object;
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }

  const { error: upsertErr } = await supabase.from("meal_plans").upsert(
    {
      user_id: user.id,
      week_start: parsed.data.week_start,
      plan: planObject,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" }
  );

  if (upsertErr) {
    return NextResponse.json(
      { error: "persist_failed", details: upsertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, plan: planObject });
}
