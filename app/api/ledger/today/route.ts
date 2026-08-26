import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { computeRemaining, enrichWithPhotos, getDayTotals } from "@/lib/ledger";
import type { PlannedMeal } from "@/lib/schemas/mealPlan";

export const dynamic = "force-dynamic";

/**
 * Ledger for a specific day. Defaults to today; accepts ?date=YYYY-MM-DD
 * so the Home tab can page backward/forward through days without a new
 * endpoint. Path stays "today" for existing callers (mobile ledger
 * hook, dashboard page, etc.) that never pass a date.
 *
 * For future dates: also returns `planned_items` from the user's
 * meal_plans row for that week, so the Home tab can show tomorrow's
 * planned meals in the ring instead of an empty view.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const dateIso =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;
  const tzOffsetParam = searchParams.get("tz_offset_min");
  const tzOffsetMin = tzOffsetParam ? parseInt(tzOffsetParam, 10) : undefined;
  const effectiveTzOffset =
    typeof tzOffsetMin === "number" && Number.isFinite(tzOffsetMin)
      ? tzOffsetMin
      : undefined;
  const effectiveDateIso =
    dateIso ??
    (typeof effectiveTzOffset === "number"
      ? localDateIso(new Date(), effectiveTzOffset)
      : undefined);

  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .single(),
    getDayTotals(supabase, user.id, effectiveDateIso, effectiveTzOffset),
  ]);

  const enrichedItems = await enrichWithPhotos(supabase, totals.items);
  const totalsWithPhotos = { ...totals, items: enrichedItems };

  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile?.daily_kcal_target ?? null,
    daily_protein_g: profile?.daily_protein_g ?? null,
    daily_carb_g: profile?.daily_carb_g ?? null,
    daily_fat_g: profile?.daily_fat_g ?? null,
  });

  // Future-day planned items — only when the caller passed a date
  // strictly greater than today's local ISO. Today + past use meal_items
  // (real logs). This keeps the ledger authoritative for anything
  // already logged; planned meals are a preview only.
  let plannedItems: PlannedMeal[] = [];
  if (dateIso && dateIso > todayIso()) {
    plannedItems = await loadPlannedMealsForDate(supabase, user.id, dateIso);
  }

  return NextResponse.json({
    totals: totalsWithPhotos,
    remaining,
    planned_items: plannedItems,
  });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Given a moment and a timezone offset (minutes east of UTC), return
 * the YYYY-MM-DD of the local calendar day at that moment.
 */
function localDateIso(instant: Date, tzOffsetMin: number): string {
  const shifted = new Date(instant.getTime() + tzOffsetMin * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Find the meal_plans row containing `dateIso` and return that day's
 * meals. Filters out meals already logged (logged_meal_item_id set) so
 * the preview doesn't double-count something that already appears in
 * the real ledger.
 */
async function loadPlannedMealsForDate(
  supabase: ReturnType<typeof getRouteClient>,
  userId: string,
  dateIso: string
): Promise<PlannedMeal[]> {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const monday = mondayOf(date);
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  const dow = daysBetween(monday, date); // 0..6, Mon=0

  const { data } = await supabase
    .from("meal_plans")
    .select("plan")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (!data?.plan) return [];

  const plan = data.plan as {
    days: { day_of_week: number; meals: PlannedMeal[] }[];
  };
  const day = plan.days.find((x) => x.day_of_week === dow);
  if (!day) return [];
  return day.meals.filter((m) => !m.logged_meal_item_id);
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // JS getDay: 0=Sun, 1=Mon, ..., 6=Sat. daysSinceMonday cycles Sunday
  // (0) back to 6, matches the plan's Mon=0 convention.
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}
