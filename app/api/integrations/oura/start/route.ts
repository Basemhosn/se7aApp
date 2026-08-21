import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/oura";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.OURA_CLIENT_ID || !process.env.OURA_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "oura_not_configured" },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const admin = getAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    state,
    user_id: user.id,
    provider: "oura",
  });
  if (error) {
    return NextResponse.json(
      { error: "state_persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: buildAuthorizeUrl(state) });
}
