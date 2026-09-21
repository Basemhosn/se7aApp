import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Read a single async body scan by id — used by the mobile client
 * for polling during analyzing and for push-tap deep links. RLS
 * enforces user ownership.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("scans")
    .select("id, kind, status, parsed, error_message, created_at, updated_at")
    .eq("id", id)
    .eq("kind", "body")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
