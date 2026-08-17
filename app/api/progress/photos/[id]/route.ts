import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Delete a progress photo — both the DB row and the Storage object.
 * RLS on both tables scopes to auth.uid(), so we can't accidentally
 * delete someone else's row/object.
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

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: row, error: readErr } = await supabase
    .from("progress_photos")
    .select("photo_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: "load_failed", details: readErr.message },
      { status: 500 }
    );
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Remove storage object first; if that fails we bail out and keep the
  // row so the user can retry rather than orphaning the file.
  const removeRes = await supabase.storage
    .from("progress-photos")
    .remove([row.photo_path]);
  if (removeRes.error) {
    return NextResponse.json(
      { error: "storage_delete_failed", details: removeRes.error.message },
      { status: 500 }
    );
  }

  const { error: delErr } = await supabase
    .from("progress_photos")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (delErr) {
    return NextResponse.json(
      { error: "persist_delete_failed", details: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
