/**
 * Canonical date-key helpers. Small pure functions duplicated across
 * ~8 files before this extract — now imported everywhere so the
 * "what does 'today' mean" definition lives in one place.
 *
 * Two flavors:
 *   - isoDay(d): server timezone (UTC in Vercel functions). Fine for
 *     day keys that don't need to align with the user's calendar day
 *     (e.g. ISO dates on wearable sync rows).
 *   - localDayKey(d, tzOffsetMin): shift into the user's local time
 *     before extracting the day. Required anywhere a "one action per
 *     day" rule (streak walks, freeze budgets, hourly notification
 *     dedup) has to match what the user considers "today" — not
 *     what a UTC clock does.
 */

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function localDayKey(d: Date, tzOffsetMin: number): string {
  const shifted = new Date(d.getTime() + tzOffsetMin * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Shift a Date object by N days (positive or negative). Preserves the
 * local hour — uses setDate which handles month/year rollover.
 */
export function offsetDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + delta);
  return out;
}

/**
 * Add days to a YYYY-MM-DD string, returning YYYY-MM-DD. Callers that
 * only work in ISO strings (streak walks, cycle math) skip a Date
 * round-trip.
 */
export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + delta);
  return isoDay(dt);
}

/**
 * Days between two YYYY-MM-DD strings (b - a). Positive when b is
 * later. Same string-only interface as addDaysIso.
 */
export function daysBetweenIso(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay!, (am ?? 1) - 1, ad ?? 1).getTime();
  const db = new Date(by!, (bm ?? 1) - 1, bd ?? 1).getTime();
  return Math.round((db - da) / 86_400_000);
}
