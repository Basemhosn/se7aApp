import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Admin-only. Returns raw meal_items for a user by the last 8 chars of
 * their user_id (what the diagnostic logs expose). Bypasses RLS via
 * service role so we can distinguish "RLS is hiding the rows" from
 * "the rows genuinely aren't in Postgres yet."
 *
 * Remove this endpoint once the vanishing-items investigation closes.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || auth !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const suffix = searchParams.get("user_suffix");
  if (!suffix || suffix.length < 6) {
    return NextResponse.json(
      { error: "missing_user_suffix", note: "pass ?user_suffix=<last 8 chars of user_id>" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();

  // Find the user_id by suffix. Not efficient but it's a one-off debug.
  const { data: users, error: usersErr } = await admin
    .from("profiles")
    .select("user_id")
    .limit(200);
  if (usersErr) {
    return NextResponse.json(
      { error: "profiles_query_failed", details: usersErr.message },
      { status: 500 }
    );
  }
  const match = users?.find((u) => u.user_id.endsWith(suffix));
  if (!match) {
    return NextResponse.json(
      { error: "no_user_found", checked: users?.length ?? 0 },
      { status: 404 }
    );
  }

  const { data: items, error: itemsErr } = await admin
    .from("meal_items")
    .select("id, eaten_at, name, source, scan_id, user_id")
    .eq("user_id", match.user_id)
    .order("eaten_at", { ascending: false })
    .limit(50);
  if (itemsErr) {
    return NextResponse.json(
      { error: "items_query_failed", details: itemsErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user_id: match.user_id,
    now_utc: new Date().toISOString(),
    item_count: items?.length ?? 0,
    items: items ?? [],
  });
}

/**
 * Nukes every meal_items row for the user identified by ?user_suffix.
 * Clean-slate testing helper — gated by ADMIN_SECRET same as the GET.
 * Returns the deleted row count so the caller can verify.
 */
export async function DELETE(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || auth !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const suffix = searchParams.get("user_suffix");
  if (!suffix || suffix.length < 6) {
    return NextResponse.json(
      { error: "missing_user_suffix" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("user_id")
    .limit(200);
  const match = users?.find((u) => u.user_id.endsWith(suffix));
  if (!match) {
    return NextResponse.json({ error: "no_user_found" }, { status: 404 });
  }

  const { data: deleted, error } = await admin
    .from("meal_items")
    .delete()
    .eq("user_id", match.user_id)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user_id: match.user_id,
    deleted_count: deleted?.length ?? 0,
    deleted_ids: deleted?.map((r) => r.id) ?? [],
  });
}
