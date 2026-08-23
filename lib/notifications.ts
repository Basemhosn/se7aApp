import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Expo push wrappers + local-time helpers used by the notifications cron
 * and event-driven pushes (PR celebration).
 *
 * Design:
 * - Every push goes through `sendNotifications` so we can batch (Expo
 *   caps at 100 messages per HTTP call) and swallow individual token
 *   failures without failing the batch.
 * - Every send is idempotent per (user_id, kind, day_key) via the
 *   notifications_sent table. If your caller doesn't specify a day_key
 *   we default to the user's *local* date, which is what "once per day"
 *   means to a human.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean>;
  sound?: "default";
}

export async function sendExpoPush(messages: PushMessage[]): Promise<unknown[]> {
  if (messages.length === 0) return [];
  const responses: unknown[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE).map((m) => ({
      ...m,
      sound: m.sound ?? "default",
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      const json = await res.json().catch(() => null);
      responses.push(json);
    } catch (e) {
      responses.push({ error: String((e as Error).message ?? e) });
    }
  }
  return responses;
}

/**
 * Check-and-set dedupe. Returns true if this is the first send for this
 * (user, kind, day_key) — caller should push. Returns false if it was
 * already sent — caller should skip.
 */
export async function claimNotification(
  admin: SupabaseClient,
  userId: string,
  kind: string,
  dayKey: string
): Promise<boolean> {
  const { error } = await admin.from("notifications_sent").insert({
    user_id: userId,
    kind,
    day_key: dayKey,
  });
  if (!error) return true;
  // 23505 = unique_violation → already sent, skip
  if ((error as { code?: string }).code === "23505") return false;
  // Other errors: don't send — avoid double-firing when the log itself
  // is broken.
  return false;
}

// Re-export from the canonical location for backward compat with
// callers that still import localDayKey from "@/lib/notifications".
export { localDayKey } from "./dateKeys";

/** Local hour 0–23 for the given user timezone. */
export function localHour(d: Date, tzOffsetMin: number): number {
  const shifted = new Date(d.getTime() + tzOffsetMin * 60_000);
  return shifted.getUTCHours();
}

/** Local weekday 0–6 with Monday = 0. */
export function localWeekdayMonZero(d: Date, tzOffsetMin: number): number {
  const shifted = new Date(d.getTime() + tzOffsetMin * 60_000);
  return (shifted.getUTCDay() + 6) % 7;
}

/**
 * Fetch every push token grouped by user, so callers can decide per-user
 * whether to send (based on prefs) then flatten into one message list.
 */
export interface TokenRow {
  user_id: string;
  expo_token: string;
  platform: "ios" | "android";
}

export async function loadTokensByUser(
  admin: SupabaseClient
): Promise<Map<string, TokenRow[]>> {
  const { data } = await admin
    .from("push_tokens")
    .select("user_id, expo_token, platform");
  const byUser = new Map<string, TokenRow[]>();
  for (const row of (data ?? []) as TokenRow[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }
  return byUser;
}
