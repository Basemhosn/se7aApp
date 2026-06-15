import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { getRouteClient } from "@/lib/supabase/server";
import {
  bodyScanResultSchema,
  normalizeBodyScan,
} from "@/lib/schemas/body";
import { BODY_SYSTEM_PROMPT, bodyUserPrompt } from "@/lib/prompts/body.v1";
import { MODELS, PROMPT_VERSION } from "@/lib/ai";
import { project, type BodyProjection } from "@/lib/body";
import type { Goal, Sex } from "@/lib/macros";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const VALID_POSES = new Set(["front", "side", "back"]);

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

  const poseRaw = form?.get("pose");
  const pose =
    typeof poseRaw === "string" && VALID_POSES.has(poseRaw)
      ? (poseRaw as "front" | "side" | "back")
      : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("sex, weight_kg, goal, goal_rate_kg_per_week")
    .eq("user_id", user.id)
    .single();
  if (!profile?.sex || profile.weight_kg == null) {
    return NextResponse.json(
      { error: "profile_incomplete", details: "complete onboarding first" },
      { status: 412 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // CRITICAL: privacy policy commits us to NOT storing body photos.
  // The buffer is analyzed in-memory and never written to storage.
  // scans.image_path stays null for kind='body'.
  const started = Date.now();
  let parsed;
  try {
    const result = await generateObject({
      model: MODELS.body_default,
      schema: bodyScanResultSchema,
      messages: [
        { role: "system", content: BODY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: bodyUserPrompt({ sex: profile.sex as Sex, pose }),
            },
            { type: "image", image: buffer, mediaType: file.type },
          ],
        },
      ],
    });
    parsed = normalizeBodyScan(result.object);
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }
  const latency = Date.now() - started;

  let projection: BodyProjection | null = null;
  if (parsed.usable) {
    projection = project({
      weight_kg: Number(profile.weight_kg),
      sex: profile.sex as Sex,
      goal: profile.goal as Goal,
      goal_rate_kg_per_week: Number(profile.goal_rate_kg_per_week ?? -0.5),
      estimate: {
        body_fat_pct_low: parsed.body_fat_pct_low,
        body_fat_pct_high: parsed.body_fat_pct_high,
      },
    });
  }

  const scanId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "body",
    image_path: null, // intentional — see privacy policy
    model: MODELS.body_default,
    prompt_version: PROMPT_VERSION.body,
    raw_response: parsed,
    parsed: { ...parsed, projection, pose },
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
    projection,
  });
}
