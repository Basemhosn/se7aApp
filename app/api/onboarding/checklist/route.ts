import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Getting-started checklist state for the Home card. Replaces the
 * 4-slide tutorial — the card auto-checks items by querying real
 * tables (scans, chat_messages, meal_plans) so completion reflects
 * actual app usage rather than per-tap flags.
 *
 * GET  /api/onboarding/checklist          → current item state + show flag
 * POST /api/onboarding/checklist/dismiss  → permanently hide for this user
 *
 * `show` is computed server-side combining three rules:
 *   1. User hasn't explicitly dismissed (checklist_dismissed_at null)
 *   2. At least one item is still unchecked
 *   3. User onboarded within the last 30 days (don't nag long-term users)
 */

type ItemKey =
  | "scan_plate"
  | "scan_menu"
  | "body_scan"
  | "coach"
  | "meal_plan";

interface ChecklistResponse {
  items: Record<ItemKey, boolean>;
  dismissed_at: string | null;
  show: boolean;
}

const CHECKLIST_WINDOW_DAYS = 30;

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pull profile fields that drive the show decision + run each item
  // check in parallel. Each item is a `select id limit 1` existence
  // probe — cheap.
  const [profileRes, plateRes, menuRes, bodyRes, chatRes, planRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("onboarded_at, checklist_dismissed_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("scans")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "plate")
        .limit(1),
      supabase
        .from("scans")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "menu")
        .limit(1),
      supabase
        .from("scans")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "body")
        .limit(1),
      supabase
        .from("chat_messages")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "user")
        .limit(1),
      supabase
        .from("meal_plans")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
    ]);

  const items: Record<ItemKey, boolean> = {
    scan_plate: (plateRes.data?.length ?? 0) > 0,
    scan_menu: (menuRes.data?.length ?? 0) > 0,
    body_scan: (bodyRes.data?.length ?? 0) > 0,
    coach: (chatRes.data?.length ?? 0) > 0,
    meal_plan: (planRes.data?.length ?? 0) > 0,
  };

  const dismissed_at = profileRes.data?.checklist_dismissed_at ?? null;
  const onboardedAt = profileRes.data?.onboarded_at ?? null;
  const allChecked = Object.values(items).every(Boolean);
  const withinWindow =
    !!onboardedAt &&
    Date.now() - new Date(onboardedAt).getTime() <
      CHECKLIST_WINDOW_DAYS * 86_400_000;

  const show = !dismissed_at && !allChecked && withinWindow;

  const body: ChecklistResponse = { items, dismissed_at, show };
  return NextResponse.json(body);
}
