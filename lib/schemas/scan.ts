import { z } from "zod";

/**
 * Structured output schema for plate scans.
 *
 * Brand rule: every macro is a range. The model is instructed in the
 * prompt to keep high >= low; we additionally normalize server-side to
 * guarantee that invariant before persisting.
 */
// Numeric caps are intentionally generous. The plate.v3 prompt asks
// the model to widen ranges to a 3× spread when no scale reference is
// visible, which can push high-end values well past a "realistic
// meal" ceiling. Tight caps here silently fail generateObject with
// "response did not match schema" (see memory feedback on schema
// tightness). Rule of thumb: cap ~= (worst realistic item) × 3.
export const plateItemSchema = z.object({
  name: z.string().min(1).max(200),
  portion_estimate: z.string().max(500),
  kcal_low: z.number().int().min(0).max(8000),
  kcal_high: z.number().int().min(0).max(10000),
  protein_g_low: z.number().min(0).max(500),
  protein_g_high: z.number().min(0).max(700),
  carb_g_low: z.number().min(0).max(800),
  carb_g_high: z.number().min(0).max(1000),
  fat_g_low: z.number().min(0).max(500),
  fat_g_high: z.number().min(0).max(700),
  // Micronutrients — optional because legacy scans + manual entries
  // don't have them, but the plate scan prompt (v2+) is expected to
  // emit these for every item.
  sodium_mg_low: z.number().min(0).max(30000).optional(),
  sodium_mg_high: z.number().min(0).max(30000).optional(),
  fiber_g_low: z.number().min(0).max(200).optional(),
  fiber_g_high: z.number().min(0).max(200).optional(),
  sugar_g_low: z.number().min(0).max(800).optional(),
  sugar_g_high: z.number().min(0).max(800).optional(),
  saturated_fat_g_low: z.number().min(0).max(500).optional(),
  saturated_fat_g_high: z.number().min(0).max(500).optional(),
});

export const plateScanResultSchema = z.object({
  identifiable: z.boolean(),
  items: z.array(plateItemSchema).max(20),
  confidence: z.enum(["low", "medium", "high"]),
  invisible_costs: z.array(z.string().max(500)).max(15),
  // v3 prompt asks the model to write container guess AND scale
  // reference status AND range-widening reasoning here. 500 was too
  // tight for the multi-sentence output we now ask for.
  notes: z.string().max(2000).optional(),
});

export type PlateItem = z.infer<typeof plateItemSchema>;
export type PlateScanResult = z.infer<typeof plateScanResultSchema>;

/**
 * Normalize an AI-returned plate scan: enforce high >= low for every
 * macro by swapping when inverted. Returns the same shape, mutated.
 */
export function normalizePlateScan(r: PlateScanResult): PlateScanResult {
  const fix = (lo: number, hi: number): [number, number] =>
    lo <= hi ? [lo, hi] : [hi, lo];
  const fixOpt = (
    lo: number | undefined,
    hi: number | undefined
  ): [number | undefined, number | undefined] => {
    if (lo == null || hi == null) return [lo, hi];
    return lo <= hi ? [lo, hi] : [hi, lo];
  };
  r.items = r.items.map((it) => {
    const [kl, kh] = fix(it.kcal_low, it.kcal_high);
    const [pl, ph] = fix(it.protein_g_low, it.protein_g_high);
    const [cl, ch] = fix(it.carb_g_low, it.carb_g_high);
    const [fl, fh] = fix(it.fat_g_low, it.fat_g_high);
    const [sodL, sodH] = fixOpt(it.sodium_mg_low, it.sodium_mg_high);
    const [fibL, fibH] = fixOpt(it.fiber_g_low, it.fiber_g_high);
    const [sugL, sugH] = fixOpt(it.sugar_g_low, it.sugar_g_high);
    const [satL, satH] = fixOpt(
      it.saturated_fat_g_low,
      it.saturated_fat_g_high
    );
    return {
      ...it,
      kcal_low: kl,
      kcal_high: kh,
      protein_g_low: pl,
      protein_g_high: ph,
      carb_g_low: cl,
      carb_g_high: ch,
      fat_g_low: fl,
      fat_g_high: fh,
      sodium_mg_low: sodL,
      sodium_mg_high: sodH,
      fiber_g_low: fibL,
      fiber_g_high: fibH,
      sugar_g_low: sugL,
      sugar_g_high: sugH,
      saturated_fat_g_low: satL,
      saturated_fat_g_high: satH,
    };
  });
  return r;
}

/**
 * Body of POST /api/ledger/add — the user-selected subset of scan items
 * they want to commit to today's log.
 */
export const ledgerAddSchema = z.object({
  scan_id: z.string().uuid().optional(),
  source: z.enum(["plate_scan", "menu_scan", "manual", "barcode", "voice"]),
  meal_slot: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  // Restaurant tag applied to every item in this write. Optional so
  // home meals + manual logs skip it. Empty string coerces to null so
  // the client can clear the field.
  restaurant_name: z.string().trim().max(140).nullable().optional(),
  items: z.array(plateItemSchema.extend({
    confidence: z.enum(["low", "medium", "high"]).optional(),
  })).min(1).max(15),
});

export type LedgerAddInput = z.infer<typeof ledgerAddSchema>;
