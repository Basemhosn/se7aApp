import { NextResponse } from "next/server";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import {
  getUltrahumanShareCode,
  getUltrahumanToken,
  isUltrahumanEnabled,
} from "@/lib/ultrahuman";

export const runtime = "nodejs";

/**
 * Connect flow for Ultrahuman — no OAuth, just an email the user has
 * already authorized via SE7A's static sharing code (entered in the UH
 * app under Profile → Settings → Partner ID).
 *
 * Flow:
 *   1. User enters their UH-registered email in SE7A Settings.
 *   2. This endpoint stores the email in user_integrations.
 *   3. First sync hits UH's API with the email + master token; if the
 *      user hasn't actually entered the share code, UH returns 404 and
 *      the sync surfaces an error.
 *
 * The share code is published statically in the UI (`shareCode`) so the
 * user knows what to type in the UH app before they come here.
 */
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

  if (!getUltrahumanToken() || !getUltrahumanShareCode()) {
    return NextResponse.json(
      { error: "server_not_configured" },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "invalid_email" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  const { error } = await admin.from("user_integrations").upsert(
    {
      user_id: user.id,
      provider: "ultrahuman",
      provider_user_id: email,
      access_token: "via_master_token", // sentinel — real token lives in env
      refresh_token: null,
      expires_at: null,
      scope: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  // Don't echo the email in the response — client already has it, it
  // just leaks into network logs / client telemetry otherwise.
  return NextResponse.json({ ok: true });
}
