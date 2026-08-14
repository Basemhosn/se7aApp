// Client-side mirror of lib/programs/select.ts on the web. Kept small so the
// onboarding reveal can rank programs against the local profile without a
// round-trip. Catalog itself comes from /api/workouts/catalog.

export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "bodyweight" | "home" | "gym" | "both";
export type Goal = "cut" | "recomp" | "maintain" | "bulk";

export interface ExerciseSpec {
  name: string;
  sets: number;
  reps: string;
  rpe: number | null;
  rest_sec: number | null;
  cue?: string;
  substitutes?: string[];
}

export interface Session {
  name: string;
  focus: string;
  exercises: ExerciseSpec[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  days_per_week: number;
  target_experience: Experience;
  target_equipment: Equipment;
  goal_alignment: Goal[];
  sessions: Session[];
}

export interface SelectorInput {
  experience: Experience;
  equipment: Equipment;
  days_per_week: number;
  goal: Goal;
}

export interface Scored {
  program: Program;
  score: number;
  reason: string;
}

function equipmentCompatible(userHas: Equipment, programNeeds: Equipment): boolean {
  if (userHas === "both" || userHas === "gym") return true;
  if (userHas === "home") return programNeeds !== "gym";
  return programNeeds === "bodyweight";
}

export function rankPrograms(catalog: Program[], input: SelectorInput): Scored[] {
  return catalog
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];

      if (p.target_experience === input.experience) {
        score += 5;
        reasons.push(`matches your ${input.experience} experience`);
      }
      if (equipmentCompatible(input.equipment, p.target_equipment)) score += 3;
      else score -= 4;

      if (p.days_per_week === input.days_per_week) {
        score += 5;
        reasons.push(`fits your ${input.days_per_week}-day schedule`);
      } else if (Math.abs(p.days_per_week - input.days_per_week) === 1) {
        score += 2;
        reasons.push(`close to your ${input.days_per_week}-day schedule`);
      }

      if (p.goal_alignment.includes(input.goal)) {
        score += 2;
        reasons.push(`built for ${input.goal}`);
      }

      return { program: p, score, reason: reasons.join(" · ") || "general fit" };
    })
    .sort((a, b) => b.score - a.score);
}
