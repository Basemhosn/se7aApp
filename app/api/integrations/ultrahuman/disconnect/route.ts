import { NextResponse } from "next/server";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { isUltrahumanEnabled } from "@/lib/ultrahuman";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isUltrahumanEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 503 });
  }

  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  await admin
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "ultrahuman");

  return NextResponse.json({ ok: true });
}
