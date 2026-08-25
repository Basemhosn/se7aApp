import { z } from "zod";

export const foodLookupInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
});

export const foodLookupItemSchema = z.object({
  name: z.string().min(1).max(140),
  portion: z.string().min(1).max(300),
  kcal_low: z.number().int().min(0).max(5000),
  kcal_high: z.number().int().min(0).max(5000),
  protein_g_low: z.number().min(0).max(400),
  protein_g_high: z.number().min(0).max(400),
  carb_g_low: z.number().min(0).max(600),
  carb_g_high: z.number().min(0).max(600),
  fat_g_low: z.number().min(0).max(400),
  fat_g_high: z.number().min(0).max(400),
  confidence: z.enum(["low", "medium", "high"]),
});

export const foodLookupResultSchema = z.object({
  items: z.array(foodLookupItemSchema).min(1).max(3),
  notes: z.string().max(400).optional(),
});

export type FoodLookupItem = z.infer<typeof foodLookupItemSchema>;
export type FoodLookupResult = z.infer<typeof foodLookupResultSchema>;
