import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("fasting_windows")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("ended_at", null)
    .select("id, started_at, ended_at, target_hours")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "no_active_fast" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, fast: data });
}
