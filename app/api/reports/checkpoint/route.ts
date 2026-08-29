import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Mark or unmark a week's checkpoint on the user's active report.
 * Idempotent: mark=true inserts if missing (no-op if present),
 * mark=false deletes if present (no-op if missing).
 *
 * The active report is the most-recent generated_at for the user;
 * older reports are considered archived and can't be modified from
 * the UI (mobile only ever shows the latest).
 */
const bodySchema = z.object({
  week_index: z.number().int().min(1).max(52),
  met: z.boolean(),
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "no_report" }, { status: 404 });
  }

  if (parsed.data.met) {
    const { error } = await supabase
      .from("report_week_checkpoints")
      .upsert(
        {
          report_id: report.id,
          week_index: parsed.data.week_index,
        },
        { onConflict: "report_id,week_index" }
      );
    if (error) {
      return NextResponse.json(
        { error: "persist_failed", details: error.message },
        { status: 500 }
      );
    }
  } else {
    const { error } = await supabase
      .from("report_week_checkpoints")
      .delete()
      .eq("report_id", report.id)
      .eq("week_index", parsed.data.week_index);
    if (error) {
      return NextResponse.json(
        { error: "persist_failed", details: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, week_index: parsed.data.week_index, met: parsed.data.met });
}
