import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import type { ReportPlan, WeeklySummary } from "@/lib/schemas/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fetch the user's most-recent report + weekly_summary. Returns null
 * when the user has never generated one — the mobile Home surface
 * uses that to decide whether to render "Get your 90-Day Plan" CTA
 * or "View your plan" pill.
 *
 * Legacy-schema handling (2026-09-01): any row whose plan lacks
 * `training.phases` is from the pre-phased schema. We delete it and
 * return `{report: null}` so the client re-triggers generation with
 * the new structure.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, generated_at, plan, weekly_summary, weekly_summary_at, duration_days"
    )
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "fetch_failed", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ report: null });
  }

  // Detect + purge legacy rows lacking the phased structure. Presence
  // of training.phases is our schema version marker.
  const trainingBlock = (data.plan as { training?: { phases?: unknown } } | null)
    ?.training;
  const hasPhases =
    trainingBlock && Array.isArray(trainingBlock.phases) && trainingBlock.phases.length > 0;
  if (!hasPhases) {
    await supabase.from("reports").delete().eq("id", data.id);
    return NextResponse.json({ report: null });
  }

  // Pull checkpoint state alongside so the client renders check
  // circles + Home strip's completed-week fills without a second
  // round-trip. Best-effort — if RLS blocks or table isn't provisioned
  // yet, fall back to empty.
  const [{ data: cpRows }, { data: completionRows }] = await Promise.all([
    supabase
      .from("report_week_checkpoints")
      .select("week_index")
      .eq("report_id", data.id),
    // PR2 (2026-09-02): interactive item state (habit ticks, grocery
    // checks, benchmark logs, session-done flags). Client renders each
    // item as done when its key appears in `completions`.
    supabase
      .from("report_item_completions")
      .select("item_key, done_at, value_json")
      .eq("report_id", data.id),
  ]);
  const checkpoints = (cpRows ?? []).map(
    (r: { week_index: number }) => r.week_index
  );
  const completions: Record<
    string,
    { done_at: string | null; value_json: unknown }
  > = {};
  for (const row of (completionRows ?? []) as Array<{
    item_key: string;
    done_at: string | null;
    value_json: unknown;
  }>) {
    completions[row.item_key] = {
      done_at: row.done_at,
      value_json: row.value_json,
    };
  }

  // Compute derived week_index client can trust — days since
  // generated_at, floor-divided by 7, +1. Capped at total weeks.
  const generated = new Date(data.generated_at).getTime();
  const daysElapsed = Math.max(0, Math.floor((Date.now() - generated) / 86_400_000));
  const totalWeeks = Math.ceil(data.duration_days / 7);
  const weekIndex = Math.min(totalWeeks, Math.floor(daysElapsed / 7) + 1);

  return NextResponse.json({
    report: {
      id: data.id,
      generated_at: data.generated_at,
      duration_days: data.duration_days,
      week_index: weekIndex,
      total_weeks: totalWeeks,
      plan: data.plan as ReportPlan,
      weekly_summary: data.weekly_summary as WeeklySummary | null,
      weekly_summary_at: data.weekly_summary_at,
      checkpoints_met: checkpoints,
      completions,
    },
  });
}
