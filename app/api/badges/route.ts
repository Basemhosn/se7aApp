import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteClient } from "@/lib/supabase/server";
import {
  BADGES,
  evaluateBadges,
  type BadgeDef,
  type BadgeSnapshot,
} from "@/lib/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EarnedBadge extends BadgeDef {
  earned_at: string;
  seen: boolean;
}

/**
 * Return the user's badge shelf: every catalog badge with its
 * earned_at + seen state (or nulls if not yet earned).
 *
 * Side effect: re-evaluates all badges against a fresh snapshot and
 * inserts any newly-earned rows into user_badges. This runs on every
 * fetch so users don't have to "trigger" badge checks explicitly;
 * cheap because the snapshot is 4-5 count queries.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await buildSnapshot(supabase, user.id);
  const earnedNow = evaluateBadges(snapshot);

  // Read existing to compute diff for insert.
  const { data: existing } = await supabase
    .from("user_badges")
    .select("badge_key, earned_at, seen_at")
    .eq("user_id", user.id);

  const existingMap = new Map(
    (existing ?? []).map((r) => [r.badge_key, r as { badge_key: string; earned_at: string; seen_at: string | null }])
  );

  const toInsert = [...earnedNow]
    .filter((k) => !existingMap.has(k))
    .map((k) => ({ user_id: user.id, badge_key: k }));

  if (toInsert.length > 0) {
    await supabase
      .from("user_badges")
      .upsert(toInsert, { onConflict: "user_id,badge_key" });
    // Refresh existing with the newly inserted so the response is
    // authoritative.
    const { data: refreshed } = await supabase
      .from("user_badges")
      .select("badge_key, earned_at, seen_at")
      .eq("user_id", user.id);
    for (const r of refreshed ?? []) {
      existingMap.set(
        r.badge_key,
        r as { badge_key: string; earned_at: string; seen_at: string | null }
      );
    }
  }

  const shelf: (BadgeDef & {
    earned_at: string | null;
    seen: boolean;
  })[] = BADGES.map((b) => {
    const row = existingMap.get(b.key);
    return {
      ...b,
      earned_at: row?.earned_at ?? null,
      seen: !!row?.seen_at,
    };
  });

  return NextResponse.json({ badges: shelf });
}

/**
 * Mark badges as seen so the client stops surfacing an unlock toast.
 * Called after the toast is shown.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const keys: unknown = body?.mark_seen;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string")) {
    return NextResponse.json(
      { error: "invalid_input", details: "expected mark_seen: string[]" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("user_badges")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("badge_key", keys as string[]);

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, marked: keys.length });
}

async function buildSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<BadgeSnapshot> {
  const [
    { count: mealCount },
    { data: firstMealRow },
    { data: sourceRows },
    { count: weighInCount },
    { count: workoutCount },
    { data: streakSample },
    { data: report },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("meal_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("meal_items")
      .select("eaten_at")
      .eq("user_id", userId)
      .order("eaten_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meal_items")
      .select("source")
      .eq("user_id", userId)
      .in("source", ["plate_scan", "menu_scan", "barcode", "voice"])
      .limit(500),
    supabase
      .from("weight_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("meal_items")
      .select("eaten_at")
      .eq("user_id", userId)
      .order("eaten_at", { ascending: false })
      .limit(400),
    supabase
      .from("reports")
      .select("id, generated_at, duration_days")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const sources = new Set(
    (sourceRows ?? []).map((r: { source: string }) => r.source)
  );

  // Simple streak: walk backwards day-by-day from today (server UTC —
  // MVP; matches /api/streaks' UTC-first approach). Days with ≥ 1
  // meal_item count as active.
  const streakDays = computeStreak(
    (streakSample ?? []).map((r: { eaten_at: string }) => r.eaten_at)
  );

  let planCheckpoints: number[] = [];
  let planWeeks: number | null = null;
  if (report) {
    planWeeks = Math.ceil(report.duration_days / 7);
    const { data: cpRows } = await supabase
      .from("report_week_checkpoints")
      .select("week_index")
      .eq("report_id", report.id);
    planCheckpoints = (cpRows ?? []).map(
      (r: { week_index: number }) => r.week_index
    );
  }

  const onboardedAt = profile?.onboarded_at ?? null;
  const daysSinceOnboarded = onboardedAt
    ? Math.floor(
        (Date.now() - new Date(onboardedAt).getTime()) / 86_400_000
      )
    : null;

  return {
    meal_count: mealCount ?? 0,
    first_meal_at: firstMealRow?.eaten_at ?? null,
    has_plate_scan: sources.has("plate_scan"),
    has_menu_scan: sources.has("menu_scan"),
    has_barcode: sources.has("barcode"),
    has_voice_log: sources.has("voice"),
    weigh_in_count: weighInCount ?? 0,
    current_streak_days: streakDays,
    workout_count: workoutCount ?? 0,
    active_plan_total_weeks: planWeeks,
    active_plan_checkpoints_met: planCheckpoints,
    days_since_onboarded: daysSinceOnboarded,
  };
}

function computeStreak(eatenAtIsoDescending: string[]): number {
  if (eatenAtIsoDescending.length === 0) return 0;
  const days = new Set(eatenAtIsoDescending.map((iso) => iso.slice(0, 10)));
  let count = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      count += 1;
    } else if (count > 0) {
      // Ended
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}
