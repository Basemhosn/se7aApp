import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { logCardioSchema } from "@/lib/schemas/cardio";

export const runtime = "nodejs";

/**
 * Log a cardio session — a run, walk, ride, swim, etc. Called from both
 * the manual "Log cardio" screen and the HealthKit auto-import path.
 * HealthKit sends hk_uuid so re-imports dedupe via the unique index.
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
  const parsed = logCardioSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    kind: parsed.data.kind,
    started_at: parsed.data.started_at ?? new Date().toISOString(),
    duration_min: parsed.data.duration_min,
    distance_km: parsed.data.distance_km ?? null,
    kcal_burned: parsed.data.kcal_burned ?? null,
    avg_hr: parsed.data.avg_hr ?? null,
    source: parsed.data.source,
    hk_uuid: parsed.data.hk_uuid ?? null,
    notes: parsed.data.notes ?? null,
  };

  // Manual inserts: plain insert. HealthKit inserts: upsert on
  // (user_id, hk_uuid) so re-imports don't double-count.
  if (parsed.data.source === "healthkit" && parsed.data.hk_uuid) {
    const { data, error } = await supabase
      .from("cardio_sessions")
      .upsert(row, { onConflict: "user_id,hk_uuid", ignoreDuplicates: false })
      .select("id, started_at")
      .single();
    if (error) {
      return NextResponse.json(
        { error: "persist_failed", details: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, session: data });
  }

  const { data, error } = await supabase
    .from("cardio_sessions")
    .insert(row)
    .select("id, started_at")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, session: data });
}

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = clamp(Number(searchParams.get("days") ?? "7"), 1, 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("cardio_sessions")
    .select("id, kind, started_at, duration_min, distance_km, kcal_burned, avg_hr, source")
    .eq("user_id", user.id)
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessions: data ?? [], days });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
