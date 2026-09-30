import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cardio summary for a given day — session totals plus the day's
 * activity counters (steps + active energy) from HealthKit / Health
 * Connect auto-import. Defaults to today; pass `?day=YYYY-MM-DD` for
 * a past or future day (Home uses this when the user swipes to a
 * previous date).
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dayParam = url.searchParams.get("day");
  const dayValid = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam);

  const startOfDay = new Date();
  if (dayValid) {
    const [y, m, d] = dayParam.split("-").map(Number);
    startOfDay.setFullYear(y, m - 1, d);
  }
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const dayKey = `${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, "0")}-${String(startOfDay.getDate()).padStart(2, "0")}`;

  const [sessionsRes, activityRes] = await Promise.all([
    supabase
      .from("cardio_sessions")
      .select("id, kind, started_at, duration_min, distance_km, kcal_burned")
      .eq("user_id", user.id)
      .gte("started_at", startOfDay.toISOString())
      .lt("started_at", endOfDay.toISOString())
      .order("started_at", { ascending: false }),
    supabase
      .from("daily_activity")
      .select("steps, active_kcal")
      .eq("user_id", user.id)
      .eq("day", dayKey)
      .maybeSingle(),
  ]);

  const sessions = sessionsRes.data ?? [];
  const totals = sessions.reduce(
    (acc, s) => {
      acc.duration_min += Number(s.duration_min ?? 0);
      acc.distance_km += Number(s.distance_km ?? 0);
      acc.kcal_burned += Number(s.kcal_burned ?? 0);
      return acc;
    },
    { duration_min: 0, distance_km: 0, kcal_burned: 0 }
  );

  return NextResponse.json({
    sessions,
    totals: {
      duration_min: Math.round(totals.duration_min),
      distance_km: Math.round(totals.distance_km * 10) / 10,
      kcal_burned: Math.round(totals.kcal_burned),
    },
    activity: {
      steps: activityRes.data?.steps ?? 0,
      active_kcal: activityRes.data?.active_kcal ?? 0,
    },
  });
}
