import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Hard-delete the current user's account.
 * 1. Purge storage objects (photos in plate-scans / menu-scans buckets).
 * 2. RPC into public.delete_current_user, which removes the auth.users
 *    row; FK cascades wipe profiles, weight_logs, scans, meal_items.
 * 3. Sign the user out.
 *
 * Privacy policy commits to "delete everything at any time" — this is
 * that. Body scan images were never stored to begin with.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const buckets = ["plate-scans", "menu-scans"];
  for (const bucket of buckets) {
    const { data: files, error: listErr } = await supabase.storage
      .from(bucket)
      .list(user.id);
    if (listErr) continue;
    if (!files || files.length === 0) continue;
    const paths = files.map((f) => `${user.id}/${f.name}`);
    await supabase.storage.from(bucket).remove(paths);
  }

  const { error: rpcErr } = await supabase.rpc("delete_current_user");
  if (rpcErr) {
    return NextResponse.json(
      { error: "delete_failed", details: rpcErr.message },
      { status: 500 }
    );
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
