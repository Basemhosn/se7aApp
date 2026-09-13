import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import { ageFromBirthdate, computeTargets } from "@/lib/macros";

export const runtime = "nodejs";

/**
 * Partial profile update from the Edit Profile screen. Distinct from
 * POST /api/profile (onboarding) in three ways:
 *   1. All fields optional — only touched fields are written.
 *   2. Never inserts a weight_logs row. Users log new weights via the
 *      dedicated log-weight flow; editing the profile's snapshot weight
 *      shouldn't fabricate trend data.
 *   3. Never overwrites onboarded_at.
 *
 * If any macro-affecting field is present (sex/birthdate/height/weight/
 * activity/goal/rate), macros are recomputed using the merged post-write
 * profile so partial edits stay coherent (e.g. changing only `goal`
 * still yields correct new targets even though weight came from DB).
 */
const editSchema = z.object({
  display_name: z.string().trim().min(1).max(60).nullable().optional(),
  sex: z.enum(["male", "female"]).optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
    .refine((d) => {
      const dob = new Date(d);
      if (Number.isNaN(dob.getTime())) return false;
      const today = new Date();
      const age =
        today.getFullYear() -
        dob.getFullYear() -
        (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
          ? 1
          : 0);
      return age >= 16 && age <= 100;
    }, "Must be between 16 and 100 years old")
    .optional(),
  height_cm: z.number().positive().max(279).optional(),
  weight_kg: z.number().positive().max(499).optional(),
  activity_level: z
    .enum(["sedentary", "light", "moderate", "active", "very_active"])
    .optional(),
  goal: z.enum(["cut", "recomp", "maintain", "bulk"]).optional(),
  goal_rate_kg_per_week: z.number().min(-1.5).max(1.0).optional(),
  goal_weight_kg: z.number().positive().max(499).nullable().optional(),
  units: z.enum(["metric", "imperial"]).optional(),
  halal_pref: z.enum(["halal", "no_preference"]).nullable().optional(),
});

const MACRO_KEYS = [
  "sex",
  "birthdate",
  "height_cm",
  "weight_kg",
  "activity_level",
  "goal",
  "goal_rate_kg_per_week",
] as const;

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const { data: current, error: readErr } = await supabase
    .from("profiles")
    .select(
      "sex, birthdate, height_cm, weight_kg, activity_level, goal, goal_rate_kg_per_week, onboarding_meta"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr || !current) {
    return NextResponse.json(
      { error: "profile_not_found", details: readErr?.message },
      { status: 404 }
    );
  }

  const patch: Record<string, unknown> = {};
  for (const key of [
    "display_name",
    "sex",
    "birthdate",
    "height_cm",
    "weight_kg",
    "activity_level",
    "goal",
    "goal_rate_kg_per_week",
    "goal_weight_kg",
    "units",
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  if (input.halal_pref !== undefined) {
    const existingMeta =
      (current.onboarding_meta as Record<string, unknown>) ?? {};
    patch.onboarding_meta = {
      ...existingMeta,
      halal_pref: input.halal_pref ?? undefined,
    };
  }

  const macroAffecting = MACRO_KEYS.some((k) => input[k] !== undefined);
  let targets: ReturnType<typeof computeTargets> | null = null;
  if (macroAffecting) {
    const merged = {
      sex: (input.sex ?? current.sex) as "male" | "female",
      birthdate: input.birthdate ?? current.birthdate,
      height_cm: Number(input.height_cm ?? current.height_cm),
      weight_kg: Number(input.weight_kg ?? current.weight_kg),
      activity_level: (input.activity_level ??
        current.activity_level) as
        | "sedentary"
        | "light"
        | "moderate"
        | "active"
        | "very_active",
      goal: (input.goal ?? current.goal) as
        | "cut"
        | "recomp"
        | "maintain"
        | "bulk",
      goal_rate_kg_per_week: Number(
        input.goal_rate_kg_per_week ?? current.goal_rate_kg_per_week
      ),
    };
    if (
      !merged.sex ||
      !merged.birthdate ||
      !merged.height_cm ||
      !merged.weight_kg ||
      !merged.activity_level ||
      !merged.goal ||
      merged.goal_rate_kg_per_week == null
    ) {
      return NextResponse.json(
        { error: "profile_incomplete_for_recompute" },
        { status: 409 }
      );
    }
    targets = computeTargets({
      sex: merged.sex,
      age: ageFromBirthdate(merged.birthdate),
      height_cm: merged.height_cm,
      weight_kg: merged.weight_kg,
      activity_level: merged.activity_level,
      goal: merged.goal,
      goal_rate_kg_per_week: merged.goal_rate_kg_per_week,
    });
    patch.daily_kcal_target = targets.daily_kcal_target;
    patch.daily_protein_g = targets.daily_protein_g;
    patch.daily_carb_g = targets.daily_carb_g;
    patch.daily_fat_g = targets.daily_fat_g;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, no_op: true });
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);
  if (updateErr) {
    return NextResponse.json(
      { error: "save_failed", details: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    patched: Object.keys(patch),
    targets,
    warnings: targets?.notes ?? [],
  });
}
