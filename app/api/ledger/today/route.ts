import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { computeRemaining, enrichWithPhotos, getDayTotals } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/**
 * Ledger for a specific day. Defaults to today; accepts ?date=YYYY-MM-DD
 * so the Home tab can page backward/forward through days without a new
 * endpoint. Path stays "today" for existing callers (mobile ledger
 * hook, dashboard page, etc.) that never pass a date.
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
  const dateParam = searchParams.get("date");
  const dateIso =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .single(),
    getDayTotals(supabase, user.id, dateIso),
  ]);

  const enrichedItems = await enrichWithPhotos(supabase, totals.items);
  const totalsWithPhotos = { ...totals, items: enrichedItems };

  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile?.daily_kcal_target ?? null,
    daily_protein_g: profile?.daily_protein_g ?? null,
    daily_carb_g: profile?.daily_carb_g ?? null,
    daily_fat_g: profile?.daily_fat_g ?? null,
  });

  return NextResponse.json({ totals: totalsWithPhotos, remaining });
}
