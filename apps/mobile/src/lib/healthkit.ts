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
      // react-native-health returns weight in grams when unit='gram'.
      // Some versions return kg; guard against both.
      const raw = Number(val.value);
      if (!Number.isFinite(raw) || raw <= 0) return resolve(null);
      const weight_kg = raw > 500 ? raw / 1000 : raw; // grams path
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

/**
 * Read step count for today (midnight → now).
 */
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

/**
 * Write a weight sample back to HealthKit when the user logs one in SE7A.
 * Fire-and-forget — a failure just means the sync direction is one-way for
 * that entry.
 */
export function writeWeightKg(weight_kg: number): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  return new Promise((resolve) => {
    const opts: HealthValueOptions = {
      value: weight_kg * 1000, // grams
      unit: "gram" as HealthUnit,
    };
    AppleHealthKit.saveWeight(opts, () => resolve());
  });
}
