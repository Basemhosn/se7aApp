import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Last-7-day energy summary: consumed (sum of meal_items midpoint
 * kcal) and burned (daily_activity.active_kcal + cardio kcal_burned)
 * per day, oldest → newest. Powers Progress' Weekly Energy stacked
 * bars.
 *
 * The optional `week_offset` param lets the client page back a week
 * at a time (0 = current week, 1 = last week, …), matching the
 * "This wk / Last wk / 2 wk ago / 3 wk ago" selector pattern.
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
  const weekOffset = Math.max(
    0,
    Math.min(12, Number(searchParams.get("week_offset") ?? 0))
  );

  // Build the 7-day local window ending today (minus week_offset weeks).
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - weekOffset * 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // 7 days inclusive
  const startIso = start.toISOString();
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const endIso = endExclusive.toISOString();

  const localDayKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [mealsRes, activityRes, cardioRes] = await Promise.all([
    supabase
      .from("meal_items")
      .select("eaten_at, kcal_low, kcal_high")
      .eq("user_id", user.id)
      .gte("eaten_at", startIso)
      .lt("eaten_at", endIso),
    supabase
      .from("daily_activity")
      .select("day, active_kcal")
      .eq("user_id", user.id)
      .gte("day", localDayKey(start))
      .lte("day", localDayKey(end)),
    supabase
      .from("cardio_sessions")
      .select("started_at, kcal_burned")
      .eq("user_id", user.id)
      .gte("started_at", startIso)
      .lt("started_at", endIso),
  ]);

  const consumedByDay = new Map<string, number>();
  for (const m of (mealsRes.data ?? []) as {
    eaten_at: string;
    kcal_low: number;
    kcal_high: number;
  }[]) {
    const key = localDayKey(new Date(m.eaten_at));
    const mid = (Number(m.kcal_low) + Number(m.kcal_high)) / 2;
    consumedByDay.set(key, (consumedByDay.get(key) ?? 0) + mid);
  }
  const activeByDay = new Map<string, number>();
  for (const a of (activityRes.data ?? []) as {
    day: string;
    active_kcal: number | null;
  }[]) {
    activeByDay.set(a.day, Number(a.active_kcal ?? 0));
  }
  const cardioByDay = new Map<string, number>();
  for (const c of (cardioRes.data ?? []) as {
    started_at: string;
    kcal_burned: number | null;
  }[]) {
    if (c.kcal_burned == null) continue;
    const key = localDayKey(new Date(c.started_at));
    cardioByDay.set(key, (cardioByDay.get(key) ?? 0) + Number(c.kcal_burned));
  }

  // Walk the 7-day window, emitting one row per day. Dense output
  // keeps the client's chart math trivial.
  const days: {
    day: string;
    consumed_kcal: number;
    burned_kcal: number;
  }[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 7; i++) {
    const key = localDayKey(cursor);
    days.push({
      day: key,
      consumed_kcal: Math.round(consumedByDay.get(key) ?? 0),
      burned_kcal: Math.round(
        (activeByDay.get(key) ?? 0) + (cardioByDay.get(key) ?? 0)
      ),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json({ week_offset: weekOffset, days });
}
