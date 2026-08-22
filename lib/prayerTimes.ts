import { Redis } from "@upstash/redis";

/**
 * Aladhan prayer times client (free public API, no key required).
 *
 * Docs: https://aladhan.com/prayer-times-api
 * Endpoint: /v1/timingsByCity/{DD-MM-YYYY}?city=X&country=Y&method=N
 *
 * We cache each (city, country, day, method) tuple in Upstash Redis
 * for 25 hours — times are stable per day, and the 25h TTL means the
 * cache stays valid across the DST-ish edge of a full calendar day
 * even for users in weird timezones.
 *
 * On any failure (network, Aladhan 5xx, malformed body, Redis unavail)
 * the caller receives null and should fall back to whatever manual
 * times the user has stored. This module never throws.
 */

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CACHE_TTL_SECONDS = 25 * 60 * 60;

export interface PrayerTimes {
  fajr: string; // HH:MM 24h local time
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  method: number;
  cached: boolean;
}

interface AladhanResponse {
  code: number;
  status: string;
  data?: {
    timings?: Record<string, string>;
  };
}

/**
 * Fetch prayer times for a specific date + city. Returns null on any
 * error or if the API returned a non-200 status.
 */
export async function fetchPrayerTimesForDate(
  city: string,
  country: string,
  date: Date,
  method?: number
): Promise<PrayerTimes | null> {
  const trimmedCity = city.trim();
  const trimmedCountry = country.trim();
  if (!trimmedCity || !trimmedCountry) return null;

  const m = method ?? methodForCountry(trimmedCountry);
  const day = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
  const cacheKey = `prayer:${trimmedCity.toLowerCase()}:${trimmedCountry.toLowerCase()}:${day}:${m}`;

  // Cache read — silent on failure so a Redis outage doesn't take the
  // whole feature down.
  try {
    const cached = (await redis.get(cacheKey)) as PrayerTimes | null;
    if (cached && typeof cached.fajr === "string") {
      return { ...cached, cached: true };
    }
  } catch {
    /* fall through to live fetch */
  }

  let body: AladhanResponse | null = null;
  try {
    const url = `https://api.aladhan.com/v1/timingsByCity/${day}?city=${encodeURIComponent(trimmedCity)}&country=${encodeURIComponent(trimmedCountry)}&method=${m}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      // Aladhan is usually snappy but occasionally hangs; 5s cap so a
      // slow upstream doesn't block a /ramadan/status response.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    body = (await res.json()) as AladhanResponse;
  } catch {
    return null;
  }

  if (!body || body.code !== 200 || !body.data?.timings) return null;
  const t = body.data.timings;
  if (typeof t.Fajr !== "string" || typeof t.Maghrib !== "string") return null;

  const result: PrayerTimes = {
    fajr: stripSeconds(t.Fajr),
    sunrise: stripSeconds(t.Sunrise ?? ""),
    dhuhr: stripSeconds(t.Dhuhr ?? ""),
    asr: stripSeconds(t.Asr ?? ""),
    maghrib: stripSeconds(t.Maghrib),
    isha: stripSeconds(t.Isha ?? ""),
    method: m,
    cached: false,
  };

  try {
    await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS });
  } catch {
    /* silent */
  }
  return result;
}

/**
 * Trim a HH:MM(:SS)? possibly with a " (TZ)" suffix down to HH:MM.
 * Aladhan returns "18:52" or occasionally "18:52 (+04)" depending on
 * the endpoint variant.
 */
function stripSeconds(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/**
 * Calculation-method defaults by country. Aladhan supports ~17
 * methods; picking the wrong one can shift fajr by ±20 min. The map
 * below covers the countries we expect for SE7A's Gulf-first user
 * base and falls back to Muslim World League (3) — a safe global
 * default that matches most non-Gulf populations.
 *
 * Full method list: https://aladhan.com/calculation-methods
 */
export function methodForCountry(country: string): number {
  const c = country.trim().toLowerCase();
  // Umm al-Qura — Saudi Arabia and Gulf.
  const ummAlQura = [
    "saudi arabia",
    "ksa",
    "uae",
    "united arab emirates",
    "qatar",
    "bahrain",
    "kuwait",
    "oman",
    "yemen",
  ];
  if (ummAlQura.includes(c)) return 8;
  // Egyptian General Authority.
  if (c === "egypt") return 5;
  // Turkey — Diyanet.
  if (c === "turkey" || c === "türkiye" || c === "turkiye") return 13;
  // ISNA covers most of North America.
  if (
    c === "usa" ||
    c === "united states" ||
    c === "united states of america" ||
    c === "canada"
  ) {
    return 2;
  }
  // Karachi — Pakistan, India, Bangladesh, Afghanistan.
  if (
    c === "pakistan" ||
    c === "india" ||
    c === "bangladesh" ||
    c === "afghanistan"
  ) {
    return 1;
  }
  // Muslim World League — safe default for Levant, N. Africa, and
  // anywhere else not explicitly matched above.
  return 3;
}
