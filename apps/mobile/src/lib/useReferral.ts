import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface ReferralStats {
  code: string;
  link: string;
  display_name: string | null;
  referred_count: number;
}

/**
 * Fetches the caller's referral code + invite link + count of people
 * they've referred. Reloads on demand via the returned `refresh`.
 */
export function useReferral(userId: string | undefined) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api<ReferralStats>("/api/referrals/stats");
      setStats(res);
    } catch {
      /* silent — settings still renders without this */
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, refresh: load };
}
