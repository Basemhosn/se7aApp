/**
 * DISABLED for v0.1.0 — see useHealthSync.ts.
 * Original implementation at commit f01f0fc.
 */
export function requestHealthKitAuth(): Promise<boolean> {
  return Promise.resolve(false);
}
export function readLatestWeightKg(): Promise<null> {
  return Promise.resolve(null);
}
export function readLatestBodyFatPct(): Promise<null> {
  return Promise.resolve(null);
}
export function readTodaySteps(): Promise<number> {
  return Promise.resolve(0);
}
export function writeWeightKg(_kg: number): Promise<void> {
  return Promise.resolve();
}
