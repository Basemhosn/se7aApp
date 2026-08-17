import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Log streak — consecutive days a user has logged at least one meal_item.
 *
 * We derive from meal_items rather than tracking a counter, so backfills
 * and edits stay consistent. The walk stops on the first missing day.
 *
 * The client's timezone matters: we take a UTC offset in minutes so days
 * bucket by the user's local midnight, not the server's.
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
  const tzOffsetMin = clamp(
    Number(searchParams.get("tz_offset_min") ?? "0"),
    -14 * 60,
    14 * 60
  );

  // Pull up to a year of data — good enough for realistic streaks.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400);
  const { data: rows, error } = await supabase
    .from("meal_items")
    .select("eaten_at")
    .eq("user_id", user.id)
    .gte("eaten_at", cutoff.toISOString())
    .order("eaten_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  // Bucket into local-day strings using the client's tz offset.
  const days = new Set<string>();
  for (const r of rows ?? []) {
    days.add(localDayKey(new Date(r.eaten_at), tzOffsetMin));
  }

  const today = localDayKey(new Date(), tzOffsetMin);
  const yesterday = localDayKey(offsetDays(new Date(), -1), tzOffsetMin);

  // Current streak: walk backwards from today. If today isn't logged yet,
  // the streak survives as long as yesterday was logged (grace day).
  let currentDays = 0;
  let cursor = new Date();
  const todayLogged = days.has(today);
  if (!todayLogged && !days.has(yesterday)) {
    currentDays = 0;
  } else {
    if (!todayLogged) {
      cursor = offsetDays(cursor, -1);
    }
    while (days.has(localDayKey(cursor, tzOffsetMin))) {
      currentDays += 1;
      cursor = offsetDays(cursor, -1);
    }
  }

  // Longest streak: sort day keys ascending and find max consecutive run.
  const sortedDays = [...days].sort();
  let longestDays = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    if (prev == null) {
      run = 1;
    } else {
      const expected = localDayKey(offsetDaysFromKey(prev, 1), tzOffsetMin);
      run = d === expected ? run + 1 : 1;
    }
    if (run > longestDays) longestDays = run;
    prev = d;
  }

  // Days this week (Mon–Sun in user local).
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffsetMin * 60_000);
  const dow = (localNow.getUTCDay() + 6) % 7; // 0 = Monday
  let daysThisWeek = 0;
  for (let i = 0; i <= dow; i++) {
    const d = offsetDays(now, -i);
    if (days.has(localDayKey(d, tzOffsetMin))) daysThisWeek += 1;
  }

  return NextResponse.json({
    current_days: currentDays,
    longest_days: Math.max(longestDays, currentDays),
    days_this_week: daysThisWeek,
    todays_status: todayLogged ? "logged" : "not_yet",
  });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

function localDayKey(d: Date, tzOffsetMin: number): string {
  const shifted = new Date(d.getTime() + tzOffsetMin * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function offsetDays(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
}

function offsetDaysFromKey(key: string, delta: number): Date {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt;
}
