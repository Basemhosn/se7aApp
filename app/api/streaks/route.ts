import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { isoDay, localDayKey } from "@/lib/dateKeys";

export const runtime = "nodejs";

/**
 * Log streak — consecutive days a user has logged at least one meal_item.
 * A "freeze" (streak_freezes row) counts as a covered day, so the walk
 * doesn't break on frozen days.
 *
 * We derive from meal_items + freezes rather than tracking a counter,
 * so backfills and edits stay consistent.
 *
 * The client's timezone matters: we take a UTC offset in minutes so days
 * bucket by the user's local midnight, not the server's.
 */
export const MONTHLY_FREEZE_BUDGET = 2;
export const FREEZE_MAX_BACKDATE_DAYS = 3; // freeze allowed for up to N calendar days ago

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
  const startOfMonth = firstOfMonthLocal(new Date(), tzOffsetMin);

  const [mealsRes, freezesRes, monthUsedRes] = await Promise.all([
    supabase
      .from("meal_items")
      .select("eaten_at")
      .eq("user_id", user.id)
      .gte("eaten_at", cutoff.toISOString())
      .order("eaten_at", { ascending: false }),
    supabase
      .from("streak_freezes")
      .select("freeze_date")
      .eq("user_id", user.id)
      .gte("freeze_date", isoDay(cutoff)),
    supabase
      .from("streak_freezes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth.toISOString()),
  ]);

  if (mealsRes.error) {
    return NextResponse.json(
      { error: "load_failed", details: mealsRes.error.message },
      { status: 500 }
    );
  }

  // Bucket logged days into local-day strings using the client's tz offset.
  const loggedDays = new Set<string>();
  for (const r of mealsRes.data ?? []) {
    loggedDays.add(localDayKey(new Date(r.eaten_at), tzOffsetMin));
  }
  const frozenDays = new Set<string>();
  for (const f of freezesRes.data ?? []) {
    frozenDays.add(String(f.freeze_date));
  }
  const coveredDays = new Set<string>([...loggedDays, ...frozenDays]);

  const today = localDayKey(new Date(), tzOffsetMin);
  const yesterday = localDayKey(offsetDays(new Date(), -1), tzOffsetMin);

  // Current streak: walk backwards from today using covered days. If
  // today isn't logged/frozen, the streak survives as long as yesterday
  // is covered (grace day).
  let currentDays = 0;
  let cursor = new Date();
  const todayCovered = coveredDays.has(today);
  if (!todayCovered && !coveredDays.has(yesterday)) {
    currentDays = 0;
  } else {
    if (!todayCovered) {
      cursor = offsetDays(cursor, -1);
    }
    while (coveredDays.has(localDayKey(cursor, tzOffsetMin))) {
      currentDays += 1;
      cursor = offsetDays(cursor, -1);
    }
  }

  // Longest streak: sort day keys ascending and find max consecutive run.
  const sortedDays = [...coveredDays].sort();
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

  // Days this week (Mon–Sun in user local). Counts freezes.
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffsetMin * 60_000);
  const dow = (localNow.getUTCDay() + 6) % 7; // 0 = Monday
  let daysThisWeek = 0;
  for (let i = 0; i <= dow; i++) {
    const d = offsetDays(now, -i);
    if (coveredDays.has(localDayKey(d, tzOffsetMin))) daysThisWeek += 1;
  }

  // Freeze budget for the current calendar month (by created_at).
  const monthUsed = monthUsedRes.count ?? 0;
  const freezesAvailable = Math.max(0, MONTHLY_FREEZE_BUDGET - monthUsed);

  // Freezable days: recent past days (1..FREEZE_MAX_BACKDATE_DAYS ago)
  // that are neither logged nor already frozen. The client uses this
  // to surface a "save your streak" CTA when yesterday sits in this
  // list and current_days is 0.
  const freezableDays: string[] = [];
  for (let i = 1; i <= FREEZE_MAX_BACKDATE_DAYS; i++) {
    const key = localDayKey(offsetDays(now, -i), tzOffsetMin);
    if (!loggedDays.has(key) && !frozenDays.has(key)) {
      freezableDays.push(key);
    }
  }

  return NextResponse.json({
    current_days: currentDays,
    longest_days: Math.max(longestDays, currentDays),
    days_this_week: daysThisWeek,
    todays_status: loggedDays.has(today) ? "logged" : "not_yet",
    freezes_available_this_month: freezesAvailable,
    freezes_monthly_budget: MONTHLY_FREEZE_BUDGET,
    freezable_days: freezableDays,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
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

function firstOfMonthLocal(now: Date, tzOffsetMin: number): Date {
  const shifted = new Date(now.getTime() + tzOffsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  // Reconstruct the UTC instant equal to the first-of-month local midnight.
  return new Date(Date.UTC(y, m, 1) - tzOffsetMin * 60_000);
}
