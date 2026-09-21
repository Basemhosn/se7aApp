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
    case "trial_expiring":
      return "/paywall";
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
    | {
        kind?: string;
        deeplink?: string;
        scan_id?: string;
        scan_kind?: string;
      }
    | undefined;
  // Prefer an explicit deeplink field (used for any future ad-hoc route)
  // over the kind-based lookup.
  const deeplink = raw?.deeplink;
  if (deeplink && typeof deeplink === "string" && deeplink.startsWith("/")) {
    router.push(deeplink as never);
    return;
  }
  const kind = raw?.kind;
  if (!kind || typeof kind !== "string") return;
  // scan_ready/scan_failed carry a scan_id + scan_kind in data.
  // Route by kind: plate/menu/body have their own review screens.
  // Menu + body currently open the picker on cold-start (they don't
  // have a scan_id-hydrated review path yet); plate hydrates fully.
  if ((kind === "scan_ready" || kind === "scan_failed") && raw?.scan_id) {
    const scanKind = raw.scan_kind === "menu"
      ? "menu"
      : raw.scan_kind === "body"
        ? "body"
        : "plate";
    if (scanKind === "plate") {
      router.push(
        `/scan/plate?scan_id=${encodeURIComponent(raw.scan_id)}` as never
      );
    } else {
      // Menu/body: open the scanner. Follow-up work: hydrate from
      // scan_id like plate does — needs each screen to load the
      // completed row and populate state before showing the picker.
      router.push(`/scan/${scanKind}` as never);
    }
    return;
  }
  const path = routeForKind(kind);
  if (!path) return;
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
