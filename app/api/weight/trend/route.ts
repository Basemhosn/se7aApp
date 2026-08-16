import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Weight + body-fat time series over the last N days (default 30, max 365).
 * Used by the dashboard trend chart.
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
  const daysParam = Number(searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysParam)
    ? Math.max(7, Math.min(365, Math.round(daysParam)))
    : 30;

  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("weight_logs")
    .select("weight_kg, body_fat_pct, logged_at")
    .eq("user_id", user.id)
    .gte("logged_at", start.toISOString())
    .order("logged_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ days, points: data ?? [] });
}
