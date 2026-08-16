import { z } from "zod";

export const onboardingSchema = z.object({
  display_name: z.string().trim().min(1).max(60).optional(),
  sex: z.enum(["male", "female"]),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
    .refine((d) => {
      // Privacy policy: under-16 not permitted.
      const dob = new Date(d);
      if (Number.isNaN(dob.getTime())) return false;
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear() -
        (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
          ? 1 : 0);
      return age >= 16 && age <= 100;
    }, "Must be between 16 and 100 years old"),
  height_cm: z.number().positive().max(279),
  weight_kg: z.number().positive().max(499),
  activity_level: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
  ]),
  goal: z.enum(["cut", "recomp", "maintain", "bulk"]),
  goal_rate_kg_per_week: z.number().min(-1.5).max(1.0),
  units: z.enum(["metric", "imperial"]).default("metric"),
  // Phase 3: workout programming
  training_experience: z
    .enum(["beginner", "intermediate", "advanced"])
    .optional(),
  equipment_access: z
    .enum(["bodyweight", "home", "gym", "both"])
    .optional(),
  days_per_week: z.number().int().min(2).max(7).optional(),
  injuries: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  // Kcal delta applied on rest days (negative subtracts, positive adds).
  rest_day_kcal_delta: z.number().int().min(-1000).max(1000).optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const weightLogSchema = z.object({
  weight_kg: z.number().positive().max(499),
  body_fat_pct: z.number().min(3).max(60).optional(),
});

export type WeightLogInput = z.infer<typeof weightLogSchema>;
