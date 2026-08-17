import PostHog from "posthog-react-native";

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let ph: PostHog | null = null;

/**
 * Initialize PostHog once at app boot. No-op if the env var isn't set —
 * lets local dev + first-run states work without an analytics backend.
 */
export function initAnalytics() {
  if (!API_KEY || ph) return;
  ph = new PostHog(API_KEY, {
    host: HOST,
    // We don't want session recording by default — user privacy first.
    // Enable per-flag if needed later.
    enableSessionReplay: false,
  });
}

/**
 * Identify the current user with PostHog so events tie to a stable ID.
 * Pass minimal properties — no PII beyond the Supabase user_id (which
 * is not PII on its own).
 */
type Props = Record<string, string | number | boolean | null>;

export function identify(userId: string, props?: Props) {
  ph?.identify(userId, props);
}

/**
 * Fire an event. All calls are no-ops until initAnalytics() has run
 * with a real API key. Safe to call anywhere.
 */
export function track(event: EventName, props?: Props) {
  ph?.capture(event, props);
}

export function resetAnalytics() {
  ph?.reset();
}

/**
 * Enumerated event names — keeps taxonomy from drifting via typos.
 * When you need a new event, add it here first.
 */
export type EventName =
  | "app_opened"
  | "signup_completed"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_abandoned"
  | "scan_started"
  | "scan_completed"
  | "scan_rate_limited"
  | "meal_logged"
  | "manual_meal_logged"
  | "recent_meal_relogged"
  | "workout_started"
  | "workout_completed"
  | "weight_logged"
  | "water_added"
  | "coach_message_sent"
  | "coach_reply_received"
  | "fast_started"
  | "fast_ended"
  | "program_picked"
  | "program_changed"
  | "referral_shared"
  | "referral_attributed"
  | "account_deleted"
  | "language_changed";
