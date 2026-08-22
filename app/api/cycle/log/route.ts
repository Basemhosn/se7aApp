import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  ended_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  flow: z.enum(["spotting", "light", "medium", "heavy"]).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/**
 * Log a period start. Upserts by (user, started_on) — repeat POSTs
 * for the same day update the existing row instead of erroring, so
 * an accidental double-tap does the right thing.
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (parsed.data.started_on > todayIso) {
    return NextResponse.json(
      { error: "invalid_start", reason: "future_date" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("cycle_periods")
    .upsert(
      {
        user_id: user.id,
        started_on: parsed.data.started_on,
        ended_on: parsed.data.ended_on ?? null,
        flow: parsed.data.flow ?? null,
        notes: parsed.data.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,started_on" }
    )
    .select("id, started_on, ended_on, flow, notes")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "save_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, period: data });
}
