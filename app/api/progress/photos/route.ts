import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * List a user's progress photos with short-lived signed URLs (1h).
 * Signed URLs are the only way clients see these images — the bucket
 * is private and the storage path is not exposed to the client.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const angle = searchParams.get("angle");
  const limit = clamp(Number(searchParams.get("limit") ?? "100"), 1, 500);

  const query = supabase
    .from("progress_photos")
    .select("id, taken_at, angle, photo_path, weight_kg_snapshot, notes")
    .eq("user_id", user.id)
    .order("taken_at", { ascending: false })
    .limit(limit);

  const { data: rows, error } = angle
    ? await query.eq("angle", angle)
    : await query;

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  const paths = (rows ?? []).map((r) => r.photo_path);
  const signed = paths.length
    ? await supabase.storage
        .from("progress-photos")
        .createSignedUrls(paths, 3600)
    : { data: [] as { path?: string | null; signedUrl?: string }[] };

  const urlByPath = new Map<string, string>();
  for (const s of signed.data ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  const photos = (rows ?? []).map((r) => ({
    id: r.id,
    taken_at: r.taken_at,
    angle: r.angle,
    weight_kg_snapshot: r.weight_kg_snapshot,
    notes: r.notes,
    url: urlByPath.get(r.photo_path) ?? null,
  }));

  return NextResponse.json({ photos, count: photos.length });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
