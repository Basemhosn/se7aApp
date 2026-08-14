import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { programById, sessionIndexForToday } from "@/lib/programs/select";

export const runtime = "nodejs";

/**
 * Returns the caller's active program + which session index is up next,
 * calculated from how many sessions they've logged this week.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: userProgram } = await supabase
    .from("user_programs")
    .select("program_id, week_number, started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!userProgram) {
    return NextResponse.json({ active: false });
  }

  const program = programById(userProgram.program_id);
  if (!program) {
    // Program was removed from catalog since user picked it. Force them
    // to pick again rather than crashing.
    return NextResponse.json({ active: false, orphaned: true });
  }

  // Week-of-year based grouping — a "week" is Monday 00:00 local UTC.
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const { count: completedThisWeek } = await supabase
    .from("workout_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("completed_at", weekStart.toISOString());

  const nextIndex = sessionIndexForToday(program, completedThisWeek ?? 0);

  return NextResponse.json({
    active: true,
    program,
    week_number: userProgram.week_number,
    completed_this_week: completedThisWeek ?? 0,
    next_session_index: nextIndex,
    next_session: program.sessions[nextIndex] ?? null,
  });
}
