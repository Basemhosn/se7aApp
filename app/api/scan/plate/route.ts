import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateObject } from "ai";
import { getRouteClient, getAdminClient } from "@/lib/supabase/server";
import {
  normalizePlateScan,
  plateScanResultSchema,
} from "@/lib/schemas/scan";
import { PLATE_SYSTEM_PROMPT, PLATE_USER_PROMPT } from "@/lib/prompts/plate.v1";
import { MODEL_IDS, MODELS, PROMPT_VERSION } from "@/lib/ai";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { getEntitlement } from "@/lib/entitlement";
import {
  languageInstruction,
  localeFromRequest,
  type ServerLocale,
} from "@/lib/i18n";
import { sendExpoPush, loadTokensByUser } from "@/lib/notifications";

export const runtime = "nodejs";
// waitUntil keeps the function alive for the AI work after we've
// already returned the scan_id to the client. Pro plan gives us up to
// 300s, which is comfortably above the ~15-40s a vision call takes.
export const maxDuration = 300;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Async plate scan (2026-09-16).
 *
 * Client flow:
 *   1. POST here with image → get back `{ scan_id }` in <3s.
 *   2. Stash scan_id locally, navigate to Home, show "analyzing" card.
 *   3. Server continues AI processing via waitUntil (survives client
 *      disconnect/app-kill; runs up to maxDuration=300s).
 *   4. Server persists result + sends push notification when done.
 *   5. Client either reconciles via GET /api/scan/plate/[id] on next
 *      app open OR taps the push notification (deep-links to review).
 *
 * The old synchronous "await the AI, return the result" behavior is
 * retired — a killed app used to lose the entire result.
 */

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ent = await getEntitlement(supabase, user.id);
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type;
  const ext = mimeToExt(contentType);
  const scanId = crypto.randomUUID();
  const objectPath = `${user.id}/${scanId}.${ext}`;

  // Storage upload happens synchronously so the row is guaranteed to
  // have a valid image_path when the background task reads it. Also
  // fast (~200ms typical) so we still fit in the client's <3s budget.
  const { error: uploadErr } = await supabase.storage
    .from("plate-scans")
    .upload(objectPath, buffer, { contentType, upsert: false });

  const storedPath = uploadErr ? null : objectPath;

  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "plate",
    image_path: storedPath,
    model: MODEL_IDS.plate_default,
    prompt_version: PROMPT_VERSION.plate,
    status: "queued",
  });
  if (insertErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insertErr.message },
      { status: 500 }
    );
  }

  // Fire off the AI work in the background. waitUntil keeps the
  // function warm after our HTTP response has been sent — up to
  // maxDuration=300s — so app-close on the client side no longer
  // aborts the AI call.
  const locale = localeFromRequest(request);
  waitUntil(
    processScanInBackground({
      scanId,
      userId: user.id,
      buffer,
      contentType,
      locale,
    })
  );

  return NextResponse.json({
    ok: true,
    scan_id: scanId,
    status: "queued",
    image_stored: storedPath !== null,
  });
}

async function processScanInBackground(args: {
  scanId: string;
  userId: string;
  buffer: Buffer;
  contentType: string;
  locale: ServerLocale;
}): Promise<void> {
  const { scanId, userId, buffer, contentType, locale } = args;
  const admin = getAdminClient();
  const started = Date.now();

  await admin
    .from("scans")
    .update({ status: "processing" })
    .eq("id", scanId);

  try {
    const result = await generateObject({
      model: MODELS.plate_default,
      schema: plateScanResultSchema,
      messages: [
        {
          role: "system",
          content: `${PLATE_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: PLATE_USER_PROMPT },
            { type: "image", image: buffer, mediaType: contentType },
          ],
        },
      ],
    });
    const parsed = normalizePlateScan(result.object);
    const latency = Date.now() - started;

    const { error: updateErr } = await admin
      .from("scans")
      .update({
        raw_response: result.object,
        parsed,
        latency_ms: latency,
        status: "ready",
        error_message: null,
      })
      .eq("id", scanId);
    if (updateErr) {
      throw new Error(`persist_failed: ${updateErr.message}`);
    }

    await notifyScanReady(admin, userId, scanId).catch(() => {
      /* push failure must not fail the scan */
    });
  } catch (e) {
    const message = (e as Error).message || "ai_failed";
    await admin
      .from("scans")
      .update({
        status: "failed",
        error_message: message,
        latency_ms: Date.now() - started,
      })
      .eq("id", scanId);
    // Best-effort failure push so the user isn't stuck on a spinner.
    await notifyScanFailed(admin, userId, scanId, message).catch(() => {});
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
      title: "Plate scan ready.",
      body: "Tap to review what we found.",
      data: { kind: "scan_ready", scan_id: scanId, scan_kind: "plate" },
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
      title: "Plate scan failed.",
      body: reason.length > 80 ? `${reason.slice(0, 80)}…` : reason,
      data: { kind: "scan_failed", scan_id: scanId, scan_kind: "plate" },
    }))
  );
}

function mimeToExt(m: string): string {
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic") return "heic";
  if (m === "image/heif") return "heif";
  return "bin";
}
