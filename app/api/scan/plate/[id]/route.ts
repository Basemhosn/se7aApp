import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Read a single async plate scan by id — used by the mobile client
 * for both push-tap deeplinks (fetch fresh result) and app-open
 * reconciliation (any scans that finished while the app was closed).
 * RLS enforces user ownership; the id is untrusted user input.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = getRouteClient(_request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("scans")
    .select(
      "id, kind, status, parsed, error_message, image_path, created_at, updated_at"
    )
    .eq("id", id)
    .eq("kind", "plate")
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
