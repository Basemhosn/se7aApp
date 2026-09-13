/**
 * Thin RevenueCat REST API client. Server-side only — uses the RC
 * secret API key which must never touch the mobile bundle.
 *
 * Docs: https://www.revenuecat.com/docs/api-v1
 * The v1 REST API is what supports promotional entitlements; v2 is
 * data-plane focused and doesn't (as of 2026-09) expose promo grants.
 */

const RC_API_BASE = "https://api.revenuecat.com/v1";

const PRO_ENTITLEMENT_ID = process.env.RC_PRO_ENTITLEMENT_ID ?? "pro";

export interface RcPromoResult {
  ok: boolean;
  status: number;
  body?: unknown;
  error?: string;
}

/**
 * Grant a promotional entitlement to a user. `duration` can be one of
 * RC's presets ('daily','three_day','weekly','monthly','two_month',
 * 'three_month','six_month','yearly','lifetime') or 'custom' with
 * duration_seconds set.
 *
 * Returns { ok:true } on success (RC responds with the updated subscriber
 * object). On failure, returns the RC error string for the caller to log.
 * We never throw — callers decide whether the failure is retryable.
 */
export async function grantPromotionalEntitlement(args: {
  appUserId: string;
  duration?: string;
  durationSeconds?: number;
  entitlementId?: string;
}): Promise<RcPromoResult> {
  const apiKey = process.env.RC_SECRET_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "RC_SECRET_API_KEY not set" };
  }
  const entitlement = args.entitlementId ?? PRO_ENTITLEMENT_ID;
  const url = `${RC_API_BASE}/subscribers/${encodeURIComponent(args.appUserId)}/entitlements/${encodeURIComponent(entitlement)}/promotional`;

  const body: Record<string, unknown> = {
    duration: args.duration ?? "monthly",
  };
  if (args.duration === "custom" && args.durationSeconds != null) {
    body.duration_seconds = args.durationSeconds;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : text.slice(0, 200);
    return { ok: false, status: res.status, body: parsed, error: message };
  }

  return { ok: true, status: res.status, body: parsed };
}
