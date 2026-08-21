import { z } from "zod";

export const cardioKindEnum = z.enum([
  "run",
  "walk",
  "ride",
  "swim",
  "row",
  "elliptical",
  "hike",
  "other",
]);

export const logCardioSchema = z.object({
  kind: cardioKindEnum,
  started_at: z.string().datetime().optional(),
  duration_min: z.number().positive().max(1440),
  distance_km: z.number().min(0).max(500).optional().nullable(),
  kcal_burned: z.number().int().min(0).max(10000).optional().nullable(),
  avg_hr: z.number().int().min(30).max(250).optional().nullable(),
  source: z.enum(["manual", "healthkit"]).default("manual"),
  hk_uuid: z.string().max(64).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const importActivitySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().min(0).optional(),
  active_kcal: z.number().int().min(0).optional(),
});

export type CardioKind = z.infer<typeof cardioKindEnum>;
export type LogCardioInput = z.infer<typeof logCardioSchema>;
