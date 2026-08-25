import { z } from "zod";

export const suggestMealsSchema = z.object({
  meal_slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  restrictions: z
    .array(
      z.enum([
        "vegetarian",
        "vegan",
        "dairy-free",
        "gluten-free",
        "low-carb",
        "halal",
      ])
    )
    .optional(),
});

export const mealSuggestionResultSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        portion: z.string().min(1).max(400),
        reason: z.string().min(1).max(400),
        kcal_low: z.number().int().min(0).max(3000),
        kcal_high: z.number().int().min(0).max(3000),
        protein_g_low: z.number().min(0).max(300),
        protein_g_high: z.number().min(0).max(300),
        carb_g_low: z.number().min(0).max(500),
        carb_g_high: z.number().min(0).max(500),
        fat_g_low: z.number().min(0).max(300),
        fat_g_high: z.number().min(0).max(300),
      })
    )
    .min(1)
    .max(4),
  notes: z.string().max(500).optional(),
});

export type SuggestMealsInput = z.infer<typeof suggestMealsSchema>;
export type MealSuggestionResult = z.infer<typeof mealSuggestionResultSchema>;
