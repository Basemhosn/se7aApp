import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sunday morning cron. Fires once a week; loops over every registered
 * push token, composes a personalized recap for the owning user, and
 * pushes it via Expo Push API.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is set on the project. We reject anything else so the
 * endpoint can't be spammed publicly.
 *
 * Env required (both must be set for this to do real work):
 * - CRON_SECRET — any random string, matches vercel.json cron header
 * - SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API
 *   (needed because the cron reads across all users, not just the caller)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "missing_env", details: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 503 }
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokens, error: tokErr } = await admin
    .from("push_tokens")
    .select("user_id, expo_token, platform");
  if (tokErr) {
    return NextResponse.json(
      { error: "load_failed", details: tokErr.message },
      { status: 500 }
    );
  }

  const weekAgo = new Date();
  weekAgo.setHours(0, 0, 0, 0);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const messages: {
    to: string;
    title: string;
    body: string;
    sound: "default";
  }[] = [];

  const userIds = [...new Set((tokens ?? []).map((t) => t.user_id))];

  for (const userId of userIds) {
    const [mealsRes, weightsRes, workoutsRes] = await Promise.all([
      admin
        .from("meal_items")
        .select("eaten_at")
        .eq("user_id", userId)
        .gte("eaten_at", weekAgoIso),
      admin
        .from("weight_logs")
        .select("weight_kg, logged_at")
        .eq("user_id", userId)
        .gte("logged_at", weekAgoIso)
        .order("logged_at", { ascending: true }),
      admin
        .from("workout_sessions")
        .select("completed_at")
        .eq("user_id", userId)
        .gte("completed_at", weekAgoIso),
    ]);

    const daysLogged = new Set<string>();
    for (const m of mealsRes.data ?? []) daysLogged.add(m.eaten_at.slice(0, 10));
    for (const w of workoutsRes.data ?? []) daysLogged.add(w.completed_at.slice(0, 10));

    const workoutCount = workoutsRes.data?.length ?? 0;
    const weights = (weightsRes.data ?? []).map((w) => Number(w.weight_kg));
    const weightDelta =
      weights.length >= 2 ? weights[weights.length - 1]! - weights[0]! : null;

    const body = composeRecap(daysLogged.size, workoutCount, weightDelta);

    // Send one message per token owned by this user (multiple devices).
    for (const tok of (tokens ?? []).filter((t) => t.user_id === userId)) {
      messages.push({
        to: tok.expo_token,
        title: "Your week in SE7A",
        body,
        sound: "default",
      });
    }
  }

  // Expo Push API accepts up to 100 messages per call.
  const results: unknown[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
    const body = await res.json().catch(() => null);
    results.push(body);
  }

  return NextResponse.json({
    ok: true,
    users_processed: userIds.length,
    messages_sent: messages.length,
    expo_responses: results,
  });
}

function composeRecap(
  daysLogged: number,
  workoutCount: number,
  weightDelta: number | null
): string {
  const parts: string[] = [];
  parts.push(`${daysLogged}/7 days logged`);
  if (workoutCount > 0) parts.push(`${workoutCount} workout${workoutCount === 1 ? "" : "s"}`);
  if (weightDelta !== null) {
    const sign = weightDelta > 0 ? "+" : "";
    parts.push(`${sign}${weightDelta.toFixed(1)} kg`);
  }
  const stats = parts.join(" · ");
  const bonus =
    daysLogged >= 5
      ? "Above the ~4-day median. That's the win."
      : daysLogged >= 3
        ? "Push to 5+ next week."
        : "Small step this week is fine. Try one scan a day.";
  return `${stats}. ${bonus}`;
}
