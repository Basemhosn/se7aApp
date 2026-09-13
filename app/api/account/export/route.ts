import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Export the current user's SE7A data as a single JSON payload —
 * satisfies the UAE PDPL "right of access" promise in the privacy
 * policy and Apple/Google's expectation that account holders can
 * download their data self-serve.
 *
 * Included: everything RLS considers "yours" (profile, logs, meals,
 * workouts, cardio, water, sleep, weight, measurements, coach chat,
 * fasting, cycle, plans, reports, badges, streak freezes, recovery
 * scores, notifications sent, subscription status, integration
 * connections). Shared caches (barcode_products, food_lookup_cache)
 * and secret material (push_tokens, oauth_states, integration
 * access/refresh tokens, rc webhook audit log) are excluded.
 *
 * Photos are referenced by storage key + signed URL. The URL is
 * good for 7 days from download so the user can archive the images
 * separately if they want them.
 */

interface Bundle {
  [table: string]: unknown;
}

const TABLES = [
  "weight_logs",
  "body_measurements",
  "meal_items",
  "meal_plans",
  "scans",
  "workout_sessions",
  "cardio_sessions",
  "user_programs",
  "water_logs",
  "sleep_sessions",
  "chat_messages",
  "fasting_windows",
  "cycle_periods",
  "progress_photos",
  "reports",
  "report_week_checkpoints",
  "report_item_completions",
  "user_badges",
  "streak_freezes",
  "daily_activity",
  "recovery_scores",
  "notifications_sent",
  "subscriptions",
] as const;

const IMAGE_BUCKETS = [
  "plate-scans",
  "menu-scans",
  "progress-photos",
] as const;

async function safeSelect(
  supabase: SupabaseClient,
  table: string
): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.from(table).select("*");
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data ?? [] };
}

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bundle: Bundle = {
    _meta: {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      user_email: user.email ?? null,
      format_version: 1,
      note:
        "This export contains your SE7A account data. Signed image URLs are valid for 7 days from the time of export.",
    },
  };
  const errors: Record<string, string> = {};

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) errors.profiles = profileErr.message;
  bundle.profile = profileRow ?? null;

  const results = await Promise.all(
    TABLES.map(async (t) => ({ t, r: await safeSelect(supabase, t) }))
  );
  for (const { t, r } of results) {
    if (r.ok) bundle[t] = r.rows;
    else errors[t] = r.error;
  }

  // Integrations: only the safe columns (provider + connected timestamps).
  // The full row contains oauth access_token / refresh_token which we
  // never want to hand back in plaintext.
  const { data: integrations, error: integrationsErr } = await supabase
    .from("user_integrations")
    .select("provider, provider_user_id, connected_at, last_sync_at");
  if (integrationsErr) errors.user_integrations = integrationsErr.message;
  bundle.user_integrations = integrations ?? [];

  // Photos: list keys + signed URLs (7-day TTL). One block per bucket
  // so the shape mirrors how storage is organized.
  const photos: Record<string, unknown[]> = {};
  for (const bucket of IMAGE_BUCKETS) {
    try {
      const { data: files } = await supabase.storage
        .from(bucket)
        .list(user.id);
      if (!files || files.length === 0) {
        photos[bucket] = [];
        continue;
      }
      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 60 * 60 * 24 * 7); // 7 days
      if (signErr) {
        errors[`storage.${bucket}`] = signErr.message;
        photos[bucket] = files.map((f) => ({
          key: `${user.id}/${f.name}`,
          size: f.metadata?.size ?? null,
          created_at: f.created_at ?? null,
        }));
      } else {
        photos[bucket] = (signed ?? []).map((s, i) => ({
          key: paths[i],
          size: files[i]?.metadata?.size ?? null,
          created_at: files[i]?.created_at ?? null,
          signed_url: s.signedUrl,
        }));
      }
    } catch (e) {
      errors[`storage.${bucket}`] = (e as Error).message;
      photos[bucket] = [];
    }
  }
  bundle.storage = photos;

  if (Object.keys(errors).length > 0) {
    bundle._meta = {
      ...(bundle._meta as Record<string, unknown>),
      partial_errors: errors,
    };
  }

  const body = JSON.stringify(bundle, null, 2);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="se7a-export-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
