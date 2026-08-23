import type { Ionicons } from "@expo/vector-icons";
import type { MealSlot } from "@/types";
import { colors } from "@/lib/theme";

/**
 * Canonical order of meal slots — used anywhere we iterate all four
 * (chip pickers, slot grids, plan-day meal ordering). Locking the
 * order in one place also means "add a fifth slot" is one edit,
 * not eight.
 */
export const SLOTS: MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/**
 * Icon + tint + bilingual label for each slot. Home + meal-plan +
 * anywhere else that renders slot rows read from this so a UI change
 * (say a re-tint) only edits the map here.
 *
 * Dinner tint is the purple #8b7dd6 — outside the theme palette but
 * intentional as the fourth distinct hue after gold/coral/mint.
 */
export const SLOT_META: Record<
  MealSlot,
  {
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    en: string;
    ar: string;
  }
> = {
  breakfast: {
    icon: "sunny",
    tint: colors.gold,
    en: "BREAKFAST",
    ar: "الفطور",
  },
  lunch: {
    icon: "restaurant",
    tint: colors.coral,
    en: "LUNCH",
    ar: "الغداء",
  },
  dinner: {
    icon: "moon",
    tint: "#8b7dd6",
    en: "DINNER",
    ar: "العشاء",
  },
  snack: {
    icon: "leaf",
    tint: colors.mint,
    en: "SNACK",
    ar: "وجبة خفيفة",
  },
};

/** Locale-aware slot label. Callers pass their own isArabic flag. */
export function slotLabel(slot: MealSlot, isArabic: boolean): string {
  return isArabic ? SLOT_META[slot].ar : SLOT_META[slot].en;
}

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
