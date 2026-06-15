import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { weightLogSchema } from "@/lib/schemas/profile";
import { ageFromBirthdate, computeTargets } from "@/lib/macros";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = weightLogSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const { error: insertErr } = await supabase.from("weight_logs").insert({
    user_id: user.id,
    weight_kg: input.weight_kg,
    body_fat_pct: input.body_fat_pct ?? null,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "log_failed", details: insertErr.message },
      { status: 500 }
    );
  }

  // Retune targets against the new weight so the dashboard stays in sync.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "sex, birthdate, height_cm, activity_level, goal, goal_rate_kg_per_week"
    )
    .eq("user_id", user.id)
    .single();
  if (!profile || !profile.sex || !profile.birthdate) {
    return NextResponse.json({ ok: true, retuned: false });
  }

  const targets = computeTargets({
    sex: profile.sex,
    age: ageFromBirthdate(profile.birthdate),
    height_cm: Number(profile.height_cm),
    weight_kg: input.weight_kg,
    activity_level: profile.activity_level,
    goal: profile.goal,
    goal_rate_kg_per_week: Number(profile.goal_rate_kg_per_week),
    body_fat_pct: input.body_fat_pct,
  });

  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      weight_kg: input.weight_kg,
      daily_kcal_target: targets.daily_kcal_target,
      daily_protein_g: targets.daily_protein_g,
      daily_carb_g: targets.daily_carb_g,
      daily_fat_g: targets.daily_fat_g,
    })
    .eq("user_id", user.id);
  if (updErr) {
    return NextResponse.json(
      { error: "retune_failed", details: updErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, retuned: true, targets });
}
