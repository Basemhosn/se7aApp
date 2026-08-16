import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Sum of today's water_logs plus recommended target based on current weight.
 * Target formula: 30 ml per kg of bodyweight, rounded to the nearest 250 ml.
 * Common heuristic; users can override in a future setting.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [logsRes, profileRes] = await Promise.all([
    supabase
      .from("water_logs")
      .select("ml, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", start.toISOString())
      .order("logged_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("weight_kg")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const logs = logsRes.data ?? [];
  const total_ml = logs.reduce((sum, l) => sum + l.ml, 0);
  const weight_kg = profileRes.data?.weight_kg;
  const target_ml = weight_kg
    ? Math.round((Number(weight_kg) * 30) / 250) * 250
    : 2500;

  return NextResponse.json({ total_ml, target_ml, entries: logs.length });
}
