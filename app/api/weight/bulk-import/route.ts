import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Bulk import historical weight (+optional body-fat) samples from a
 * health store. Called by useHealthSync's initial backfill (90 days).
 *
 * Dedup rule: per day, keep only ONE weight entry. If we already have
 * a row within ±1 hour of an incoming sample, drop it. Prevents the
 * user's ledger from filling with duplicates when they weigh multiple
 * times per day (or when a scale writes twice).
 *
 * Does NOT retune macro targets — the retune belongs to /api/weight
 * (POST) for the CURRENT weight. Historical backfill shouldn't shift
 * targets retroactively.
 */
const bulkSchema = z.object({
  samples: z
    .array(
      z.object({
        weight_kg: z.number().positive().max(500),
        body_fat_pct: z.number().min(3).max(60).nullable().optional(),
        measured_at: z.string().datetime(),
      })
    )
    .min(1)
    .max(500),
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
  const parsed = bulkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const samples = parsed.data.samples;
  // Window covering all incoming samples so we can dedup in one query.
  const times = samples.map((s) => new Date(s.measured_at).getTime());
  const minMs = Math.min(...times) - 60 * 60 * 1000; // 1h margin
  const maxMs = Math.max(...times) + 60 * 60 * 1000;

  const { data: existing } = await supabase
    .from("weight_logs")
    .select("logged_at")
    .eq("user_id", user.id)
    .gte("logged_at", new Date(minMs).toISOString())
    .lte("logged_at", new Date(maxMs).toISOString());

  const existingMs = (existing ?? []).map((r) =>
    new Date(r.logged_at as string).getTime()
  );
  const isDupe = (t: number) =>
    existingMs.some((e) => Math.abs(e - t) < 60 * 60 * 1000);

  const toInsert = samples
    .filter((s) => !isDupe(new Date(s.measured_at).getTime()))
    .map((s) => ({
      user_id: user.id,
      weight_kg: s.weight_kg,
      body_fat_pct: s.body_fat_pct ?? null,
      logged_at: s.measured_at,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: samples.length });
  }

  const { error } = await supabase.from("weight_logs").insert(toInsert);
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    skipped: samples.length - toInsert.length,
  });
}
