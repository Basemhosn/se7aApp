import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  mealSuggestionResultSchema,
  suggestMealsSchema,
} from "@/lib/schemas/mealSuggest";
import { MEAL_SUGGEST_SYSTEM_PROMPT } from "@/lib/prompts/mealSuggest.v1";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { computeRemaining, getDayTotals } from "@/lib/ledger";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";
import { localDateIso, tzOffsetFromRequest } from "@/lib/tz";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL_ID = "claude-sonnet-4-6";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await checkScanLimits(user.id);
  if (!rl.ok) return rateLimitedResponse(rl);

  const json = await request.json().catch(() => null);
  const parsed = suggestMealsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tzOffsetMin = tzOffsetFromRequest(request);
  const dateIso =
    typeof tzOffsetMin === "number"
      ? localDateIso(new Date(), tzOffsetMin)
      : undefined;
  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, goal, injuries"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    getDayTotals(supabase, user.id, dateIso, tzOffsetMin),
  ]);

  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile?.daily_kcal_target ?? null,
    daily_protein_g: profile?.daily_protein_g ?? null,
    daily_carb_g: profile?.daily_carb_g ?? null,
    daily_fat_g: profile?.daily_fat_g ?? null,
  });

  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);

  const restrictions = parsed.data.restrictions ?? [];
  const userMsg = `
The user is filling their ${parsed.data.meal_slot} slot.

Remaining today (ranges):
- kcal: ${remaining.kcal.low}–${remaining.kcal.high}
- protein: ${remaining.protein_g.low}–${remaining.protein_g.high} g
- carbs: ${remaining.carb_g.low}–${remaining.carb_g.high} g
- fat: ${remaining.fat_g.low}–${remaining.fat_g.high} g

Goal: ${profile?.goal ?? "unknown"}
Dietary restrictions: ${restrictions.length ? restrictions.join(", ") : "none"}

Suggest 3 dishes for ${parsed.data.meal_slot} that fit this budget.
`.trim();

  try {
    const result = await generateObject({
      model: anthropic(MODEL_ID),
      schema: mealSuggestionResultSchema,
      messages: [
        {
          role: "system",
          content: `${MEAL_SUGGEST_SYSTEM_PROMPT}\n\n${langInstruction}`,
        },
        { role: "user", content: userMsg },
      ],
      maxOutputTokens: 900,
    });

    return NextResponse.json({
      ok: true,
      remaining,
      ...result.object,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }
}
