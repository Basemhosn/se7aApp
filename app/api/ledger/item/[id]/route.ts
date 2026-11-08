import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
