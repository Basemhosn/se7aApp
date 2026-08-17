import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import {
  claimNotification,
  loadTokensByUser,
  localDayKey,
  localHour,
  localWeekdayMonZero,
  sendExpoPush,
  type PushMessage,
  type TokenRow,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Runs every hour. For each user with push tokens, evaluates a small
 * ruleset in the user's LOCAL timezone. Each rule fires at most once
 * per day per user via the notifications_sent dedupe table.
 *
 * Rules:
 *  - streak_at_risk (local 20:00) — user has >=2 day streak but hasn't
 *    logged anything today. "Your 5-day streak is at risk."
 *  - lunch_nudge (local 13:00) — no lunch logged today AND user is a
 *    regular logger (>=3 of last 7 days). "Lunchtime — snap a plate?"
 *  - weigh_in (Monday local 09:00) — no weight logged in the last 5 days
 *    AND user has weight_kg set on profile. "Weekly weigh-in?"
 *  - plan_your_week (Sunday local 10:00, Pro only) — no meal_plan row
 *    for this week yet. "Sunday planning session?"
 */

const DAY_MS = 86_400_000;

interface Prefs {
  streak_at_risk?: boolean;
  lunch_nudge?: boolean;
  weigh_in?: boolean;
  plan_your_week?: boolean;
  pr_celebration?: boolean;
  weekly_recap?: boolean;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  notification_prefs: Prefs | null;
  tz_offset_min: number | null;
  weight_kg: number | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const now = new Date();

  const tokensByUser = await loadTokensByUser(admin);
  if (tokensByUser.size === 0) {
    return NextResponse.json({ ok: true, users: 0 });
  }

  const userIds = [...tokensByUser.keys()];
  const [profilesRes, subsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, display_name, notification_prefs, tz_offset_min, weight_kg")
      .in("user_id", userIds),
    admin
      .from("v_active_pro")
      .select("user_id, is_pro")
      .in("user_id", userIds),
  ]);

  const profileByUser = new Map<string, ProfileRow>();
  for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
    profileByUser.set(p.user_id, p);
  }
  const proByUser = new Map<string, boolean>();
  for (const s of (subsRes.data ?? []) as { user_id: string; is_pro: boolean }[]) {
    proByUser.set(s.user_id, !!s.is_pro);
  }

  const messages: PushMessage[] = [];
  const stats = {
    users: userIds.length,
    streak_at_risk: 0,
    lunch_nudge: 0,
    weigh_in: 0,
    plan_your_week: 0,
  };

  for (const userId of userIds) {
    const profile = profileByUser.get(userId);
    if (!profile) continue;
    const tz = profile.tz_offset_min ?? 0;
    const prefs = profile.notification_prefs ?? {};
    const tokens = tokensByUser.get(userId) ?? [];
    if (tokens.length === 0) continue;

    const hour = localHour(now, tz);
    const dow = localWeekdayMonZero(now, tz);
    const today = localDayKey(now, tz);

    // ── Rule 1: streak_at_risk (local 20:00) ──────────────────────────
    if (prefs.streak_at_risk !== false && hour === 20) {
      const decision = await evalStreakAtRisk(admin, userId, tz, now);
      if (decision.fire) {
        if (await claimNotification(admin, userId, "streak_at_risk", today)) {
          for (const tok of tokens) {
            messages.push({
              to: tok.expo_token,
              title: `🔥 Your ${decision.streak}-day streak`,
              body: "Log something quick before midnight to keep it alive.",
              data: { kind: "streak_at_risk" },
            });
          }
          stats.streak_at_risk += 1;
        }
      }
    }

    // ── Rule 2: lunch_nudge (local 13:00) ─────────────────────────────
    if (prefs.lunch_nudge !== false && hour === 13) {
      const decision = await evalLunchNudge(admin, userId, tz, now);
      if (decision.fire) {
        if (await claimNotification(admin, userId, "lunch_nudge", today)) {
          for (const tok of tokens) {
            messages.push({
              to: tok.expo_token,
              title: "Lunchtime.",
              body: "Snap a plate — takes 5 seconds.",
              data: { kind: "lunch_nudge" },
            });
          }
          stats.lunch_nudge += 1;
        }
      }
    }

    // ── Rule 3: weigh_in (Monday local 09:00) ─────────────────────────
    if (
      prefs.weigh_in !== false &&
      dow === 0 &&
      hour === 9 &&
      profile.weight_kg
    ) {
      const decision = await evalWeighIn(admin, userId, now);
      if (decision.fire) {
        if (await claimNotification(admin, userId, "weigh_in", today)) {
          for (const tok of tokens) {
            messages.push({
              to: tok.expo_token,
              title: "Weekly weigh-in?",
              body: `Trend is ${decision.daysStale} days stale — one weigh-in re-tunes your targets.`,
              data: { kind: "weigh_in" },
            });
          }
          stats.weigh_in += 1;
        }
      }
    }

    // ── Rule 4: plan_your_week (Sunday local 10:00, Pro only) ─────────
    if (
      prefs.plan_your_week !== false &&
      dow === 6 &&
      hour === 10 &&
      proByUser.get(userId)
    ) {
      const decision = await evalPlanYourWeek(admin, userId, tz, now);
      if (decision.fire) {
        if (await claimNotification(admin, userId, "plan_your_week", today)) {
          for (const tok of tokens) {
            messages.push({
              to: tok.expo_token,
              title: "Sunday planning.",
              body: "Generate this week's meal plan + shopping list in 30 seconds.",
              data: { kind: "plan_your_week" },
            });
          }
          stats.plan_your_week += 1;
        }
      }
    }
  }

  const responses = await sendExpoPush(messages);
  return NextResponse.json({
    ok: true,
    stats,
    messages_sent: messages.length,
    expo_responses: responses,
  });
}

// ── Rule evaluators ──────────────────────────────────────────────────────

async function evalStreakAtRisk(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  tz: number,
  now: Date
): Promise<{ fire: false } | { fire: true; streak: number }> {
  const today = localDayKey(now, tz);
  // Anything logged today?
  const startOfLocalToday = new Date(now);
  startOfLocalToday.setUTCHours(0, 0, 0, 0);
  startOfLocalToday.setTime(
    startOfLocalToday.getTime() - tz * 60_000
  );
  const { count: todayCount } = await admin
    .from("meal_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("eaten_at", startOfLocalToday.toISOString());
  if ((todayCount ?? 0) > 0) return { fire: false };

  // Compute current streak from meal_items — walk back from yesterday.
  const lookback = new Date(now.getTime() - 30 * DAY_MS);
  const { data: rows } = await admin
    .from("meal_items")
    .select("eaten_at")
    .eq("user_id", userId)
    .gte("eaten_at", lookback.toISOString());
  const days = new Set<string>();
  for (const r of rows ?? []) {
    days.add(localDayKey(new Date(r.eaten_at as string), tz));
  }
  let cursor = new Date(now.getTime() - DAY_MS);
  let streak = 0;
  while (days.has(localDayKey(cursor, tz))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  if (streak < 2 || days.has(today)) return { fire: false };
  return { fire: true, streak };
}

async function evalLunchNudge(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  tz: number,
  now: Date
): Promise<{ fire: boolean }> {
  const startOfLocalToday = new Date(now);
  startOfLocalToday.setUTCHours(0, 0, 0, 0);
  startOfLocalToday.setTime(startOfLocalToday.getTime() - tz * 60_000);

  const [{ count: lunchCount }, { data: weekRows }] = await Promise.all([
    admin
      .from("meal_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("meal_slot", "lunch")
      .gte("eaten_at", startOfLocalToday.toISOString()),
    admin
      .from("meal_items")
      .select("eaten_at")
      .eq("user_id", userId)
      .gte("eaten_at", new Date(now.getTime() - 7 * DAY_MS).toISOString()),
  ]);

  if ((lunchCount ?? 0) > 0) return { fire: false };
  const daysLogged = new Set<string>();
  for (const r of weekRows ?? []) {
    daysLogged.add(localDayKey(new Date(r.eaten_at as string), tz));
  }
  return { fire: daysLogged.size >= 3 };
}

async function evalWeighIn(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  now: Date
): Promise<{ fire: false } | { fire: true; daysStale: number }> {
  const { data: latest } = await admin
    .from("weight_logs")
    .select("logged_at")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { fire: true, daysStale: 999 };
  const days = Math.floor(
    (now.getTime() - new Date(latest.logged_at as string).getTime()) / DAY_MS
  );
  return days >= 5 ? { fire: true, daysStale: days } : { fire: false };
}

async function evalPlanYourWeek(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  tz: number,
  now: Date
): Promise<{ fire: boolean }> {
  // Monday-anchored week that contains this Sunday's local day.
  // Compute the Monday of the *upcoming* week (i.e. tomorrow).
  const localNow = new Date(now.getTime() + tz * 60_000);
  const mondayOfNextWeek = new Date(localNow);
  mondayOfNextWeek.setUTCDate(mondayOfNextWeek.getUTCDate() + 1);
  mondayOfNextWeek.setUTCHours(0, 0, 0, 0);
  const weekStart = `${mondayOfNextWeek.getUTCFullYear()}-${String(mondayOfNextWeek.getUTCMonth() + 1).padStart(2, "0")}-${String(mondayOfNextWeek.getUTCDate()).padStart(2, "0")}`;

  const { data: existing } = await admin
    .from("meal_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  return { fire: !existing };
}
