import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns the caller's referral code, invite link, and count of people
 * who signed up via them. Powers the Settings > Invite section.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: me }, { count }, { data: rewards }] = await Promise.all([
    supabase
      .from("profiles")
      .select("referral_code, display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("referred_by", user.id),
    supabase
      .from("referral_rewards")
      .select("days_granted, applied_at")
      .eq("referrer_user_id", user.id),
  ]);

  if (!me?.referral_code) {
    return NextResponse.json({ error: "no_profile" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://se7a.vercel.app";

  const rewardRows = rewards ?? [];
  const rewardsEarnedDays = rewardRows
    .filter((r) => r.applied_at != null)
    .reduce((sum, r) => sum + (r.days_granted ?? 0), 0);
  const rewardsPending = rewardRows.filter((r) => r.applied_at == null).length;

  return NextResponse.json({
    code: me.referral_code,
    link: `${baseUrl}/join/${me.referral_code}`,
    display_name: me.display_name,
    referred_count: count ?? 0,
    rewards_earned_days: rewardsEarnedDays,
    rewards_pending: rewardsPending,
  });
}
