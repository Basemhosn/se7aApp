import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import { voiceLogResultSchema } from "@/lib/schemas/voiceLog";
import { VOICE_LOG_SYSTEM_PROMPT } from "@/lib/prompts/voiceLog.v1";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // ~15MB — plenty for a 60s clip
const PARSE_MODEL = "claude-sonnet-4-6";

/**
 * Voice meal-log — two-stage pipeline:
 *   1. Whisper (OpenAI /v1/audio/transcriptions) — audio → transcript
 *   2. Claude generateObject — transcript → structured meal items
 *
 * Whisper handles Arabic/English code-switching cleanly; Claude does
 * the domain reasoning (portion inference, macro estimation, Gulf
 * dish naming).
 *
 * Rate limited via checkScanLimits since audio transcription costs
 * real money (~$0.006/min for Whisper + Claude call).
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await checkScanLimits(user.id);
  if (!rl.ok) return rateLimitedResponse(rl);

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "invalid_input", details: "expected multipart field 'audio'" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "audio_too_large", details: `max ${MAX_BYTES} bytes` },
      { status: 413 }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "voice_log_not_configured" },
      { status: 503 }
    );
  }

  // ── 1. Transcribe with Whisper ──────────────────────────────────
  const whisperForm = new FormData();
  whisperForm.append("file", file);
  whisperForm.append("model", "whisper-1");
  // language hint helps Arabic/English mixed transcription accuracy.
  // "en" is a safe default; Whisper still recognizes Arabic words
  // embedded in an English utterance.
  whisperForm.append("language", "en");
  whisperForm.append("response_format", "text");

  let transcript = "";
  try {
    const res = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: whisperForm,
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: "transcription_failed",
          status: res.status,
          details: detail.slice(0, 200),
        },
        { status: 502 }
      );
    }
    transcript = (await res.text()).trim();
  } catch (e) {
    return NextResponse.json(
      {
        error: "transcription_failed",
        details: String((e as Error)?.message ?? e),
      },
      { status: 502 }
    );
  }

  if (transcript.length === 0) {
    return NextResponse.json(
      { error: "empty_transcript" },
      { status: 400 }
    );
  }

  // ── 2. Parse transcript into meal items with Claude ─────────────
  const locale = localeFromRequest(request);
  let parsed;
  try {
    const result = await generateObject({
      model: anthropic(PARSE_MODEL),
      schema: voiceLogResultSchema,
      messages: [
        {
          role: "system",
          content: `${VOICE_LOG_SYSTEM_PROMPT}\n\n${languageInstruction(locale)}`,
        },
        {
          role: "user",
          content: `Transcript:\n"""${transcript}"""\n\nParse this into meal items.`,
        },
      ],
      maxOutputTokens: 2000,
    });
    parsed = result.object;
  } catch (e) {
    return NextResponse.json(
      {
        error: "parse_failed",
        transcript,
        details: String((e as Error)?.message ?? e),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    transcript,
    result: parsed,
  });
}
