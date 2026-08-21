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
