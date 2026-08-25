import { z } from "zod";

const mealSlotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const generatePlanSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
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

export const ingredientSchema = z.object({
  name: z.string().min(1).max(120),
  qty: z.string().min(1).max(80),
});

export const plannedMealSchema = z.object({
  slot: mealSlotEnum,
  name: z.string().min(1).max(120),
  subtitle: z.string().max(120).optional(),
  portion: z.string().min(1).max(400),
  kcal_low: z.number().int().min(0).max(3000),
  kcal_high: z.number().int().min(0).max(3000),
  protein_g_low: z.number().min(0).max(300),
  protein_g_high: z.number().min(0).max(300),
  carb_g_low: z.number().min(0).max(500),
  carb_g_high: z.number().min(0).max(500),
  fat_g_low: z.number().min(0).max(300),
  fat_g_high: z.number().min(0).max(300),
  // Micronutrients (meal_plan.v3_micros). Optional for backward
  // compat with plans generated pre-bump; new plans populate them.
  // When a plan meal is logged via /api/meal-plan/log, these carry
  // through to the meal_item row so today's totals stay accurate.
  sodium_mg_low: z.number().min(0).max(20000).optional(),
  sodium_mg_high: z.number().min(0).max(20000).optional(),
  fiber_g_low: z.number().min(0).max(100).optional(),
  fiber_g_high: z.number().min(0).max(100).optional(),
  sugar_g_low: z.number().min(0).max(500).optional(),
  sugar_g_high: z.number().min(0).max(500).optional(),
  saturated_fat_g_low: z.number().min(0).max(300).optional(),
  saturated_fat_g_high: z.number().min(0).max(300).optional(),
  ingredients: z.array(ingredientSchema).min(0).max(20),
  recipe_id: z.string().nullable().optional(),
  logged_meal_item_id: z.number().nullable().optional(),
});

export const plannedDaySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  meals: z.array(plannedMealSchema).min(1).max(6),
});

export const mealPlanResultSchema = z.object({
  days: z.array(plannedDaySchema).length(7),
  notes: z.array(z.string().max(500)).max(4).optional(),
});

export const logPlanMealSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_of_week: z.number().int().min(0).max(6),
  slot: mealSlotEnum,
});

export const regenerateMealSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_of_week: z.number().int().min(0).max(6),
  slot: mealSlotEnum,
});

export type MealPlanResult = z.infer<typeof mealPlanResultSchema>;
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
