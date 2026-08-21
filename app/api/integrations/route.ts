import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Return the current user's connected integrations. Only surfaces
 * non-secret fields — token columns never leave the server.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_integrations")
    .select("provider, provider_user_id, connected_at, last_sync_at")
    .eq("user_id", user.id);

  return NextResponse.json({ integrations: data ?? [] });
}
