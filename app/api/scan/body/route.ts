import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateObject } from "ai";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import {
  bodyScanResultSchema,
  normalizeBodyScan,
} from "@/lib/schemas/body";
import { BODY_SYSTEM_PROMPT, bodyUserPrompt } from "@/lib/prompts/body.v1";
import { MODEL_IDS, MODELS, PROMPT_VERSION } from "@/lib/ai";
import { project, type BodyProjection } from "@/lib/body";
import type { Goal, Sex } from "@/lib/macros";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { getEntitlement } from "@/lib/entitlement";
import {
  languageInstruction,
  localeFromRequest,
  type ServerLocale,
} from "@/lib/i18n";
import { loadTokensByUser, sendExpoPush } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 8 * 1024 * 1024;
const VALID_POSES = new Set(["front", "side", "back"]);

/**
 * Async body-composition scan (2026-09-21).
 *
 * Same waitUntil pattern as plate + menu, with one CRITICAL difference:
 * the buffer is captured in the closure and analyzed in-memory — it's
 * NEVER written to storage. The privacy policy commits to not storing
 * body photos. Row inserts with image_path = null and stays that way.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Body scan: 1 free per lifetime for free users, unlimited for Pro.
  const ent = await getEntitlement(supabase, user.id);
  if (!ent.is_pro) {
    const { count } = await supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("kind", "body");
    const used = count ?? 0;
    if (used >= 1) {
      return NextResponse.json(
        {
          error: "pro_required",
          details:
            "You've used your free body-composition scan. Upgrade to Pro for unlimited scans.",
          feature: "body_scan",
          current_tier: ent.tier,
          free_used: used,
        },
        { status: 402 }
      );
    }
  }

  const rl = await checkScanLimits(user.id, { isPro: ent.is_pro });
  if (!rl.ok) return rateLimitedResponse(rl);

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
  const contentType = file.type;
  const scanId = crypto.randomUUID();

  // Insert the row FIRST so the client has a scan_id to poll against.
  // Privacy: image_path stays null; the buffer stays in memory only.
  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "body",
    image_path: null,
    model: MODEL_IDS.body_default,
    prompt_version: PROMPT_VERSION.body,
    status: "queued",
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insertErr.message },
      { status: 500 }
    );
  }

  const locale = localeFromRequest(request);
  waitUntil(
    processBodyScanInBackground({
      scanId,
      userId: user.id,
      buffer,
      contentType,
      locale,
      sex: profile.sex as Sex,
      pose,
      weightKg: Number(profile.weight_kg),
      goal: profile.goal as Goal,
      goalRateKgPerWeek: Number(profile.goal_rate_kg_per_week ?? -0.5),
    })
  );

  return NextResponse.json({
    ok: true,
    scan_id: scanId,
    status: "queued",
  });
}

async function processBodyScanInBackground(args: {
  scanId: string;
  userId: string;
  buffer: Buffer;
  contentType: string;
  locale: ServerLocale;
  sex: Sex;
  pose: "front" | "side" | "back" | null;
  weightKg: number;
  goal: Goal;
  goalRateKgPerWeek: number;
}): Promise<void> {
  const {
    scanId,
    userId,
    buffer,
    contentType,
    locale,
    sex,
    pose,
    weightKg,
    goal,
    goalRateKgPerWeek,
  } = args;
  const admin = getAdminClient();
  const started = Date.now();

  await admin
    .from("scans")
    .update({ status: "processing" })
    .eq("id", scanId);

  try {
    const result = await generateObject({
      model: MODELS.body_default,
      schema: bodyScanResultSchema,
      messages: [
        {
          role: "system",
          content: `${BODY_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: bodyUserPrompt({ sex, pose }) },
            { type: "image", image: buffer, mediaType: contentType },
          ],
        },
      ],
    });
    const parsed = normalizeBodyScan(result.object);
    const latency = Date.now() - started;

    let projection: BodyProjection | null = null;
    if (parsed.usable) {
      projection = project({
        weight_kg: weightKg,
        sex,
        goal,
        goal_rate_kg_per_week: goalRateKgPerWeek,
        estimate: {
          body_fat_pct_low: parsed.body_fat_pct_low,
          body_fat_pct_high: parsed.body_fat_pct_high,
        },
      });
    }

    const { error: updateErr } = await admin
      .from("scans")
      .update({
        raw_response: parsed,
        parsed: { ...parsed, projection, pose },
        latency_ms: latency,
        status: "ready",
        error_message: null,
      })
      .eq("id", scanId);
    if (updateErr) throw new Error(`persist_failed: ${updateErr.message}`);

    await notifyScanReady(admin, userId, scanId).catch(() => {});
  } catch (e) {
    const raw = (e as Error).message || "ai_failed";
    const friendly = friendlyBodyFailure(raw);
    await admin
      .from("scans")
      .update({
        status: "failed",
        error_message: friendly,
        latency_ms: Date.now() - started,
      })
      .eq("id", scanId);
    console.error("body scan failed", { scanId, raw });
    await notifyScanFailed(admin, userId, scanId, friendly).catch(() => {});
  }
}

async function notifyScanReady(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  scanId: string
): Promise<void> {
  const tokensByUser = await loadTokensByUser(admin);
  const tokens = tokensByUser.get(userId) ?? [];
  if (tokens.length === 0) return;
  await sendExpoPush(
    tokens.map((tok) => ({
      to: tok.expo_token,
      title: "Body scan ready.",
      body: "Tap to see your body-composition estimate.",
      data: { kind: "scan_ready", scan_id: scanId, scan_kind: "body" },
    }))
  );
}

async function notifyScanFailed(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  scanId: string,
  reason: string
): Promise<void> {
  const tokensByUser = await loadTokensByUser(admin);
  const tokens = tokensByUser.get(userId) ?? [];
  if (tokens.length === 0) return;
  await sendExpoPush(
    tokens.map((tok) => ({
      to: tok.expo_token,
      title: "Body scan failed.",
      body: reason.length > 80 ? `${reason.slice(0, 80)}…` : reason,
      data: { kind: "scan_failed", scan_id: scanId, scan_kind: "body" },
    }))
  );
}

function friendlyBodyFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("did not match schema") ||
    lower.includes("typevalidationerror") ||
    lower.includes("too_big") ||
    lower.includes("too_small")
  ) {
    return "The photo didn't fit our analysis model. Try a well-lit full-body shot with fitted clothing.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "Too many scans in a row — wait a minute and try again.";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    lower.includes("etimedout")
  ) {
    return "The scan took too long. Try a smaller / clearer photo.";
  }
  if (lower.includes("safety") || lower.includes("content policy")) {
    return "Couldn't analyze that photo. Try a full-body shot in fitted clothing.";
  }
  return "Scan failed. Try again — if it keeps happening, tell support.";
}
