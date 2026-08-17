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

const scanDaily = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(30, "24 h"),
  prefix: "rl:scan:daily",
  analytics: true,
});

const scanDailyPro = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(200, "24 h"),
  prefix: "rl:scan:daily:pro",
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
