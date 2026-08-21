/**
 * Ramadan detection + status.
 *
 * Ramadan dates are approximate — the actual first day depends on moon
 * sighting and can vary by ±1 day between countries. We use commonly-
 * accepted Gulf dates. Users can force enable/disable via profile
 * ramadan_prefs.enabled_override.
 *
 * Dates cover Ramadan 1447 AH (2026) → Ramadan 1456 AH (2035) to give
 * us ~10 years of runway. Extend when this table is close to running
 * out (mid 2033ish is a good re-check point).
 */

export interface RamadanRange {
  hijri_year: number;
  start: string; // YYYY-MM-DD, first day of fasting (Gregorian)
  end: string; // YYYY-MM-DD, last day of fasting (Gregorian, inclusive)
}

export const RAMADAN_DATES: RamadanRange[] = [
  { hijri_year: 1447, start: "2026-02-18", end: "2026-03-19" },
  { hijri_year: 1448, start: "2027-02-07", end: "2027-03-08" },
  { hijri_year: 1449, start: "2028-01-28", end: "2028-02-26" },
  { hijri_year: 1450, start: "2029-01-16", end: "2029-02-14" },
  { hijri_year: 1451, start: "2030-01-05", end: "2030-02-03" },
  { hijri_year: 1452, start: "2030-12-26", end: "2031-01-24" },
  { hijri_year: 1453, start: "2031-12-15", end: "2032-01-13" },
  { hijri_year: 1454, start: "2032-12-04", end: "2033-01-02" },
  { hijri_year: 1455, start: "2033-11-23", end: "2033-12-22" },
  { hijri_year: 1456, start: "2034-11-13", end: "2034-12-12" },
];

export interface RamadanPrefs {
  auto_detect: boolean;
  enabled_override: boolean | null;
  fajr_time: string; // "HH:MM"
  maghrib_time: string; // "HH:MM"
  suhoor_reminder: boolean;
  iftar_reminder: boolean;
}

export const DEFAULT_RAMADAN_PREFS: RamadanPrefs = {
  auto_detect: true,
  enabled_override: null,
  fajr_time: "04:30",
  maghrib_time: "18:45",
  suhoor_reminder: true,
  iftar_reminder: true,
};

/**
 * Which Ramadan window contains the given date, if any?
 * Returns the range + day number (1-based) + total days.
 */
export function findRamadanFor(
  date: Date
): { range: RamadanRange; day_num: number; total_days: number } | null {
  const iso = fmtIso(date);
  const range = RAMADAN_DATES.find((r) => iso >= r.start && iso <= r.end);
  if (!range) return null;
  const start = dateFromIso(range.start);
  const end = dateFromIso(range.end);
  const total_days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const day_num = Math.round((date.getTime() - start.getTime()) / 86_400_000) + 1;
  return { range, day_num: Math.max(1, Math.min(total_days, day_num)), total_days };
}

/**
 * Resolve whether Ramadan mode is active for a user right now, taking
 * their auto_detect + override preferences into account.
 */
export function isRamadanActiveForPrefs(
  prefs: RamadanPrefs,
  now: Date = new Date()
): boolean {
  if (prefs.auto_detect === false) return !!prefs.enabled_override;
  if (prefs.enabled_override !== null && prefs.enabled_override !== undefined) {
    return !!prefs.enabled_override;
  }
  return findRamadanFor(now) !== null;
}

/**
 * Combined status for the mobile /api/ramadan/status endpoint.
 */
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
  prefs: RamadanPrefs;
}

export function computeStatus(
  prefsRaw: Partial<RamadanPrefs> | null | undefined,
  now: Date = new Date()
): RamadanStatus {
  const prefs: RamadanPrefs = { ...DEFAULT_RAMADAN_PREFS, ...(prefsRaw ?? {}) };
  const window = findRamadanFor(now);
  const active = isRamadanActiveForPrefs(prefs, now);
  const nextStart =
    RAMADAN_DATES.find((r) => r.start > fmtIso(now))?.start ?? null;

  if (!active || !window) {
    return {
      active,
      hijri_year: window?.range.hijri_year ?? null,
      day_num: window?.day_num ?? null,
      total_days: window?.total_days ?? null,
      days_left: window ? window.total_days - window.day_num + 1 : null,
      today: null,
      next_ramadan_start: nextStart,
      prefs,
    };
  }

  const fajr = todayAtLocalTime(prefs.fajr_time, now);
  let maghrib = todayAtLocalTime(prefs.maghrib_time, now);
  // If maghrib for today has already passed, seconds_until_maghrib
  // rolls forward to tomorrow so the UI counts down to the next iftar.
  if (maghrib.getTime() <= now.getTime()) {
    maghrib = new Date(maghrib.getTime() + 24 * 3600 * 1000);
  }
  let fajrNext = fajr;
  if (fajrNext.getTime() <= now.getTime()) {
    fajrNext = new Date(fajrNext.getTime() + 24 * 3600 * 1000);
  }

  const in_fast_window =
    now.getTime() >= todayAtLocalTime(prefs.fajr_time, now).getTime() &&
    now.getTime() < todayAtLocalTime(prefs.maghrib_time, now).getTime();

  return {
    active: true,
    hijri_year: window.range.hijri_year,
    day_num: window.day_num,
    total_days: window.total_days,
    days_left: window.total_days - window.day_num + 1,
    today: {
      fajr: prefs.fajr_time,
      maghrib: prefs.maghrib_time,
      in_fast_window,
      seconds_until_maghrib: Math.max(
        0,
        Math.round((maghrib.getTime() - now.getTime()) / 1000)
      ),
      seconds_until_fajr: Math.max(
        0,
        Math.round((fajrNext.getTime() - now.getTime()) / 1000)
      ),
    },
    next_ramadan_start: nextStart,
    prefs,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function todayAtLocalTime(hhmm: string, base: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}
