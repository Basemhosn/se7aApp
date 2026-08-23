import { NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Redis } from "@upstash/redis";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const ROAST_CACHE_TTL_SECONDS = 60 * 24 * 3600; // 60 days
const ROAST_MODEL = "claude-sonnet-4-6";
const DAY_MS = 86_400_000;

interface Wrapped {
  week_start: string; // Monday YYYY-MM-DD
  week_end: string; // Sunday YYYY-MM-DD
  hero: {
    label: string;
    value: string;
    unit: string;
  };
  slides: Array<{
    kind:
      | "logging"
      | "workouts"
      | "cardio"
      | "weight"
      | "sleep"
      | "recovery"
      | "protein"
      | "streak";
    kicker: string;
    stat: string;
    unit: string;
    detail: string;
  }>;
  roast: string; // one-line coach observation
  has_any_data: boolean;
}

/**
 * Weekly Wrapped — Spotify-style recap of the user's week. On-demand,
 * defaults to the most recently completed Mon–Sun. The deterministic
 * stats are computed fresh on every call (fast, correct after edits);
 * the one-line coach "roast" is cached in Redis so repeat views don't
 * re-hit Claude for the same week.
 *
 * "Roast" is a friendly word for the coaching observation — it should
 * be honest and specific, not mean. See buildRoast for the prompt.
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
  const requestedWeek = searchParams.get("week_start");
  const { weekStart, weekEnd } = requestedWeek
    ? { weekStart: requestedWeek, weekEnd: addDays(requestedWeek, 6) }
    : lastCompletedWeek(new Date());

  const startIso = new Date(weekStart + "T00:00:00").toISOString();
  const endIsoExclusive = new Date(
    new Date(weekEnd + "T00:00:00").getTime() + DAY_MS
  ).toISOString();

  const [
    profileRes,
    mealsRes,
    workoutsRes,
    cardioRes,
    dailyActivityRes,
    weightRes,
    sleepRes,
    recoveryRes,
    prevWeightRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, weight_kg, display_name"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_items")
      .select(
        "eaten_at, name, kcal_low, kcal_high, protein_g_low, protein_g_high"
      )
      .eq("user_id", user.id)
      .gte("eaten_at", startIso)
      .lt("eaten_at", endIsoExclusive),
    supabase
      .from("workout_sessions")
      .select("session_name, completed_at, exercises")
      .eq("user_id", user.id)
      .gte("completed_at", startIso)
      .lt("completed_at", endIsoExclusive),
    supabase
      .from("cardio_sessions")
      .select("kind, duration_min, distance_km, kcal_burned")
      .eq("user_id", user.id)
      .gte("started_at", startIso)
      .lt("started_at", endIsoExclusive),
    supabase
      .from("daily_activity")
      .select("day, steps, active_kcal")
      .eq("user_id", user.id)
      .gte("day", weekStart)
      .lte("day", weekEnd),
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", startIso)
      .lt("logged_at", endIsoExclusive)
      .order("logged_at", { ascending: true }),
    supabase
      .from("sleep_sessions")
      .select("night_date, duration_minutes, sleep_score")
      .eq("user_id", user.id)
      .gte("night_date", weekStart)
      .lte("night_date", weekEnd)
      .order("night_date", { ascending: true }),
    supabase
      .from("recovery_scores")
      .select("day, score")
      .eq("user_id", user.id)
      .gte("day", weekStart)
      .lte("day", weekEnd)
      .order("day", { ascending: true }),
    // For weight delta: the most recent weigh-in BEFORE the week started
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", user.id)
      .lt("logged_at", startIso)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const meals = mealsRes.data ?? [];
  const workouts = workoutsRes.data ?? [];
  const cardio = cardioRes.data ?? [];
  const dailyActivity = dailyActivityRes.data ?? [];
  const weights = weightRes.data ?? [];
  const sleeps = sleepRes.data ?? [];
  const recoveries = recoveryRes.data ?? [];
  const prevWeight = prevWeightRes.data;

  // ── Compute per-slide numbers ─────────────────────────────────────

  const daysLogged = new Set<string>();
  let kcalLow = 0;
  let kcalHigh = 0;
  let proteinLow = 0;
  let proteinHigh = 0;
  const perDayKcalHigh = new Map<string, number>();
  const perDayProteinHigh = new Map<string, number>();
  for (const m of meals) {
    const day = String(m.eaten_at).slice(0, 10);
    daysLogged.add(day);
    kcalLow += Number(m.kcal_low ?? 0);
    kcalHigh += Number(m.kcal_high ?? 0);
    proteinLow += Number(m.protein_g_low ?? 0);
    proteinHigh += Number(m.protein_g_high ?? 0);
    perDayKcalHigh.set(
      day,
      (perDayKcalHigh.get(day) ?? 0) + Number(m.kcal_high ?? 0)
    );
    perDayProteinHigh.set(
      day,
      (perDayProteinHigh.get(day) ?? 0) + Number(m.protein_g_high ?? 0)
    );
  }
  const dailyKcalTarget = profile?.daily_kcal_target ?? null;
  const proteinTarget = profile?.daily_protein_g ?? null;
  const bestKcalDay = pickBestKcalDay(perDayKcalHigh, dailyKcalTarget);
  const bestProteinDay = pickBestProteinDay(
    perDayProteinHigh,
    proteinTarget
  );

  const workoutSessions = workouts.length;
  const cardioMinutes = cardio.reduce(
    (s, c) => s + Number(c.duration_min ?? 0),
    0
  );
  const totalSteps = dailyActivity.reduce(
    (s, d) => s + Number(d.steps ?? 0),
    0
  );
  const activeKcal = dailyActivity.reduce(
    (s, d) => s + Number(d.active_kcal ?? 0),
    0
  );

  const weightDelta =
    weights.length > 0 && prevWeight
      ? round(
          Number(weights[weights.length - 1]!.weight_kg) -
            Number(prevWeight.weight_kg),
          1
        )
      : weights.length >= 2
        ? round(
            Number(weights[weights.length - 1]!.weight_kg) -
              Number(weights[0]!.weight_kg),
            1
          )
        : null;

  const avgSleepMinutes =
    sleeps.length > 0
      ? Math.round(
          sleeps.reduce((s, n) => s + Number(n.duration_minutes ?? 0), 0) /
            sleeps.length
        )
      : null;

  const avgRecovery =
    recoveries.length > 0
      ? Math.round(
          recoveries.reduce((s, r) => s + Number(r.score ?? 0), 0) /
            recoveries.length
        )
      : null;

  // ── Assemble slides ──────────────────────────────────────────────

  const slides: Wrapped["slides"] = [];

  slides.push({
    kind: "logging",
    kicker: "LOG STREAK",
    stat: `${daysLogged.size}`,
    unit: "/ 7 DAYS",
    detail:
      daysLogged.size === 7
        ? "Perfect logging week."
        : daysLogged.size >= 5
          ? "Strong week."
          : daysLogged.size >= 3
            ? "Half in, half out."
            : "Off week for logging.",
  });

  if (workoutSessions > 0 || cardioMinutes > 0) {
    slides.push({
      kind: "workouts",
      kicker: "TRAINING",
      stat: String(workoutSessions),
      unit: workoutSessions === 1 ? "SESSION" : "SESSIONS",
      detail:
        cardioMinutes > 0
          ? `+${Math.round(cardioMinutes)} min cardio.`
          : "Strength focus.",
    });
  }

  if (totalSteps > 0) {
    slides.push({
      kind: "cardio",
      kicker: "STEPS",
      stat: totalSteps.toLocaleString(),
      unit: "TAKEN",
      detail: `~${Math.round(totalSteps / 7).toLocaleString()} avg / day.`,
    });
  }

  if (weightDelta !== null) {
    const sign = weightDelta > 0 ? "+" : "";
    slides.push({
      kind: "weight",
      kicker: "WEIGHT",
      stat: `${sign}${weightDelta}`,
      unit: "KG",
      detail:
        Math.abs(weightDelta) < 0.2
          ? "Holding steady."
          : weightDelta < 0
            ? "Down for the week."
            : "Up for the week.",
    });
  }

  if (avgSleepMinutes !== null) {
    const h = Math.floor(avgSleepMinutes / 60);
    const m = avgSleepMinutes - h * 60;
    slides.push({
      kind: "sleep",
      kicker: "SLEEP",
      stat: `${h}h ${String(m).padStart(2, "0")}m`,
      unit: "AVG / NIGHT",
      detail: `${sleeps.length} night${sleeps.length === 1 ? "" : "s"} tracked.`,
    });
  }

  if (avgRecovery !== null) {
    slides.push({
      kind: "recovery",
      kicker: "RECOVERY",
      stat: `${avgRecovery}`,
      unit: "% AVG",
      detail:
        avgRecovery >= 67
          ? "Well-recovered week."
          : avgRecovery >= 34
            ? "Middling recovery."
            : "Recovery was low.",
    });
  }

  if (bestProteinDay) {
    slides.push({
      kind: "protein",
      kicker: "TOP PROTEIN DAY",
      stat: `${Math.round(bestProteinDay.grams)}`,
      unit: "G",
      detail: `${dayName(bestProteinDay.day)}${
        proteinTarget ? ` · ${Math.round((bestProteinDay.grams / proteinTarget) * 100)}% of target` : ""
      }.`,
    });
  }

  // ── Hero: the single number to lead the recap ────────────────────

  const hero = pickHero({
    daysLogged: daysLogged.size,
    workoutSessions,
    weightDelta,
    avgSleepMinutes,
    avgRecovery,
    totalSteps,
  });

  const hasAnyData =
    meals.length > 0 ||
    workouts.length > 0 ||
    cardio.length > 0 ||
    weights.length > 0 ||
    sleeps.length > 0 ||
    recoveries.length > 0 ||
    dailyActivity.length > 0;

  // ── Coach roast (cached) ─────────────────────────────────────────

  const cacheKey = `wrapped_roast:${user.id}:${weekStart}`;
  let roast: string | null = null;
  try {
    roast = (await redis.get(cacheKey)) as string | null;
  } catch {
    /* redis down; continue without cache */
  }
  if (!roast && hasAnyData) {
    roast = await buildRoast({
      name: profile?.display_name ?? null,
      week_start: weekStart,
      week_end: weekEnd,
      days_logged: daysLogged.size,
      workout_sessions: workoutSessions,
      cardio_minutes: Math.round(cardioMinutes),
      total_steps: totalSteps,
      active_kcal: Math.round(activeKcal),
      weight_delta_kg: weightDelta,
      avg_sleep_minutes: avgSleepMinutes,
      avg_recovery: avgRecovery,
      best_kcal_day: bestKcalDay,
      best_protein_day: bestProteinDay,
      daily_kcal_target: dailyKcalTarget,
      protein_target: proteinTarget,
    }).catch(() => null);
    if (roast) {
      try {
        await redis.set(cacheKey, roast, { ex: ROAST_CACHE_TTL_SECONDS });
      } catch {
        /* silent */
      }
    }
  }

  return NextResponse.json({
    week_start: weekStart,
    week_end: weekEnd,
    hero,
    slides,
    roast: roast ?? "",
    has_any_data: hasAnyData,
  } satisfies Wrapped);
}

// ── helpers ────────────────────────────────────────────────────────

interface RoastInput {
  name: string | null;
  week_start: string;
  week_end: string;
  days_logged: number;
  workout_sessions: number;
  cardio_minutes: number;
  total_steps: number;
  active_kcal: number;
  weight_delta_kg: number | null;
  avg_sleep_minutes: number | null;
  avg_recovery: number | null;
  best_kcal_day: { day: string; kcal: number } | null;
  best_protein_day: { day: string; grams: number } | null;
  daily_kcal_target: number | null;
  protein_target: number | null;
}

async function buildRoast(input: RoastInput): Promise<string | null> {
  const summary = [
    `Days logged: ${input.days_logged}/7`,
    `Workouts: ${input.workout_sessions}`,
    input.cardio_minutes > 0 ? `Cardio: ${input.cardio_minutes} min` : null,
    input.total_steps > 0
      ? `Steps: ${input.total_steps.toLocaleString()}`
      : null,
    input.weight_delta_kg !== null
      ? `Weight: ${input.weight_delta_kg > 0 ? "+" : ""}${input.weight_delta_kg} kg`
      : null,
    input.avg_sleep_minutes !== null
      ? `Sleep: ${Math.floor(input.avg_sleep_minutes / 60)}h ${String(input.avg_sleep_minutes % 60).padStart(2, "0")}m avg`
      : null,
    input.avg_recovery !== null
      ? `Recovery: ${input.avg_recovery}% avg`
      : null,
    input.best_protein_day
      ? `Top protein: ${Math.round(input.best_protein_day.grams)}g on ${dayName(input.best_protein_day.day)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const prompt = `The user just finished a week. Here are their numbers:

${summary}

Write ONE line of coaching feedback about this week — max 180 characters,
punchy, specific, honest. Point at a pattern the numbers reveal, not a
platitude. Never be mean. Never say "great job" without a "but". Never
mention macros the user didn't hit unless you offer a specific
next-week action. No emojis. No hashtags. Return only the line itself.
`.trim();

  const { text } = await generateText({
    model: anthropic(ROAST_MODEL),
    prompt,
    maxOutputTokens: 200,
  });

  return text.trim().slice(0, 200);
}

function lastCompletedWeek(now: Date): {
  weekStart: string;
  weekEnd: string;
} {
  // Monday of the *previous* full week. If today is Monday, we hand
  // back last Mon–Sun (not this partial week).
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow - 7);
  const weekStart = isoDay(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { weekStart, weekEnd: isoDay(end) };
}

function pickBestKcalDay(
  map: Map<string, number>,
  target: number | null
): { day: string; kcal: number } | null {
  if (map.size === 0 || !target) return null;
  let best: { day: string; kcal: number; distance: number } | null = null;
  for (const [day, kcal] of map) {
    const distance = Math.abs(kcal - target);
    if (!best || distance < best.distance) {
      best = { day, kcal, distance };
    }
  }
  return best ? { day: best.day, kcal: best.kcal } : null;
}

function pickBestProteinDay(
  map: Map<string, number>,
  _target: number | null
): { day: string; grams: number } | null {
  if (map.size === 0) return null;
  let best: { day: string; grams: number } | null = null;
  for (const [day, grams] of map) {
    if (!best || grams > best.grams) best = { day, grams };
  }
  return best;
}

function pickHero(input: {
  daysLogged: number;
  workoutSessions: number;
  weightDelta: number | null;
  avgSleepMinutes: number | null;
  avgRecovery: number | null;
  totalSteps: number;
}): Wrapped["hero"] {
  // Hero priority: weight delta > workout count > logging days > steps.
  // Numbers users emotionally react to lead.
  if (input.weightDelta !== null && Math.abs(input.weightDelta) >= 0.2) {
    return {
      label: input.weightDelta < 0 ? "WEIGHT DROPPED" : "WEIGHT ADDED",
      value: `${input.weightDelta > 0 ? "+" : ""}${input.weightDelta}`,
      unit: "kg",
    };
  }
  if (input.workoutSessions > 0) {
    return {
      label: "WORKOUTS DONE",
      value: String(input.workoutSessions),
      unit: input.workoutSessions === 1 ? "session" : "sessions",
    };
  }
  if (input.daysLogged >= 5) {
    return {
      label: "LOGGED",
      value: `${input.daysLogged}`,
      unit: "of 7 days",
    };
  }
  if (input.totalSteps > 0) {
    return {
      label: "STEPS",
      value: input.totalSteps.toLocaleString(),
      unit: "walked",
    };
  }
  return {
    label: "YOUR WEEK",
    value: `${input.daysLogged}`,
    unit: "days logged",
  };
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return isoDay(dt);
}

function dayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
  });
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
