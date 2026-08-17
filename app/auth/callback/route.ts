import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase redirects here with a `code` query param;
 * we exchange it for a session, then route the user to onboarding (first
 * time) or the dashboard (returning users).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? null;
  const ref = searchParams.get("ref");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = getServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // If a referral code came through the /join flow, attach it now. Best
  // effort — a failure here doesn't block sign-in.
  if (ref && /^[a-f0-9]{6,12}$/.test(ref)) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: referrer } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("referral_code", ref)
        .maybeSingle();
      if (referrer && referrer.user_id !== user.id) {
        await supabase
          .from("profiles")
          .update({
            referred_by: referrer.user_id,
            referred_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .is("referred_by", null); // first invite wins; no hijacking
      }
    }
  }

  // If the caller asked for a specific destination, honour it.
  if (next && next.startsWith("/")) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // First-login routing: send users with no completed profile to onboarding.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarded_at) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}
