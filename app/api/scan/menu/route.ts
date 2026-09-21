import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateObject } from "ai";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { computeRemaining, getDayTotals } from "@/lib/ledger";
import {
  menuScanResultSchema,
  normalizeMenuScan,
} from "@/lib/schemas/menu";
import { MENU_SYSTEM_PROMPT, menuUserPrompt } from "@/lib/prompts/menu.v1";
import { MENU_FALLBACK_BUDGET, MODEL_IDS, MODELS, PROMPT_VERSION } from "@/lib/ai";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { requirePro } from "@/lib/entitlement";
import {
  languageInstruction,
  localeFromRequest,
  type ServerLocale,
} from "@/lib/i18n";
import { localDateIso, tzOffsetFromRequest } from "@/lib/tz";
import { loadTokensByUser, sendExpoPush } from "@/lib/notifications";

export const runtime = "nodejs";
// waitUntil keeps the function warm after the response, up to 300s
// on Pro. Vision + schema-constrained menu ranking on Sonnet 4.6
// runs 15-45s typically.
export const maxDuration = 300;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Async menu scan (2026-09-21). Same architecture as plate:
 *   1. POST returns { scan_id } in <3s (image upload + row insert)
 *   2. waitUntil runs the AI ranking in background
 *   3. Row is updated with status='ready' + parsed OR status='failed'
 *   4. Push notification fires with scan_id in data
 *   5. Client polls GET /api/scan/menu/[id] or taps the push
 *
 * Kill-the-app resilience: the AI keeps running server-side; the row
 * lives in the `scans` table with status column from migration 0037.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gated = await requirePro(supabase, user.id, "menu_scan");
  if (gated) return gated;

  const rl = await checkScanLimits(user.id, { isPro: true });
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

  // Compute the remaining budget synchronously so the model sees the
  // right numbers when we hand it off — this only takes 100-200ms.
  const tzOffsetMin = tzOffsetFromRequest(request);
  const dateIso =
    typeof tzOffsetMin === "number"
      ? localDateIso(new Date(), tzOffsetMin)
      : undefined;
  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .single(),
    getDayTotals(supabase, user.id, dateIso, tzOffsetMin),
  ]);

  const targetsKnown =
    profile?.daily_kcal_target != null &&
    profile?.daily_protein_g != null &&
    profile?.daily_carb_g != null &&
    profile?.daily_fat_g != null;

  const remaining = computeRemaining(totals, {
    daily_kcal_target: profile?.daily_kcal_target ?? null,
    daily_protein_g: profile?.daily_protein_g ?? null,
    daily_carb_g: profile?.daily_carb_g ?? null,
    daily_fat_g: profile?.daily_fat_g ?? null,
  });

  const budget = targetsKnown
    ? {
        kcal_low: remaining.kcal.low,
        kcal_high: remaining.kcal.high,
        protein_g_low: remaining.protein_g.low,
        protein_g_high: remaining.protein_g.high,
        carb_g_low: remaining.carb_g.low,
        carb_g_high: remaining.carb_g.high,
        fat_g_low: remaining.fat_g.low,
        fat_g_high: remaining.fat_g.high,
      }
    : MENU_FALLBACK_BUDGET;

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type;
  const ext = mimeToExt(contentType);
  const scanId = crypto.randomUUID();
  const objectPath = `${user.id}/${scanId}.${ext}`;

  // Upload synchronously so the row's image_path is valid when the
  // background function reads it (or the client displays a thumbnail).
  const { error: uploadErr } = await supabase.storage
    .from("menu-scans")
    .upload(objectPath, buffer, { contentType, upsert: false });
  const storedPath = uploadErr ? null : objectPath;

  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "menu",
    image_path: storedPath,
    model: MODEL_IDS.menu_default,
    prompt_version: PROMPT_VERSION.menu,
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
    processMenuScanInBackground({
      scanId,
      userId: user.id,
      buffer,
      contentType,
      locale,
      budget,
      targetsKnown,
    })
  );

  return NextResponse.json({
    ok: true,
    scan_id: scanId,
    status: "queued",
    budget,
    targets_known: targetsKnown,
    image_stored: storedPath !== null,
  });
}

interface MenuBudget {
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

async function processMenuScanInBackground(args: {
  scanId: string;
  userId: string;
  buffer: Buffer;
  contentType: string;
  locale: ServerLocale;
  budget: MenuBudget;
  targetsKnown: boolean;
}): Promise<void> {
  const {
    scanId,
    userId,
    buffer,
    contentType,
    locale,
    budget,
    targetsKnown,
  } = args;
  const admin = getAdminClient();
  const started = Date.now();

  await admin
    .from("scans")
    .update({ status: "processing" })
    .eq("id", scanId);

  try {
    const result = await generateObject({
      model: MODELS.menu_default,
      schema: menuScanResultSchema,
      messages: [
        {
          role: "system",
          content: `${MENU_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: menuUserPrompt(budget) },
            { type: "image", image: buffer, mediaType: contentType },
          ],
        },
      ],
    });
    const parsed = normalizeMenuScan(result.object);
    const latency = Date.now() - started;

    const { error: updateErr } = await admin
      .from("scans")
      .update({
        raw_response: result.object,
        parsed: { ...parsed, budget_used: budget, targets_known: targetsKnown },
        latency_ms: latency,
        status: "ready",
        error_message: null,
      })
      .eq("id", scanId);
    if (updateErr) throw new Error(`persist_failed: ${updateErr.message}`);

    await notifyScanReady(admin, userId, scanId).catch(() => {});
  } catch (e) {
    const raw = (e as Error).message || "ai_failed";
    const friendly = friendlyMenuFailure(raw);
    await admin
      .from("scans")
      .update({
        status: "failed",
        error_message: friendly,
        latency_ms: Date.now() - started,
      })
      .eq("id", scanId);
    console.error("menu scan failed", { scanId, raw });
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
      title: "Menu scan ready.",
      body: "Tap to see what to order.",
      data: { kind: "scan_ready", scan_id: scanId, scan_kind: "menu" },
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
      title: "Menu scan failed.",
      body: reason.length > 80 ? `${reason.slice(0, 80)}…` : reason,
      data: { kind: "scan_failed", scan_id: scanId, scan_kind: "menu" },
    }))
  );
}

function friendlyMenuFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("did not match schema") ||
    lower.includes("typevalidationerror") ||
    lower.includes("too_big") ||
    lower.includes("too_small")
  ) {
    return "The menu didn't fit our data shape. Try a clearer photo of the whole menu page.";
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
    return "Couldn't read that photo. Try a clearer menu shot.";
  }
  return "Scan failed. Try again — if it keeps happening, tell support.";
}

function mimeToExt(m: string): string {
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic") return "heic";
  if (m === "image/heif") return "heif";
  return "bin";
}
