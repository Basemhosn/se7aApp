import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { ledgerAddSchema } from "@/lib/schemas/scan";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = ledgerAddSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { scan_id, source, meal_slot, items } = parsed.data;

  // If a scan_id is provided, ensure it belongs to this user before
  // letting them attach meal_items to it.
  if (scan_id) {
    const { data: scan, error } = await supabase
      .from("scans")
      .select("user_id")
      .eq("id", scan_id)
      .maybeSingle();
    if (error || !scan || scan.user_id !== user.id) {
      return NextResponse.json(
        { error: "scan_not_found_or_forbidden" },
        { status: 404 }
      );
    }
  }

  const rows = items.map((it) => ({
    user_id: user.id,
    scan_id: scan_id ?? null,
    source,
    meal_slot: meal_slot ?? null,
    name: it.name,
    portion_estimate: it.portion_estimate ?? null,
    kcal_low: it.kcal_low,
    kcal_high: it.kcal_high,
    protein_g_low: it.protein_g_low,
    protein_g_high: it.protein_g_high,
    carb_g_low: it.carb_g_low,
    carb_g_high: it.carb_g_high,
    fat_g_low: it.fat_g_low,
    fat_g_high: it.fat_g_high,
    confidence: it.confidence ?? null,
  }));

  const { data: inserted, error } = await supabase
    .from("meal_items")
    .insert(rows)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inserted: inserted?.length ?? 0 });
}
