import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Bulk import per-day steps + active energy from the local health
 * store. Called by useHealthSync's one-shot 90-day activity backfill
 * so past-day Home views show real numbers instead of "—".
 *
 * Idempotent via the (user_id, day) PK on daily_activity — each row
 * upserts, so a re-run after a bug or reinstall overwrites cleanly.
 */
const bulkSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        steps: z.number().int().min(0).max(200_000),
        active_kcal: z.number().min(0).max(50_000),
      })
    )
    .min(1)
    .max(400),
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bulkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = parsed.data.days.map((d) => ({
    user_id: user.id,
    day: d.day,
    steps: d.steps,
    active_kcal: d.active_kcal,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("daily_activity")
    .upsert(rows, { onConflict: "user_id,day" });

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, upserted: rows.length });
}
