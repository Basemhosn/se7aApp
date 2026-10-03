import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import type { NormalizedProduct } from "@/lib/openFoodFacts";

export const runtime = "nodejs";

/**
 * Save a manually-entered product to the user's pantry and return
 * a NormalizedProduct-shaped payload so the client can transition
 * straight to the review screen as if it had come from OFF.
 *
 * Users can submit macros either as per-serving (preferred — matches
 * what's on a package nutrition label) or already-per-100g. The
 * caller sends serving_size_g + per_serving macros; we convert to
 * per-100g for storage so review-screen portion scaling behaves the
 * same as OFF products. serving_size_g is kept so the first scan
 * review defaults to a sensible portion.
 */
const bodySchema = z.object({
  code: z.string().regex(/^\d{6,14}$/, "6-14 digits"),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).nullable().optional(),
  serving_size_g: z.number().positive().max(2000),
  kcal_per_serving: z.number().min(0).max(5000),
  protein_g_per_serving: z.number().min(0).max(500),
  carb_g_per_serving: z.number().min(0).max(500),
  fat_g_per_serving: z.number().min(0).max(500),
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const factor = 100 / d.serving_size_g;
  const per100 = {
    kcal: Math.round(d.kcal_per_serving * factor),
    protein_g: round1(d.protein_g_per_serving * factor),
    carb_g: round1(d.carb_g_per_serving * factor),
    fat_g: round1(d.fat_g_per_serving * factor),
  };

  const { error } = await supabase.from("user_pantry").upsert(
    {
      user_id: user.id,
      code: d.code,
      name: d.name,
      brand: d.brand ?? null,
      serving_size_g: d.serving_size_g,
      kcal_per_100g: per100.kcal,
      protein_g_per_100g: per100.protein_g,
      carb_g_per_100g: per100.carb_g,
      fat_g_per_100g: per100.fat_g,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,code" }
  );

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  const product: NormalizedProduct = {
    code: d.code,
    name: d.name,
    brand: d.brand ?? null,
    image_url: null,
    serving_size_g: d.serving_size_g,
    per_100g: per100,
    // Manual entries are high-confidence by definition — the user
    // just read the package label. OFF entries are often "medium"
    // because of crowd-sourced quality variance.
    confidence: "high",
    source: "user_pantry",
  };

  return NextResponse.json({ product, source: "user_pantry" });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
