import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { attachReferralSchema } from "@/lib/schemas/referral";

export const runtime = "nodejs";

/**
 * Attaches a referrer to the caller's profile. Only succeeds if:
 * - The caller has no existing referrer (single attribution — first invite
 *   wins, so latecomers can't hijack)
 * - The code exists and points at a different user
 * - The caller has been signed up for less than 7 days (attribution window)
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
  const parsed = attachReferralSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("referred_by, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json({ error: "no_profile" }, { status: 404 });
  }
  if (me.referred_by) {
    return NextResponse.json(
      { error: "already_attributed" },
      { status: 409 }
    );
  }
  const createdMs = me.created_at ? new Date(me.created_at).getTime() : 0;
  if (Date.now() - createdMs > 7 * 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "outside_attribution_window" },
      { status: 410 }
    );
  }

  const { data: referrer } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("referral_code", parsed.data.referral_code)
    .maybeSingle();
  if (!referrer) {
    return NextResponse.json({ error: "code_not_found" }, { status: 404 });
  }
  if (referrer.user_id === user.id) {
    return NextResponse.json(
      { error: "self_referral" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      referred_by: referrer.user_id,
      referred_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
