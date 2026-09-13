import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

/**
 * Admin escape hatch: refund a user's report-generation rate-limit
 * slots. Needed because the 4/year cap is enforced in Redis (Upstash
 * Ratelimit fixedWindow) with no user-facing reset — a genuine support
 * case (e.g. their goal changed materially, or an early plan was
 * unusable) would otherwise wait ~365 days for the window to roll.
 *
 * Auth: shared secret via `Authorization: Bearer $ADMIN_SECRET`.
 * Mirrors the CRON_SECRET pattern used by the cron routes — no user
 * session, no Supabase auth check. Keep ADMIN_SECRET narrow: this
 * endpoint can wipe rate limits for any user_id.
 *
 * Usage:
 *   # See what's left:
 *   curl -H "Authorization: Bearer $ADMIN_SECRET" \
 *     "https://se7a.app/api/admin/reports/reset-cap?user_id=<uuid>"
 *
 *   # Reset yearly (default):
 *   curl -H "Authorization: Bearer $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" -X POST \
 *     -d '{"user_id":"<uuid>"}' \
 *     https://se7a.app/api/admin/reports/reset-cap
 *
 *   # Reset both burst + yearly:
 *   curl ... -d '{"user_id":"<uuid>","kind":"both"}' ...
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Must match the prefixes + windows in /api/reports/generate/route.ts.
const BURST_PREFIX = "rl:report:burst";
const YEARLY_PREFIX = "rl:report:yearly";
const BURST_WINDOW_MS = 3_600_000;
const YEARLY_WINDOW_MS = 365 * 86_400_000;

type Kind = "burst" | "yearly" | "both";

function checkAuth(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

function bucketKeys(userId: string): { burst: string; yearly: string } {
  const now = Date.now();
  return {
    burst: `${BURST_PREFIX}:${userId}:${Math.floor(now / BURST_WINDOW_MS)}`,
    yearly: `${YEARLY_PREFIX}:${userId}:${Math.floor(now / YEARLY_WINDOW_MS)}`,
  };
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const userId = body?.user_id;
  const kind: Kind = body?.kind === "both" || body?.kind === "burst"
    ? body.kind
    : "yearly";
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json(
      { error: "user_id required" },
      { status: 400 }
    );
  }
  const keys = bucketKeys(userId);
  const cleared: string[] = [];
  if (kind === "burst" || kind === "both") {
    await redis.del(keys.burst).catch(() => 0);
    cleared.push(keys.burst);
  }
  if (kind === "yearly" || kind === "both") {
    await redis.del(keys.yearly).catch(() => 0);
    cleared.push(keys.yearly);
  }
  return NextResponse.json({ ok: true, user_id: userId, cleared });
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json(
      { error: "user_id query param required" },
      { status: 400 }
    );
  }
  const keys = bucketKeys(userId);
  // Upstash stores the current counter as a plain integer under the
  // bucket key. Missing key = 0 uses, full quota available.
  const [burstUsed, yearlyUsed] = await Promise.all([
    redis.get<number>(keys.burst),
    redis.get<number>(keys.yearly),
  ]);
  return NextResponse.json({
    user_id: userId,
    burst: {
      used: Number(burstUsed ?? 0),
      limit: 1,
      window: "1h",
      key: keys.burst,
    },
    yearly: {
      used: Number(yearlyUsed ?? 0),
      limit: 4,
      window: "365d",
      key: keys.yearly,
    },
  });
}
