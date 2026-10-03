import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Per-day expenditure (active energy + cardio kcal_burned) over the
 * last N days (default 90, max 365). Used by Progress' Expenditure
 * Changes card to compute 3/7/14/30/90/All deltas client-side.
 *
 * We join daily_activity (steps/active energy from HK auto-import)
 * and cardio_sessions (user-logged + HK workout imports). Both
 * come back as sparse arrays of {day, kcal} — the client fills in
 * missing days as zero rather than us returning 365 explicit rows.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const daysParam = Number(searchParams.get("days") ?? 90);
  const days = Number.isFinite(daysParam)
    ? Math.max(7, Math.min(365, Math.round(daysParam)))
    : 90;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();
  const startDay = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

  const [activityRes, cardioRes] = await Promise.all([
    supabase
      .from("daily_activity")
      .select("day, active_kcal")
      .eq("user_id", user.id)
      .gte("day", startDay)
      .order("day", { ascending: true }),
    supabase
      .from("cardio_sessions")
      .select("started_at, kcal_burned")
      .eq("user_id", user.id)
      .gte("started_at", startIso)
      .order("started_at", { ascending: true }),
  ]);

  const activity = (activityRes.data ?? []).map(
    (r: { day: string; active_kcal: number | null }) => ({
      day: r.day,
      active_kcal: Number(r.active_kcal ?? 0),
    })
  );
  // Bucket cardio session kcal by local day of `started_at`. UTC is
  // fine here — small drift at midnight; matches /api/activity/import
  // which also doesn't adjust for tz.
  const cardioByDay = new Map<string, number>();
  for (const r of (cardioRes.data ?? []) as {
    started_at: string;
    kcal_burned: number | null;
  }[]) {
    if (r.kcal_burned == null) continue;
    const d = new Date(r.started_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cardioByDay.set(key, (cardioByDay.get(key) ?? 0) + Number(r.kcal_burned));
  }

  return NextResponse.json({
    days,
    activity,
    cardio: Array.from(cardioByDay.entries()).map(([day, kcal]) => ({
      day,
      kcal,
    })),
  });
}
