import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Two layers per user:
// - burst: catches accidental double-taps / retries
// - daily: hard cost cap. Vision calls are ~$0.10 each.
const scanBurst = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  prefix: "rl:scan:burst",
  analytics: true,
});

// Free tier: 5 scans per rolling 24h across ALL scan types (plate,
// menu, body, meals-suggest, meal-plan). Pro is effectively unlimited
// — capped at 10k/day only as an abuse ceiling; users never see it.
const scanDaily = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, "24 h"),
  prefix: "rl:scan:daily:v2",
  analytics: true,
});

const scanDailyPro = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10000, "24 h"),
  prefix: "rl:scan:daily:pro:v2",
  analytics: true,
});

export type ScanLimitResult =
  | { ok: true }
  | {
      ok: false;
      kind: "burst" | "daily";
      retryAfterSec: number;
      limit: number;
    };

export async function checkScanLimits(
  userId: string,
  opts: { isPro?: boolean } = {}
): Promise<ScanLimitResult> {
  const dailyLimiter = opts.isPro ? scanDailyPro : scanDaily;
  const [burst, daily] = await Promise.all([
    scanBurst.limit(userId),
    dailyLimiter.limit(userId),
  ]);

  if (!burst.success) {
    return {
      ok: false,
      kind: "burst",
      retryAfterSec: Math.max(1, Math.ceil((burst.reset - Date.now()) / 1000)),
      limit: burst.limit,
    };
  }
  if (!daily.success) {
    return {
      ok: false,
      kind: "daily",
      retryAfterSec: Math.max(1, Math.ceil((daily.reset - Date.now()) / 1000)),
      limit: daily.limit,
    };
  }
  return { ok: true };
}

// Barcode lookups are cheap (OFF is free, cached) but we still throttle
// against enumeration / scraping abuse. Generous limits vs plate scan.
const barcodeBurst = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  prefix: "rl:barcode:burst",
  analytics: true,
});

export async function checkBarcodeLimits(
  userId: string
): Promise<ScanLimitResult> {
  const burst = await barcodeBurst.limit(userId);
  if (!burst.success) {
    return {
      ok: false,
      kind: "burst",
      retryAfterSec: Math.max(1, Math.ceil((burst.reset - Date.now()) / 1000)),
      limit: burst.limit,
    };
  }
  return { ok: true };
}

// Food-lookup rate limits sit between barcode and scan — LLM cost is
// real but cache hits dominate, so the daily cap is generous enough
// that typical logging never hits it.
const foodBurst = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "rl:food:burst",
  analytics: true,
});
const foodDaily = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(200, "24 h"),
  prefix: "rl:food:daily",
  analytics: true,
});

export async function checkFoodLimits(
  userId: string
): Promise<ScanLimitResult> {
  const [burst, daily] = await Promise.all([
    foodBurst.limit(userId),
    foodDaily.limit(userId),
  ]);
  if (!burst.success) {
    return {
      ok: false,
      kind: "burst",
      retryAfterSec: Math.max(1, Math.ceil((burst.reset - Date.now()) / 1000)),
      limit: burst.limit,
    };
  }
  if (!daily.success) {
    return {
      ok: false,
      kind: "daily",
      retryAfterSec: Math.max(1, Math.ceil((daily.reset - Date.now()) / 1000)),
      limit: daily.limit,
    };
  }
  return { ok: true };
}

export function rateLimitedResponse(result: Extract<ScanLimitResult, { ok: false }>) {
  const detail =
    result.kind === "burst"
      ? "Too many scans in a short time. Try again in a minute."
      : "Daily scan limit reached. Try again tomorrow.";
  return Response.json(
    {
      error: "rate_limited",
      details: detail,
      limit: result.limit,
      retry_after_sec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    }
  );
}
