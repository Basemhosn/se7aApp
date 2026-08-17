import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Server-side Pro entitlement check.
 *
 * Reads from v_active_pro (the "is_pro right now" view over subscriptions).
 * The mobile RC SDK renders the paywall client-side for UX responsiveness,
 * but every Pro-only route must re-check server-side — a jailbroken client
 * can lie about entitlements. Source of truth is RevenueCat's webhook.
 */
export interface EntitlementStatus {
  is_pro: boolean;
  tier: "free" | "pro";
  status: string;
  product_id: string | null;
  expires_at: string | null;
  will_renew: boolean;
}

const FREE: EntitlementStatus = {
  is_pro: false,
  tier: "free",
  status: "inactive",
  product_id: null,
  expires_at: null,
  will_renew: false,
};

export async function getEntitlement(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementStatus> {
  const { data } = await supabase
    .from("v_active_pro")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return FREE;
  return {
    is_pro: !!data.is_pro,
    tier: (data.tier ?? "free") as "free" | "pro",
    status: (data.status ?? "inactive") as string,
    product_id: data.rc_product_id ?? null,
    expires_at: data.expires_at ?? null,
    will_renew: !!data.will_renew,
  };
}

/**
 * Guard a route handler with a Pro check. Returns null if allowed,
 * otherwise a NextResponse to return immediately.
 */
export async function requirePro(
  supabase: SupabaseClient,
  userId: string,
  feature: string
): Promise<NextResponse | null> {
  const ent = await getEntitlement(supabase, userId);
  if (ent.is_pro) return null;
  return NextResponse.json(
    {
      error: "pro_required",
      details: `${feature} is a Pro feature. Upgrade to unlock.`,
      feature,
      current_tier: ent.tier,
    },
    { status: 402 }
  );
}
