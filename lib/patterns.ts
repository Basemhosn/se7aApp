/**
 * Pure pattern detectors. Each takes the raw rows it needs and returns
 * a Pattern or null. Composed by /api/insights/patterns.
 *
 * Deterministic — no AI, no randomness. Same input always gives same
 * output. That's the whole point: the app is surfacing things a
 * careful reader of their own data would notice, not fabricating them.
 *
 * Every detector has a minimum-observations gate. Below that gate we
 * return null rather than a low-confidence claim — pattern detection
 * that fires on 3 data points reads as astrology, not insight.
 */

import { isRamadanActiveForPrefs, type RamadanPrefs } from "./ramadan";
import {
  averageCycleLength,
  averagePeriodLength,
  phaseForDay,
  type CyclePhase,
  type CyclePrefs,
  type PeriodEntry,
} from "./cycle";

export type PatternSeverity = "info" | "warn";

export interface Pattern {
  id:
    | "dow_kcal_bias"
    | "late_night_eating"
    | "post_workout_sleep_drop"
    | "weekend_cardio_dip"
    | "fiber_sodium_days"
    | "ramadan_drift"
    | "cycle_phase_kcal_drift"
    | "cycle_phase_workout_capacity";
  severity: PatternSeverity;
  title: string;
  body: string;
  evidence: Record<string, string | number>;
}

const DOW_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── Day-of-week kcal bias ─────────────────────────────────────────
/**
 * "Fridays run 40% higher than the rest of the week." Bucket meals
 * per DoW → sum kcal per day → average per DoW. Flag any DoW whose
 * average is >20% above the overall mean AND we have >=3 samples
 * for that DoW (so a single big Friday doesn't misread as a pattern).
 */
export function detectDayOfWeekKcalBias(
  meals: { eaten_at: string; kcal_low: number; kcal_high: number }[]
): Pattern | null {
  if (meals.length === 0) return null;
  const perDay = new Map<string, { mid: number; dow: number }>();
  for (const m of meals) {
    const d = new Date(m.eaten_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const mid = (Number(m.kcal_low) + Number(m.kcal_high)) / 2;
    const existing = perDay.get(key);
    if (existing) {
      existing.mid += mid;
    } else {
      perDay.set(key, { mid, dow: d.getDay() });
    }
  }
  if (perDay.size < 14) return null; // need at least 2 weeks

  const dowKcal = new Array(7).fill(0).map(() => ({ sum: 0, count: 0 }));
  for (const v of perDay.values()) {
    dowKcal[v.dow]!.sum += v.mid;
    dowKcal[v.dow]!.count += 1;
  }
  const dowAvg = dowKcal.map((d) => (d.count > 0 ? d.sum / d.count : 0));
  const totalAvg =
    [...perDay.values()].reduce((s, v) => s + v.mid, 0) / perDay.size;

  let worstIdx = -1;
  let worstOver = 0;
  for (let i = 0; i < 7; i++) {
    if (dowKcal[i]!.count < 3) continue;
    if (totalAvg === 0) continue;
    const overPct = (dowAvg[i]! - totalAvg) / totalAvg;
    if (overPct > worstOver) {
      worstOver = overPct;
      worstIdx = i;
    }
  }
  if (worstIdx === -1 || worstOver < 0.2) return null;

  return {
    id: "dow_kcal_bias",
    severity: worstOver > 0.35 ? "warn" : "info",
    title: `${DOW_NAMES[worstIdx]}s run ${Math.round(worstOver * 100)}% higher`,
    body: `Your ${DOW_NAMES[worstIdx]} kcal averages ~${Math.round(dowAvg[worstIdx]!)} vs ~${Math.round(totalAvg)} the rest of the week. Worth a plan?`,
    evidence: {
      dow: DOW_NAMES[worstIdx]!,
      dow_avg_kcal: Math.round(dowAvg[worstIdx]!),
      overall_avg_kcal: Math.round(totalAvg),
      days_used: perDay.size,
    },
  };
}

// ── Late-night eating ─────────────────────────────────────────────
/**
 * "Log a meal after 22:00 on ~40% of days." Uses the raw eaten_at
 * timestamp so a user who eats at 21:59 doesn't get flagged. Silent
 * unless the rate is >=25% over at least 14 days of data.
 */
export function detectLateNightEating(
  meals: { eaten_at: string }[]
): Pattern | null {
  if (meals.length === 0) return null;
  const dayHas = new Map<string, boolean>();
  const dayLate = new Map<string, boolean>();
  for (const m of meals) {
    const d = new Date(m.eaten_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dayHas.set(key, true);
    if (d.getHours() >= 22) dayLate.set(key, true);
  }
  if (dayHas.size < 14) return null;
  const rate = dayLate.size / dayHas.size;
  if (rate < 0.25) return null;

  return {
    id: "late_night_eating",
    severity: rate >= 0.5 ? "warn" : "info",
    title: "Late-night eating pattern",
    body: `You've logged a meal after 22:00 on ${dayLate.size} of the last ${dayHas.size} days (${Math.round(rate * 100)}%). Sleep quality usually suffers.`,
    evidence: {
      days_late: dayLate.size,
      days_total: dayHas.size,
      rate_pct: Math.round(rate * 100),
    },
  };
}

// ── Post-workout sleep drop ──────────────────────────────────────
/**
 * "Sleep drops ~50 min the night after evening workouts." Correlate
 * workout days (workout_sessions completed_at) with next-day sleep
 * duration. Needs >=5 workout+sleep pairs AND >=5 no-workout+sleep
 * nights to compare.
 */
export function detectPostWorkoutSleepDrop(
  workouts: { completed_at: string }[],
  sleeps: { night_date: string; duration_minutes: number }[]
): Pattern | null {
  if (workouts.length < 5 || sleeps.length < 10) return null;

  const workoutDays = new Set<string>();
  for (const w of workouts) {
    const d = new Date(w.completed_at);
    workoutDays.add(
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    );
  }

  const afterWorkout: number[] = [];
  const afterRest: number[] = [];
  for (const s of sleeps) {
    // sleep.night_date is the WAKE date; the workout was the day
    // before, so check if the previous calendar day was a workout day.
    const [y, m, d] = s.night_date.split("-").map(Number);
    const wake = new Date(y!, (m ?? 1) - 1, d ?? 1);
    const prevDay = new Date(wake);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevKey = `${prevDay.getFullYear()}-${prevDay.getMonth()}-${prevDay.getDate()}`;
    const dur = Number(s.duration_minutes);
    if (!Number.isFinite(dur) || dur <= 0) continue;
    if (workoutDays.has(prevKey)) afterWorkout.push(dur);
    else afterRest.push(dur);
  }

  if (afterWorkout.length < 5 || afterRest.length < 5) return null;
  const avgWorkout =
    afterWorkout.reduce((s, n) => s + n, 0) / afterWorkout.length;
  const avgRest = afterRest.reduce((s, n) => s + n, 0) / afterRest.length;
  const diff = avgRest - avgWorkout; // positive = workout days sleep less
  if (diff < 20) return null; // <20 min diff = noise

  return {
    id: "post_workout_sleep_drop",
    severity: diff > 45 ? "warn" : "info",
    title: `Sleep drops ~${Math.round(diff)} min after workouts`,
    body: `Nights after a workout: ~${fmtHM(avgWorkout)}. Rest days: ~${fmtHM(avgRest)}. Tighter pre-bed routine on training days might close the gap.`,
    evidence: {
      workout_nights: afterWorkout.length,
      rest_nights: afterRest.length,
      diff_min: Math.round(diff),
    },
  };
}

// ── Weekend cardio dip ────────────────────────────────────────────
/**
 * "Weekend steps drop 35% from weekday average." Bucket
 * daily_activity by day-of-week, compare Fri+Sat (Gulf weekend) mean
 * to Mon–Thu mean. Needs >=8 days each side.
 */
export function detectWeekendCardioDip(
  activity: { day: string; steps: number | null }[]
): Pattern | null {
  const weekend: number[] = [];
  const weekday: number[] = [];
  for (const a of activity) {
    const [y, m, d] = a.day.split("-").map(Number);
    const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
    const dow = date.getDay(); // 5 = Fri, 6 = Sat in Gulf weekend
    const steps = Number(a.steps ?? 0);
    if (steps <= 0) continue;
    if (dow === 5 || dow === 6) weekend.push(steps);
    else weekday.push(steps);
  }
  if (weekend.length < 4 || weekday.length < 8) return null;
  const avgWeekend =
    weekend.reduce((s, n) => s + n, 0) / weekend.length;
  const avgWeekday =
    weekday.reduce((s, n) => s + n, 0) / weekday.length;
  if (avgWeekday <= 0) return null;
  const dip = (avgWeekday - avgWeekend) / avgWeekday;
  if (dip < 0.2) return null;

  return {
    id: "weekend_cardio_dip",
    severity: dip > 0.4 ? "warn" : "info",
    title: `Weekend steps drop ${Math.round(dip * 100)}%`,
    body: `Weekday avg ${Math.round(avgWeekday).toLocaleString()} steps; Fri–Sat avg ${Math.round(avgWeekend).toLocaleString()}. A single evening walk usually closes the gap.`,
    evidence: {
      weekday_avg: Math.round(avgWeekday),
      weekend_avg: Math.round(avgWeekend),
      dip_pct: Math.round(dip * 100),
    },
  };
}

// ── Fiber-low + sodium-high pairing ──────────────────────────────
/**
 * "N days this month had low fiber AND high sodium — usually the
 * same meal type." Both signals we already surface individually;
 * flagging when they co-occur is the pattern.
 */
export function detectFiberSodiumDays(
  meals: {
    eaten_at: string;
    sodium_mg_high: number | null;
    fiber_g_high: number | null;
  }[],
  targets: { sodium_mg: number | null; fiber_g: number | null }
): Pattern | null {
  if (!targets.sodium_mg || !targets.fiber_g) return null;
  const perDay = new Map<
    string,
    { sodium: number; fiber: number }
  >();
  for (const m of meals) {
    const d = new Date(m.eaten_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const s = Number(m.sodium_mg_high ?? 0);
    const f = Number(m.fiber_g_high ?? 0);
    const existing = perDay.get(key);
    if (existing) {
      existing.sodium += s;
      existing.fiber += f;
    } else {
      perDay.set(key, { sodium: s, fiber: f });
    }
  }
  if (perDay.size < 14) return null;
  let bothDays = 0;
  for (const v of perDay.values()) {
    if (
      v.sodium > targets.sodium_mg &&
      v.fiber < targets.fiber_g * 0.5
    ) {
      bothDays += 1;
    }
  }
  if (bothDays < 3) return null;
  const rate = bothDays / perDay.size;
  if (rate < 0.15) return null;

  return {
    id: "fiber_sodium_days",
    severity: rate > 0.35 ? "warn" : "info",
    title: `${bothDays} days: high sodium + low fiber`,
    body: `Days like this line up with rice-and-meat plates without vegetables or legumes. A side salad or foul with the meal usually closes both gaps at once.`,
    evidence: {
      matching_days: bothDays,
      total_days: perDay.size,
      rate_pct: Math.round(rate * 100),
    },
  };
}

// ── Ramadan drift ────────────────────────────────────────────────
/**
 * "During Ramadan you average 22% over your kcal target." Iftar makes
 * this the single most common drift for Gulf users on a cut. Only
 * fires when the user's ramadan_prefs resolve to "active" for at least
 * 5 of the days in the window AND they have a daily_kcal_target to
 * compare against.
 *
 * Uses the same isRamadanActiveForPrefs() that the /ramadan/status
 * endpoint uses, so a user who explicitly disabled Ramadan mode gets
 * skipped even during actual Ramadan dates.
 */
export function detectRamadanDrift(
  meals: { eaten_at: string; kcal_low: number; kcal_high: number }[],
  prefs: Partial<RamadanPrefs> | null | undefined,
  dailyKcalTarget: number | null
): Pattern | null {
  if (!dailyKcalTarget || dailyKcalTarget <= 0) return null;
  if (meals.length === 0) return null;

  // Group meals by calendar day, then filter to days the user's prefs
  // say were Ramadan. Using the DATE (not the meal timestamp) lets a
  // suhoor eaten at 04:00 count against the wake day of Ramadan, not
  // the previous calendar day — which is how users think of it.
  const perDay = new Map<string, { mid: number; date: Date }>();
  for (const m of meals) {
    const d = new Date(m.eaten_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const mid = (Number(m.kcal_low) + Number(m.kcal_high)) / 2;
    const existing = perDay.get(key);
    if (existing) existing.mid += mid;
    else perDay.set(key, { mid, date: d });
  }

  const ramadanDayKcal: number[] = [];
  for (const v of perDay.values()) {
    if (isRamadanActiveForPrefs(prefs as RamadanPrefs, v.date)) {
      ramadanDayKcal.push(v.mid);
    }
  }
  if (ramadanDayKcal.length < 5) return null;

  const avg =
    ramadanDayKcal.reduce((s, n) => s + n, 0) / ramadanDayKcal.length;
  const deltaPct = (avg - dailyKcalTarget) / dailyKcalTarget;
  if (Math.abs(deltaPct) < 0.15) return null;

  const over = deltaPct > 0;
  const pct = Math.round(Math.abs(deltaPct) * 100);

  return {
    id: "ramadan_drift",
    severity: Math.abs(deltaPct) > 0.25 ? "warn" : "info",
    title: over
      ? `Ramadan days run ${pct}% over target`
      : `Ramadan days run ${pct}% under target`,
    body: over
      ? `Averaging ~${Math.round(avg)} kcal on Ramadan days vs your ${dailyKcalTarget} kcal target. Iftar overshoot is the usual culprit — a soup + salad opener before the main plate usually resets the pace.`
      : `Averaging ~${Math.round(avg)} kcal on Ramadan days vs your ${dailyKcalTarget} kcal target. Under-eating during Ramadan tanks energy and slows recovery — try adding a suhoor with slow carbs + protein.`,
    evidence: {
      ramadan_days_logged: ramadanDayKcal.length,
      ramadan_avg_kcal: Math.round(avg),
      target_kcal: dailyKcalTarget,
      delta_pct: Math.round(deltaPct * 100),
    },
  };
}

// ── Cycle-phase kcal drift ────────────────────────────────────────
/**
 * "Your luteal phase averages 18% higher kcal than the rest of your
 * cycle." Only runs when the user has explicitly opted into cycle
 * tracking AND opted into sharing it with the coach — same gate the
 * coach-context injection uses.
 *
 * Method:
 *   1. Aggregate meals per calendar day (mid kcal)
 *   2. For each day, find the most recent period start ON OR BEFORE
 *      that day, compute cycle_day, map to phase via phaseForDay()
 *   3. Bucket kcal averages by phase; require ≥3 days per phase
 *   4. Compare each phase's average to the overall mean; flag the
 *      biggest deviation ≥15%
 *
 * Copy is deliberately non-prescriptive. Cycle-phase kcal shifts are
 * biology, not a behavior to fix — the point of surfacing it is so
 * the user (and coach) can stop treating a normal luteal 200-kcal
 * bump as an adherence failure.
 *
 * Severity always "info". Never warn — this is not a mistake.
 */
export function detectCyclePhaseKcalDrift(
  meals: { eaten_at: string; kcal_low: number; kcal_high: number }[],
  prefs: Partial<CyclePrefs> | null | undefined,
  periods: PeriodEntry[]
): Pattern | null {
  if (!prefs?.enabled || !prefs.share_with_coach) return null;
  if (periods.length < 2) return null;
  if (meals.length === 0) return null;

  const avgCycle = averageCycleLength(periods, prefs.avg_cycle_length_days ?? 28);
  const avgPeriod = averagePeriodLength(
    periods,
    prefs.avg_period_length_days ?? 5
  );

  // Sort periods ASC so we can binary-search-ish for "most recent
  // period on or before this day" cheaply.
  const sortedPeriods = [...periods].sort((a, b) =>
    a.started_on.localeCompare(b.started_on)
  );

  // Aggregate meals per calendar day.
  const perDay = new Map<string, { mid: number; date: Date }>();
  for (const m of meals) {
    const d = new Date(m.eaten_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const mid = (Number(m.kcal_low) + Number(m.kcal_high)) / 2;
    const existing = perDay.get(key);
    if (existing) existing.mid += mid;
    else perDay.set(key, { mid, date: d });
  }

  const perPhase: Record<CyclePhase, number[]> = {
    menstrual: [],
    follicular: [],
    ovulation: [],
    luteal: [],
    unknown: [],
  };
  for (const v of perDay.values()) {
    const iso = isoDay(v.date);
    // Find last period start <= this day.
    let applicable: PeriodEntry | null = null;
    for (let i = sortedPeriods.length - 1; i >= 0; i--) {
      if (sortedPeriods[i]!.started_on <= iso) {
        applicable = sortedPeriods[i]!;
        break;
      }
    }
    if (!applicable) continue;
    const cycleDay = daysBetween(applicable.started_on, iso) + 1;
    // If we're more than avg_cycle + 7 days out, the user probably
    // missed logging a period — don't confidently assign a phase.
    if (cycleDay < 1 || cycleDay > avgCycle + 7) continue;
    const phase = phaseForDay(cycleDay, avgCycle, avgPeriod);
    perPhase[phase].push(v.mid);
  }

  const validPhases: CyclePhase[] = (
    ["menstrual", "follicular", "ovulation", "luteal"] as const
  ).filter((p) => perPhase[p].length >= 3);
  if (validPhases.length < 2) return null;

  const avgByPhase = new Map<CyclePhase, number>();
  for (const p of validPhases) {
    const arr = perPhase[p];
    avgByPhase.set(p, arr.reduce((s, n) => s + n, 0) / arr.length);
  }

  const overallMean =
    [...avgByPhase.values()].reduce((s, n) => s + n, 0) / avgByPhase.size;
  if (overallMean <= 0) return null;

  let biggest: { phase: CyclePhase; delta: number } | null = null;
  for (const [phase, avg] of avgByPhase) {
    const delta = (avg - overallMean) / overallMean;
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) {
      biggest = { phase, delta };
    }
  }
  if (!biggest || Math.abs(biggest.delta) < 0.15) return null;

  const pct = Math.round(Math.abs(biggest.delta) * 100);
  const phaseLabel =
    biggest.phase[0]!.toUpperCase() + biggest.phase.slice(1);
  const direction = biggest.delta > 0 ? "higher" : "lower";

  return {
    id: "cycle_phase_kcal_drift",
    severity: "info", // biology, not a mistake — never warn
    title: `${phaseLabel} phase averages ${pct}% ${direction} kcal`,
    body: cyclePhaseBody(biggest.phase, biggest.delta),
    evidence: {
      phase: biggest.phase,
      phase_avg_kcal: Math.round(avgByPhase.get(biggest.phase)!),
      overall_avg_kcal: Math.round(overallMean),
      delta_pct: Math.round(biggest.delta * 100),
      days_in_phase: perPhase[biggest.phase].length,
    },
  };
}

// ── Cycle-phase workout capacity ─────────────────────────────────
/**
 * "Your follicular sessions land 22% more volume than your menstrual
 * ones." Uses total session volume (Σ weight_kg × reps across all
 * sets) as the capacity signal — captures intensity + workload
 * without picking a single lift. Same double-gate as cycle-phase
 * kcal drift (opted in + share_with_coach).
 *
 * Same phase-bucket rules: ≥3 sessions per phase to include; skip
 * days more than avg_cycle + 7 out from the last logged period.
 *
 * Copy names the underlying physiology briefly so the pattern reads
 * as "use this to program your training" instead of "you're
 * underperforming." Never warn — this is a real biological curve.
 */
export function detectCyclePhaseWorkoutCapacity(
  workouts: { completed_at: string; exercises: unknown }[],
  prefs: Partial<CyclePrefs> | null | undefined,
  periods: PeriodEntry[]
): Pattern | null {
  if (!prefs?.enabled || !prefs.share_with_coach) return null;
  if (periods.length < 2) return null;
  if (workouts.length === 0) return null;

  const avgCycle = averageCycleLength(
    periods,
    prefs.avg_cycle_length_days ?? 28
  );
  const avgPeriod = averagePeriodLength(
    periods,
    prefs.avg_period_length_days ?? 5
  );
  const sortedPeriods = [...periods].sort((a, b) =>
    a.started_on.localeCompare(b.started_on)
  );

  const perPhase: Record<CyclePhase, number[]> = {
    menstrual: [],
    follicular: [],
    ovulation: [],
    luteal: [],
    unknown: [],
  };

  for (const w of workouts) {
    const volume = sessionVolume(w.exercises);
    if (volume <= 0) continue; // no lifted volume — skip cardio-only rows

    const d = new Date(w.completed_at);
    const iso = isoDay(d);
    let applicable: PeriodEntry | null = null;
    for (let i = sortedPeriods.length - 1; i >= 0; i--) {
      if (sortedPeriods[i]!.started_on <= iso) {
        applicable = sortedPeriods[i]!;
        break;
      }
    }
    if (!applicable) continue;
    const cycleDay = daysBetween(applicable.started_on, iso) + 1;
    if (cycleDay < 1 || cycleDay > avgCycle + 7) continue;
    const phase = phaseForDay(cycleDay, avgCycle, avgPeriod);
    perPhase[phase].push(volume);
  }

  const validPhases: CyclePhase[] = (
    ["menstrual", "follicular", "ovulation", "luteal"] as const
  ).filter((p) => perPhase[p].length >= 3);
  if (validPhases.length < 2) return null;

  const avgByPhase = new Map<CyclePhase, number>();
  for (const p of validPhases) {
    const arr = perPhase[p];
    avgByPhase.set(p, arr.reduce((s, n) => s + n, 0) / arr.length);
  }

  const overallMean =
    [...avgByPhase.values()].reduce((s, n) => s + n, 0) / avgByPhase.size;
  if (overallMean <= 0) return null;

  let biggest: { phase: CyclePhase; delta: number } | null = null;
  for (const [phase, avg] of avgByPhase) {
    const delta = (avg - overallMean) / overallMean;
    if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) {
      biggest = { phase, delta };
    }
  }
  if (!biggest || Math.abs(biggest.delta) < 0.15) return null;

  const pct = Math.round(Math.abs(biggest.delta) * 100);
  const phaseLabel =
    biggest.phase[0]!.toUpperCase() + biggest.phase.slice(1);
  const direction = biggest.delta > 0 ? "more" : "less";

  return {
    id: "cycle_phase_workout_capacity",
    severity: "info", // biology, not a mistake
    title: `${phaseLabel} sessions land ${pct}% ${direction} volume`,
    body: cyclePhaseCapacityBody(biggest.phase, biggest.delta),
    evidence: {
      phase: biggest.phase,
      phase_avg_volume: Math.round(avgByPhase.get(biggest.phase)!),
      overall_avg_volume: Math.round(overallMean),
      delta_pct: Math.round(biggest.delta * 100),
      sessions_in_phase: perPhase[biggest.phase].length,
    },
  };
}

/**
 * Sum of weight × reps across every set of every exercise. Loose
 * shape check because `exercises` is jsonb — any garbage entry is
 * silently skipped rather than failing the whole detector.
 */
function sessionVolume(exercisesRaw: unknown): number {
  if (!Array.isArray(exercisesRaw)) return 0;
  let total = 0;
  for (const ex of exercisesRaw as {
    sets?: { weight_kg?: number; reps?: number }[];
  }[]) {
    const sets = ex?.sets;
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      const w = Number(s?.weight_kg);
      const r = Number(s?.reps);
      if (!Number.isFinite(w) || w <= 0) continue;
      if (!Number.isFinite(r) || r <= 0) continue;
      total += w * r;
    }
  }
  return total;
}

function cyclePhaseCapacityBody(
  phase: CyclePhase,
  delta: number
): string {
  const higher = delta > 0;
  if (phase === "follicular" && higher) {
    return "Follicular estrogen supports peak lifting capacity for many women. Program heavy work + PR attempts here rather than fighting for them mid-luteal.";
  }
  if (phase === "menstrual" && !higher) {
    return "Menstrual fatigue is expected — technique-focused sessions with lower volume land better than forcing a PR week here.";
  }
  if (phase === "luteal" && !higher) {
    return "Luteal-phase dip is common — thermal load + progesterone raise perceived effort at the same weight. A planned deload aligns naturally with the late-luteal week.";
  }
  if (phase === "ovulation" && higher) {
    return "Ovulation window can peak briefly — some women see a short PR-attempt window here. Note it in your program.";
  }
  return "Worth noticing so training programming can flex with your cycle rather than against it.";
}

function cyclePhaseBody(phase: CyclePhase, delta: number): string {
  const higher = delta > 0;
  if (phase === "luteal" && higher) {
    return "Normal luteal-phase pattern — basal metabolic rate rises slightly and hunger cues follow. An extra ~150–250 kcal here is usually the right call rather than fighting it.";
  }
  if (phase === "menstrual" && !higher) {
    return "Appetite often dips during the menstrual phase. If energy feels flat, iron-forward meals help — not restriction.";
  }
  if (phase === "follicular" && higher) {
    return "Follicular phase running high — usually driven by more training capacity + higher activity, not a behavior gap.";
  }
  return "Worth noticing so it doesn't read as an adherence problem when it's just biology.";
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay!, (am ?? 1) - 1, ad ?? 1).getTime();
  const db = new Date(by!, (bm ?? 1) - 1, bd ?? 1).getTime();
  return Math.round((db - da) / 86_400_000);
}

function fmtHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
