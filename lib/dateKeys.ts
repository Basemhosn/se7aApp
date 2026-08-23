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
