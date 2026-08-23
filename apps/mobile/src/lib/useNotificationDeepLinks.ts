import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

/**
 * Notification tap → route mapping. Called from the Home tab (where
 * we know auth has resolved), so it handles both:
 *
 *   - Cold-start: user taps a notification, app launches, we read
 *     the last response via getLastNotificationResponseAsync and
 *     navigate as soon as Home mounts. Small race here (Home paints
 *     for a frame before the navigate fires), but low enough that
 *     the extra layout complexity to hoist this into _layout isn't
 *     worth it
 *
 *   - Warm-tap: user taps while the app is running (backgrounded or
 *     foreground). addNotificationResponseReceivedListener fires,
 *     we navigate straight away
 *
 * Also sets the foreground handler so pushes actually surface when
 * the app is open — Expo's default is to swallow them silently, which
 * looks like a bug to users who expect to see an incoming iftar
 * reminder while they're checking their day.
 *
 * Unknown kinds fall through to no-op (stay on the current screen).
 */

// Set once at module load — Expo docs recommend this outside the hook
// so it's registered before the first push arrives.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert is the pre-SDK-52 field; shouldShowBanner +
    // shouldShowList replaced it. Keep both so the handler validates
    // against whichever NotificationBehavior version is installed.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function routeForKind(kind: string): string | null {
  switch (kind) {
    case "weekly_wrapped":
      return "/weekly-wrapped";
    case "plan_your_week":
      return "/meal-plan";
    case "weigh_in":
      // Progress tab hosts the weigh-in form.
      return "/progress";
    case "lunch_nudge":
      return "/manual-meal";
    case "streak_at_risk":
    case "ramadan_reminder":
      // Home already surfaces the right affordance (QuickLogFab for
      // streak, ramadan banner countdown). Deep-link is a no-op —
      // just opening the app is the point.
      return null;
    default:
      return null;
  }
}

function handleResponse(
  response: Notifications.NotificationResponse | null | undefined
) {
  const raw = response?.notification.request.content.data as
    | { kind?: string }
    | undefined;
  const kind = raw?.kind;
  if (!kind || typeof kind !== "string") return;
  const path = routeForKind(kind);
  if (!path) return;
  // expo-router accepts any string path at runtime; the typed-routes
  // assertion is scoped to author-time. Small `as any` here rather
  // than plumbing every route through the type union.
  router.push(path as never);
}

export function useNotificationDeepLinks() {
  useEffect(() => {
    // Cold-start: was the app opened by tapping a notification?
    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {});

    // Warm-tap: user taps while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener(
      handleResponse
    );
    return () => sub.remove();
  }, []);
}
