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

  const { error } = await supabase
    .from("meal_items")
    .delete()
    .eq("id", numericId);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", details: error.message },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
