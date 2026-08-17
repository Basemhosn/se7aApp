import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import {
  configureRc,
  hasProEntitlement,
  identifyRc,
  refreshCustomerInfo,
  resetRc,
} from "@/lib/rc";

/**
 * Entitlement resolution priority:
 *   1. Server subscription view (authoritative — driven by RC webhook)
 *   2. Local RC customerInfo (survives offline, faster on cold boot)
 *
 * The server row lags by ~1 second after purchase (RC webhook round-trip),
 * so we optimistically flip to Pro from the local RC info right after a
 * successful purchase, then reconcile on the next `refresh()`.
 */

export interface Entitlement {
  is_pro: boolean;
  tier: "free" | "pro";
  status: string;
  product_id: string | null;
  expires_at: string | null;
  will_renew: boolean;
}

const FREE: Entitlement = {
  is_pro: false,
  tier: "free",
  status: "inactive",
  product_id: null,
  expires_at: null,
  will_renew: false,
};

interface EntitlementState {
  ent: Entitlement;
  loading: boolean;
  refresh: () => Promise<void>;
  optimisticProFromRc: () => Promise<void>;
}

const EntCtx = createContext<EntitlementState | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ent, setEnt] = useState<Entitlement>(FREE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    configureRc(user?.id ?? null);
    if (user?.id) {
      identifyRc(user.id).catch(() => {});
    } else {
      resetRc().catch(() => {});
      setEnt(FREE);
      setLoading(false);
    }
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setEnt(FREE);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [serverEnt, rcInfo] = await Promise.all([
      api<Entitlement>("/api/subscription").catch(() => null),
      refreshCustomerInfo(),
    ]);
    const rcSaysPro = hasProEntitlement(rcInfo);
    const next: Entitlement = serverEnt ?? FREE;
    // If server hasn't caught up yet but RC says Pro, respect RC.
    if (!next.is_pro && rcSaysPro) {
      next.is_pro = true;
      next.tier = "pro";
      next.status = next.status === "inactive" ? "active" : next.status;
    }
    setEnt(next);
    setLoading(false);
  }, [user?.id]);

  const optimisticProFromRc = useCallback(async () => {
    const info = await refreshCustomerInfo();
    if (hasProEntitlement(info)) {
      setEnt((prev) => ({
        ...prev,
        is_pro: true,
        tier: "pro",
        status: prev.status === "inactive" ? "active" : prev.status,
      }));
    }
    // Kick a server reconcile too, but don't await.
    refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (user?.id) refresh().catch(() => {});
  }, [user?.id, refresh]);

  return (
    <EntCtx.Provider value={{ ent, loading, refresh, optimisticProFromRc }}>
      {children}
    </EntCtx.Provider>
  );
}

export function useEntitlement(): EntitlementState {
  const ctx = useContext(EntCtx);
  if (!ctx)
    throw new Error("useEntitlement must be used within EntitlementProvider");
  return ctx;
}
