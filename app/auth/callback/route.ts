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
