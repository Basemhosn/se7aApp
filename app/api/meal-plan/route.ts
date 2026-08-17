import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Read the meal plan for a given week_start (Monday YYYY-MM-DD).
 * Returns { plan: null } if the user hasn't generated one yet.
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

  const { data } = await supabase
    .from("meal_plans")
    .select("plan, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  return NextResponse.json({ plan: data?.plan ?? null, meta: data ?? null });
}
