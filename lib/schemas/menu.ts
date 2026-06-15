import { z } from "zod";

export const menuDishSchema = z.object({
  name: z.string().min(1).max(140),
  description: z.string().max(280).optional(),
  verdict: z.enum(["order", "consider", "skip"]),
  reason: z.string().min(1).max(280),
  rank: z.number().int().min(1).max(40),
  kcal_low: z.number().int().min(0).max(5000),
  kcal_high: z.number().int().min(0).max(6000),
  protein_g_low: z.number().min(0).max(300),
  protein_g_high: z.number().min(0).max(400),
  carb_g_low: z.number().min(0).max(500),
  carb_g_high: z.number().min(0).max(600),
  fat_g_low: z.number().min(0).max(300),
  fat_g_high: z.number().min(0).max(400),
});

export const menuScanResultSchema = z.object({
  identifiable: z.boolean(),
  restaurant_guess: z.string().max(140).optional(),
  dishes: z.array(menuDishSchema).max(30),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string().max(500).optional(),
});

export type MenuDish = z.infer<typeof menuDishSchema>;
export type MenuScanResult = z.infer<typeof menuScanResultSchema>;

/** Enforce high >= low on every macro, defensive against model slips. */
export function normalizeMenuScan(r: MenuScanResult): MenuScanResult {
  const fix = (lo: number, hi: number): [number, number] =>
    lo <= hi ? [lo, hi] : [hi, lo];
  r.dishes = r.dishes
    .map((d) => {
      const [kl, kh] = fix(d.kcal_low, d.kcal_high);
      const [pl, ph] = fix(d.protein_g_low, d.protein_g_high);
      const [cl, ch] = fix(d.carb_g_low, d.carb_g_high);
      const [fl, fh] = fix(d.fat_g_low, d.fat_g_high);
      return {
        ...d,
        kcal_low: kl,
        kcal_high: kh,
        protein_g_low: pl,
        protein_g_high: ph,
        carb_g_low: cl,
        carb_g_high: ch,
        fat_g_low: fl,
        fat_g_high: fh,
      };
    })
    // Stable sort by rank — the model is told to rank but we re-sort
    // server-side so the client doesn't have to trust input order.
    .sort((a, b) => a.rank - b.rank);
  return r;
}
