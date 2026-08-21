import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { importActivitySchema } from "@/lib/schemas/cardio";

export const runtime = "nodejs";

/**
 * Upsert a per-day steps + active-energy row. Called by the mobile
 * HealthKit sync hook once per foreground session with the current day's
 * counters. Idempotent via PK on (user_id, day).
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = importActivitySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("daily_activity").upsert(
    {
      user_id: user.id,
      day: parsed.data.day,
      steps: parsed.data.steps ?? null,
      active_kcal: parsed.data.active_kcal ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day" }
  );

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
