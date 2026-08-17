import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * RevenueCat webhook — source of truth for Pro entitlement.
 *
 * Auth: RevenueCat calls with a shared secret in the Authorization header,
 * configured in the RC dashboard (Project settings → Webhooks → Auth).
 * We compare against RC_WEBHOOK_AUTH_HEADER on our side. This is the
 * pattern RC docs recommend; there's no HMAC signature scheme.
 *
 * Idempotency: RC guarantees at-least-once delivery. We de-dupe on
 * event.id via the rc_webhook_events table (primary key).
 *
 * Events handled:
 *   INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION → active pro
 *   CANCELLATION       → keeps pro until expires_at, will_renew=false
 *   EXPIRATION         → falls back to free
 *   BILLING_ISSUE      → status='billing_issue' (still pro if within grace)
 *   NON_RENEWING_PURCHASE, TRANSFER, SUBSCRIPTION_EXTENDED → refresh state
 *   TEST               → 200 OK, no-op
 */

interface RcEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  period_type?: "NORMAL" | "TRIAL" | "INTRO" | "PROMOTIONAL";
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  environment?: "PRODUCTION" | "SANDBOX";
  original_transaction_id?: string;
  transaction_id?: string;
  cancel_reason?: string;
  new_product_id?: string;
}

interface RcPayload {
  event?: RcEvent;
  api_version?: string;
}

const PRO_PRODUCTS = new Set(["se7a_pro_monthly", "se7a_pro_annual"]);

export async function POST(request: Request) {
  const expectedAuth = process.env.RC_WEBHOOK_AUTH_HEADER;
  if (!expectedAuth) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 503 }
    );
  }
  const provided = request.headers.get("authorization");
  if (provided !== expectedAuth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RcPayload | null;
  const event = body?.event;
  if (!event?.id || !event.type) {
    return NextResponse.json(
      { error: "invalid_payload", details: "event.id and event.type required" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();

  // Idempotency: skip if we've already processed this event.id
  const { data: existing } = await admin
    .from("rc_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await admin.from("rc_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    app_user_id: event.app_user_id ?? null,
    payload: body,
  });

  if (event.type === "TEST") {
    return NextResponse.json({ ok: true, test: true });
  }

  const userId = event.app_user_id;
  if (!userId) {
    return NextResponse.json(
      { error: "missing_user", details: "event.app_user_id required" },
      { status: 400 }
    );
  }

  // Map RC product to our tier — anything else (say, a promo product)
  // still activates Pro if it's a known Pro product, otherwise we ignore.
  const productId = event.new_product_id ?? event.product_id ?? null;

  const now = new Date();
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms)
    : null;
  const purchasedAt = event.purchased_at_ms
    ? new Date(event.purchased_at_ms)
    : null;
  const stillFuture = expiresAt ? expiresAt > now : false;

  const isKnownProProduct = productId ? PRO_PRODUCTS.has(productId) : false;

  let tier: "free" | "pro" = "free";
  let status:
    | "inactive"
    | "trial"
    | "active"
    | "grace"
    | "cancelled"
    | "expired"
    | "billing_issue" = "inactive";
  let willRenew = false;

  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      if (isKnownProProduct && stillFuture) {
        tier = "pro";
        status = event.period_type === "TRIAL" ? "trial" : "active";
        willRenew = true;
      }
      break;

    case "CANCELLATION":
      if (isKnownProProduct && stillFuture) {
        tier = "pro";
        status = "cancelled";
        willRenew = false;
      } else {
        tier = "free";
        status = "expired";
      }
      break;

    case "EXPIRATION":
      tier = "free";
      status = "expired";
      willRenew = false;
      break;

    case "BILLING_ISSUE":
      if (isKnownProProduct && stillFuture) {
        tier = "pro";
        status = "billing_issue";
        willRenew = true;
      } else {
        tier = "free";
        status = "expired";
      }
      break;

    case "NON_RENEWING_PURCHASE":
      // Not applicable to auto-renewables; keep row as-is if present.
      return NextResponse.json({ ok: true, ignored: event.type });

    case "TRANSFER":
      // The subscription moved to a different app_user_id. Best handled by
      // recomputing from the RC REST API; for now we simply record the
      // event and expect a follow-up RENEWAL/INITIAL_PURCHASE to arrive.
      return NextResponse.json({ ok: true, note: "transfer_logged" });

    default:
      return NextResponse.json({ ok: true, ignored: event.type });
  }

  const upsertRow = {
    user_id: userId,
    tier,
    status,
    rc_app_user_id: userId,
    rc_original_transaction_id:
      event.original_transaction_id ?? event.transaction_id ?? null,
    rc_product_id: productId,
    rc_environment: event.environment ?? null,
    period_type: event.period_type ?? null,
    purchased_at: purchasedAt?.toISOString() ?? null,
    expires_at: expiresAt?.toISOString() ?? null,
    will_renew: willRenew,
    updated_at: now.toISOString(),
  };

  const { error: upErr } = await admin
    .from("subscriptions")
    .upsert(upsertRow, { onConflict: "user_id" });

  if (upErr) {
    return NextResponse.json(
      { error: "persist_failed", details: upErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    tier,
    status,
    expires_at: upsertRow.expires_at,
  });
}
