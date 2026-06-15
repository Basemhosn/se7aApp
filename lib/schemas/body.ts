import { z } from "zod";

export const bodyScanResultSchema = z.object({
  usable: z.boolean(),
  body_fat_pct_low: z.number().min(3).max(50),
  body_fat_pct_high: z.number().min(3).max(50),
  visual_muscle_level: z.enum(["low", "avg", "above_avg", "high"]),
  visible_issues: z.array(z.string().max(200)).max(10),
  notes: z.string().max(500),
});

export type BodyScanResult = z.infer<typeof bodyScanResultSchema>;

export function normalizeBodyScan(r: BodyScanResult): BodyScanResult {
  if (r.body_fat_pct_low > r.body_fat_pct_high) {
    const tmp = r.body_fat_pct_low;
    r.body_fat_pct_low = r.body_fat_pct_high;
    r.body_fat_pct_high = tmp;
  }
  return r;
}
