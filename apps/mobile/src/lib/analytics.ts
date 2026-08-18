/**
 * TEMPORARY STUB — posthog-react-native removed for TestFlight launch
 * bisect. All exports here are no-ops so callers don't need to change.
 * Restore this file to its git history state once we identify + patch
 * the crash cause and re-add PostHog.
 */

type Props = Record<string, string | number | boolean | null>;

export function initAnalytics() {
  /* no-op */
}
export function identify(_userId: string, _props?: Props) {
  /* no-op */
}
export function track(_event: EventName, _props?: Props) {
  /* no-op */
}
export function resetAnalytics() {
  /* no-op */
}

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
