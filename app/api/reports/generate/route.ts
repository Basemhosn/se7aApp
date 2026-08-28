import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  generatePlanInputSchema,
  reportFoundationSchema,
  reportTacticalSchema,
  type ReportPlan,
} from "@/lib/schemas/report";
import { REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report.v1";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";
import { tzOffsetFromRequest } from "@/lib/tz";
import { getDayTotals } from "@/lib/ledger";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
// Report generation runs two parallel generateObject calls; the
// tactical half (meals + training + roadmap over 12+ weeks) can take
// 120-180s on its own. Bumping to Vercel's 300s ceiling to leave
// headroom for slow LLM days.
export const maxDuration = 300;

const MODEL_ID = "claude-sonnet-4-6";

// Reports are cost-heavy (~15-20k output tokens = ~$0.10 per call) so
// we protect the endpoint with two limits:
//   • 1/hour per user  — catches accidental double-taps + retries
//   • 4/year per user  — one every ~90 days is the intended cadence;
//                         users buying more get told to wait
// Server-side auth also requires the mobile client to have already
// completed the RevenueCat purchase (or hold Pro entitlement) — that
// gate lives on the client for MVP; a follow-up will wire an RC
// webhook to persist purchases and verify server-side.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const genBurst = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "3600 s"),
  prefix: "rl:report:burst",
  analytics: true,
});
const genYearly = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(4, "365 d"),
  prefix: "rl:report:yearly",
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

  const [burst, yearly] = await Promise.all([
    genBurst.limit(user.id),
    genYearly.limit(user.id),
  ]);
  if (!burst.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        details:
          "You just generated a plan — give it an hour before regenerating.",
      },
      { status: 429 }
    );
  }
  if (!yearly.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        details:
          "You've generated 4 plans this year — that's the cap. Follow the current plan for a while, then reach out if you need another.",
      },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => ({}));
  const parsed = generatePlanInputSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const durationDays = parsed.data.duration_days ?? 90;

  const [{ data: profile }, ledgerToday] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, sex, birthdate, height_cm, weight_kg, activity_level, goal, goal_rate_kg_per_week, experience, equipment, days_per_week, injuries, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, rest_day_kcal_delta"
      )
      .eq("user_id", user.id)
      .single(),
    getDayTotals(supabase, user.id, undefined, tzOffsetFromRequest(request)),
  ]);
  if (!profile?.daily_kcal_target) {
    return NextResponse.json(
      { error: "onboarding_incomplete" },
      { status: 412 }
    );
  }

  const injuriesStr =
    Array.isArray(profile.injuries) && profile.injuries.length > 0
      ? profile.injuries.join(", ")
      : "none";

  const context = `
User profile (from onboarding):
- Sex: ${profile.sex}
- Birthdate: ${profile.birthdate ?? "unknown"}
- Height: ${profile.height_cm} cm
- Current weight: ${profile.weight_kg} kg
- Activity level: ${profile.activity_level}
- Goal: ${profile.goal}
- Target rate: ${profile.goal_rate_kg_per_week ?? 0} kg/week
- Experience: ${profile.experience}
- Equipment: ${profile.equipment}
- Days/week available: ${profile.days_per_week}
- Injuries / work-arounds: ${injuriesStr}

SE7A already computed daily targets:
- kcal: ${profile.daily_kcal_target}
- protein: ${profile.daily_protein_g} g
- carbs: ${profile.daily_carb_g} g
- fat: ${profile.daily_fat_g} g
${profile.rest_day_kcal_delta ? `- rest day adjustment: ${profile.rest_day_kcal_delta} kcal\n` : ""}
Recent logging behavior (today's totals so far):
- kcal today: ${ledgerToday.kcal.low}–${ledgerToday.kcal.high}
- items today: ${ledgerToday.items.length}

Plan duration: ${durationDays} days (${Math.ceil(durationDays / 7)} weeks).

Build the personalized ${durationDays}-day plan now. Reference the
user's specific profile numbers in the hero + nutrition sections
(don't hide the math). Weekly roadmap should span all
${Math.ceil(durationDays / 7)} weeks.
`.trim();

  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);
  const system = `${REPORT_SYSTEM_PROMPT}\n\n${langInstruction}`;

  // Two parallel generateObject calls — Anthropic's grammar compiler
  // rejects the merged schema as too large, so we split into
  // foundation (hero + nutrition + habits + tracking) and tactical
  // (meals + training + roadmap). Merged client-side.
  let plan: ReportPlan;
  try {
    const [foundation, tactical] = await Promise.all([
      generateObject({
        model: anthropic(MODEL_ID),
        schema: reportFoundationSchema,
        system,
        messages: [
          {
            role: "user",
            content: `${context}\n\nProduce sections: hero, nutrition, habits, tracking.`,
          },
        ],
        maxOutputTokens: 8000,
      }),
      generateObject({
        model: anthropic(MODEL_ID),
        schema: reportTacticalSchema,
        system,
        messages: [
          {
            role: "user",
            content: `${context}\n\nProduce sections: meals (7-day sample), training (weekly schedule), roadmap (${Math.ceil(durationDays / 7)} weeks + monthly reviews).`,
          },
        ],
        maxOutputTokens: 16000,
      }),
    ]);
    plan = { ...foundation.object, ...tactical.object };
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", details: String((e as Error)?.message ?? e) },
      { status: 502 }
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      plan,
      duration_days: durationDays,
    })
    .select("id, generated_at, duration_days")
    .single();
  if (insErr) {
    return NextResponse.json(
      { error: "persist_failed", details: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: inserted.id,
    generated_at: inserted.generated_at,
    duration_days: inserted.duration_days,
    plan,
  });
}
