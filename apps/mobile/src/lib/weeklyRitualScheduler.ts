import * as Notifications from "expo-notifications";
import i18n from "./i18n";

/**
 * Schedule the two weekly ritual push notifications that anchor SE7A's
 * retention loop:
 *   1. Sunday 18:00 local — Weekly Wrapped (recap of the past 7 days)
 *   2. Monday   09:00 local — Weekly Plan Review (Week X of N)
 *
 * Uses expo-notifications' WEEKLY trigger, which recurs indefinitely
 * on the device with no server involvement — critical because Vercel
 * Hobby tier caps us at daily crons.
 *
 * Idempotent: cancels any prior weekly_ritual reminders before
 * scheduling fresh ones, so this is safe to call on every app boot
 * (from RootLayout) without accumulating duplicates.
 *
 * No-ops silently if:
 *   - Notification permissions haven't been granted (permission comes
 *     from the existing push registration flow; we don't re-prompt)
 *   - The scheduler API is unavailable (Simulator, Expo Go without
 *     dev-client, etc.)
 *
 * Copy is intentionally generic (no "Week 4 of 13" in the title,
 * because that state drifts weekly and updating scheduled
 * notifications is fragile). Personalized content renders when the
 * user taps in and lands on /weekly-wrapped or /report.
 */
export async function rescheduleWeeklyRituals(): Promise<{
  scheduled: number;
}> {
  await cancelWeeklyRituals();

  try {
    // Only schedule if the user actually has permission; otherwise
    // the calls succeed but nothing fires, which is silently confusing.
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return { scheduled: 0 };

    const t = i18n.t.bind(i18n);

    // WEEKLY trigger: iOS calendar convention has weekday 1=Sunday,
    // 2=Monday, ... 7=Saturday. expo-notifications passes this through
    // to the native scheduler unchanged. WEEKLY recurs indefinitely.
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t("notifications.weekly_wrapped.title"),
        body: t("notifications.weekly_wrapped.body"),
        sound: "default",
        data: {
          kind: "weekly_ritual",
          type: "wrapped",
          route: "/weekly-wrapped",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Sunday
        hour: 18,
        minute: 0,
      },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: t("notifications.weekly_summary.title"),
        body: t("notifications.weekly_summary.body"),
        sound: "default",
        data: {
          kind: "weekly_ritual",
          type: "summary",
          route: "/report",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday
        hour: 9,
        minute: 0,
      },
    });

    return { scheduled: 2 };
  } catch {
    return { scheduled: 0 };
  }
}

export async function cancelWeeklyRituals(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const data = n.content.data as { kind?: string } | null | undefined;
      if (data?.kind === "weekly_ritual") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    /* permissions denied or scheduler unavailable — silent no-op */
  }
}
