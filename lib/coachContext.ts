import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStatus as computeRamadanStatus, type RamadanPrefs } from "./ramadan";

/**
 * Coach context assembler — pulls the user's recent state into a single
 * text block that goes into the system prompt of every chat turn.
 *
 * Design choices:
 * - Everything in one parallel query batch to keep total latency ~one
 *   round-trip on top of the LLM call.
 * - Only include data that's actually useful for coaching — the model
 *   can't reason well over 200 rows of raw logs, so we pre-summarize.
 * - Format is a compact human-readable block, not JSON. The Claude
 *   messages API doesn't need tokens spent on braces and quotes.
 */

const DAY_MS = 86_400_000;

export interface CoachContext {
  block: string;
  has_profile: boolean;
  has_any_data: boolean;
}

interface ProfileRow {
  display_name?: string | null;
  sex?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  activity_level?: string | null;
  ramadan_prefs?: RamadanPrefs | null;
  goal_weight_kg?: number | null;
  goal_rate_kg_per_week?: number | null;
  daily_kcal_target?: number | null;
  daily_protein_g?: number | null;
  daily_carb_g?: number | null;
  daily_fat_g?: number | null;
  training_experience?: string | null;
  equipment_access?: string | null;
  days_per_week?: number | null;
  injuries?: unknown;
}

export async function buildCoachContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CoachContext> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    profileRes,
    todayMealsRes,
    weekMealsRes,
    recentMealNamesRes,
    weightRes,
    workoutRes,
    fastingRes,
    waterTodayRes,
    sleepRes,
    freezesRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, sex, weight_kg, height_cm, goal, activity_level, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, training_experience, equipment_access, days_per_week, injuries, ramadan_prefs, goal_weight_kg, goal_rate_kg_per_week"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("meal_items")
      .select(
        "name, meal_slot, kcal_low, kcal_high, protein_g_low, protein_g_high"
      )
      .eq("user_id", userId)
      .gte("eaten_at", startOfToday.toISOString())
      .order("eaten_at", { ascending: true }),
    supabase
      .from("meal_items")
      .select("eaten_at, kcal_low, kcal_high")
      .eq("user_id", userId)
      .gte("eaten_at", sevenDaysAgo.toISOString()),
    supabase
      .from("meal_items")
      .select("name")
      .eq("user_id", userId)
      .order("eaten_at", { ascending: false })
      .limit(30),
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", thirtyDaysAgo.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("workout_sessions")
      .select("session_name, exercises, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(150),
    supabase
      .from("fasting_windows")
      .select("id, started_at, target_hours, ended_at")
      .eq("user_id", userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("water_logs")
      .select("ml")
      .eq("user_id", userId)
      .gte("logged_at", startOfToday.toISOString()),
    supabase
      .from("sleep_sessions")
      .select(
        "night_date, duration_minutes, sleep_score, hrv_ms, resting_hr_bpm"
      )
      .eq("user_id", userId)
      .gte("night_date", dayKey(sevenDaysAgo))
      .order("night_date", { ascending: false }),
    supabase
      .from("streak_freezes")
      .select("freeze_date")
      .eq("user_id", userId)
      .gte("freeze_date", dayKey(sevenDaysAgo)),
  ]);

  const profile = (profileRes.data ?? null) as ProfileRow | null;
  const todayMeals = todayMealsRes.data ?? [];
  const weekMeals = weekMealsRes.data ?? [];
  const recentNames = recentMealNamesRes.data ?? [];
  const weights = (weightRes.data ?? []).map((w) => ({
    kg: Number(w.weight_kg),
    at: w.logged_at as string,
  }));
  const workouts = workoutRes.data ?? [];
  const fasting = fastingRes.data;
  const waterMl = (waterTodayRes.data ?? []).reduce(
    (s, w) => s + Number(w.ml ?? 0),
    0
  );
  const sleepNights = sleepRes.data ?? [];
  const frozenDays = new Set<string>(
    (freezesRes.data ?? []).map((f) => String(f.freeze_date))
  );

  const parts: string[] = [];
  parts.push("USER CONTEXT (real data, use this in your answers):");

  // Profile
  if (profile) {
    parts.push("\n[Profile]");
    if (profile.display_name) parts.push(`Name: ${profile.display_name}`);
    if (profile.sex) parts.push(`Sex: ${profile.sex}`);
    if (profile.weight_kg) parts.push(`Weight: ${profile.weight_kg} kg`);
    if (profile.height_cm) parts.push(`Height: ${profile.height_cm} cm`);
    if (profile.goal) parts.push(`Goal: ${profile.goal}`);
    if (profile.activity_level)
      parts.push(`Activity level: ${profile.activity_level}`);
    if (profile.daily_kcal_target) {
      parts.push(
        `Daily target: ${profile.daily_kcal_target} kcal · ${profile.daily_protein_g}g P · ${profile.daily_carb_g}g C · ${profile.daily_fat_g}g F`
      );
    }
    if (
      profile.training_experience ||
      profile.equipment_access ||
      profile.days_per_week
    ) {
      parts.push(
        `Training: ${profile.training_experience ?? "?"} · ${profile.equipment_access ?? "?"} · ${profile.days_per_week ?? "?"} d/wk`
      );
    }
    const inj = Array.isArray(profile.injuries)
      ? (profile.injuries as string[])
      : [];
    if (inj.length > 0) parts.push(`Injuries/avoid: ${inj.join(", ")}`);

    // Ramadan context — coach adjusts advice around iftar/suhoor timing.
    const ramadan = computeRamadanStatus(profile.ramadan_prefs ?? null);
    if (ramadan.active && ramadan.today) {
      const secsToMaghrib = ramadan.today.seconds_until_maghrib ?? 0;
      const hrsToMaghrib = Math.floor(secsToMaghrib / 3600);
      const mins = Math.floor((secsToMaghrib % 3600) / 60);
      parts.push(
        `Ramadan: day ${ramadan.day_num}/${ramadan.total_days}. Fajr ${ramadan.today.fajr}, maghrib ${ramadan.today.maghrib}.` +
          (ramadan.today.in_fast_window
            ? ` Currently fasting — ~${hrsToMaghrib}h ${mins}m until iftar. Suggest meals for iftar/suhoor timing, not "right now".`
            : ` Currently in the eating window.`)
      );
    }
  } else {
    parts.push("\n[Profile] Not yet onboarded.");
  }

  // Today so far
  const todayKcalLow = todayMeals.reduce(
    (s, m) => s + Number(m.kcal_low ?? 0),
    0
  );
  const todayKcalHigh = todayMeals.reduce(
    (s, m) => s + Number(m.kcal_high ?? 0),
    0
  );
  const todayProteinLow = todayMeals.reduce(
    (s, m) => s + Number(m.protein_g_low ?? 0),
    0
  );
  const todayProteinHigh = todayMeals.reduce(
    (s, m) => s + Number(m.protein_g_high ?? 0),
    0
  );
  parts.push("\n[Today so far]");
  if (todayMeals.length === 0) {
    parts.push("Nothing logged yet today.");
  } else {
    parts.push(
      `${todayMeals.length} item${todayMeals.length === 1 ? "" : "s"} logged: ${todayKcalLow}–${todayKcalHigh} kcal, ${Math.round(todayProteinLow)}–${Math.round(todayProteinHigh)}g protein.`
    );
    const meals = todayMeals
      .slice(0, 6)
      .map((m) => `${m.meal_slot ?? "?"}: ${m.name}`)
      .join(" | ");
    parts.push(`Items: ${meals}`);
    if (profile?.daily_kcal_target) {
      const target = profile.daily_kcal_target;
      const remLow = target - todayKcalHigh;
      const remHigh = target - todayKcalLow;
      parts.push(`Remaining today: ${remLow}–${remHigh} kcal.`);
    }
  }
  if (waterMl > 0) {
    parts.push(`Water today: ${waterMl} ml.`);
  }
  if (fasting) {
    const hrs = Math.floor(
      (Date.now() - new Date(fasting.started_at as string).getTime()) / 3_600_000
    );
    parts.push(
      `Currently fasting: ${hrs}h into a ${fasting.target_hours}h target.`
    );
  }

  // Last 7 days
  const daysLoggedSet = new Set<string>();
  for (const m of weekMeals) {
    daysLoggedSet.add(String(m.eaten_at).slice(0, 10));
  }
  // Streak walk treats frozen days as covered — matches /api/streaks.
  const coveredForStreak = new Set<string>([...daysLoggedSet, ...frozenDays]);
  const streak = computeCurrentStreak(coveredForStreak, now);
  parts.push("\n[Last 7 days]");
  parts.push(
    `Logged ${daysLoggedSet.size}/7 days. Current streak: ${streak.current} day${streak.current === 1 ? "" : "s"}.`
  );
  if (weekMeals.length > 0) {
    const midKcal =
      weekMeals.reduce(
        (s, m) => s + (Number(m.kcal_low) + Number(m.kcal_high)) / 2,
        0
      ) / Math.max(1, daysLoggedSet.size);
    parts.push(`Avg kcal per logged day: ~${Math.round(midKcal)}.`);
  }

  // Weight trend + projection. Regression on the same 30-day window
  // that's already loaded so the coach can talk about pace, ETA, and
  // on-pace percentage without a second query.
  if (weights.length >= 2) {
    const first = weights[0]!;
    const last = weights[weights.length - 1]!;
    const delta = Math.round((last.kg - first.kg) * 10) / 10;
    const days = Math.max(
      1,
      Math.round(
        (new Date(last.at).getTime() - new Date(first.at).getTime()) / DAY_MS
      )
    );
    const sign = delta > 0 ? "+" : "";
    parts.push(
      `\n[Weight] ${sign}${delta} kg over ${days} d (${first.kg} → ${last.kg}). ${weights.length} weigh-ins.`
    );

    const reg = linearRegression(
      weights.map((w) => new Date(w.at).getTime() / 86_400_000),
      weights.map((w) => w.kg)
    );
    if (reg) {
      const perWk = Math.round(reg.slope * 7 * 100) / 100;
      const paceBits = [`current pace ${perWk > 0 ? "+" : ""}${perWk} kg/wk`];
      const targetRate = profile?.goal_rate_kg_per_week ?? null;
      if (typeof targetRate === "number" && Math.abs(targetRate) > 1e-6) {
        const onPace = Math.round((reg.slope * 7) / targetRate * 100);
        paceBits.push(`${onPace}% of target ${targetRate} kg/wk`);
      }
      const goalWeight = profile?.goal_weight_kg ?? null;
      if (typeof goalWeight === "number" && Math.abs(reg.slope) > 1e-6) {
        const todayOffset = Date.now() / 86_400_000;
        const targetOffset = (goalWeight - reg.intercept) / reg.slope;
        const daysToGoal = Math.round(targetOffset - todayOffset);
        if (daysToGoal > 0 && daysToGoal < 365 * 3) {
          paceBits.push(
            `~${Math.round(daysToGoal / 7)} wks to ${goalWeight} kg at this pace`
          );
        } else if (daysToGoal <= 0) {
          paceBits.push(`already past goal ${goalWeight} kg`);
        } else {
          paceBits.push(`goal ${goalWeight} kg unreachable at this pace`);
        }
      }
      parts.push(`[Projection] ${paceBits.join(", ")}.`);
    }
  } else if (weights.length === 1) {
    parts.push(`\n[Weight] Latest: ${weights[0]!.kg} kg. Only 1 weigh-in.`);
  }

  // Sleep — last night + 7-day average. Signal-heavy for coaching: poor
  // sleep suppresses recovery, HRV crash signals overtraining/illness.
  if (sleepNights.length > 0) {
    const last = sleepNights[0]!;
    const lastHrs = Math.floor(Number(last.duration_minutes) / 60);
    const lastMins = Number(last.duration_minutes) % 60;
    const avgMin =
      sleepNights.reduce((s, n) => s + Number(n.duration_minutes ?? 0), 0) /
      sleepNights.length;
    const avgHrs = Math.floor(avgMin / 60);
    const avgMinsRem = Math.round(avgMin - avgHrs * 60);
    const scoreBits: string[] = [];
    if (typeof last.sleep_score === "number")
      scoreBits.push(`score ${last.sleep_score}/100`);
    if (typeof last.hrv_ms === "number")
      scoreBits.push(`HRV ${Math.round(Number(last.hrv_ms))}ms`);
    if (typeof last.resting_hr_bpm === "number")
      scoreBits.push(`RHR ${last.resting_hr_bpm}bpm`);
    parts.push(
      `\n[Sleep] Last night ${lastHrs}h ${lastMins}m${scoreBits.length ? ` (${scoreBits.join(", ")})` : ""}. 7-day avg ${avgHrs}h ${avgMinsRem}m over ${sleepNights.length} night${sleepNights.length === 1 ? "" : "s"}.`
    );
  }

  // Recent workouts + top PRs (derived in one pass)
  if (workouts.length > 0) {
    const recent = workouts.slice(0, 2);
    parts.push("\n[Recent workouts]");
    for (const w of recent) {
      const when = shortDate(new Date(w.completed_at as string));
      const exNames = Array.isArray(w.exercises)
        ? (w.exercises as { name?: string }[])
            .map((e) => e.name)
            .filter(Boolean)
            .slice(0, 4)
            .join(", ")
        : "";
      parts.push(`${when}: ${w.session_name}${exNames ? " — " + exNames : ""}`);
    }
    const prs = topPrs(workouts);
    if (prs.length > 0) {
      parts.push(
        `Top PRs: ${prs.map((p) => `${p.exercise} ${p.weight_kg}kg×${p.reps}`).join(" · ")}`
      );
    }
  }

  // Recent meal names — useful when user asks "what did I have for lunch"
  if (recentNames.length > 0) {
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const r of recentNames) {
      const n = String(r.name ?? "").trim();
      if (!n || seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      uniq.push(n);
      if (uniq.length >= 8) break;
    }
    if (uniq.length > 0) {
      parts.push(`\n[Recently eaten] ${uniq.join(" · ")}`);
    }
  }

  const block = parts.join("\n");
  const hasAny =
    !!profile ||
    todayMeals.length > 0 ||
    weekMeals.length > 0 ||
    weights.length > 0 ||
    workouts.length > 0 ||
    sleepNights.length > 0;

  return { block, has_profile: !!profile, has_any_data: hasAny };
}

function computeCurrentStreak(
  days: Set<string>,
  now: Date
): { current: number } {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  let cursor = new Date(now);
  const todayLogged = days.has(today);
  if (!todayLogged && !days.has(yesterday)) return { current: 0 };
  let n = 0;
  if (!todayLogged) cursor = new Date(cursor.getTime() - DAY_MS);
  while (days.has(dayKey(cursor))) {
    n += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return { current: n };
}

function topPrs(
  sessions: {
    exercises: unknown;
    completed_at: unknown;
  }[]
): { exercise: string; weight_kg: number; reps: number; est_1rm: number }[] {
  const byName = new Map<
    string,
    { exercise: string; weight_kg: number; reps: number; est_1rm: number }
  >();
  for (const s of sessions) {
    const exs = Array.isArray(s.exercises)
      ? (s.exercises as {
          name?: string;
          sets?: { weight_kg?: number; reps?: number }[];
        }[])
      : [];
    for (const ex of exs) {
      const name = ex.name?.trim();
      if (!name) continue;
      for (const set of ex.sets ?? []) {
        const w = Number(set.weight_kg);
        const r = Number(set.reps);
        if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0)
          continue;
        const est = Math.round(w * (1 + r / 30) * 10) / 10;
        const prior = byName.get(name);
        if (!prior || w > prior.weight_kg) {
          byName.set(name, {
            exercise: name,
            weight_kg: Math.round(w * 10) / 10,
            reps: Math.round(r),
            est_1rm: est,
          });
        }
      }
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.est_1rm - a.est_1rm)
    .slice(0, 3);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function linearRegression(
  xs: number[],
  ys: number[]
): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
