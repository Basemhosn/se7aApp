import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ALLOWED_ANGLES = new Set(["front", "side", "back"]);

/**
 * Save a user-initiated progress photo. Distinct from the AI body-scan
 * endpoint — that one analyzes in-memory and discards. This one stores
 * the photo in the private `progress-photos` bucket so the user can
 * compare themselves over time on their own timeline.
 *
 * Privacy: bucket is private; only signed URLs from GET /progress/photos
 * expose the image. User-deletable at any time.
 *
 * If a weight_log exists within the last 24h, we snapshot it onto the
 * row so the timeline can show "-2.1 kg since first photo" over time.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  const angleRaw = String(form?.get("angle") ?? "").toLowerCase();
  const notesRaw = form?.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.slice(0, 500) : null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "invalid_input", details: "expected multipart field 'image'" },
      { status: 400 }
    );
  }
  if (!ALLOWED_ANGLES.has(angleRaw)) {
    return NextResponse.json(
      { error: "invalid_input", details: "angle must be front|side|back" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "image_too_large", details: `max ${MAX_BYTES} bytes` },
      { status: 413 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "invalid_mime", details: file.type },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = mimeToExt(file.type);
  const objectId = crypto.randomUUID();
  const objectPath = `${user.id}/${objectId}.${ext}`;

  const upload = await supabase.storage
    .from("progress-photos")
    .upload(objectPath, buffer, { contentType: file.type, upsert: false });

  if (upload.error) {
    return NextResponse.json(
      { error: "upload_failed", details: upload.error.message },
      { status: 500 }
    );
  }

  // Snapshot most-recent weight if it's from the last 24h.
  const dayAgo = new Date();
  dayAgo.setHours(dayAgo.getHours() - 24);
  const { data: weightRow } = await supabase
    .from("weight_logs")
    .select("weight_kg")
    .eq("user_id", user.id)
    .gte("logged_at", dayAgo.toISOString())
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertErr } = await supabase
    .from("progress_photos")
    .insert({
      user_id: user.id,
      angle: angleRaw,
      photo_path: objectPath,
      weight_kg_snapshot: weightRow?.weight_kg ?? null,
      notes,
    })
    .select("id, taken_at, angle, weight_kg_snapshot, notes")
    .single();

  if (insertErr || !inserted) {
    // Best-effort cleanup so we don't orphan a Storage object.
    await supabase.storage.from("progress-photos").remove([objectPath]);
    return NextResponse.json(
      { error: "persist_failed", details: insertErr?.message },
      { status: 500 }
    );
  }

  const signed = await supabase.storage
    .from("progress-photos")
    .createSignedUrl(objectPath, 3600);

  return NextResponse.json({
    ok: true,
    photo: {
      id: inserted.id,
      taken_at: inserted.taken_at,
      angle: inserted.angle,
      weight_kg_snapshot: inserted.weight_kg_snapshot,
      notes: inserted.notes,
      url: signed.data?.signedUrl ?? null,
    },
  });
}

function mimeToExt(m: string): string {
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic") return "heic";
  if (m === "image/heif") return "heif";
  return "bin";
}
