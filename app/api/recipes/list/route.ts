import { NextResponse } from "next/server";
import { RECIPES } from "@/lib/recipes/catalog";
import type { MealCategory } from "@/lib/recipes/types";

export const runtime = "nodejs";

/**
 * Public catalog of the curated Gulf recipes. Filterable by category.
 * Cache-friendly — this is code-owned static content that only changes
 * on deploy.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as MealCategory | null;

  const recipes = category
    ? RECIPES.filter((r) => r.category === category)
    : RECIPES;

  return NextResponse.json(
    { recipes },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    }
  );
}
