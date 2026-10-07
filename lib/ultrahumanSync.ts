import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDailyMetrics,
  getUltrahumanToken,
  UltrahumanApiError,
  type UltrahumanDailyMetrics,
} from "./ultrahuman";
import { bandForScore } from "./recovery";

/**
 * Sync one user's Ultrahuman data for a range of days.
 *
 * UH's /daily_metrics endpoint is one-day-at-a-time; a 7-day sync is
 * 7 sequential calls. Keep the default range small (default 2 days —
 * yesterday + today, to catch late-logged sleep that spans midnight).
 * On-demand "sync now" from Settings can request wider ranges.
 *
 * Writes into:
 *   - sleep_sessions  (one row per night with sleep data)
 *   - recovery_scores (one row per day with recovery_index)
 *   - glucose_daily   (one row per day with M1 CGM metrics; many users
 *                      won't have these)
 */
export async function syncUltrahumanForUser(
  admin: SupabaseClient,
  userId: string,
  options: { daysBack?: number } = {}
): Promise<{
  days_synced: number;
  sleep_upserted: number;
  recovery_upserted: number;
  glucose_upserted: number;
  error?: string;
}> {
  const token = getUltrahumanToken();
  if (!token) {
    return {
      days_synced: 0,
      sleep_upserted: 0,
      recovery_upserted: 0,
      glucose_upserted: 0,
      error: "server_not_configured",
    };
  }

  const { data: integration } = await admin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "ultrahuman")
    .maybeSingle();

  if (!integration) {
    return {
      days_synced: 0,
      sleep_upserted: 0,
      recovery_upserted: 0,
      glucose_upserted: 0,
      error: "not_connected",
    };
  }

  const email = integration.provider_user_id as string | null;
  if (!email) {
    return {
      days_synced: 0,
      sleep_upserted: 0,
      recovery_upserted: 0,
      glucose_upserted: 0,
      error: "missing_uh_email",
    };
  }

  const daysBack = Math.max(1, Math.min(7, options.daysBack ?? 2));
  const dates: string[] = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  let sleepUpserted = 0;
  let recoveryUpserted = 0;
  let glucoseUpserted = 0;
  let daysSynced = 0;
  let lastError: string | undefined;

  for (const date of dates) {
    let metrics: UltrahumanDailyMetrics | null;
    try {
      metrics = await fetchDailyMetrics(email, date, token);
    } catch (e) {
      if (e instanceof UltrahumanApiError) {
        lastError = `uh_${e.status}: ${e.message}`;
      } else {
        lastError = (e as Error).message ?? "unknown_fetch_error";
      }
      continue;
    }
    if (!metrics) continue; // 404 — not authorized for this user
    daysSynced++;

    if (await upsertSleep(admin, userId, date, metrics)) sleepUpserted++;
    if (await upsertRecovery(admin, userId, date, metrics)) recoveryUpserted++;
    if (await upsertGlucose(admin, userId, date, metrics)) glucoseUpserted++;
  }

  await admin
    .from("user_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "ultrahuman");

  return {
    days_synced: daysSynced,
    sleep_upserted: sleepUpserted,
    recovery_upserted: recoveryUpserted,
    glucose_upserted: glucoseUpserted,
    error: lastError,
  };
}

async function upsertSleep(
  admin: SupabaseClient,
  userId: string,
  date: string,
  m: UltrahumanDailyMetrics
): Promise<boolean> {
  const totalSleep = toInt(m.total_sleep);
  if (!totalSleep || totalSleep <= 0) return false;

  // UH gives us durations but not start/end timestamps. Fabricate a
  // conservative window centered on 02:00 local for schema compliance.
  // When UH exposes real timestamps later, swap this.
  const nightDate = date;
  const midnight = new Date(`${date}T02:00:00Z`);
  const startAt = new Date(midnight.getTime() - (totalSleep * 60_000) / 2);
  const endAt = new Date(midnight.getTime() + (totalSleep * 60_000) / 2);

  const row = {
    user_id: userId,
    source: "ultrahuman",
    provider_session_id: `uh-${date}`,
    night_date: nightDate,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    duration_minutes: totalSleep,
    time_in_bed_minutes: toInt(m.time_in_bed),
    sleep_score: clampScore(m.sleep_score),
    deep_minutes: toInt(m.deep_sleep),
    rem_minutes: toInt(m.rem_sleep),
    light_minutes: toInt(m.light_sleep),
    awake_minutes: toInt(m.awake),
    hrv_ms: toNum(m.avg_sleep_hrv),
    resting_hr_bpm: toInt(m.sleep_rhr),
    respiratory_rate: null, // UH doesn't surface this directly
  };

  // Dedup on (user, source, provider_session_id) — one row per night.
  const { data: existing } = await admin
    .from("sleep_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "ultrahuman")
    .eq("provider_session_id", row.provider_session_id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("sleep_sessions")
      .update(row)
      .eq("id", existing.id);
    return !error;
  }
  const { error } = await admin.from("sleep_sessions").insert(row);
  return !error;
}

async function upsertRecovery(
  admin: SupabaseClient,
  userId: string,
  date: string,
  m: UltrahumanDailyMetrics
): Promise<boolean> {
  const score = clampScore(m.recovery_index);
  if (score == null) return false;

  const row = {
    user_id: userId,
    source: "ultrahuman",
    day: date,
    score,
    band: bandForScore(score),
    hrv_ms: toNum(m.avg_sleep_hrv),
    resting_hr_bpm: toInt(m.sleep_rhr),
  };

  const { error } = await admin
    .from("recovery_scores")
    .upsert(row, { onConflict: "user_id,source,day" });
  return !error;
}

async function upsertGlucose(
  admin: SupabaseClient,
  userId: string,
  date: string,
  m: UltrahumanDailyMetrics
): Promise<boolean> {
  const avg = toNum(m.average_glucose);
  // Only insert when we actually have CGM data — most users won't.
  if (avg == null) return false;

  const row = {
    user_id: userId,
    source: "ultrahuman",
    day: date,
    average_glucose_mgdl: avg,
    glucose_variability_pct: toNum(m.glucose_variability),
    time_in_target_pct: toNum(m.time_in_target),
    hba1c_estimated: toNum(m.hba1c),
    metabolic_score: clampScore(m.metabolic_score),
  };

  const { error } = await admin
    .from("glucose_daily")
    .upsert(row, { onConflict: "user_id,source,day" });
  return !error;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampScore(v: unknown): number | null {
  const n = toInt(v);
  if (n == null) return null;
  return Math.max(0, Math.min(100, n));
}
