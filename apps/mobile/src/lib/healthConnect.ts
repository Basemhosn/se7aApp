import { Platform } from "react-native";
import {
  ExerciseType,
  SdkAvailabilityStatus,
  SleepStageType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  type Permission,
} from "react-native-health-connect";

/**
 * Android Health Connect client — mirrors the healthkit.ts API on iOS
 * so `useHealthSync` can dispatch by platform without caring which
 * store is behind it.
 *
 * Health Connect is native on Android 14+ (API 34). On 13 and below,
 * the user has to install the Health Connect app from the Play Store.
 * `getSdkStatus` tells us where we stand — we no-op silently when the
 * SDK isn't available rather than nagging users.
 *
 * Permission model: unlike HealthKit's initHealthKit-then-you-know,
 * Health Connect grants are per-recordType. We request them all up
 * front and then check `getGrantedPermissions` before each read.
 * Denied reads return null/empty arrays, not errors — same UX rule.
 */

const REQUESTED_PERMISSIONS: Permission[] = [
  { accessType: "read", recordType: "Weight" },
  { accessType: "read", recordType: "BodyFat" },
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "Distance" },
  { accessType: "write", recordType: "Weight" },
];

let initialized = false;
let grantedSet = new Set<string>();

/**
 * Initialize the SDK and request permissions once per install. Returns
 * true if the SDK is available AND the user granted at least one
 * read permission — false lets callers no-op cleanly.
 */
export async function requestHealthConnectAuth(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    if (!initialized) {
      const status = await getSdkStatus();
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      const ok = await initialize();
      if (!ok) return false;
      initialized = true;
    }
    const granted = await requestPermission(REQUESTED_PERMISSIONS);
    grantedSet = new Set(
      granted.map((p) => `${p.accessType}:${p.recordType}`)
    );
    // Consider auth successful if any read grant was given — individual
    // reads gate themselves on their specific permission.
    for (const key of grantedSet) {
      if (key.startsWith("read:")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hasRead(recordType: string): boolean {
  return grantedSet.has(`read:${recordType}`);
}

async function refreshGranted(): Promise<void> {
  try {
    const g = (await getGrantedPermissions()) as Permission[];
    grantedSet = new Set(g.map((p) => `${p.accessType}:${p.recordType}`));
  } catch {
    /* keep previous */
  }
}

export async function readLatestWeightKg(): Promise<{
  weight_kg: number;
  measured_at: string;
} | null> {
  if (Platform.OS !== "android") return null;
  if (!hasRead("Weight")) await refreshGranted();
  if (!hasRead("Weight")) return null;
  try {
    // Look back 90 days — most users don't weigh in every day.
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86_400_000);
    const res = await readRecords("Weight", {
      timeRangeFilter: {
        operator: "between",
        startTime: start.toISOString(),
        endTime: now.toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1,
    });
    const rec = res.records[0];
    if (!rec) return null;
    // Weight comes as { inKilograms, inGrams, ... } via the Mass type.
    const mass = rec.weight as unknown as { inKilograms?: number };
    const kg = typeof mass?.inKilograms === "number" ? mass.inKilograms : null;
    if (kg === null || !Number.isFinite(kg) || kg <= 0) return null;
    return {
      weight_kg: Math.round(kg * 10) / 10,
      measured_at: rec.time,
    };
  } catch {
    return null;
  }
}

export async function readLatestBodyFatPct(): Promise<{
  body_fat_pct: number;
  measured_at: string;
} | null> {
  if (Platform.OS !== "android") return null;
  if (!hasRead("BodyFat")) await refreshGranted();
  if (!hasRead("BodyFat")) return null;
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86_400_000);
    const res = await readRecords("BodyFat", {
      timeRangeFilter: {
        operator: "between",
        startTime: start.toISOString(),
        endTime: now.toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1,
    });
    const rec = res.records[0];
    if (!rec) return null;
    const pct = Number(rec.percentage);
    if (!Number.isFinite(pct)) return null;
    return {
      body_fat_pct: Math.round(pct * 10) / 10,
      measured_at: rec.time,
    };
  } catch {
    return null;
  }
}

export async function readTodaySteps(): Promise<number> {
  if (Platform.OS !== "android") return 0;
  if (!hasRead("Steps")) await refreshGranted();
  if (!hasRead("Steps")) return 0;
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const res = await readRecords("Steps", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfDay.toISOString(),
        endTime: new Date().toISOString(),
      },
    });
    return res.records.reduce((s, r) => s + Number(r.count ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function readTodayActiveEnergy(): Promise<number> {
  if (Platform.OS !== "android") return 0;
  if (!hasRead("ActiveCaloriesBurned")) await refreshGranted();
  if (!hasRead("ActiveCaloriesBurned")) return 0;
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const res = await readRecords("ActiveCaloriesBurned", {
      timeRangeFilter: {
        operator: "between",
        startTime: startOfDay.toISOString(),
        endTime: new Date().toISOString(),
      },
    });
    const total = res.records.reduce((s, r) => {
      const e = r.energy as unknown as { inKilocalories?: number };
      return s + (typeof e?.inKilocalories === "number" ? e.inKilocalories : 0);
    }, 0);
    return Math.round(total);
  } catch {
    return 0;
  }
}

export interface HcWorkout {
  hc_uuid: string;
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

export async function readWorkoutsSince(
  sinceIso: string
): Promise<HcWorkout[]> {
  if (Platform.OS !== "android") return [];
  if (!hasRead("ExerciseSession")) await refreshGranted();
  if (!hasRead("ExerciseSession")) return [];
  try {
    const res = await readRecords("ExerciseSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: sinceIso,
        endTime: new Date().toISOString(),
      },
    });
    return res.records.map((w) => ({
      hc_uuid: w.metadata?.id ?? `${w.startTime}:${w.exerciseType}`,
      kind: mapExerciseType(Number(w.exerciseType)),
      started_at: w.startTime,
      duration_min: Math.round(
        (new Date(w.endTime).getTime() - new Date(w.startTime).getTime()) /
          60_000
      ),
      // Distance + calories aren't on ExerciseSessionRecord directly —
      // they live on companion Distance / ActiveCaloriesBurned records
      // for the same time window. Correlating them is a future win; for
      // now null lets the row insert without lying about the data.
      distance_km: null,
      kcal_burned: null,
      avg_hr: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Map Health Connect's numeric exerciseType into SE7A's kind enum.
 * Anything we don't explicitly know buckets to "other" rather than
 * being dropped — matches how the HealthKit mapper handles unknowns.
 */
function mapExerciseType(t: number): HcWorkout["kind"] {
  switch (t) {
    case ExerciseType.RUNNING:
    case ExerciseType.RUNNING_TREADMILL:
      return "run";
    case ExerciseType.WALKING:
      return "walk";
    case ExerciseType.HIKING:
      return "hike";
    case ExerciseType.BIKING:
    case ExerciseType.BIKING_STATIONARY:
      return "ride";
    case ExerciseType.SWIMMING_OPEN_WATER:
    case ExerciseType.SWIMMING_POOL:
      return "swim";
    case ExerciseType.ROWING:
    case ExerciseType.ROWING_MACHINE:
    case ExerciseType.PADDLING:
      return "row";
    case ExerciseType.ELLIPTICAL:
      return "elliptical";
    default:
      return "other";
  }
}

export interface HcSleep {
  hc_uuid: string;
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

/**
 * Fetch sleep sessions ended in the given lookback window. Aggregates
 * stage durations from the `stages` array when the wearable provided
 * them; when it didn't we still get duration + TIB, just without the
 * stage breakdown.
 */
export async function readSleepSessionsSince(
  sinceIso: string
): Promise<HcSleep[]> {
  if (Platform.OS !== "android") return [];
  if (!hasRead("SleepSession")) await refreshGranted();
  if (!hasRead("SleepSession")) return [];
  try {
    const res = await readRecords("SleepSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: sinceIso,
        endTime: new Date().toISOString(),
      },
    });
    return res.records
      .map((s) => {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const tibMs = end.getTime() - start.getTime();
        if (tibMs <= 0) return null;

        let deepMs = 0;
        let remMs = 0;
        let lightMs = 0;
        let awakeMs = 0;
        let anyStageData = false;
        for (const stage of s.stages ?? []) {
          const stageMs =
            new Date(stage.endTime).getTime() -
            new Date(stage.startTime).getTime();
          if (stageMs <= 0) continue;
          anyStageData = true;
          switch (stage.stage) {
            case SleepStageType.DEEP:
              deepMs += stageMs;
              break;
            case SleepStageType.REM:
              remMs += stageMs;
              break;
            case SleepStageType.LIGHT:
            case SleepStageType.SLEEPING:
              lightMs += stageMs;
              break;
            case SleepStageType.AWAKE:
            case SleepStageType.OUT_OF_BED:
              awakeMs += stageMs;
              break;
          }
        }

        const asleepMs = anyStageData
          ? deepMs + remMs + lightMs
          : Math.max(0, tibMs - awakeMs);
        const durationMinutes = Math.round(asleepMs / 60_000);
        if (durationMinutes <= 0) return null;

        return {
          hc_uuid: s.metadata?.id ?? `${s.startTime}:${s.endTime}`,
          night_date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
          start_at: s.startTime,
          end_at: s.endTime,
          duration_minutes: durationMinutes,
          time_in_bed_minutes: Math.round(tibMs / 60_000),
          deep_minutes: anyStageData ? Math.round(deepMs / 60_000) : null,
          rem_minutes: anyStageData ? Math.round(remMs / 60_000) : null,
          light_minutes: anyStageData ? Math.round(lightMs / 60_000) : null,
          awake_minutes: anyStageData ? Math.round(awakeMs / 60_000) : null,
        } satisfies HcSleep;
      })
      .filter((s): s is HcSleep => s !== null);
  } catch {
    return [];
  }
}
