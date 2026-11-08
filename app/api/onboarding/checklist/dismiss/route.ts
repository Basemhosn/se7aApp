import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Explicitly hide the Home checklist card for this user. Writes
 * profiles.checklist_dismissed_at = now(). Idempotent — re-posting is
 * harmless. The GET endpoint reads this and sets `show: false` on
 * subsequent fetches.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ checklist_dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "dismiss_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
