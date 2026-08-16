import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * "Is today a rest day or lift day?" for the dashboard's calorie-cycling
 * banner. A lift day means the user completed at least one workout today.
 * If they haven't yet but the program schedules one, we still treat it as
 * lift day (encourages them to actually do it and avoids showing a low
 * calorie budget on training days).
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

  const [profileRes, sessionsRes, programRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("daily_kcal_target, rest_day_kcal_delta")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("completed_at", start.toISOString()),
    supabase
      .from("user_programs")
      .select("program_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const base = profileRes.data?.daily_kcal_target ?? null;
  const delta = profileRes.data?.rest_day_kcal_delta ?? 0;
  const workoutsToday = sessionsRes.count ?? 0;
  const hasProgram = !!programRes.data;

  const kind: "lift" | "rest" | "none" =
    workoutsToday > 0 ? "lift" : hasProgram ? "rest" : "none";

  const adjustedTarget =
    base != null && kind === "rest" && delta !== 0 ? base + delta : base;

  return NextResponse.json({
    kind,
    workouts_today: workoutsToday,
    base_target: base,
    delta_applied: kind === "rest" ? delta : 0,
    adjusted_target: adjustedTarget,
  });
}
