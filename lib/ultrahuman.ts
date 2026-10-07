/**
 * Ultrahuman Partner API client.
 *
 * UH's API is simpler than OAuth-based providers:
 *   - SE7A holds a single master token (env UH_API_TOKEN).
 *   - Users enter SE7A's share code (env UH_SHARE_CODE) in their
 *     Ultrahuman app under Profile → Settings → Partner ID.
 *   - Once authorized, we call /partner/daily_metrics?email=X&date=Y
 *     with the master token to retrieve their data.
 *
 * Endpoint: GET https://ultrahuman.com/api/v1/partner/daily_metrics
 * Headers:  Authorization: <master token>
 * Query:    email, date (YYYY-MM-DD) OR start_epoch + end_epoch (max 7d)
 *
 * Everything in the response is nullable — a user without a specific
 * sensor (e.g. no M1 ring = no glucose) just omits that field. Treat
 * missing fields as "not provided this day" rather than errors.
 */

const BASE_URL = "https://ultrahuman.com/api/v1/partner";

/**
 * Shape returned by /daily_metrics. Fields pulled from UH developer
 * docs — treat each as optional since response shape depends on which
 * device(s) the user has.
 */
export interface UltrahumanDailyMetrics {
  // Overall scores (0-100 unless noted)
  recovery_index?: number | null;
  movement_index?: number | null;
  sleep_score?: number | null;
  metabolic_score?: number | null;
  vo2_max?: number | null;

  // Activity
  steps?: number | null;
  active_minutes?: number | null;

  // Sleep (minutes unless noted)
  total_sleep?: number | null;
  time_in_bed?: number | null;
  sleep_efficiency?: number | null; // percent
  rem_sleep?: number | null;
  deep_sleep?: number | null;
  light_sleep?: number | null;
  awake?: number | null;
  full_sleep_cycles?: number | null;
  tosses_and_turns?: number | null;
  restorative_sleep?: number | null;
  morning_alertness?: number | null;
  temperature_deviation?: number | null;
  hr_drop?: number | null;
  movements?: number | null;
  average_body_temperature?: number | null;

  // Heart
  sleep_rhr?: number | null; // resting heart rate during sleep (bpm)
  avg_sleep_hrv?: number | null; // ms

  // Blood
  spo2?: number | null; // percent

  // Metabolic (M1 only)
  average_glucose?: number | null; // mg/dL
  glucose_variability?: number | null; // percent
  time_in_target?: number | null; // percent
  hba1c?: number | null;

  // Metadata — UH may add fields we don't model. Unknown keys are safe
  // to ignore.
  [key: string]: unknown;
}

export interface UltrahumanErrorResponse {
  error?: string;
  message?: string;
}

export class UltrahumanApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetch daily metrics for a user. `email` is the UH-registered email —
 * NOT necessarily the same as the SE7A auth email. Date is YYYY-MM-DD
 * in the user's timezone (UH handles the day boundary server-side).
 *
 * Returns null on 404 (user hasn't authorized sharing). Throws on 4xx
 * (misconfigured) and 5xx (UH outage).
 */
export async function fetchDailyMetrics(
  email: string,
  date: string,
  token: string
): Promise<UltrahumanDailyMetrics | null> {
  const url = new URL(`${BASE_URL}/daily_metrics`);
  url.searchParams.set("email", email);
  url.searchParams.set("date", date);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UltrahumanApiError(res.status, text.slice(0, 500));
  }

  return (await res.json()) as UltrahumanDailyMetrics;
}

/**
 * Env-based feature flag. All UH-facing routes check this. Default off
 * so a half-built scaffold doesn't leak into production.
 */
export function isUltrahumanEnabled(): boolean {
  return process.env.UH_ENABLED === "true";
}

export function getUltrahumanToken(): string | null {
  return process.env.UH_API_TOKEN ?? null;
}

export function getUltrahumanShareCode(): string | null {
  return process.env.UH_SHARE_CODE ?? null;
}
