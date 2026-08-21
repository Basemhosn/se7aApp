import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Sleep summary card data — last night's session plus the 7-day
 * rolling average. `night_date` is the wake date, so "last night" is
 * today's date. If today's night_date isn't populated yet (the ring /
 * strap hasn't synced this morning's wake), we fall back to the most
 * recent night we do have — better to show yesterday's sleep than an
 * empty card.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { data: recent } = await supabase
    .from("sleep_sessions")
    .select(
      "night_date, start_at, end_at, duration_minutes, sleep_score, deep_minutes, rem_minutes, light_minutes, awake_minutes, hrv_ms, resting_hr_bpm, source"
    )
    .eq("user_id", user.id)
    .gte("night_date", isoDay(sevenDaysAgo))
    .order("night_date", { ascending: false });

  const rows = recent ?? [];
  const lastNight = rows[0] ?? null;

  const durations = rows.map((r) => r.duration_minutes as number);
  const avgMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
      : null;

  return NextResponse.json({
    last_night: lastNight
      ? {
          night_date: lastNight.night_date,
          start_at: lastNight.start_at,
          end_at: lastNight.end_at,
          duration_minutes: lastNight.duration_minutes,
          sleep_score: lastNight.sleep_score,
          deep_minutes: lastNight.deep_minutes,
          rem_minutes: lastNight.rem_minutes,
          light_minutes: lastNight.light_minutes,
          awake_minutes: lastNight.awake_minutes,
          hrv_ms: lastNight.hrv_ms,
          resting_hr_bpm: lastNight.resting_hr_bpm,
          source: lastNight.source,
        }
      : null,
    seven_day: {
      nights_logged: rows.length,
      avg_duration_minutes: avgMinutes,
    },
  });
}
