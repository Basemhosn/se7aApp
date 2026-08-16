import { z } from "zod";

export const logWaterSchema = z.object({
  ml: z.number().int().min(1).max(5000),
});

export type LogWaterInput = z.infer<typeof logWaterSchema>;
