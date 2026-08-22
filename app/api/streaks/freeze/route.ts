import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import {
  FREEZE_MAX_BACKDATE_DAYS,
  MONTHLY_FREEZE_BUDGET,
} from "../route";

export const runtime = "nodejs";

/**
 * Apply one or more streak freezes in a single write, so a user who
 * missed 2-3 days in a row can restore their prior streak with one
 * confirm instead of tapping "save yesterday" three days running.
 *
 * Backward-compatible body shape: either
 *   { freeze_date: "YYYY-MM-DD" }          — single-day (legacy)
 *   { freeze_dates: ["YYYY-MM-DD", ...] }  — multi-day
 *
 * Rules (400 with a `reason` string on failure):
 *  - Every date within the last FREEZE_MAX_BACKDATE_DAYS days (user tz)
 *  - No future/today dates
 *  - No dates the user already logged a meal on
 *  - No dates already frozen
 *  - Total dates in the batch must fit remaining monthly budget
 *
 * Validation is all-or-nothing: if any single date fails we reject
 * the whole batch so the client can adjust before we start writing
 * partial state. Writes then happen as a single bulk upsert.
 */
const bodySchema = z
  .object({
    freeze_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .optional(),
    freeze_dates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .max(FREEZE_MAX_BACKDATE_DAYS)
      .optional(),
    tz_offset_min: z
      .number()
      .int()
      .min(-14 * 60)
      .max(14 * 60)
      .default(0),
  })
  .refine((v) => !!v.freeze_date || (v.freeze_dates?.length ?? 0) > 0, {
    message: "one of freeze_date or freeze_dates required",
  });

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
  const { tz_offset_min } = parsed.data;
  // Collapse both body shapes into a single deduped array, sorted
  // most-recent first so error messages point at the "youngest" bad
  // date, which is what the user was probably trying to freeze.
  const inputDates = Array.from(
    new Set([
      ...(parsed.data.freeze_date ? [parsed.data.freeze_date] : []),
      ...(parsed.data.freeze_dates ?? []),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const now = new Date();
  const today = localDayKey(now, tz_offset_min);
  const oldestAllowed = localDayKey(
    offsetDays(now, -FREEZE_MAX_BACKDATE_DAYS),
    tz_offset_min
  );

  for (const d of inputDates) {
    if (d >= today) {
      return NextResponse.json(
        {
          error: "invalid_freeze_date",
          reason: "cannot_freeze_today_or_future",
          freeze_date: d,
        },
        { status: 400 }
      );
    }
    if (d < oldestAllowed) {
      return NextResponse.json(
        { error: "invalid_freeze_date", reason: "too_old", freeze_date: d },
        { status: 400 }
      );
    }
  }

  // Budget check for the whole batch. Counting once up front matches
  // how the client reasons ("I have 2 freezes and want to use 2").
  const startOfMonth = firstOfMonthLocal(now, tz_offset_min);
  const { count: monthUsed } = await supabase
    .from("streak_freezes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfMonth.toISOString());
  const remaining = MONTHLY_FREEZE_BUDGET - (monthUsed ?? 0);
  if (inputDates.length > remaining) {
    return NextResponse.json(
      {
        error: "no_budget",
        reason: "insufficient_budget",
        needed: inputDates.length,
        available: Math.max(0, remaining),
      },
      { status: 400 }
    );
  }

  // Reject dates the user already logged a meal on. One query spans
  // the whole batch window to keep this at O(1) DB round-trips.
  const earliest = inputDates[inputDates.length - 1]!;
  const latest = inputDates[0]!;
  const windowStartUtc = utcInstantAtLocalStartOfDay(earliest, tz_offset_min);
  const windowEndUtc = new Date(
    utcInstantAtLocalStartOfDay(latest, tz_offset_min).getTime() +
      86_400_000
  );
  const { data: meals } = await supabase
    .from("meal_items")
    .select("eaten_at")
    .eq("user_id", user.id)
    .gte("eaten_at", windowStartUtc.toISOString())
    .lt("eaten_at", windowEndUtc.toISOString());
  const loggedDays = new Set<string>();
  for (const m of meals ?? []) {
    loggedDays.add(localDayKey(new Date(m.eaten_at as string), tz_offset_min));
  }
  for (const d of inputDates) {
    if (loggedDays.has(d)) {
      return NextResponse.json(
        {
          error: "invalid_freeze_date",
          reason: "already_logged",
          freeze_date: d,
        },
        { status: 400 }
      );
    }
  }

  // Bulk insert. The unique index on (user_id, freeze_date) catches
  // any already-frozen day in the batch — we surface that as its own
  // reason so the client can nudge the user to pick different dates.
  const rows = inputDates.map((freeze_date) => ({
    user_id: user.id,
    freeze_date,
  }));
  const { error } = await supabase.from("streak_freezes").insert(rows);
  if (error) {
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

  const nextUsed = (monthUsed ?? 0) + inputDates.length;
  return NextResponse.json({
    ok: true,
    freeze_dates: inputDates,
    freezes_used_this_month: nextUsed,
    freezes_available_this_month: Math.max(0, MONTHLY_FREEZE_BUDGET - nextUsed),
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
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - tzOffsetMin * 60_000);
}

function firstOfMonthLocal(now: Date, tzOffsetMin: number): Date {
  const shifted = new Date(now.getTime() + tzOffsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - tzOffsetMin * 60_000);
}
