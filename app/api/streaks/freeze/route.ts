import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import {
  FREEZE_MAX_BACKDATE_DAYS,
  MONTHLY_FREEZE_BUDGET,
} from "../route";

export const runtime = "nodejs";

const bodySchema = z.object({
  freeze_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  tz_offset_min: z
    .number()
    .int()
    .min(-14 * 60)
    .max(14 * 60)
    .default(0),
});

/**
 * Apply a streak freeze for a specific past day.
 *
 * Rules (400 on failure with a `reason` string):
 *  - freeze_date must be within the last FREEZE_MAX_BACKDATE_DAYS days
 *    in the user's local timezone (can't freeze today or the future)
 *  - user must have budget remaining this calendar month
 *  - freeze_date must not already be logged (has any meal_item that day)
 *  - freeze_date must not already have a freeze row (unique index also
 *    catches this; we check first for a friendlier error)
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { freeze_date, tz_offset_min } = parsed.data;

  const now = new Date();
  const today = localDayKey(now, tz_offset_min);
  const oldestAllowed = localDayKey(
    offsetDays(now, -FREEZE_MAX_BACKDATE_DAYS),
    tz_offset_min
  );

  if (freeze_date >= today) {
    return NextResponse.json(
      { error: "invalid_freeze_date", reason: "cannot_freeze_today_or_future" },
      { status: 400 }
    );
  }
  if (freeze_date < oldestAllowed) {
    return NextResponse.json(
      { error: "invalid_freeze_date", reason: "too_old" },
      { status: 400 }
    );
  }

  // Reject if the user already logged a meal on that local day.
  const dayStartUtc = utcInstantAtLocalStartOfDay(freeze_date, tz_offset_min);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 86_400_000);
  const { count: mealsThatDay } = await supabase
    .from("meal_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("eaten_at", dayStartUtc.toISOString())
    .lt("eaten_at", dayEndUtc.toISOString());
  if ((mealsThatDay ?? 0) > 0) {
    return NextResponse.json(
      { error: "invalid_freeze_date", reason: "already_logged" },
      { status: 400 }
    );
  }

  // Budget check: freezes created this calendar month (user local).
  const startOfMonth = firstOfMonthLocal(now, tz_offset_min);
  const { count: monthUsed } = await supabase
    .from("streak_freezes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfMonth.toISOString());
  if ((monthUsed ?? 0) >= MONTHLY_FREEZE_BUDGET) {
    return NextResponse.json(
      { error: "no_budget", reason: "monthly_limit_reached" },
      { status: 400 }
    );
  }

  // Attempt insert; unique index handles the "already frozen" race.
  const { error } = await supabase.from("streak_freezes").insert({
    user_id: user.id,
    freeze_date,
  });
  if (error) {
    // 23505 = unique violation → someone already froze that day
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "invalid_freeze_date", reason: "already_frozen" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    freeze_date,
    freezes_used_this_month: (monthUsed ?? 0) + 1,
    freezes_available_this_month: Math.max(
      0,
      MONTHLY_FREEZE_BUDGET - ((monthUsed ?? 0) + 1)
    ),
  });
}

function localDayKey(d: Date, tzOffsetMin: number): string {
  const shifted = new Date(d.getTime() + tzOffsetMin * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function offsetDays(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
}

function utcInstantAtLocalStartOfDay(
  dayKey: string,
  tzOffsetMin: number
): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  // Local midnight for that day, expressed as a UTC instant.
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - tzOffsetMin * 60_000);
}

function firstOfMonthLocal(now: Date, tzOffsetMin: number): Date {
  const shifted = new Date(now.getTime() + tzOffsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - tzOffsetMin * 60_000);
}
