import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { registerPushSchema } from "@/lib/schemas/push";

export const runtime = "nodejs";

/**
 * Mobile app calls this once per install (and again on token refresh)
 * to register its Expo push token. Upserts by (user_id, expo_token) so
 * the same device re-registering just bumps last_seen.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = registerPushSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: user.id,
      expo_token: parsed.data.expo_token,
      platform: parsed.data.platform,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,expo_token" }
  );

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
