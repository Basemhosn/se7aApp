import { NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/schemas/chat";
import { COACH_SYSTEM_PROMPT } from "@/lib/prompts/coach.v1";
import { checkScanLimits, rateLimitedResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  // Same rate limits as scans — chat is a paid Claude call.
  const rl = await checkScanLimits(user.id);
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

  const [profileRes, historyRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, sex, weight_kg, height_cm, goal, activity_level, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, training_experience, equipment_access, days_per_week, injuries"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS + 1),
  ]);

  const profile = profileRes.data;
  const history = (historyRes.data ?? []).reverse();

  const contextBlock = buildContextBlock(profile);

  const messages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));

  let assistantText = "";
  try {
    const result = await generateText({
      model: anthropic(MODEL_ID),
      system: `${COACH_SYSTEM_PROMPT}\n\n${contextBlock}`,
      messages,
      maxOutputTokens: 800,
    });
    assistantText = result.text.trim();
  } catch (e) {
    // Roll back the user turn? No — user still typed it. Return
    // graceful error; the client will show the user turn + an error.
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }

  const { error: insertAiErr } = await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "assistant",
    content: assistantText,
  });
  if (insertAiErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insertAiErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reply: assistantText,
  });
}

function buildContextBlock(
  profile: {
    display_name?: string | null;
    sex?: string | null;
    weight_kg?: number | null;
    height_cm?: number | null;
    goal?: string | null;
    activity_level?: string | null;
    daily_kcal_target?: number | null;
    daily_protein_g?: number | null;
    daily_carb_g?: number | null;
    daily_fat_g?: number | null;
    training_experience?: string | null;
    equipment_access?: string | null;
    days_per_week?: number | null;
    injuries?: unknown;
  } | null
): string {
  if (!profile) return "USER CONTEXT: not yet onboarded.";
  const parts: string[] = [];
  parts.push("USER CONTEXT:");
  if (profile.display_name) parts.push(`- Name: ${profile.display_name}`);
  if (profile.sex) parts.push(`- Sex: ${profile.sex}`);
  if (profile.weight_kg) parts.push(`- Weight: ${profile.weight_kg} kg`);
  if (profile.height_cm) parts.push(`- Height: ${profile.height_cm} cm`);
  if (profile.goal) parts.push(`- Goal: ${profile.goal}`);
  if (profile.activity_level)
    parts.push(`- Activity level: ${profile.activity_level}`);
  if (profile.daily_kcal_target) {
    parts.push(
      `- Daily targets: ${profile.daily_kcal_target} kcal · ${profile.daily_protein_g}g P · ${profile.daily_carb_g}g C · ${profile.daily_fat_g}g F`
    );
  }
  if (profile.training_experience || profile.equipment_access || profile.days_per_week) {
    parts.push(
      `- Training: ${profile.training_experience ?? "?"} · ${profile.equipment_access ?? "?"} · ${profile.days_per_week ?? "?"} d/wk`
    );
  }
  const inj = Array.isArray(profile.injuries) ? (profile.injuries as string[]) : [];
  if (inj.length > 0) parts.push(`- Injuries / avoid: ${inj.join(", ")}`);
  return parts.join("\n");
}
