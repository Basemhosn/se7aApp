import { z } from "zod";

export const startFastSchema = z.object({
  target_hours: z.number().min(1).max(72),
  notes: z.string().max(300).nullable().optional(),
});

export type StartFastInput = z.infer<typeof startFastSchema>;
