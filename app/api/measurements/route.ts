import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Body measurements — tape-measure values in cm.
 * All fields optional so users log only what they track.
 * POST inserts one row; GET returns most-recent N.
 */
const insertSchema = z
  .object({
    waist_cm: z.number().min(20).max(300).optional().nullable(),
    hip_cm: z.number().min(20).max(300).optional().nullable(),
    chest_cm: z.number().min(20).max(300).optional().nullable(),
    arm_cm: z.number().min(10).max(150).optional().nullable(),
    thigh_cm: z.number().min(20).max(200).optional().nullable(),
    neck_cm: z.number().min(20).max(100).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine(
    (v) =>
      [
        v.waist_cm,
        v.hip_cm,
        v.chest_cm,
        v.arm_cm,
        v.thigh_cm,
        v.neck_cm,
      ].some((n) => n != null),
    { message: "at least one measurement required" }
  );

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = insertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await supabase
    .from("body_measurements")
    .insert({ user_id: user.id, ...parsed.data })
    .select("*")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: "persist_failed", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, measurement: inserted });
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
  const limit = clamp(Number(searchParams.get("limit") ?? "60"), 1, 500);

  const { data: rows, error } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  // Compute deltas vs first entry so the UI can render "-3.2 cm since day 1".
  const asc = [...(rows ?? [])].reverse();
  const first = asc[0];
  const latest = asc[asc.length - 1];
  const deltas =
    first && latest && first !== latest
      ? {
          waist_cm: delta(first.waist_cm, latest.waist_cm),
          hip_cm: delta(first.hip_cm, latest.hip_cm),
          chest_cm: delta(first.chest_cm, latest.chest_cm),
          arm_cm: delta(first.arm_cm, latest.arm_cm),
          thigh_cm: delta(first.thigh_cm, latest.thigh_cm),
          neck_cm: delta(first.neck_cm, latest.neck_cm),
        }
      : null;

  return NextResponse.json({
    measurements: rows ?? [],
    count: rows?.length ?? 0,
    deltas,
  });
}

function delta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((Number(b) - Number(a)) * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
