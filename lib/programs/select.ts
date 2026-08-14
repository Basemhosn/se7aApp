import { PROGRAMS } from "./catalog";
import type { Equipment, Experience, Goal, Program } from "./types";

export interface SelectorInput {
  experience: Experience;
  equipment: Equipment;
  days_per_week: number;
  goal: Goal;
}

interface Scored {
  program: Program;
  score: number;
  reason: string;
}

/**
 * Rank all programs by fit and return them sorted best-first. The scoring
 * favors:
 *   +5  exact experience match
 *   +3  compatible equipment (bodyweight-only user only fits bodyweight prog;
 *       gym user fits any; home user fits home + bodyweight)
 *   +5  exact days_per_week match, +2 within one day, 0 otherwise
 *   +2  goal in program's goal_alignment
 *
 * The top-scoring program is treated as the recommendation; the rest are
 * "alternatives" the user can pick instead.
 */
export function rankPrograms(input: SelectorInput): Scored[] {
  return PROGRAMS.map((p) => {
    let score = 0;
    const reasons: string[] = [];

    if (p.target_experience === input.experience) {
      score += 5;
      reasons.push(`matches your ${input.experience} experience`);
    }

    if (equipmentCompatible(input.equipment, p.target_equipment)) {
      score += 3;
    } else {
      score -= 4;
    }

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

    return {
      program: p,
      score,
      reason: reasons.join(" · ") || "general fit",
    };
  }).sort((a, b) => b.score - a.score);
}

export function pickBestProgram(input: SelectorInput): Scored | null {
  const ranked = rankPrograms(input);
  if (ranked.length === 0) return null;
  return ranked[0] ?? null;
}

function equipmentCompatible(userHas: Equipment, programNeeds: Equipment): boolean {
  if (userHas === "both" || userHas === "gym") return true; // has gym → anything works
  if (userHas === "home") return programNeeds !== "gym";
  // userHas === "bodyweight"
  return programNeeds === "bodyweight";
}

export function programById(id: string): Program | null {
  return PROGRAMS.find((p) => p.id === id) ?? null;
}

/**
 * Which session index (0-based) should the user do today? Rotates through the
 * program's sessions based on the number of completed sessions this week.
 */
export function sessionIndexForToday(
  program: Program,
  completedThisWeek: number
): number {
  if (program.sessions.length === 0) return 0;
  return completedThisWeek % program.sessions.length;
}
