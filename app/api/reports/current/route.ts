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
    },
  });
}
