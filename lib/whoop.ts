/**
 * Whoop OAuth 2 + API client.
 *
 * Env vars required (server-side only):
 *   WHOOP_CLIENT_ID
 *   WHOOP_CLIENT_SECRET
 *
 * Whoop requires an HTTPS redirect URI configured on their developer
 * dashboard; ours is `https://se7a.app/api/integrations/whoop/callback`.
 *
 * Scopes: read:workout (pulls sessions), read:cycles (daily kcal +
 * strain), read:profile (athlete identity), offline (refresh token).
 */

export const WHOOP_AUTH_URL =
  "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL =
  "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API = "https://api.prod.whoop.com/developer";
export const WHOOP_REDIRECT_URI =
  process.env.WHOOP_REDIRECT_URI ??
  "https://se7a.app/api/integrations/whoop/callback";
export const WHOOP_SCOPE =
  "read:workout read:cycles read:profile offline";

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
}

export interface WhoopWorkout {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string; // ISO
  end: string; // ISO
  sport_id: number;
  score_state: string;
  score?: {
    strain: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    distance_meter?: number;
  };
}

export interface WhoopCycle {
  id: string;
  user_id: number;
  start: string;
  end: string | null;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.WHOOP_CLIENT_ID;
  if (!clientId) throw new Error("WHOOP_CLIENT_ID not set");
  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", WHOOP_REDIRECT_URI);
  url.searchParams.set("scope", WHOOP_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<WhoopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: WHOOP_REDIRECT_URI,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
  });
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Whoop token exchange failed: ${res.status}`);
  }
  return (await res.json()) as WhoopTokenResponse;
}

export async function refreshToken(
  refreshTokenValue: string
): Promise<WhoopTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    scope: WHOOP_SCOPE,
  });
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Whoop token refresh failed: ${res.status}`);
  }
  return (await res.json()) as WhoopTokenResponse;
}

interface WhoopPaged<T> {
  records: T[];
  next_token?: string;
}

export async function fetchWorkouts(
  accessToken: string,
  sinceIso: string
): Promise<WhoopWorkout[]> {
  const results: WhoopWorkout[] = [];
  let nextToken: string | undefined;
  // Cap pages to avoid runaway; 5 pages × 25 per page = 125 workouts,
  // more than any user would produce between hourly syncs.
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${WHOOP_API}/v1/activity/workout`);
    url.searchParams.set("start", sinceIso);
    url.searchParams.set("limit", "25");
    if (nextToken) url.searchParams.set("nextToken", nextToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Whoop workouts fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as WhoopPaged<WhoopWorkout>;
    results.push(...body.records);
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return results;
}

export async function fetchCycles(
  accessToken: string,
  sinceIso: string
): Promise<WhoopCycle[]> {
  const url = new URL(`${WHOOP_API}/v1/cycle`);
  url.searchParams.set("start", sinceIso);
  url.searchParams.set("limit", "25");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Whoop cycles fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as WhoopPaged<WhoopCycle>;
  return body.records;
}

export async function fetchProfile(
  accessToken: string
): Promise<{ user_id: number; first_name?: string; last_name?: string } | null> {
  const res = await fetch(`${WHOOP_API}/v1/user/profile/basic`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    user_id: number;
    first_name?: string;
    last_name?: string;
  };
}

/**
 * Whoop sport IDs → SE7A cardio kind. Non-cardio activities (yoga,
 * weightlifting) fall through to "other" — we don't drop them; users
 * can still see them in the log if they log via Whoop.
 *
 * Full sport ID reference: https://developer.whoop.com/docs/appendix
 * Covers the ones most likely to appear; unknowns → "other".
 */
export function mapWhoopKind(sportId: number):
  | "run"
  | "walk"
  | "ride"
  | "swim"
  | "row"
  | "elliptical"
  | "hike"
  | "other" {
  switch (sportId) {
    case 0: // Activity (generic)
      return "other";
    case 1: // Cycling
      return "ride";
    case 43: // Rowing
      return "row";
    case 45: // Running
      return "run";
    case 47: // Swimming
      return "swim";
    case 55: // Hiking
      return "hike";
    case 63: // Elliptical
      return "elliptical";
    case 66: // Walking
      return "walk";
    case 68: // Cycling (indoor)
      return "ride";
    case 71: // Running (indoor treadmill)
      return "run";
    default:
      return "other";
  }
}
