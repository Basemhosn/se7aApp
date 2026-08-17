import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlement";

export const runtime = "nodejs";

/**
 * Return the caller's Pro entitlement so the mobile Settings screen
 * and any client-side gate can render the right state without asking
 * the RC SDK for a refresh (which does a network call).
 *
 * Mobile still calls Purchases.getCustomerInfo() for the local cache;
 * this endpoint is the server-canonical view.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ent = await getEntitlement(supabase, user.id);
  return NextResponse.json(ent);
}
