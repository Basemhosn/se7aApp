export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "bodyweight" | "home" | "gym" | "both";
export type Goal = "cut" | "recomp" | "maintain" | "bulk";

export interface ExerciseSpec {
  name: string;
  sets: number;
  /** Rep target as a range so users can push into the range as they progress. */
  reps: string; // "6-8", "10-12", "AMRAP"
  /**
   * RPE target on the last set (7-10 scale). Cues intensity without demanding
   * exact weight prescriptions — matches SE7A's "honest ranges" ethos.
   */
  rpe: number | null;
  /** Rest between sets, in seconds. Null for supersets / minimal-rest circuits. */
  rest_sec: number | null;
  /** Optional coaching cue or common form fix. Rendered as a subtitle. */
  cue?: string;
  /** Optional substitutes if the user can't do this exercise. */
  substitutes?: string[];
}

export interface Session {
  name: string;
  focus: string; // "Legs / posterior chain"
  exercises: ExerciseSpec[];
}

export interface Program {
  id: string; // slug
  name: string;
  description: string;
  days_per_week: number;
  target_experience: Experience;
  target_equipment: Equipment;
  goal_alignment: Goal[];
  sessions: Session[]; // length == days_per_week
}
