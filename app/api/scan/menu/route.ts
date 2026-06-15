import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { getRouteClient } from "@/lib/supabase/server";
import { computeRemaining, getTodayTotals } from "@/lib/ledger";
import {
  menuScanResultSchema,
  normalizeMenuScan,
} from "@/lib/schemas/menu";
import { MENU_SYSTEM_PROMPT, menuUserPrompt } from "@/lib/prompts/menu.v1";
import { MENU_FALLBACK_BUDGET, MODELS, PROMPT_VERSION } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

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

  // Read what the user has left for today.
  const [{ data: profile }, totals] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .single(),
    getTodayTotals(supabase, user.id),
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
  const ext = mimeToExt(file.type);
  const scanId = crypto.randomUUID();
  const objectPath = `${user.id}/${scanId}.${ext}`;

  const started = Date.now();
  const [uploadRes, scanRes] = await Promise.allSettled([
    supabase.storage
      .from("menu-scans")
      .upload(objectPath, buffer, { contentType: file.type, upsert: false }),
    generateObject({
      model: MODELS.menu_default,
      schema: menuScanResultSchema,
      messages: [
        { role: "system", content: MENU_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: menuUserPrompt(budget) },
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

  const parsed = normalizeMenuScan(scanRes.value.object);
  const storedPath =
    uploadRes.status === "fulfilled" && !uploadRes.value.error
      ? objectPath
      : null;

  const { error: insertErr } = await supabase.from("scans").insert({
    id: scanId,
    user_id: user.id,
    kind: "menu",
    image_path: storedPath,
    model: MODELS.menu_default,
    prompt_version: PROMPT_VERSION.menu,
    raw_response: scanRes.value.object,
    parsed: { ...parsed, budget_used: budget },
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
    budget,
    targets_known: targetsKnown,
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
