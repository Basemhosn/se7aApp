/**
 * Parse an AI-generated portion string into a numeric value + unit.
 *
 * Handles the common forms the plate / menu prompts emit:
 *   "150g", "300 ml", "1.5 cups", "2 pieces", "4 slices",
 *   "1 tbsp", "0.25 l", "6oz"
 *
 * Returns null when no numeric prefix is detectable — callers then
 * fall back to a free-form "multiply by N" prompt.
 *
 * The unit returned is normalized to the lowercase singular Shortest
 * form ("g", "ml", "cup", "piece", "slice", "tbsp", "tsp", "oz", "l")
 * and should be used directly in UI labels like `${n}${unit}` or
 * `${n} ${unit}s`.
 */
export interface ParsedPortion {
  value: number;
  unit: string;
}

const UNIT_PATTERNS: Array<{ re: RegExp; unit: string; scale?: number }> = [
  // Mass — store in grams
  { re: /^(\d+(?:\.\d+)?)\s*(kg|kilograms?)\b/i, unit: "g", scale: 1000 },
  { re: /^(\d+(?:\.\d+)?)\s*(g|grams?|gr)\b/i, unit: "g" },
  // Volume — store in ml
  { re: /^(\d+(?:\.\d+)?)\s*(l|litres?|liters?)\b/i, unit: "ml", scale: 1000 },
  { re: /^(\d+(?:\.\d+)?)\s*(ml|milliliters?|millilitres?)\b/i, unit: "ml" },
  // US customary
  { re: /^(\d+(?:\.\d+)?)\s*(oz|ounces?)\b/i, unit: "oz" },
  { re: /^(\d+(?:\.\d+)?)\s*(cups?)\b/i, unit: "cup" },
  { re: /^(\d+(?:\.\d+)?)\s*(tbsps?|tablespoons?)\b/i, unit: "tbsp" },
  { re: /^(\d+(?:\.\d+)?)\s*(tsps?|teaspoons?)\b/i, unit: "tsp" },
  // Count-based
  { re: /^(\d+(?:\.\d+)?)\s*(pieces?|pcs?)\b/i, unit: "piece" },
  { re: /^(\d+(?:\.\d+)?)\s*(slices?)\b/i, unit: "slice" },
  { re: /^(\d+(?:\.\d+)?)\s*(servings?)\b/i, unit: "serving" },
];

export function parsePortion(portion: string | null | undefined): ParsedPortion | null {
  if (!portion) return null;
  const trimmed = portion.trim();
  for (const { re, unit, scale } of UNIT_PATTERNS) {
    const m = re.exec(trimmed);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      return { value: scale ? n * scale : n, unit };
    }
  }
  return null;
}

/**
 * Format a portion value for display. Pluralizes count-based units when
 * the value isn't exactly 1 ("2 pieces", "1 slice"). Mass + volume keep
 * their short form without pluralization ("150g" / "300ml").
 */
export function formatPortion({ value, unit }: ParsedPortion): string {
  const n = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  switch (unit) {
    case "g":
    case "ml":
    case "oz":
    case "tbsp":
    case "tsp":
    case "l":
      return `${n}${unit}`;
    case "cup":
      return `${n} ${n === 1 ? "cup" : "cups"}`;
    case "piece":
      return `${n} ${n === 1 ? "piece" : "pieces"}`;
    case "slice":
      return `${n} ${n === 1 ? "slice" : "slices"}`;
    case "serving":
      return `${n} ${n === 1 ? "serving" : "servings"}`;
    default:
      return `${n} ${unit}`;
  }
}

/** Long form for the prompt body ("grams", "milliliters", "pieces"). */
export function unitLongName(unit: string): string {
  switch (unit) {
    case "g":
      return "grams";
    case "ml":
      return "milliliters";
    case "oz":
      return "ounces";
    case "cup":
      return "cups";
    case "tbsp":
      return "tablespoons";
    case "tsp":
      return "teaspoons";
    case "piece":
      return "pieces";
    case "slice":
      return "slices";
    case "serving":
      return "servings";
    default:
      return unit;
  }
}
