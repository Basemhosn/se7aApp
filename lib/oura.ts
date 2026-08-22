/**
 * Oura Ring OAuth 2 + API v2 client.
 *
 * Env vars required (server-side only):
 *   OURA_CLIENT_ID
 *   OURA_CLIENT_SECRET
 *
 * Docs: https://cloud.ouraring.com/v2/docs
 * OAuth: https://cloud.ouraring.com/oauth/authorize (browser)
 *        https://api.ouraring.com/oauth/token (server)
 *
 * Scopes: `personal` (profile), `daily` (activity summaries + steps +
 * kcal), `heartrate` (optional, for future), `workout` (session data).
 */

export const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
export const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
export const OURA_API = "https://api.ouraring.com/v2";
export const OURA_REDIRECT_URI =
  process.env.OURA_REDIRECT_URI ??
  "https://se7a.app/api/integrations/oura/callback";
export const OURA_SCOPE = "personal daily workout heartrate";

export interface OuraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

export interface OuraWorkout {
  id: string; // UUID
  activity: string; // "walking", "running", "cycling", "swimming", etc.
  calories?: number;
  day: string; // YYYY-MM-DD
  distance?: number | null; // meters
  end_datetime: string; // ISO
  start_datetime: string; // ISO
  intensity?: "easy" | "moderate" | "hard";
  label?: string | null;
  source?: string;
}

export interface OuraSleep {
  id: string;
  average_breath?: number | null;
  average_heart_rate?: number | null;
  average_hrv?: number | null;
  awake_time?: number | null; // seconds
  bedtime_end: string; // ISO
  bedtime_start: string; // ISO
  day: string; // YYYY-MM-DD — Oura already anchors to the wake date
  deep_sleep_duration?: number | null; // seconds
  efficiency?: number | null;
  latency?: number | null;
  light_sleep_duration?: number | null;
  low_battery_alert?: boolean;
  lowest_heart_rate?: number | null;
  period?: number;
  readiness?: {
    score?: number;
  } | null;
  rem_sleep_duration?: number | null;
  restless_periods?: number | null;
  sleep_phase_5_min?: string;
  time_in_bed: number; // seconds
  total_sleep_duration?: number | null; // seconds
  type: "deleted" | "sleep" | "long_sleep" | "late_nap" | "rest";
}

export interface OuraDailySleep {
  id: string;
  contributors?: Record<string, number | null>;
  day: string; // YYYY-MM-DD
  score?: number | null;
  timestamp?: string;
}

export interface OuraDailyReadiness {
  id: string;
  contributors?: Record<string, number | null>;
  day: string; // YYYY-MM-DD
  score?: number | null;
  temperature_deviation?: number | null;
  temperature_trend_deviation?: number | null;
  timestamp?: string;
}

export interface OuraDailyActivity {
  id: string;
  day: string; // YYYY-MM-DD
  steps: number;
  active_calories: number;
  total_calories?: number;
  score?: number | null;
  target_calories?: number;
  target_meters?: number;
  timezone?: number; // offset in seconds
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.OURA_CLIENT_ID;
  if (!clientId) throw new Error("OURA_CLIENT_ID not set");
  const url = new URL(OURA_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", OURA_REDIRECT_URI);
  url.searchParams.set("scope", OURA_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<OuraTokenResponse> {
  // Oura's token endpoint uses HTTP Basic auth with client_id:client_secret
  const basic = Buffer.from(
    `${process.env.OURA_CLIENT_ID}:${process.env.OURA_CLIENT_SECRET}`
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: OURA_REDIRECT_URI,
  });
  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Oura token exchange failed: ${res.status}`);
  }
  return (await res.json()) as OuraTokenResponse;
}

export async function refreshToken(
  refreshTokenValue: string
): Promise<OuraTokenResponse> {
  const basic = Buffer.from(
    `${process.env.OURA_CLIENT_ID}:${process.env.OURA_CLIENT_SECRET}`
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  });
  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Oura token refresh failed: ${res.status}`);
  }
  return (await res.json()) as OuraTokenResponse;
}

interface OuraPaged<T> {
  data: T[];
  next_token?: string | null;
}

export async function fetchWorkouts(
  accessToken: string,
  sinceIso: string
): Promise<OuraWorkout[]> {
  // Oura's workout endpoint uses `start_date` / `end_date` (YYYY-MM-DD)
  const startDay = sinceIso.slice(0, 10);
  const endDay = new Date().toISOString().slice(0, 10);
  const results: OuraWorkout[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${OURA_API}/usercollection/workout`);
    url.searchParams.set("start_date", startDay);
    url.searchParams.set("end_date", endDay);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Oura workouts fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as OuraPaged<OuraWorkout>;
    results.push(...body.data);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

export async function fetchDailyActivity(
  accessToken: string,
  sinceIso: string
): Promise<OuraDailyActivity[]> {
  const startDay = sinceIso.slice(0, 10);
  const endDay = new Date().toISOString().slice(0, 10);
  const results: OuraDailyActivity[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${OURA_API}/usercollection/daily_activity`);
    url.searchParams.set("start_date", startDay);
    url.searchParams.set("end_date", endDay);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Oura daily_activity fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as OuraPaged<OuraDailyActivity>;
    results.push(...body.data);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

export async function fetchSleep(
  accessToken: string,
  sinceIso: string
): Promise<OuraSleep[]> {
  const startDay = sinceIso.slice(0, 10);
  const endDay = new Date().toISOString().slice(0, 10);
  const results: OuraSleep[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${OURA_API}/usercollection/sleep`);
    url.searchParams.set("start_date", startDay);
    url.searchParams.set("end_date", endDay);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Oura sleep fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as OuraPaged<OuraSleep>;
    results.push(...body.data);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

/**
 * Oura's overall sleep score lives in the /daily_sleep collection,
 * keyed by day. The per-session /sleep endpoint doesn't include it —
 * we fetch this separately and stitch on `day`.
 */
export async function fetchDailySleep(
  accessToken: string,
  sinceIso: string
): Promise<OuraDailySleep[]> {
  const startDay = sinceIso.slice(0, 10);
  const endDay = new Date().toISOString().slice(0, 10);
  const results: OuraDailySleep[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${OURA_API}/usercollection/daily_sleep`);
    url.searchParams.set("start_date", startDay);
    url.searchParams.set("end_date", endDay);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const body = (await res.json()) as OuraPaged<OuraDailySleep>;
    results.push(...body.data);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

/**
 * Oura's readiness score is the closest analogue to Whoop's recovery —
 * a 0-100 composite from HRV balance, resting HR, body temp, prior-day
 * activity, and sleep quality. Lives in its own endpoint, keyed by day.
 */
export async function fetchDailyReadiness(
  accessToken: string,
  sinceIso: string
): Promise<OuraDailyReadiness[]> {
  const startDay = sinceIso.slice(0, 10);
  const endDay = new Date().toISOString().slice(0, 10);
  const results: OuraDailyReadiness[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${OURA_API}/usercollection/daily_readiness`);
    url.searchParams.set("start_date", startDay);
    url.searchParams.set("end_date", endDay);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const body = (await res.json()) as OuraPaged<OuraDailyReadiness>;
    results.push(...body.data);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

export async function fetchPersonalInfo(
  accessToken: string
): Promise<{ id: string; email?: string } | null> {
  const res = await fetch(`${OURA_API}/usercollection/personal_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; email?: string };
}

/**
 * Oura activity strings → SE7A cardio kind. Oura uses lowercased English
 * words already, so this is straightforward keyword matching.
 */
export function mapOuraKind(
  activity: string
):
  | "run"
  | "walk"
  | "ride"
  | "swim"
  | "row"
  | "elliptical"
  | "hike"
  | "other" {
  const a = activity.toLowerCase();
  if (a.includes("run")) return "run";
  if (a.includes("hike")) return "hike";
  if (a.includes("walk")) return "walk";
  if (a.includes("cycl") || a.includes("bike") || a.includes("ride"))
    return "ride";
  if (a.includes("swim")) return "swim";
  if (a.includes("row") || a.includes("kayak") || a.includes("canoe"))
    return "row";
  if (a.includes("elliptical")) return "elliptical";
  return "other";
}
