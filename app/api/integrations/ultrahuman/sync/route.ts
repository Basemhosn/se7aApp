import { NextResponse } from "next/server";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { isUltrahumanEnabled } from "@/lib/ultrahuman";
import { syncUltrahumanForUser } from "@/lib/ultrahumanSync";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * On-demand UH sync. Mobile Settings calls this when the user taps
 * "Sync now". Nightly cron will hit the same adapter with a wider
 * daysBack range once the integration is enabled in production.
 */
export async function POST(request: Request) {
  if (!isUltrahumanEnabled()) {
    return NextResponse.json({ error: "integration_disabled" }, { status: 503 });
  }

  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysParam = Number.parseInt(url.searchParams.get("days") ?? "2", 10);
  const daysBack = Number.isFinite(daysParam) ? daysParam : 2;

  const admin = getAdminClient();
  const result = await syncUltrahumanForUser(admin, user.id, { daysBack });
  return NextResponse.json(result);
}
