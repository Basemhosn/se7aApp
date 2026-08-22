/**
 * Menstrual cycle math — pure functions, no DB access.
 *
 * We treat the day the user logs a period START as cycle day 1. Phase
 * boundaries scale off the user's rolling average cycle length so a
 * 24-day cycle user doesn't get told they're in the follicular phase
 * on day 12 of what is, for them, already ovulation.
 *
 * Rolling average is derived from the last N observed gaps between
 * period starts, clamped to the physiologically plausible 21–45 day
 * range so a badly typo'd entry can't drag the average off a cliff.
 *
 * NOT medical advice — used only to bias coaching language ("expect
 * lower energy today"), never to make health claims or predict
 * fertility with precision. Aviva Romm's numbers, not a clinic's.
 */

export type CyclePhase =
  | "menstrual"
  | "follicular"
  | "ovulation"
  | "luteal"
  | "unknown";

export interface CycleStatus {
  enabled: boolean;
  phase: CyclePhase;
  cycle_day: number | null; // 1-based; null when we have no history
  avg_cycle_length_days: number;
  avg_period_length_days: number;
  days_until_next_period: number | null;
  last_period_started_on: string | null; // YYYY-MM-DD
  next_period_estimate: string | null; // YYYY-MM-DD, null when no history
  history_count: number;
  coaching_hint: string | null;
}

export interface CyclePrefs {
  enabled: boolean;
  avg_cycle_length_days: number;
  avg_period_length_days: number;
  share_with_coach: boolean;
}

export const DEFAULT_CYCLE_PREFS: CyclePrefs = {
  enabled: false,
  avg_cycle_length_days: 28,
  avg_period_length_days: 5,
  share_with_coach: true,
};

const MIN_CYCLE = 21;
const MAX_CYCLE = 45;

export interface PeriodEntry {
  started_on: string; // YYYY-MM-DD
  ended_on: string | null;
}

/**
 * Compute average cycle length from observed gaps between period starts.
 * Uses the last up-to-6 gaps for responsiveness. Falls back to the
 * stored preference when we have fewer than 2 periods logged.
 */
export function averageCycleLength(
  periods: PeriodEntry[],
  fallback: number
): number {
  if (periods.length < 2) return clampCycle(fallback);
  // periods are expected sorted by started_on ASC or DESC; normalize:
  const sorted = [...periods].sort((a, b) =>
    a.started_on.localeCompare(b.started_on)
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = daysBetween(sorted[i - 1]!.started_on, sorted[i]!.started_on);
    if (g >= MIN_CYCLE && g <= MAX_CYCLE) gaps.push(g);
  }
  if (gaps.length === 0) return clampCycle(fallback);
  const recent = gaps.slice(-6);
  const avg = recent.reduce((s, g) => s + g, 0) / recent.length;
  return Math.round(avg);
}

/**
 * Same shape for period length — average observed period duration.
 */
export function averagePeriodLength(
  periods: PeriodEntry[],
  fallback: number
): number {
  const durations: number[] = [];
  for (const p of periods) {
    if (!p.ended_on) continue;
    const d = daysBetween(p.started_on, p.ended_on) + 1; // inclusive
    if (d >= 2 && d <= 10) durations.push(d);
  }
  if (durations.length === 0) return clampInt(fallback, 2, 10);
  const recent = durations.slice(-6);
  const avg = recent.reduce((s, d) => s + d, 0) / recent.length;
  return Math.round(avg);
}

/**
 * Compute the full cycle status for a user, given their prefs and the
 * ordered history of period entries.
 */
export function computeCycleStatus(
  prefsRaw: Partial<CyclePrefs> | null | undefined,
  periods: PeriodEntry[],
  now: Date = new Date()
): CycleStatus {
  const prefs: CyclePrefs = { ...DEFAULT_CYCLE_PREFS, ...(prefsRaw ?? {}) };

  if (!prefs.enabled) {
    return {
      enabled: false,
      phase: "unknown",
      cycle_day: null,
      avg_cycle_length_days: prefs.avg_cycle_length_days,
      avg_period_length_days: prefs.avg_period_length_days,
      days_until_next_period: null,
      last_period_started_on: null,
      next_period_estimate: null,
      history_count: periods.length,
      coaching_hint: null,
    };
  }

  const avgCycle = averageCycleLength(periods, prefs.avg_cycle_length_days);
  const avgPeriod = averagePeriodLength(periods, prefs.avg_period_length_days);

  if (periods.length === 0) {
    return {
      enabled: true,
      phase: "unknown",
      cycle_day: null,
      avg_cycle_length_days: avgCycle,
      avg_period_length_days: avgPeriod,
      days_until_next_period: null,
      last_period_started_on: null,
      next_period_estimate: null,
      history_count: 0,
      coaching_hint: null,
    };
  }

  // periods sorted DESC by started_on (client responsibility, but sort
  // defensively so we don't assume).
  const sorted = [...periods].sort((a, b) =>
    b.started_on.localeCompare(a.started_on)
  );
  const last = sorted[0]!;
  const cycleDay = daysBetween(last.started_on, isoDay(now)) + 1;

  // Only project forward within one cycle — anything past that is
  // "the user missed logging" territory and we don't want to imply
  // certainty about their state.
  if (cycleDay < 1 || cycleDay > avgCycle + 7) {
    return {
      enabled: true,
      phase: "unknown",
      cycle_day: null,
      avg_cycle_length_days: avgCycle,
      avg_period_length_days: avgPeriod,
      days_until_next_period: null,
      last_period_started_on: last.started_on,
      next_period_estimate: addDays(last.started_on, avgCycle),
      history_count: periods.length,
      coaching_hint:
        "It's been a while — log your last period start when you can.",
    };
  }

  const phase = phaseForDay(cycleDay, avgCycle, avgPeriod);
  const nextStart = addDays(last.started_on, avgCycle);
  const daysUntilNext = daysBetween(isoDay(now), nextStart);

  return {
    enabled: true,
    phase,
    cycle_day: cycleDay,
    avg_cycle_length_days: avgCycle,
    avg_period_length_days: avgPeriod,
    days_until_next_period: daysUntilNext,
    last_period_started_on: last.started_on,
    next_period_estimate: nextStart,
    history_count: periods.length,
    coaching_hint: hintForPhase(phase, cycleDay, daysUntilNext),
  };
}

/**
 * Which phase does the given cycle day fall in, given the user's
 * average cycle length? Ovulation is anchored to (cycle - 14) days —
 * the luteal phase is the more stable of the two halves biologically.
 */
export function phaseForDay(
  cycleDay: number,
  cycleLen: number,
  periodLen: number
): CyclePhase {
  if (cycleDay <= periodLen) return "menstrual";
  const ovulationDay = cycleLen - 14; // typical LH surge → ovulation
  // 3-day ovulation window centered on ovulationDay.
  if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1) {
    return "ovulation";
  }
  if (cycleDay < ovulationDay - 1) return "follicular";
  return "luteal";
}

/**
 * Short coaching hint the coach can weave into advice. Kept generic
 * so we're not making prescriptive medical claims — just biasing
 * language toward what's usually true at each phase.
 */
export function hintForPhase(
  phase: CyclePhase,
  cycleDay: number | null,
  daysUntilNext: number | null
): string | null {
  switch (phase) {
    case "menstrual":
      return "Energy typically lower. Iron-forward meals help; keep training but consider lighter volume.";
    case "follicular":
      return "Recovery + protein synthesis usually strongest. Good window to push training intensity.";
    case "ovulation":
      return "Peak strength window for many. Cravings usually low.";
    case "luteal":
      if (daysUntilNext !== null && daysUntilNext <= 3) {
        return "Pre-menstrual — carb cravings + water retention are common. Add ~100–200 kcal if hungry.";
      }
      return "Basal metabolic rate rises slightly. Cravings may pick up in the second half.";
    case "unknown":
    default:
      return null;
  }
}

// ── date helpers ────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = dateFromIso(a);
  const db = dateFromIso(b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function addDays(iso: string, delta: number): string {
  const d = dateFromIso(iso);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clampCycle(n: number): number {
  return clampInt(n, MIN_CYCLE, MAX_CYCLE);
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
