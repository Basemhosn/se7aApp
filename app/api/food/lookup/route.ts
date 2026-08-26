import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  foodLookupInputSchema,
  foodLookupResultSchema,
  type FoodLookupResult,
} from "@/lib/schemas/foodLookup";
import { FOOD_LOOKUP_SYSTEM_PROMPT } from "@/lib/prompts/foodLookup.v1";
import { checkFoodLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL_ID = "claude-sonnet-4-6";

/**
 * AI-backed food macro lookup. MFP-style search for foods, restaurant
 * items, and Arabic queries. Cached in food_lookup_cache so repeat
 * queries for common items are ~10ms.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await checkFoodLimits(user.id);
  if (!rl.ok) return rateLimitedResponse(rl);

  const json = await request.json().catch(() => null);
  const parsed = foodLookupInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const queryOriginal = parsed.data.query.trim();
  const queryNormalized = normalize(queryOriginal);

  // 1. Cache
  const { data: cached } = await supabase
    .from("food_lookup_cache")
    .select("id, response, hit_count")
    .eq("query_normalized", queryNormalized)
    .maybeSingle();

  if (cached) {
    // Fire-and-forget hit tracking; don't block the response.
    supabase
      .from("food_lookup_cache")
      .update({
        hit_count: (cached.hit_count ?? 0) + 1,
        last_hit_at: new Date().toISOString(),
      })
      .eq("id", cached.id)
      .then(undefined, () => {});
    return NextResponse.json({
      ...(cached.response as FoodLookupResult),
      source: "cache",
    });
  }

  // 2. LLM
  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);

  let result: FoodLookupResult;
  try {
    const generated = await generateObject({
      model: anthropic(MODEL_ID),
      schema: foodLookupResultSchema,
      system: `${FOOD_LOOKUP_SYSTEM_PROMPT}\n\n${langInstruction}`,
      messages: [{ role: "user", content: `Look up: ${queryOriginal}` }],
      maxOutputTokens: 1200,
    });
    result = generated.object;
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }

  // 3. Cache the response (best-effort; ignore write errors so the
  // user still gets their result even if the cache write races).
  supabase
    .from("food_lookup_cache")
    .insert({
      query_normalized: queryNormalized,
      query_original: queryOriginal,
      response: result,
    })
    .then(undefined, () => {});

  return NextResponse.json({ ...result, source: "llm" });
}

function normalize(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}
