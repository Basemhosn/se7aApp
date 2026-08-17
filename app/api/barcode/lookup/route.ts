import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { checkBarcodeLimits, rateLimitedResponse } from "@/lib/ratelimit";
import {
  fetchProductByBarcode,
  type NormalizedProduct,
} from "@/lib/openFoodFacts";

export const runtime = "nodejs";

/**
 * Barcode lookup — cached hit-or-fetch.
 *
 * 1. Check the barcode_products cache. If present + fresh (< 30 days),
 *    return it and skip the network call.
 * 2. Otherwise hit Open Food Facts, normalize, upsert cache, return.
 *
 * Not-found is a legitimate response — we return 404 with a clear
 * error so the UI can offer "add manually" as a fallback path.
 */
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim();
  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json(
      { error: "invalid_input", details: "code must be 6–14 digits" },
      { status: 400 }
    );
  }

  const limit = await checkBarcodeLimits(user.id);
  if (!limit.ok) return rateLimitedResponse(limit);

  // 1. Cache
  const { data: cached } = await supabase
    .from("barcode_products")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      product: fromCacheRow(cached),
      source: "cache",
    });
  }

  // 2. Fetch OFF
  const fetched = await fetchProductByBarcode(code);
  if (!fetched) {
    return NextResponse.json(
      {
        error: "not_found",
        details:
          "This barcode isn't in Open Food Facts yet. Add it manually and we'll remember it.",
      },
      { status: 404 }
    );
  }

  // 3. Upsert cache
  await supabase.from("barcode_products").upsert(
    {
      code: fetched.code,
      name: fetched.name,
      brand: fetched.brand,
      image_url: fetched.image_url,
      serving_size_g: fetched.serving_size_g,
      kcal_per_100g: fetched.per_100g.kcal,
      protein_g_per_100g: fetched.per_100g.protein_g,
      carb_g_per_100g: fetched.per_100g.carb_g,
      fat_g_per_100g: fetched.per_100g.fat_g,
      confidence: fetched.confidence,
      source: fetched.source,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "code" }
  );

  return NextResponse.json({ product: fetched, source: "off" });
}

interface CacheRow {
  code: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  serving_size_g: number | null;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  carb_g_per_100g: number;
  fat_g_per_100g: number;
  confidence: "low" | "medium" | "high";
  source: string;
  fetched_at: string;
}

function fromCacheRow(row: CacheRow): NormalizedProduct {
  return {
    code: row.code,
    name: row.name,
    brand: row.brand,
    image_url: row.image_url,
    serving_size_g: row.serving_size_g,
    per_100g: {
      kcal: Number(row.kcal_per_100g),
      protein_g: Number(row.protein_g_per_100g),
      carb_g: Number(row.carb_g_per_100g),
      fat_g: Number(row.fat_g_per_100g),
    },
    confidence: row.confidence,
    source: "off",
  };
}
