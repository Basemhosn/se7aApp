import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/whoop";

export const runtime = "nodejs";

/**
 * Authenticated. Creates a short-lived OAuth state row bound to the
 * current user, then returns the Whoop authorize URL that includes
 * that state.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "whoop_not_configured" },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const admin = getAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    state,
    user_id: user.id,
    provider: "whoop",
  });
  if (error) {
    return NextResponse.json(
      { error: "state_persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: buildAuthorizeUrl(state) });
}
