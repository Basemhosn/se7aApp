import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Small partial-update endpoint for notification preferences and
 * timezone. Distinct from the full /api/profile write (which recomputes
 * macros) so the mobile app can call this on every boot without cost.
 */
const prefsSchema = z.object({
  notification_prefs: z
    .object({
      streak_at_risk: z.boolean().optional(),
      lunch_nudge: z.boolean().optional(),
      weigh_in: z.boolean().optional(),
      pr_celebration: z.boolean().optional(),
      plan_your_week: z.boolean().optional(),
      weekly_recap: z.boolean().optional(),
    })
    .optional(),
  tz_offset_min: z.number().int().min(-14 * 60).max(14 * 60).optional(),
  // Optional absolute target weight for the projection chart. Nullable
  // so the user can clear it. Not touched by the /api/profile macro
  // recompute — it only powers ETA + goal-line rendering.
  goal_weight_kg: z.number().positive().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Merge notification_prefs so we only overwrite the fields the caller
  // actually specified. jsonb merge via `||` in Postgres would be cleaner
  // but we don't have a helper for that on the JS client, so we read →
  // merge → write.
  const patch: Record<string, unknown> = {};
  if (parsed.data.tz_offset_min != null) {
    patch.tz_offset_min = parsed.data.tz_offset_min;
  }
  if (parsed.data.goal_weight_kg !== undefined) {
    patch.goal_weight_kg = parsed.data.goal_weight_kg;
  }
  if (parsed.data.notification_prefs) {
    const { data: current } = await supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    const merged = {
      ...(current?.notification_prefs ?? {}),
      ...parsed.data.notification_prefs,
    };
    patch.notification_prefs = merged;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, no_op: true });
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, patched: Object.keys(patch) });
}

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("notification_prefs, tz_offset_min, goal_weight_kg")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    notification_prefs: data?.notification_prefs ?? {},
    tz_offset_min: data?.tz_offset_min ?? 0,
    goal_weight_kg: data?.goal_weight_kg ?? null,
  });
}
