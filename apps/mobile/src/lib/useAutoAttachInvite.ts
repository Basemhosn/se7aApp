import { useEffect } from "react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "./supabase";
import { api } from "./api";
import { clearInviteCode, readInviteCode } from "./referralInvite";

/**
 * Silent auto-attach for referral codes that arrived via universal
 * link or custom scheme.
 *
 * Fires once per signed-in session: if there's a stashed code and the
 * user has no `referred_by` set AND is still within the 7-day
 * attribution window, POST /api/referrals/attach and clear the stash.
 * Every error is swallowed — the Settings "Have a friend's code?"
 * input still works if this silent path fails, so the user never
 * sees a spurious error for something they didn't ask for.
 */
export function useAutoAttachInvite(): void {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const code = await readInviteCode();
      if (!code || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("referred_by, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data || data.referred_by) {
        // Already attributed OR profile row not present yet — clear
        // the stash either way. Second launch shouldn't try again.
        await clearInviteCode();
        return;
      }
      const createdMs = data.created_at
        ? new Date(data.created_at).getTime()
        : 0;
      if (Date.now() - createdMs > 7 * 24 * 60 * 60 * 1000) {
        // Outside window — code is now useless, drop it.
        await clearInviteCode();
        return;
      }
      try {
        await api<{ ok: true }>("/api/referrals/attach", {
          method: "POST",
          body: JSON.stringify({ referral_code: code }),
        });
        await clearInviteCode();
      } catch {
        // Leave the stash for the Settings block to pick up so the
        // user can retry manually with feedback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
}
