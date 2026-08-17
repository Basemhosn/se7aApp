import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import type { PlannedMeal } from "@/lib/schemas/mealPlan";

export const runtime = "nodejs";

/**
 * Aggregate every ingredient across the week's meal plan into one
 * shopping list. Deduplicates by lowercase name and preserves each
 * source quantity so users see "chicken thigh — 180 g × 4 meals" and
 * can gauge portion.
 *
 * No smart unit-conversion yet (kg + tbsp + cups don't cleanly sum);
 * we group identical strings and count occurrences instead. Good
 * enough for v0 — users mentally do the "buy about 800 g of chicken."
 *
 * Also groups items into rough categories (produce, protein, dairy,
 * pantry, other) via a keyword match to make the list scannable at
 * a grocery store.
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
  const weekStart = searchParams.get("week_start");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json(
      { error: "invalid_input", details: "week_start=YYYY-MM-DD required" },
      { status: 400 }
    );
  }

  const { data: row } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  const plan = row?.plan as
    | { days: { day_of_week: number; meals: PlannedMeal[] }[] }
    | undefined;
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Aggregate across all meals — dedupe by lowercase name, collect qtys.
  const byName = new Map<
    string,
    { name: string; occurrences: number; qtys: string[] }
  >();
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients ?? []) {
        const key = ing.name.trim().toLowerCase();
        if (!key) continue;
        const existing = byName.get(key);
        if (existing) {
          existing.occurrences += 1;
          existing.qtys.push(ing.qty);
        } else {
          byName.set(key, {
            name: ing.name.trim(),
            occurrences: 1,
            qtys: [ing.qty],
          });
        }
      }
    }
  }

  const items = [...byName.values()].map((it) => ({
    name: it.name,
    quantity_summary:
      it.occurrences === 1
        ? it.qtys[0]!
        : `${it.qtys[0]} × ${it.occurrences} meals`,
    category: categorize(it.name),
  }));

  // Group by category, order categories by grocery aisle logic.
  const CATEGORY_ORDER = [
    "produce",
    "protein",
    "dairy",
    "grain",
    "pantry",
    "spice",
    "other",
  ] as const;
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category]!.push(item);
  }
  const ordered = CATEGORY_ORDER.flatMap((cat) =>
    grouped[cat] ? [{ category: cat, items: grouped[cat] }] : []
  );

  return NextResponse.json({
    week_start: weekStart,
    total_items: items.length,
    groups: ordered,
  });
}

function categorize(name: string): string {
  const n = name.toLowerCase();
  const has = (words: string[]) => words.some((w) => n.includes(w));

  if (
    has([
      "chicken",
      "beef",
      "lamb",
      "fish",
      "hammour",
      "salmon",
      "shrimp",
      "prawn",
      "egg",
      "meat",
      "kofta",
      "shawarma",
      "kabab",
      "kebab",
    ])
  )
    return "protein";
  if (
    has([
      "yogurt",
      "labneh",
      "milk",
      "cheese",
      "halloumi",
      "feta",
      "cream",
      "butter",
      "ghee",
    ])
  )
    return "dairy";
  if (
    has([
      "tomato",
      "onion",
      "cucumber",
      "lettuce",
      "parsley",
      "cilantro",
      "coriander",
      "mint",
      "lemon",
      "lime",
      "garlic",
      "pepper",
      "chili",
      "carrot",
      "potato",
      "eggplant",
      "zucchini",
      "spinach",
      "apple",
      "banana",
      "date",
      "orange",
      "avocado",
    ])
  )
    return "produce";
  if (
    has([
      "rice",
      "bread",
      "khubz",
      "pita",
      "wrap",
      "dough",
      "flour",
      "vermicelli",
      "pasta",
      "wheat",
      "oat",
      "freekeh",
      "bulgur",
    ])
  )
    return "grain";
  if (
    has([
      "cumin",
      "cardamom",
      "cinnamon",
      "saffron",
      "baharat",
      "hawaij",
      "zaatar",
      "sumac",
      "loomi",
      "spice",
      "paprika",
      "turmeric",
    ])
  )
    return "spice";
  if (
    has([
      "oil",
      "olive oil",
      "tahini",
      "hummus",
      "chickpea",
      "bean",
      "fava",
      "lentil",
      "syrup",
      "sugar",
      "salt",
      "vinegar",
      "sauce",
      "yeast",
      "coffee",
      "tea",
    ])
  )
    return "pantry";
  return "other";
}
