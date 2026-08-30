import { getAdminClient } from "@/lib/supabase/server";

/**
 * Read the total waitlist member count for the marketing landing's
 * social-proof line ("Join N+ others waiting"). Uses the admin
 * client so RLS doesn't block an anon SELECT count.
 *
 * Wrapped in a try/catch because a failed count shouldn't kill the
 * page render. Returns null when unavailable so the caller can
 * choose to hide the counter rather than show "0" or "—".
 */
export async function getWaitlistCount(): Promise<number | null> {
  try {
    const admin = getAdminClient();
    const { count, error } = await admin
      .from("waitlist")
      .select("*", { count: "exact", head: true });
    if (error || count == null) return null;
    return count;
  } catch {
    return null;
  }
}
