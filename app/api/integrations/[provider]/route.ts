import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED = new Set(["strava", "whoop", "oura", "fitbit"]);

/**
 * Disconnect an integration. RLS on user_integrations enforces
 * ownership; we just fire the delete.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { provider } = await params;
  if (!ALLOWED.has(provider)) {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  if (error) {
    return NextResponse.json(
      { error: "disconnect_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
