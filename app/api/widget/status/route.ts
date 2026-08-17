import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeRemaining, getTodayTotals } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * Token-authed endpoint for the iOS widget. Returns just enough to render
 * the "remaining kcal today" widget — nothing PII, no writes.
 *
 * The widget stores the token in shared UserDefaults (via App Group). We
 * look up the owning user via profiles.widget_token unique index.
 *
 * Uses service role because the widget doesn't have a JWT session. Access
 * is bounded to the specific token's owner.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, display_name, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
    )
    .eq("widget_token", token)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const totals = await getTodayTotals(admin, profile.user_id);
  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile.daily_kcal_target,
    daily_protein_g: profile.daily_protein_g,
    daily_carb_g: profile.daily_carb_g,
    daily_fat_g: profile.daily_fat_g,
  });

  return NextResponse.json(
    {
      display_name: profile.display_name,
      target: profile.daily_kcal_target,
      eaten: {
        low: Math.round(totals.kcal.low),
        high: Math.round(totals.kcal.high),
      },
      remaining: {
        low: Math.round(remaining.kcal.low),
        high: Math.round(remaining.kcal.high),
      },
    },
    {
      // Widgets refresh on iOS' schedule; a short public cache is fine.
      headers: { "Cache-Control": "public, max-age=60" },
    }
  );
}
