import { z } from "zod";

export const experienceEnum = z.enum(["beginner", "intermediate", "advanced"]);
export const equipmentEnum = z.enum(["bodyweight", "home", "gym", "both"]);
export const daysPerWeek = z.number().int().min(2).max(7);

export const pickProgramSchema = z.object({
  program_id: z.string().min(1),
});

/**
 * A single set the user actually did. reps + weight are ranges only insofar
 * as the user chooses to log; we store the exact value they entered.
 */
export const loggedSetSchema = z.object({
  reps: z.number().int().min(0).max(500),
  weight_kg: z.number().min(0).max(1000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
});

export const loggedExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.array(loggedSetSchema).min(1).max(20),
  notes: z.string().max(500).nullable().optional(),
});

export const logSessionSchema = z.object({
  program_id: z.string().min(1).nullable().optional(),
  session_index: z.number().int().min(0).max(6),
  session_name: z.string().min(1).max(100),
  exercises: z.array(loggedExerciseSchema).min(1).max(30),
  duration_min: z.number().int().min(1).max(600).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type LoggedSet = z.infer<typeof loggedSetSchema>;
export type LoggedExercise = z.infer<typeof loggedExerciseSchema>;
export type LogSessionInput = z.infer<typeof logSessionSchema>;
