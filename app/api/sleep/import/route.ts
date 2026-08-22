import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Client-side sleep session import (Android Health Connect on-device,
 * potentially HealthKit too in the future). Server-side integrations
 * (Whoop, Oura) go through their own sync paths and don't call this.
 *
 * Dedupes via (user, source, provider_session_id) — the same unique
 * index the Whoop/Oura syncs use.
 */

const sessionSchema = z.object({
  provider_session_id: z.string().min(1).max(200),
  night_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().max(1440),
  time_in_bed_minutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .nullable()
    .optional(),
  deep_minutes: z.number().int().min(0).nullable().optional(),
  rem_minutes: z.number().int().min(0).nullable().optional(),
  light_minutes: z.number().int().min(0).nullable().optional(),
  awake_minutes: z.number().int().min(0).nullable().optional(),
});

const bodySchema = z.object({
  source: z.enum(["healthkit", "health_connect", "manual"]),
  sessions: z.array(sessionSchema).max(50),
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.sessions.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0 });
  }

  const rows = parsed.data.sessions.map((s) => ({
    user_id: user.id,
    source: parsed.data.source,
    provider_session_id: s.provider_session_id,
    night_date: s.night_date,
    start_at: s.start_at,
    end_at: s.end_at,
    duration_minutes: s.duration_minutes,
    time_in_bed_minutes: s.time_in_bed_minutes ?? null,
    deep_minutes: s.deep_minutes ?? null,
    rem_minutes: s.rem_minutes ?? null,
    light_minutes: s.light_minutes ?? null,
    awake_minutes: s.awake_minutes ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error, count } = await supabase
    .from("sleep_sessions")
    .upsert(rows, {
      onConflict: "user_id,source,provider_session_id",
      count: "exact",
    });
  if (error) {
    return NextResponse.json(
      { error: "save_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, upserted: count ?? rows.length });
}
