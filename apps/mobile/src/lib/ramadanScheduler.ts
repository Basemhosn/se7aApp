import * as Notifications from "expo-notifications";
import type { RamadanStatus } from "./useRamadan";

/**
 * Schedule local push notifications for iftar and suhoor across the
 * remaining Ramadan days. Uses expo-notifications' DATE trigger, one
 * scheduled notification per day per reminder — expires naturally
 * after the last day so no ongoing daily-repeat cleanup is needed.
 *
 * Idempotent: cancels any prior SE7A Ramadan reminders (identified by
 * data.kind='ramadan_reminder') before scheduling fresh ones, so this
 * is safe to call whenever prefs or Ramadan state might have changed.
 *
 * No-ops silently if:
 *   - Ramadan isn't active
 *   - Both reminder prefs are off
 *   - Notification permissions haven't been granted (permissions come
 *     from the existing push registration flow; we don't re-prompt)
 */
export async function rescheduleRamadanReminders(
  status: RamadanStatus | null
): Promise<{ scheduled: number }> {
  await cancelRamadanReminders();

  if (
    !status ||
    !status.active ||
    !status.today ||
    (!status.prefs.suhoor_reminder && !status.prefs.iftar_reminder)
  ) {
    return { scheduled: 0 };
  }

  const daysLeft = status.days_left ?? 0;
  if (daysLeft <= 0) return { scheduled: 0 };

  const [fh, fm] = status.today.fajr.split(":").map(Number);
  const [mh, mm] = status.today.maghrib.split(":").map(Number);
  if (
    fh === undefined ||
    fm === undefined ||
    mh === undefined ||
    mm === undefined
  ) {
    return { scheduled: 0 };
  }

  const minLeadMs = 60_000; // don't schedule fire times < 1 minute out
  const now = new Date();
  let scheduled = 0;

  for (let i = 0; i < daysLeft; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);

    if (status.prefs.iftar_reminder) {
      const iftar = new Date(day);
      // Fire 10 min before maghrib (handles negative-minute rollover
      // via JS Date normalization).
      iftar.setHours(mh, mm - 10, 0, 0);
      if (iftar.getTime() > now.getTime() + minLeadMs) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Iftar in 10 minutes 🌙",
            body: "Break your fast with dates + water, then a protein-forward main.",
            sound: "default",
            data: { kind: "ramadan_reminder", type: "iftar" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: iftar,
          },
        });
        scheduled += 1;
      }
    }

    if (status.prefs.suhoor_reminder) {
      const suhoor = new Date(day);
      // Fire 15 min before fajr — enough runway to eat + hydrate before
      // the fasting window opens.
      suhoor.setHours(fh, fm - 15, 0, 0);
      if (suhoor.getTime() > now.getTime() + minLeadMs) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Suhoor closes in 15 min 🌅",
            body: "Last window to eat + hydrate before fajr. Aim for slow carbs and protein.",
            sound: "default",
            data: { kind: "ramadan_reminder", type: "suhoor" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: suhoor,
          },
        });
        scheduled += 1;
      }
    }
  }

  return { scheduled };
}

export async function cancelRamadanReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const data = n.content.data as { kind?: string } | null | undefined;
      if (data?.kind === "ramadan_reminder") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    /* permissions denied or scheduler unavailable — silent no-op */
  }
}
