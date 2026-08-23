import type { MealSlot } from "@/types";

/**
 * Guess which meal slot the current local time falls into. Used as
 * the default value on every "log a meal" screen (voice, manual,
 * plate, barcode, meals-suggest, recipe, log tab) so the user
 * doesn't have to pick a slot for the common case.
 *
 * Windows chosen to bias toward the meal a Gulf-region user is most
 * likely about to eat, not the one they just finished:
 *   < 11:00 → breakfast
 *   < 16:00 → lunch
 *   < 21:00 → dinner
 *   otherwise → snack
 */
export function slotForNow(now: Date = new Date()): MealSlot {
  const h = now.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
