import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * "How consistent were you last week?" — for the Progress-tab adherence
 * card. A day counts as 'logged' if the user recorded at least one
 * meal_item OR one workout_session that day.
 *
 * Honest-range branding: we compare against the ~4-day median, which is
 * approximately the observed adherence of users who reach a body-comp
 * goal (per public studies on food-tracking adherence — a placeholder
 * we can refine once we have our own beta data).
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
  const days = Math.min(60, Math.max(7, Number(searchParams.get("days") ?? 7)));

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const [mealsRes, workoutsRes] = await Promise.all([
    supabase
      .from("meal_items")
      .select("eaten_at")
      .eq("user_id", user.id)
      .gte("eaten_at", start.toISOString()),
    supabase
      .from("workout_sessions")
      .select("completed_at")
      .eq("user_id", user.id)
      .gte("completed_at", start.toISOString()),
  ]);

  const daysWithActivity = new Set<string>();
  for (const m of mealsRes.data ?? []) {
    daysWithActivity.add(m.eaten_at.slice(0, 10));
  }
  for (const w of workoutsRes.data ?? []) {
    daysWithActivity.add(w.completed_at.slice(0, 10));
  }

  const logged = daysWithActivity.size;
  const pct = Math.round((logged / days) * 100);

  const MEDIAN_DAYS_PER_WEEK = 4;
  const goalMedian = (MEDIAN_DAYS_PER_WEEK / 7) * 100;
  const comparison =
    logged === days
      ? "perfect week — everyone tracks well when they start; the trick is holding this in month two"
      : pct >= goalMedian
        ? "above the ~4-day median for people who reach their goal"
        : pct >= 50
          ? "average adherence — pushing to 5+ days a week correlates with better outcomes"
          : "under the median — most people who reach their goal log 4+ days a week";

  return NextResponse.json({
    days_window: days,
    days_logged: logged,
    percentage: pct,
    comparison,
  });
}
