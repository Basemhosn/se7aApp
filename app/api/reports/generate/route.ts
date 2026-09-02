import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getRouteClient } from "@/lib/supabase/server";
import {
  generatePlanInputSchema,
  reportFoundationSchema,
  mealsOnlySchema,
  trainingOnlySchema,
  roadmapOnlySchema,
  type ReportPlan,
} from "@/lib/schemas/report";
import { REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report.v1";
import { languageInstruction, localeFromRequest } from "@/lib/i18n";
import { tzOffsetFromRequest } from "@/lib/tz";
import { getDayTotals } from "@/lib/ledger";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const runtime = "nodejs";
// Bumped to Vercel's 300s ceiling. Bigger phased schema pushes
// generation to 90-150s. Response is chunked (see below) so iOS
// URLSession's 60s inactivity timeout doesn't fire — bytes flow
// via heartbeat while Claude works.
export const maxDuration = 300;

const MODEL_ID = "claude-sonnet-4-6";

// Reports are cost-heavy (~15-20k output tokens = ~$0.10 per call) so
// we protect the endpoint with two limits:
//   • 1/hour per user  — catches accidental double-taps + retries
//   • 4/year per user  — one every ~90 days is the intended cadence
// Both are reset if generation fails (see catch block below) so a
// failed attempt doesn't burn a slot.
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const BURST_PREFIX = "rl:report:burst";
const YEARLY_PREFIX = "rl:report:yearly";
const BURST_WINDOW_MS = 3_600_000; // 1h
const YEARLY_WINDOW_MS = 365 * 86_400_000;

const genBurst = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "3600 s"),
  prefix: BURST_PREFIX,
  analytics: true,
});
const genYearly = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(4, "365 d"),
  prefix: YEARLY_PREFIX,
  analytics: true,
});

/**
 * Roll back a consumed rate-limit slot when generation fails. The
 * upstash Ratelimit library doesn't expose a clean reset method for
 * the current window, so we delete the underlying Redis counter keys
 * directly. Best-effort: log-and-ignore errors, since a stuck slot is
 * annoying but not catastrophic (user waits an hour).
 */
async function refundRateLimits(userId: string): Promise<void> {
  const now = Date.now();
  const burstBucket = Math.floor(now / BURST_WINDOW_MS);
  const yearlyBucket = Math.floor(now / YEARLY_WINDOW_MS);
  await Promise.all([
    redis.del(`${BURST_PREFIX}:${userId}:${burstBucket}`).catch(() => 0),
    redis.del(`${YEARLY_PREFIX}:${userId}:${yearlyBucket}`).catch(() => 0),
  ]);
}

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Validate input BEFORE consuming a rate-limit slot so malformed
  // payloads (e.g. bad duration_days) don't burn user attempts.
  const json = await request.json().catch(() => ({}));
  const parsed = generatePlanInputSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const durationDays = parsed.data.duration_days ?? 90;

  // Fetch profile + today's ledger BEFORE rate limit — an incomplete
  // profile shouldn't cost a slot either.
  const [{ data: profile }, ledgerToday] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, sex, birthdate, height_cm, weight_kg, activity_level, goal, goal_rate_kg_per_week, training_experience, equipment_access, days_per_week, injuries, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g, rest_day_kcal_delta"
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

  // NOW consume the rate limit — request is well-formed and the user
  // has a complete profile. If AI fails, we refund below.
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
- Experience: ${profile.training_experience}
- Equipment: ${profile.equipment_access}
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
${Math.ceil(durationDays / 7)} weeks. Produce 4 progressive phases
in nutrition, training, and habits (see prompt for phase names +
week ranges).
`.trim();

  const locale = localeFromRequest(request);
  const langInstruction = languageInstruction(locale);
  const system = `${REPORT_SYSTEM_PROMPT}\n\n${langInstruction}`;

  // Stream the response so iOS URLSession's 60s inactivity timer
  // doesn't fire. We send `\n` heartbeats every 5s while Claude
  // generates (both halves in parallel), then write the final JSON
  // as the closing chunk. `\n` is valid JSON whitespace, so
  // `response.json()` on the client parses cleanly.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          /* controller closed — ignore */
        }
      }, 5000);

      let plan: ReportPlan;
      try {
        // Four parallel generateObject calls — Anthropic's grammar
        // compiler rejected the previous 2-way split once training
        // grew to 4 phases with substitutions. We now split into
        // foundation + meals + training + roadmap and merge before
        // persist. Same total tokens; smaller grammar per call.
        const [foundation, meals, training, roadmap] = await Promise.all([
          generateObject({
            model: anthropic(MODEL_ID),
            schema: reportFoundationSchema,
            system,
            messages: [
              {
                role: "user",
                content: `${context}\n\nProduce sections: hero, nutrition (rationale + 4 phases with per-phase macros), habits (4 phases with daily_habits + sleep_recovery_rules + hard_scenarios covering sick/travel/plateau/injury/missed_workout/social_event/high_stress/other + cravings_playbook), tracking.`,
              },
            ],
            maxOutputTokens: 10000,
          }),
          generateObject({
            model: anthropic(MODEL_ID),
            schema: mealsOnlySchema,
            system,
            messages: [
              {
                role: "user",
                content: `${context}\n\nProduce ONLY the meals section: 7-day sample (Mon..Sun), 3-4 meals per day, each with slot/name/portion/kcal range/1-2 swap ideas. Grocery staples (10-20 items). Eating-out rules (3-5).`,
              },
            ],
            maxOutputTokens: 8000,
          }),
          generateObject({
            model: anthropic(MODEL_ID),
            schema: trainingOnlySchema,
            system,
            messages: [
              {
                role: "user",
                content: `${context}\n\nProduce ONLY the training section: 4 progressive phases (Accumulation weeks 1-3, Intensification 4-6, Realization 7-9, Deload+Retest 10-12). Each phase: focus + weekly_sessions matching user's days/week. Every session has warmup + cooldown + exercises with sets/reps/rest/notes/substitutions. Plus general_notes (autoregulation + RPE), deload_rule, cardio_prescription.`,
              },
            ],
            maxOutputTokens: 12000,
          }),
          generateObject({
            model: anthropic(MODEL_ID),
            schema: roadmapOnlySchema,
            system,
            messages: [
              {
                role: "user",
                content: `${context}\n\nProduce ONLY the roadmap section: ${Math.ceil(durationDays / 7)} weeks (each with theme/focus/checkpoint), monthly reviews, and 3-5 benchmarks scheduled at key weeks (e.g. week 4 push-ups AMRAP + tape measurements; week 8 same + progress photo prompt; week 12 full benchmark set).`,
              },
            ],
            maxOutputTokens: 6000,
          }),
        ]);
        plan = {
          ...foundation.object,
          ...meals.object,
          ...training.object,
          ...roadmap.object,
        };
      } catch (e) {
        clearInterval(heartbeat);
        await refundRateLimits(user.id);
        const errMsg = String((e as Error)?.message ?? e);
        // Extract as much diagnostic info as possible. Vercel AI SDK's
        // NoObjectGeneratedError carries the raw model text + a ZodError
        // in .cause with the failed path — that's what tells us which
        // field/constraint tripped the validation.
        const errObj = e as {
          message?: string;
          text?: string;
          cause?: { message?: string; issues?: unknown[] };
        };
        const raw = errObj.text ? errObj.text.slice(0, 2000) : null;
        const causeMsg = errObj.cause?.message ?? null;
        const issues = errObj.cause?.issues
          ? JSON.stringify(errObj.cause.issues).slice(0, 2000)
          : null;
        await redis
          .set(
            `dbg:reports:last_error:${user.id}`,
            JSON.stringify({
              at: new Date().toISOString(),
              err: errMsg,
              causeMsg,
              issues,
              raw_preview: raw,
            }),
            { ex: 3600 }
          )
          .catch(() => {});
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: "ai_failed", details: errMsg }))
        );
        controller.close();
        return;
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
      clearInterval(heartbeat);

      if (insErr) {
        await refundRateLimits(user.id);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: "persist_failed",
              details: insErr.message,
            })
          )
        );
        controller.close();
        return;
      }

      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            id: inserted.id,
            generated_at: inserted.generated_at,
            duration_days: inserted.duration_days,
            plan,
          })
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      // Nudge intermediaries not to buffer — critical for streaming to
      // actually reach iOS in real time.
      "X-Accel-Buffering": "no",
    },
  });
}
