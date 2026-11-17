import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Rescale a single meal_items row by a scale factor. Used by the
 * portion-edit flow — user taps "450g" on a 300g item, client sends
 * { scale: 1.5, portion_estimate: "450g" }, server multiplies every
 * macro field by 1.5 and updates the label.
 *
 * Scale-based rather than absolute-value-based so the client doesn't
 * need to know the current values AND the server doesn't need to
 * assume the client's math matches ours. Accepts 0.1x-10x to prevent
 * typos ("4500g" instead of "450g") from zeroing or exploding macros.
 */
const scaleRe = z.number().min(0.05).max(10);
const patchSchema = z.object({
  scale: scaleRe,
  portion_estimate: z.string().min(1).max(60),
});

/**
 * Delete a single meal_items row. RLS restricts to the owning user, so
 * we don't need to filter by user_id explicitly — the anon-key client
 * bound to the request only sees its own rows. Idempotent: deleting an
 * already-deleted or non-existent row is a 204.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // Scope by user_id explicitly (belt-and-suspenders alongside RLS) AND
  // request the deleted row back so we know whether anything was actually
  // removed. Without this, an RLS-blocked delete returns {error: null}
  // and we'd falsely 204 — the client would refetch and see the row
  // still present, which looks like "delete didn't work".
  const { data, error } = await supabase
    .from("meal_items")
    .delete()
    .eq("id", numericId)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", details: error.message },
      { status: 500 }
    );
  }
  const removed = data?.length ?? 0;
  // Return JSON with the count so the client can distinguish "actually
  // deleted" from "already gone / not owned by this user". We DON'T
  // 404 on removed=0 because that would break double-tap idempotency —
  // a slow network can retry and the second DELETE legitimately finds
  // nothing to remove. Final ledger refetch on the client is the source
  // of truth; the count is informational.
  return NextResponse.json({ removed }, { status: 200 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { scale, portion_estimate } = parsed.data;

  // Pull the row's current macros (RLS enforces ownership — we won't
  // see anything the user doesn't own).
  const { data: current, error: readErr } = await supabase
    .from("meal_items")
    .select(
      "kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, sodium_mg_low, sodium_mg_high, fiber_g_low, fiber_g_high, sugar_g_low, sugar_g_high, saturated_fat_g_low, saturated_fat_g_high"
    )
    .eq("id", numericId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: "read_failed", details: readErr.message },
      { status: 500 }
    );
  }
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const scaleInt = (n: number | null): number | null =>
    n == null ? null : Math.round(Number(n) * scale);
  const scaleDec = (n: number | null): number | null =>
    n == null ? null : Math.round(Number(n) * scale * 10) / 10;

  const update = {
    portion_estimate,
    kcal_low: scaleInt(current.kcal_low),
    kcal_high: scaleInt(current.kcal_high),
    protein_g_low: scaleDec(current.protein_g_low),
    protein_g_high: scaleDec(current.protein_g_high),
    carb_g_low: scaleDec(current.carb_g_low),
    carb_g_high: scaleDec(current.carb_g_high),
    fat_g_low: scaleDec(current.fat_g_low),
    fat_g_high: scaleDec(current.fat_g_high),
    sodium_mg_low: scaleInt(current.sodium_mg_low),
    sodium_mg_high: scaleInt(current.sodium_mg_high),
    fiber_g_low: scaleDec(current.fiber_g_low),
    fiber_g_high: scaleDec(current.fiber_g_high),
    sugar_g_low: scaleDec(current.sugar_g_low),
    sugar_g_high: scaleDec(current.sugar_g_high),
    saturated_fat_g_low: scaleDec(current.saturated_fat_g_low),
    saturated_fat_g_high: scaleDec(current.saturated_fat_g_high),
  };

  const { data: updated, error } = await supabase
    .from("meal_items")
    .update(update)
    .eq("id", numericId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "update_failed", details: error.message },
      { status: 500 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: updated.id, ...update });
}
