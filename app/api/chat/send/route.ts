import { NextResponse } from "next/server";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import * as Sentry from "@sentry/nextjs";
import { getRouteClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/schemas/chat";
import { COACH_SYSTEM_PROMPT_V2 } from "@/lib/prompts/coach.v2";
import { buildCoachContext } from "@/lib/coachContext";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";
import { requirePro } from "@/lib/entitlement";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL_ID = "claude-sonnet-4-6";
const HISTORY_TURNS = 12; // last 12 messages, ~6 user + 6 assistant

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gated = await requirePro(supabase, user.id, "ai_coach");
  if (gated) return gated;

  // Same rate limits as scans — chat is a paid Claude call.
  const rl = await checkScanLimits(user.id, { isPro: true });
  if (!rl.ok) return rateLimitedResponse(rl);

  const json = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const userContent = parsed.data.content;

  // Store the user turn immediately so it shows up even if the AI call
  // fails.
  const { error: insertUserErr } = await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "user",
    content: userContent,
  });
  if (insertUserErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insertUserErr.message },
      { status: 500 }
    );
  }

  const [contextRes, historyRes] = await Promise.all([
    buildCoachContext(supabase, user.id),
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1),
  ]);

  const history = (historyRes.data ?? []).reverse();
  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);

  const messages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  // Stream the model output as plain-text chunks so the mobile client
  // can render partial tokens via XMLHttpRequest.onprogress. The final
  // assistant turn is persisted to chat_messages in the onFinish
  // callback — the response completes only after that write lands, so
  // a page refresh immediately after the stream ends sees it.
  //
  // Model errors become an "[error:…]" trailer so the client can
  // surface a human-readable failure even once bytes have flushed.
  try {
    const result = streamText({
      model: anthropic(MODEL_ID),
      system: `${COACH_SYSTEM_PROMPT_V2}\n\n${langInstruction}\n\n${contextRes.block}`,
      messages,
      maxOutputTokens: 800,
      onFinish: async ({ text }) => {
        const final = text.trim();
        if (!final) return;
        // CRITICAL: must not swallow this error silently. The response
        // bytes have already flushed to the client — if this insert
        // fails, the user sees a complete reply they'll never see again
        // on refetch. Logging to Sentry so a persistent DB/RLS issue
        // surfaces instead of looking like coach amnesia.
        try {
          const { error } = await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: final,
          });
          if (error) throw error;
        } catch (e) {
          Sentry.captureException(e, {
            tags: { route: "chat/send", stage: "persist_assistant_turn" },
            extra: {
              user_id: user.id,
              text_length: final.length,
            },
          });
        }
      },
    });
    return result.toTextStreamResponse();
  } catch (e) {
    Sentry.captureException(e, {
      tags: { route: "chat/send", stage: "stream_text" },
      extra: { user_id: user.id },
    });
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }
}

