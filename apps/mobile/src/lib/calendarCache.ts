import type { MealItemRow } from "@/types";

/**
 * Cross-screen invalidation signal for the Calendar tab.
 *
 * Any mutation that affects a calendar day (a meal logged, a workout
 * saved, a weigh-in, a water log) calls markDayDirty(). The Calendar
 * tab consumes the dirty set on focus, translates dates → months, and
 * invalidates only those month keys in its own cache before re-fetching.
 *
 * Kept as a plain module-level state (no context, no store) because:
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

/**
 * Optimistic ledger updates.
 *
 * When a log flow (barcode, manual, plate, meals-suggest) completes
 * successfully, the row lands on the server but the Home tab still
 * has to refetch to know about it — that round-trip is what makes
 * the ring feel laggy after a scan.
 *
 * Screens push the just-logged items here after the server confirms
 * the insert. Home consumes on focus, merges into ledger.totals for
 * an instant ring update, then the real refetch overwrites with
 * authoritative data (should match, so the merge is invisible).
 *
 * Items use a negative synthetic id so they don't collide with real
 * server ids when the real ledger response arrives — the merger
 * deduplicates by name+eaten_at instead.
 */

interface OptimisticItem extends Omit<MealItemRow, "id"> {
  synthetic_id: string;
}

const optimisticItems: OptimisticItem[] = [];
let nextSynthetic = 0;

/**
 * Push one or more items that were just successfully logged. Should
 * be called after /api/ledger/add returns 200. `eaten_at` defaults
 * to now — pass explicitly if the log path uses a different value.
 */
export function pushOptimisticLogItems(
  items: Array<
    Pick<
      MealItemRow,
      | "name"
      | "portion_estimate"
      | "source"
      | "confidence"
      | "meal_slot"
      | "kcal_low"
      | "kcal_high"
      | "protein_g_low"
      | "protein_g_high"
      | "carb_g_low"
      | "carb_g_high"
      | "fat_g_low"
      | "fat_g_high"
    > &
      Partial<
        Pick<
          MealItemRow,
          | "sodium_mg_low"
          | "sodium_mg_high"
          | "fiber_g_low"
          | "fiber_g_high"
          | "sugar_g_low"
          | "sugar_g_high"
          | "saturated_fat_g_low"
          | "saturated_fat_g_high"
          | "eaten_at"
        >
      >
  >
) {
  const nowIso = new Date().toISOString();
  for (const it of items) {
    optimisticItems.push({
      ...it,
      synthetic_id: `opt-${++nextSynthetic}`,
      eaten_at: it.eaten_at ?? nowIso,
      scan_id: null,
      photo_url: null,
    });
  }
}

/**
 * Read pending optimistic items without clearing — the caller merges
 * them into local ledger state, then the fresh server ledger arrives
 * and replaces the merged view. We clear only after the merge has
 * been rendered, so a background focus that arrives during navigation
 * still sees them.
 */
export function peekOptimisticLogItems(): OptimisticItem[] {
  return [...optimisticItems];
}

/**
 * Clear the optimistic buffer once the authoritative ledger response
 * has been rendered. Safe to call even when empty.
 */
export function clearOptimisticLogItems() {
  optimisticItems.length = 0;
}
