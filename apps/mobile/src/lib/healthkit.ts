import { Platform } from "react-native";
import AppleHealthKit, {
  type HealthInputOptions,
  type HealthKitPermissions,
  type HealthUnit,
  type HealthValue,
  type HealthValueOptions,
} from "react-native-health";

const P = AppleHealthKit.Constants.Permissions;

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      P.Weight,
      P.BodyFatPercentage,
      P.Workout,
      P.StepCount,
      P.ActiveEnergyBurned,
      P.HeartRate,
      P.DistanceWalkingRunning,
      P.DistanceCycling,
      P.SleepAnalysis,
    ],
    write: [P.Weight, P.BodyFatPercentage],
  },
};

/**
 * Request HealthKit read/write auth. iOS-only; no-op on Android. Resolves
 * true if the user granted (or already granted) — HealthKit deliberately
 * doesn't tell us if they denied, so `true` means "asked; proceed".
 */
export function requestHealthKitAuth(): Promise<boolean> {
  if (Platform.OS !== "ios") return Promise.resolve(false);
  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => {
      if (err) resolve(false);
      else resolve(true);
    });
  });
}

/**
 * Read the most recent weight sample (kg). Returns null if HealthKit has
 * no data or auth was denied.
 */
export function readLatestWeightKg(): Promise<{
  weight_kg: number;
  measured_at: string;
} | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  return new Promise((resolve) => {
    const opts: HealthInputOptions = { unit: "gram" as HealthUnit };
    AppleHealthKit.getLatestWeight(opts, (err, res) => {
      if (err || !res) return resolve(null);
      const val = res as unknown as HealthValue & { endDate: string };
      const raw = Number(val.value);
      if (!Number.isFinite(raw) || raw <= 0) return resolve(null);
      const weight_kg = raw > 500 ? raw / 1000 : raw;
      resolve({
        weight_kg: Math.round(weight_kg * 10) / 10,
        measured_at: val.endDate,
      });
    });
  });
}

/**
 * Read the most recent body-fat percentage sample. HealthKit stores as a
 * fraction (0.15 = 15%); we return the percent.
 */
export function readLatestBodyFatPct(): Promise<{
  body_fat_pct: number;
  measured_at: string;
} | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  return new Promise((resolve) => {
    AppleHealthKit.getLatestBodyFatPercentage({}, (err, res) => {
      if (err || !res) return resolve(null);
      const val = res as unknown as HealthValue & { endDate: string };
      const raw = Number(val.value);
      if (!Number.isFinite(raw)) return resolve(null);
      const pct = raw < 1 ? raw * 100 : raw;
      resolve({
        body_fat_pct: Math.round(pct * 10) / 10,
        measured_at: val.endDate,
      });
    });
  });
}

/** Read step count for today (midnight → now). */
export function readTodaySteps(): Promise<number> {
  if (Platform.OS !== "ios") return Promise.resolve(0);
  return new Promise((resolve) => {
    const opts: HealthInputOptions = {
      date: new Date().toISOString(),
      includeManuallyAdded: true,
    };
    AppleHealthKit.getStepCount(opts, (err, res) => {
      if (err || !res) return resolve(0);
      resolve(Math.round(Number((res as unknown as HealthValue).value) || 0));
    });
  });
}

/** Read active energy burned today (kcal), midnight → now. */
export function readTodayActiveEnergy(): Promise<number> {
  if (Platform.OS !== "ios") return Promise.resolve(0);
  return new Promise((resolve) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const opts: HealthInputOptions = {
      startDate: startOfDay.toISOString(),
      endDate: new Date().toISOString(),
      ascending: true,
      includeManuallyAdded: true,
    };
    // getActiveEnergyBurned returns an array of samples; we sum them up.
    AppleHealthKit.getActiveEnergyBurned(opts, (err, samples) => {
      if (err || !samples) return resolve(0);
      const total = (samples as unknown as HealthValue[]).reduce(
        (s, v) => s + (Number(v.value) || 0),
        0
      );
      resolve(Math.round(total));
    });
  });
}

/**
 * Read cardio workouts from HealthKit since the given ISO datetime.
 * Maps Apple's `activityName` (e.g. "Running", "Cycling") into SE7A's
 * kind enum (run/ride/etc). Samples we can't map fall to "other".
 */
export interface HkWorkout {
  hk_uuid: string;
  kind:
    | "run"
    | "walk"
    | "ride"
    | "swim"
    | "row"
    | "elliptical"
    | "hike"
    | "other";
  started_at: string;
  duration_min: number;
  distance_km: number | null;
  kcal_burned: number | null;
  avg_hr: number | null;
}

export function readWorkoutsSince(sinceIso: string): Promise<HkWorkout[]> {
  if (Platform.OS !== "ios") return Promise.resolve([]);
  return new Promise((resolve) => {
    const opts: HealthInputOptions = {
      startDate: sinceIso,
      endDate: new Date().toISOString(),
      ascending: true,
    };
    AppleHealthKit.getSamples(
      { ...opts, type: "Workout" } as HealthInputOptions,
      (err, samples) => {
        if (err || !samples) return resolve([]);
        const list = samples as unknown as {
          id: string;
          activityName?: string;
          activityId?: number;
          calories?: number;
          distance?: number; // meters
          startDate: string;
          endDate: string;
          metadata?: { HKAverageHeartRate?: number };
        }[];
        const mapped: HkWorkout[] = list.map((w) => ({
          hk_uuid: w.id,
          kind: mapActivityKind(w.activityName ?? ""),
          started_at: w.startDate,
          duration_min: Math.round(
            (new Date(w.endDate).getTime() -
              new Date(w.startDate).getTime()) /
              60_000
          ),
          distance_km:
            typeof w.distance === "number" && w.distance > 0
              ? Math.round((w.distance / 1000) * 100) / 100
              : null,
          kcal_burned:
            typeof w.calories === "number"
              ? Math.round(w.calories)
              : null,
          avg_hr:
            typeof w.metadata?.HKAverageHeartRate === "number"
              ? Math.round(w.metadata.HKAverageHeartRate)
              : null,
        }));
        resolve(mapped);
      }
    );
  });
}

function mapActivityKind(name: string): HkWorkout["kind"] {
  const n = name.toLowerCase();
  if (n.includes("run")) return "run";
  if (n.includes("walk")) return "walk";
  if (n.includes("hike")) return "hike";
  if (n.includes("cycl") || n.includes("bike") || n.includes("ride"))
    return "ride";
  if (n.includes("swim")) return "swim";
  if (n.includes("row")) return "row";
  if (n.includes("elliptical")) return "elliptical";
  return "other";
}

export interface HkSleep {
  hk_uuid: string; // synthesized session ID (see buildSession)
  night_date: string; // YYYY-MM-DD, anchored to wake date
  start_at: string;
  end_at: string;
  duration_minutes: number;
  time_in_bed_minutes: number;
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
}

interface HkSleepSample {
  id?: string;
  startDate: string;
  endDate: string;
  sourceId?: string;
  sourceName?: string;
  value: string; // "INBED" | "ASLEEP" | "CORE" | "DEEP" | "REM" | "AWAKE" | "UNSPECIFIED"
}

const MIN_MAIN_SLEEP_MINUTES = 30; // filter naps; main-sleep only

/**
 * Read sleep sessions since the given ISO datetime and roll HealthKit's
 * flat sample stream (InBed / stage / Awake, one row per stretch) into
 * one session per night per source.
 *
 * Grouping rules — HealthKit doesn't have a native "session" concept:
 *   - Bucket samples by sourceId first (an Apple Watch and a Whoop
 *     mirror both write to HK; keep them separate rather than mashing
 *     their overlapping samples into one artificially long night)
 *   - Within a source, start a new session when the gap between the
 *     previous session's max endDate and the next sample's startDate
 *     exceeds 60 min. Anything shorter is treated as the same session
 *   - Filter sessions < 30 min (naps, accidental InBed logs)
 *
 * Session dedupe ID is deterministic (`sourceId:startTimestamp`) so
 * repeat syncs upsert cleanly on (user, source, provider_session_id).
 */
export function readSleepSessionsSince(sinceIso: string): Promise<HkSleep[]> {
  if (Platform.OS !== "ios") return Promise.resolve([]);
  return new Promise((resolve) => {
    const opts: HealthInputOptions = {
      startDate: sinceIso,
      endDate: new Date().toISOString(),
      ascending: true,
    };
    AppleHealthKit.getSleepSamples(opts, (err, samples) => {
      if (err || !samples) return resolve([]);
      resolve(groupSleepSessions(samples as unknown as HkSleepSample[]));
    });
  });
}

function groupSleepSessions(samples: HkSleepSample[]): HkSleep[] {
  const bySource = new Map<string, HkSleepSample[]>();
  for (const s of samples) {
    const key = s.sourceId ?? "unknown";
    const list = bySource.get(key) ?? [];
    list.push(s);
    bySource.set(key, list);
  }

  const gapMs = 60 * 60 * 1000;
  const out: HkSleep[] = [];
  for (const [sourceId, list] of bySource) {
    list.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    let bucket: HkSleepSample[] = [];
    const flush = () => {
      if (bucket.length === 0) return;
      const session = buildSleepSession(sourceId, bucket);
      if (session) out.push(session);
      bucket = [];
    };
    for (const s of list) {
      if (bucket.length === 0) {
        bucket.push(s);
        continue;
      }
      const lastEnd = Math.max(
        ...bucket.map((b) => new Date(b.endDate).getTime())
      );
      const startMs = new Date(s.startDate).getTime();
      if (startMs - lastEnd > gapMs) {
        flush();
        bucket.push(s);
      } else {
        bucket.push(s);
      }
    }
    flush();
  }
  return out;
}

function buildSleepSession(
  sourceId: string,
  samples: HkSleepSample[]
): HkSleep | null {
  const startMs = Math.min(
    ...samples.map((s) => new Date(s.startDate).getTime())
  );
  const endMs = Math.max(...samples.map((s) => new Date(s.endDate).getTime()));
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return null;

  let deepMs = 0;
  let remMs = 0;
  let coreMs = 0;
  let awakeMs = 0;
  let asleepMs = 0; // legacy ASLEEP / UNSPECIFIED
  let inBedMs = 0;

  for (const s of samples) {
    const sms =
      new Date(s.endDate).getTime() - new Date(s.startDate).getTime();
    if (sms <= 0) continue;
    switch (s.value) {
      case "DEEP":
        deepMs += sms;
        break;
      case "REM":
        remMs += sms;
        break;
      case "CORE":
        coreMs += sms;
        break;
      case "AWAKE":
        awakeMs += sms;
        break;
      case "ASLEEP":
      case "UNSPECIFIED":
        asleepMs += sms;
        break;
      case "INBED":
        inBedMs += sms;
        break;
    }
  }

  const stageTotal = deepMs + remMs + coreMs;
  const hasStages = stageTotal > 0;
  // Prefer summed stage minutes when we have them (iOS 16+ Apple Watch),
  // otherwise fall back to the legacy ASLEEP samples, and only if
  // neither exists infer duration from InBed minus Awake.
  const asleepChosenMs = hasStages
    ? stageTotal
    : asleepMs > 0
      ? asleepMs
      : Math.max(0, (inBedMs > 0 ? inBedMs : spanMs) - awakeMs);
  const durationMinutes = Math.round(asleepChosenMs / 60_000);
  if (durationMinutes < MIN_MAIN_SLEEP_MINUTES) return null;

  const wake = new Date(endMs);
  const nightDate = `${wake.getFullYear()}-${String(wake.getMonth() + 1).padStart(2, "0")}-${String(wake.getDate()).padStart(2, "0")}`;

  return {
    hk_uuid: `${sourceId}:${startMs}`,
    night_date: nightDate,
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    duration_minutes: durationMinutes,
    time_in_bed_minutes: Math.round(
      (inBedMs > 0 ? inBedMs : spanMs) / 60_000
    ),
    deep_minutes: hasStages ? Math.round(deepMs / 60_000) : null,
    rem_minutes: hasStages ? Math.round(remMs / 60_000) : null,
    light_minutes: hasStages ? Math.round(coreMs / 60_000) : null,
    awake_minutes: awakeMs > 0 ? Math.round(awakeMs / 60_000) : null,
  };
}

/** Write a weight sample back to HealthKit when the user logs one. */
export function writeWeightKg(weight_kg: number): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  return new Promise((resolve) => {
    const opts: HealthValueOptions = {
      value: weight_kg * 1000,
      unit: "gram" as HealthUnit,
    };
    AppleHealthKit.saveWeight(opts, () => resolve());
  });
}
