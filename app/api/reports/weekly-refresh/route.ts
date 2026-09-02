import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  weeklySummarySchema,
  type WeeklySummary,
  type ReportPlan,
} from "@/lib/schemas/report";
import { WEEKLY_SUMMARY_PROMPT } from "@/lib/prompts/report.v1";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";
import { tzOffsetFromRequest, localDateIso } from "@/lib/tz";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL_ID = "claude-sonnet-4-6";

/**
 * Regenerates only the reports.weekly_summary field from the past 7
 * days of the user's real logs. Cheap (~$0.01/call, ~2s). Throttled
 * to once per 24h per user so the mobile client can call it on
 * every report-screen focus without worry.
 */
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
const refreshLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "86400 s"),
  prefix: "rl:report:weekly-refresh",
  analytics: true,
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await refreshLimit.limit(user.id);
  if (!limit.success) {
    return NextResponse.json(
      { error: "rate_limited", details: "Weekly summary already refreshed today." },
      { status: 429 }
    );
  }

  // 1. Load active report (need plan for context; abort if none).
  const { data: report } = await supabase
    .from("reports")
    .select("id, generated_at, plan, duration_days")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "no_report" }, { status: 404 });
  }

  // 2. Pull last 7 days of meal_items + weight_logs.
  const tzOffsetMin = tzOffsetFromRequest(request);
  const todayIso =
    typeof tzOffsetMin === "number"
      ? localDateIso(new Date(), tzOffsetMin)
      : new Date().toISOString().slice(0, 10);
  const [y, m, d] = todayIso.split("-").map(Number);
  const localMidnightUtcMs =
    Date.UTC(y!, (m ?? 1) - 1, d ?? 1) -
    (typeof tzOffsetMin === "number" ? tzOffsetMin : 0) * 60_000;
  const weekAgo = new Date(localMidnightUtcMs - 7 * 86_400_000).toISOString();

  const [{ data: meals }, { data: weights }] = await Promise.all([
    supabase
      .from("meal_items")
      .select("eaten_at, kcal_low, kcal_high, protein_g_low, protein_g_high")
      .eq("user_id", user.id)
      .gte("eaten_at", weekAgo)
      .order("eaten_at", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("logged_at, weight_kg")
      .eq("user_id", user.id)
      .gte("logged_at", weekAgo)
      .order("logged_at", { ascending: true }),
  ]);

  // 3. Summarize into a compact context the LLM can reason about.
  const mealRows = meals ?? [];
  const byDay = new Map<string, { kcalLow: number; kcalHigh: number; proteinLow: number; proteinHigh: number; count: number }>();
  for (const row of mealRows) {
    const dateKey = String(row.eaten_at).slice(0, 10);
    const cur = byDay.get(dateKey) ?? {
      kcalLow: 0,
      kcalHigh: 0,
      proteinLow: 0,
      proteinHigh: 0,
      count: 0,
    };
    cur.kcalLow += Number(row.kcal_low ?? 0);
    cur.kcalHigh += Number(row.kcal_high ?? 0);
    cur.proteinLow += Number(row.protein_g_low ?? 0);
    cur.proteinHigh += Number(row.protein_g_high ?? 0);
    cur.count += 1;
    byDay.set(dateKey, cur);
  }
  const daysLogged = byDay.size;
  const weightRows = weights ?? [];

  // 4. Compute the current week_index against the report's roadmap.
  const generated = new Date(report.generated_at).getTime();
  const daysElapsed = Math.max(0, Math.floor((Date.now() - generated) / 86_400_000));
  const totalWeeks = Math.ceil(report.duration_days / 7);
  const weekIndex = Math.min(totalWeeks, Math.floor(daysElapsed / 7) + 1);

  const plan = report.plan as ReportPlan;

  // Pick the nutrition phase covering this week so we compare adherence
  // against the phase-specific targets, not a static top-level number.
  const currentPhase =
    plan.nutrition.phases.find((p) => {
      const parts = p.weeks
        .split(/[–\-]/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      const lo = parts[0] ?? 1;
      const hi = parts[1] ?? lo;
      return weekIndex >= lo && weekIndex <= hi;
    }) ?? plan.nutrition.phases[0];

  const daySummaries = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([day, s]) =>
        `- ${day}: ${Math.round(s.kcalLow)}–${Math.round(s.kcalHigh)} kcal · ${Math.round(s.proteinLow)}–${Math.round(s.proteinHigh)} g protein · ${s.count} items`
    )
    .join("\n");

  const weightSummary =
    weightRows.length >= 2
      ? `Weight trend: ${Number(weightRows[0]!.weight_kg).toFixed(1)} kg → ${Number(weightRows[weightRows.length - 1]!.weight_kg).toFixed(1)} kg (${weightRows.length} weigh-ins this week)`
      : weightRows.length === 1
        ? `Weight logged once this week: ${Number(weightRows[0]!.weight_kg).toFixed(1)} kg`
        : "No weight logged this week.";

  const context = `
Plan targets (${currentPhase ? `Phase ${currentPhase.phase_index} · ${currentPhase.name}, weeks ${currentPhase.weeks}` : "current phase"}):
- Daily kcal: ${currentPhase?.daily_kcal.low ?? "?"}–${currentPhase?.daily_kcal.high ?? "?"}
- Daily protein: ${currentPhase?.protein_g.low ?? "?"}–${currentPhase?.protein_g.high ?? "?"} g

Current week: ${weekIndex} of ${totalWeeks}.
Days logged this week: ${daysLogged} / 7.

Daily totals (last 7 days):
${daySummaries || "- (no meal logs)"}

${weightSummary}

Produce a 4-part summary now.
`.trim();

  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);

  let summary: WeeklySummary;
  try {
    const generated = await generateObject({
      model: anthropic(MODEL_ID),
      schema: weeklySummarySchema,
      system: `${WEEKLY_SUMMARY_PROMPT}\n\n${langInstruction}`,
      messages: [{ role: "user", content: context }],
      maxOutputTokens: 800,
    });
    summary = { ...generated.object, week_index: weekIndex };
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }

  const { error: upErr } = await supabase
    .from("reports")
    .update({
      weekly_summary: summary,
      weekly_summary_at: new Date().toISOString(),
    })
    .eq("id", report.id);
  if (upErr) {
    return NextResponse.json(
      { error: "persist_failed", details: upErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ summary });
}
