/**
 * Cross-screen invalidation signal for the Calendar tab.
 *
 * Any mutation that affects a calendar day (a meal logged, a workout
 * saved, a weigh-in, a water log) calls markDayDirty(). The Calendar
 * tab consumes the dirty set on focus, translates dates → months, and
 * invalidates only those month keys in its own cache before re-fetching.
 *
 * Kept as a plain module-level state (no context, no store) because:
 *   - Only one consumer (the Calendar tab).
 *   - Producers are scattered across many screens; a hook per producer
 *     would be overkill for a fire-and-forget signal.
 *   - Set + function calls survives Fast Refresh cleanly.
 */

const dirty = new Set<string>();

/**
 * Mark a specific day as needing re-fetch on the Calendar next time it
 * gains focus. Defaults to today, since 99% of mutations affect today.
 */
export function markDayDirty(date: Date = new Date()) {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  dirty.add(key);
}

/**
 * Read out the unique YYYY-MM month keys that need re-fetching, then
 * clear the dirty set. Calendar calls this once per focus event.
 */
export function consumeDirtyMonths(): string[] {
  if (dirty.size === 0) return [];
  const months = new Set<string>();
  for (const day of dirty) months.add(day.slice(0, 7));
  dirty.clear();
  return [...months];
}
