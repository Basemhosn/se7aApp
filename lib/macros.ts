/**
 * SE7A macro math. Pure functions, no I/O, no deps.
 *
 * BMR via Mifflin-St Jeor (1990), the most accurate predictive equation
 * for healthy adults per the 2005 Frankenfield ADA review.
 *
 * Brand rule: outputs are numbers, but the UI must surface them as
 * targets/ranges, never as immutable truths. See project memory:
 * "honest ranges, never fake precision".
 */

export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "cut" | "recomp" | "maintain" | "bulk";

export interface ProfileForMacros {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  goal_rate_kg_per_week: number;
  body_fat_pct?: number;
}

export interface MacroTargets {
  bmr: number;
  tdee: number;
  daily_kcal_target: number;
  daily_protein_g: number;
  daily_carb_g: number;
  daily_fat_g: number;
  notes: string[];
}

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Body tissue ≈ 7700 kcal/kg (approximate, mixes fat + lean).
const KCAL_PER_KG = 7700;

// Conservative minimum daily calories below which adherence and
// micronutrient sufficiency fall apart. Clamp aggressive cuts here.
const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

const PROTEIN_G_PER_KG: Record<Goal, number> = {
  cut: 2.2,
  recomp: 2.0,
  maintain: 1.8,
  bulk: 1.6,
};

const FAT_FRACTION_OF_KCAL = 0.27;

export function bmrMifflinStJeor(p: {
  sex: Sex;
  weight_kg: number;
  height_cm: number;
  age: number;
}): number {
  const base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function tdee(p: { bmr: number; activity_level: ActivityLevel }): number {
  return p.bmr * ACTIVITY_MULTIPLIER[p.activity_level];
}

export function kcalTarget(opts: {
  tdee: number;
  goal_rate_kg_per_week: number;
  sex: Sex;
}): { kcal: number; clamped: boolean } {
  const delta = (opts.goal_rate_kg_per_week * KCAL_PER_KG) / 7;
  const raw = opts.tdee + delta;
  const floor = KCAL_FLOOR[opts.sex];
  if (raw < floor) return { kcal: Math.round(floor), clamped: true };
  return { kcal: Math.round(raw), clamped: false };
}

export function proteinTarget(p: {
  weight_kg: number;
  goal: Goal;
  body_fat_pct?: number;
}): number {
  // When body-fat % is known, prefer lean mass — guards against
  // overestimating needs for higher body-fat individuals.
  const leanMass = p.body_fat_pct
    ? p.weight_kg * (1 - p.body_fat_pct / 100)
    : p.weight_kg;
  return Math.round(leanMass * PROTEIN_G_PER_KG[p.goal]);
}

export function fatTarget(p: { daily_kcal_target: number }): number {
  return Math.round((p.daily_kcal_target * FAT_FRACTION_OF_KCAL) / 9);
}

export function carbTarget(p: {
  daily_kcal_target: number;
  protein_g: number;
  fat_g: number;
}): number {
  const remaining = p.daily_kcal_target - p.protein_g * 4 - p.fat_g * 9;
  return Math.max(0, Math.round(remaining / 4));
}

export function computeTargets(profile: ProfileForMacros): MacroTargets {
  const notes: string[] = [];

  const bmr = bmrMifflinStJeor(profile);
  const tdeeRaw = tdee({ bmr, activity_level: profile.activity_level });
  const { kcal, clamped } = kcalTarget({
    tdee: tdeeRaw,
    goal_rate_kg_per_week: profile.goal_rate_kg_per_week,
    sex: profile.sex,
  });
  if (clamped) notes.push("kcal_floor_applied");

  const protein = proteinTarget({
    weight_kg: profile.weight_kg,
    goal: profile.goal,
    body_fat_pct: profile.body_fat_pct,
  });
  const fat = fatTarget({ daily_kcal_target: kcal });
  const carb = carbTarget({
    daily_kcal_target: kcal,
    protein_g: protein,
    fat_g: fat,
  });

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdeeRaw),
    daily_kcal_target: kcal,
    daily_protein_g: protein,
    daily_carb_g: carb,
    daily_fat_g: fat,
    notes,
  };
}

export function ageFromBirthdate(
  birthdate: string | Date,
  now: Date = new Date()
): number {
  const d = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
