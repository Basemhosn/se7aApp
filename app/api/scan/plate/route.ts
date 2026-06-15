import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { getRouteClient } from "@/lib/supabase/server";
import {
  normalizePlateScan,
  plateScanResultSchema,
} from "@/lib/schemas/scan";
import { PLATE_SYSTEM_PROMPT, PLATE_USER_PROMPT } from "@/lib/prompts/plate.v1";
import { MODELS, PROMPT_VERSION } from "@/lib/ai";

export const runtime = "nodejs";
// Vision calls can be slow; allow up to 60s for Claude.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

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
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "invalid_input", details: "expected multipart field 'image'" },
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
  const scanId = crypto.randomUUID();
  const objectPath = `${user.id}/${scanId}.${ext}`;

  // Upload to Storage and analyze in parallel — independent operations.
  const started = Date.now();
  const [uploadRes, scanRes] = await Promise.allSettled([
    supabase.storage
      .from("plate-scans")
      .upload(objectPath, buffer, { contentType: file.type, upsert: false }),
    generateObject({
      model: MODELS.plate_default,
      schema: plateScanResultSchema,
      messages: [
        { role: "system", content: PLATE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: PLATE_USER_PROMPT },
            { type: "image", image: buffer, mediaType: file.type },
          ],
        },
      ],
    }),
  ]);
  const latency = Date.now() - started;

  if (scanRes.status === "rejected") {
    return NextResponse.json(
      {
        error: "ai_failed",
        details: String((scanRes.reason as Error)?.message ?? scanRes.reason),
      },
      { status: 502 }
    );
  }

  const parsed = normalizePlateScan(scanRes.value.object);
  const storedPath =
    uploadRes.status === "fulfilled" && !uploadRes.value.error
      ? objectPath
      : null;

  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "plate",
    image_path: storedPath,
    model: MODELS.plate_default,
    prompt_version: PROMPT_VERSION.plate,
    raw_response: scanRes.value.object,
    parsed,
    latency_ms: latency,
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    scan_id: scanId,
    result: parsed,
    image_stored: storedPath !== null,
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
