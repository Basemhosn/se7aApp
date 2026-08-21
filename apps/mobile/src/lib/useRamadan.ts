import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import {
  cancelRamadanReminders,
  rescheduleRamadanReminders,
} from "./ramadanScheduler";

export interface RamadanStatus {
  active: boolean;
  hijri_year: number | null;
  day_num: number | null;
  total_days: number | null;
  days_left: number | null;
  today: {
    fajr: string;
    maghrib: string;
    in_fast_window: boolean;
    seconds_until_maghrib: number | null;
    seconds_until_fajr: number | null;
  } | null;
  next_ramadan_start: string | null;
  prefs: {
    auto_detect: boolean;
    enabled_override: boolean | null;
    fajr_time: string;
    maghrib_time: string;
    suhoor_reminder: boolean;
    iftar_reminder: boolean;
  };
}

/**
 * Hook that fetches + returns the user's Ramadan status. Refetches when
 * the app comes back to the foreground so the countdown stays accurate
 * after long backgrounds. The consumer decides how to render — a
 * seconds-level ticker should be a local setInterval on top of the
 * returned `today.seconds_until_maghrib` seed value.
 */
export function useRamadan() {
  const [status, setStatus] = useState<RamadanStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<RamadanStatus>("/api/ramadan/status");
      setStatus(res);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => sub.remove();
  }, [load]);

  return { status, refresh: load };
}

/**
 * Keeps local iftar/suhoor push notifications in sync with the user's
 * Ramadan status. Idempotent — safe to re-run whenever prefs or the
 * active window change. Also clears reminders on unmount to avoid
 * stale schedules if the user signs out while Ramadan is active.
 */
export function useRamadanScheduling(status: RamadanStatus | null) {
  // Reduce the status to just the fields that affect scheduling so we
  // don't re-run for cosmetic changes like the seconds_until_maghrib
  // ticker.
  const sig = status
    ? [
        status.active ? 1 : 0,
        status.days_left ?? 0,
        status.today?.fajr ?? "",
        status.today?.maghrib ?? "",
        status.prefs.suhoor_reminder ? 1 : 0,
        status.prefs.iftar_reminder ? 1 : 0,
      ].join("|")
    : "";

  useEffect(() => {
    rescheduleRamadanReminders(status).catch(() => {
      /* silent — scheduler already swallows expected failures */
    });
    return () => {
      /* nothing on dep-change unmount; the next reschedule cancels
         stale entries before writing new ones */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    return () => {
      // Full unmount (e.g. sign-out) — clear all scheduled reminders.
      cancelRamadanReminders().catch(() => {});
    };
  }, []);
}
