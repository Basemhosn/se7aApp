import type { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

/**
 * Compute and route a signed-in user to their correct landing surface.
 *
 * Gating order (first matching wins):
 *   1. No `onboarded_at`      → /onboarding
 *   2. No `tutorial_seen_at`  → /tutorial    (added in build 95)
 *   3. Otherwise              → /
 *
 * Centralized so adding a future gating step (e.g. age-verify prompt,
 * paywall) doesn't require touching every post-auth site. Call sites:
 * login.tsx (password + Google OAuth), auth/callback.tsx (magic link +
 * OAuth code exchange), (tabs)/index.tsx (defensive home-screen check),
 * and onboarding.tsx on finish.
 *
 * Fail-open on read errors: if the profiles SELECT throws (schema cache
 * lag right after the tutorial_seen_at migration, transient network),
 * we route to home rather than trapping the user on a loader. A missed
 * first-tutorial is strictly better than a broken sign-in.
 */
type Router = ReturnType<typeof useRouter>;

export async function routeAfterAuth(userId: string, router: Router) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.onboarded_at) {
      router.replace("/onboarding");
    } else {
      // The previous tutorial-screen gate was removed — new users now
      // see the Home-tab getting-started checklist instead of a
      // blocking slide screen. Dismissal + completion live in
      // profiles.checklist_dismissed_at and the per-item queries in
      // /api/onboarding/checklist, not in routing.
      router.replace("/");
    }
  } catch {
    router.replace("/");
  }
}
