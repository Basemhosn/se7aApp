import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns the most recent N messages (chronological order — oldest first)
 * so the client can render the transcript directly.
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
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  const messages = (data ?? []).reverse();
  return NextResponse.json({ messages });
}
