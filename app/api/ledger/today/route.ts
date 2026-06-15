import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { computeRemaining, getTodayTotals } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .single(),
    getTodayTotals(supabase, user.id),
  ]);

  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile?.daily_kcal_target ?? null,
    daily_protein_g: profile?.daily_protein_g ?? null,
    daily_carb_g: profile?.daily_carb_g ?? null,
    daily_fat_g: profile?.daily_fat_g ?? null,
  });

  return NextResponse.json({ totals, remaining });
}
