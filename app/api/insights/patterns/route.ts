import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import {
  detectCyclePhaseKcalDrift,
  detectDayOfWeekKcalBias,
  detectFiberSodiumDays,
  detectLateNightEating,
  detectPostWorkoutSleepDrop,
  detectRamadanDrift,
  detectWeekendCardioDip,
  type Pattern,
} from "@/lib/patterns";
import type { RamadanPrefs } from "@/lib/ramadan";
import type { CyclePrefs } from "@/lib/cycle";

export const runtime = "nodejs";

/**
 * Runs the deterministic pattern detectors over the last 60 days of
 * the user's data and returns whatever fires. Detector min-observations
 * gates handle "not enough data" so this endpoint just filters nulls.
 *
 * 60-day window is a compromise: short enough that seasonal drift
 * (Ramadan, summer holiday, exam season) doesn't wash out real
 * patterns, long enough that a few outlier days can't dominate.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 60 * 86_400_000);
  const sinceIso = since.toISOString();
  const sinceDay = sinceIso.slice(0, 10);

  // Cycle periods pulled with a wider window since we need 2+ periods
  // (roughly 56-90 days apart) for the phase-drift detector to fire.
  const periodsSince = new Date(Date.now() - 180 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [
    mealsRes,
    workoutsRes,
    sleepsRes,
    activityRes,
    profileRes,
    periodsRes,
  ] = await Promise.all([
      supabase
        .from("meal_items")
        .select(
          "eaten_at, kcal_low, kcal_high, sodium_mg_high, fiber_g_high"
        )
        .eq("user_id", user.id)
        .gte("eaten_at", sinceIso),
      supabase
        .from("workout_sessions")
        .select("completed_at")
        .eq("user_id", user.id)
        .gte("completed_at", sinceIso),
      supabase
        .from("sleep_sessions")
        .select("night_date, duration_minutes")
        .eq("user_id", user.id)
        .gte("night_date", sinceDay),
      supabase
        .from("daily_activity")
        .select("day, steps")
        .eq("user_id", user.id)
        .gte("day", sinceDay),
      supabase
        .from("profiles")
        .select(
          "daily_sodium_mg, daily_fiber_g, daily_kcal_target, ramadan_prefs, cycle_prefs"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("cycle_periods")
        .select("started_on, ended_on")
        .eq("user_id", user.id)
        .gte("started_on", periodsSince)
        .order("started_on", { ascending: false }),
    ]);

  const meals = mealsRes.data ?? [];
  const workouts = workoutsRes.data ?? [];
  const sleeps = sleepsRes.data ?? [];
  const activity = activityRes.data ?? [];
  const profile = profileRes.data;

  const patterns: Pattern[] = [
    detectDayOfWeekKcalBias(
      meals.map((m) => ({
        eaten_at: m.eaten_at as string,
        kcal_low: Number(m.kcal_low),
        kcal_high: Number(m.kcal_high),
      }))
    ),
    detectLateNightEating(
      meals.map((m) => ({ eaten_at: m.eaten_at as string }))
    ),
    detectPostWorkoutSleepDrop(
      workouts.map((w) => ({ completed_at: w.completed_at as string })),
      sleeps.map((s) => ({
        night_date: String(s.night_date),
        duration_minutes: Number(s.duration_minutes),
      }))
    ),
    detectWeekendCardioDip(
      activity.map((a) => ({
        day: String(a.day),
        steps: a.steps as number | null,
      }))
    ),
    detectFiberSodiumDays(
      meals.map((m) => ({
        eaten_at: m.eaten_at as string,
        sodium_mg_high: m.sodium_mg_high as number | null,
        fiber_g_high: m.fiber_g_high as number | null,
      })),
      {
        sodium_mg: profile?.daily_sodium_mg ?? null,
        fiber_g: profile?.daily_fiber_g ?? null,
      }
    ),
    detectRamadanDrift(
      meals.map((m) => ({
        eaten_at: m.eaten_at as string,
        kcal_low: Number(m.kcal_low),
        kcal_high: Number(m.kcal_high),
      })),
      (profile?.ramadan_prefs ?? null) as Partial<RamadanPrefs> | null,
      profile?.daily_kcal_target ?? null
    ),
    detectCyclePhaseKcalDrift(
      meals.map((m) => ({
        eaten_at: m.eaten_at as string,
        kcal_low: Number(m.kcal_low),
        kcal_high: Number(m.kcal_high),
      })),
      (profile?.cycle_prefs ?? null) as Partial<CyclePrefs> | null,
      (periodsRes.data ?? []).map((p) => ({
        started_on: String(p.started_on),
        ended_on: p.ended_on ? String(p.ended_on) : null,
      }))
    ),
  ].filter((p): p is Pattern => p !== null);

  return NextResponse.json({ patterns, window_days: 60 });
}
