/**
 * Strava OAuth 2 + activity fetch helpers.
 *
 * Two env vars required (server-side only):
 *   STRAVA_CLIENT_ID     — the numeric id from strava.com/settings/api
 *   STRAVA_CLIENT_SECRET — the accompanying secret
 *
 * Strava requires an HTTPS redirect URI at their app settings; ours is
 * `https://se7a.app/api/integrations/strava/callback` and must match
 * exactly.
 *
 * Scope "activity:read_all" so we can pull historical runs/rides for
 * backfill. "read" is included so we can hit the athlete endpoint for
 * the user's Strava id.
 */

export const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";
export const STRAVA_API = "https://www.strava.com/api/v3";
export const STRAVA_REDIRECT_URI =
  process.env.STRAVA_REDIRECT_URI ??
  "https://se7a.app/api/integrations/strava/callback";
export const STRAVA_SCOPE = "read,activity:read_all";

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix seconds
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string; // "Run" | "Ride" | "Walk" | "Swim" | ...
  sport_type?: string;
  start_date: string; // ISO
  elapsed_time: number; // seconds
  moving_time: number; // seconds
  distance: number; // meters
  average_heartrate?: number;
  calories?: number;
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) throw new Error("STRAVA_CLIENT_ID not set");
  const url = new URL(STRAVA_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", STRAVA_REDIRECT_URI);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status}`);
  }
  return (await res.json()) as StravaTokenResponse;
}

export async function refreshToken(
  refreshTokenValue: string
): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshTokenValue,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }
  return (await res.json()) as StravaTokenResponse;
}

export async function fetchActivities(
  accessToken: string,
  afterUnixSec: number
): Promise<StravaActivity[]> {
  const url = new URL(`${STRAVA_API}/athlete/activities`);
  url.searchParams.set("after", String(afterUnixSec));
  url.searchParams.set("per_page", "100");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Strava activities fetch failed: ${res.status}`);
  }
  return (await res.json()) as StravaActivity[];
}

/**
 * Map a Strava activity type/sport_type string to SE7A's cardio kind
 * enum. Anything unrecognized falls to "other".
 */
export function mapStravaKind(activity: StravaActivity):
  | "run"
  | "walk"
  | "ride"
  | "swim"
  | "row"
  | "elliptical"
  | "hike"
  | "other" {
  const t = (activity.sport_type ?? activity.type ?? "").toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("hike")) return "hike";
  if (t.includes("walk")) return "walk";
  if (t.includes("ride") || t.includes("bike") || t.includes("cycl"))
    return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("row") || t.includes("kayak") || t.includes("canoe"))
    return "row";
  if (t.includes("elliptical")) return "elliptical";
  return "other";
}
