import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "./api";

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
