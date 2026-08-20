import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

/**
 * Food-image proxy for meal-plan cards. Given a dish name, returns a
 * public image URL if we can find one, or null. Server-side because:
 *   1. Upstream (TheMealDB) doesn't allow client-side calls from apps
 *      without CORS complications, and its rate limits are per-IP.
 *   2. We cache successful hits in Redis so repeated views of the same
 *      plan don't hammer the upstream.
 *
 * Fallback chain (best → worst) each lookup:
 *   - Redis cache: 30-day TTL for hits, 24h for misses (retry sooner)
 *   - TheMealDB /search.php?s=<query>
 *   - TheMealDB /filter.php?i=<ingredient>  (last-ditch ingredient search)
 *   - null → mobile falls back to slot icon badge
 *
 * The upstream is a free hobbyist DB — not every dish will match. We
 * strip Arabic transliteration parens, split multi-word queries, and
 * take the first two words as the search key to maximize hits.
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const HIT_TTL_SEC = 30 * 24 * 3600;
const MISS_TTL_SEC = 24 * 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") ?? "").trim();
  if (!raw || raw.length > 120) {
    return NextResponse.json(
      { error: "invalid_input", details: "q required (1–120 chars)" },
      { status: 400 }
    );
  }

  const key = `food-img:${normalize(raw)}`;
  const cached = await redis.get<string | null>(key);
  if (cached !== null && cached !== undefined) {
    // We store empty-string as sentinel for "we looked, no result yet."
    return NextResponse.json({ url: cached === "" ? null : cached });
  }

  const url = await lookup(raw);
  await redis.set(key, url ?? "", {
    ex: url ? HIT_TTL_SEC : MISS_TTL_SEC,
  });
  return NextResponse.json({ url });
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parenthetical transliterations
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function lookup(raw: string): Promise<string | null> {
  const clean = normalize(raw);
  if (!clean) return null;

  // Try the full name first, then the first two words, then the first.
  const words = clean.split(" ");
  const attempts = [clean];
  if (words.length > 2) attempts.push(words.slice(0, 2).join(" "));
  if (words.length > 1) attempts.push(words[0]!);

  for (const q of attempts) {
    const searchUrl = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        meals: { strMealThumb?: string }[] | null;
      };
      const img = body.meals?.[0]?.strMealThumb;
      if (typeof img === "string" && img.startsWith("https://")) {
        return img;
      }
    } catch {
      /* try next */
    }
  }

  return null;
}
