import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns the user's active fast (if any) plus their last completed fast
 * for context on the timer screen.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [activeRes, lastRes] = await Promise.all([
    supabase
      .from("fasting_windows")
      .select("id, started_at, target_hours, notes")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .maybeSingle(),
    supabase
      .from("fasting_windows")
      .select("id, started_at, ended_at, target_hours")
      .eq("user_id", user.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    active: activeRes.data ?? null,
    last: lastRes.data ?? null,
  });
}
