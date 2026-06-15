import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/schemas/profile";
import { ageFromBirthdate, computeTargets } from "@/lib/macros";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const age = ageFromBirthdate(input.birthdate);
  const targets = computeTargets({
    sex: input.sex,
    age,
    height_cm: input.height_cm,
    weight_kg: input.weight_kg,
    activity_level: input.activity_level,
    goal: input.goal,
    goal_rate_kg_per_week: input.goal_rate_kg_per_week,
  });

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      display_name: input.display_name ?? null,
      sex: input.sex,
      birthdate: input.birthdate,
      height_cm: input.height_cm,
      weight_kg: input.weight_kg,
      activity_level: input.activity_level,
      goal: input.goal,
      goal_rate_kg_per_week: input.goal_rate_kg_per_week,
      units: input.units,
      daily_kcal_target: targets.daily_kcal_target,
      daily_protein_g: targets.daily_protein_g,
      daily_carb_g: targets.daily_carb_g,
      daily_fat_g: targets.daily_fat_g,
      onboarded_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (updateErr) {
    return NextResponse.json(
      { error: "save_failed", details: updateErr.message },
      { status: 500 }
    );
  }

  // Record the starting weight so the trend chart has a baseline.
  const { error: weightErr } = await supabase
    .from("weight_logs")
    .insert({ user_id: user.id, weight_kg: input.weight_kg });
  if (weightErr) {
    return NextResponse.json(
      { error: "weight_log_failed", details: weightErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, targets });
}
