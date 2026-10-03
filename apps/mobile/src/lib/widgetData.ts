import { Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";

const APP_GROUP = "group.app.se7a.mobile";

export interface WidgetSnapshot {
  kcalEaten: number;
  kcalTarget: number;
  streakDays: number;
}

/**
 * Write the current ring state into the App Group container so the
 * iOS WidgetKit extension can read it on its next timeline refresh.
 *
 * Called from Home every time the ledger finishes loading. iOS
 * batches widget timeline reloads; this is a hint, not a guarantee
 * of instant update — standard behaviour for all WidgetKit widgets.
 *
 * No-op on Android.
 */
export async function writeWidgetSnapshot(
  snap: WidgetSnapshot
): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    // Each key stored as a plain integer so the Swift side reads
    // via UserDefaults.integer(forKey:) with no JSON parsing.
    await Promise.all([
      SharedGroupPreferences.setItem(
        "kcalEaten",
        Math.max(0, Math.round(snap.kcalEaten)),
        APP_GROUP
      ),
      SharedGroupPreferences.setItem(
        "kcalTarget",
        Math.max(1, Math.round(snap.kcalTarget)),
        APP_GROUP
      ),
      SharedGroupPreferences.setItem(
        "streakDays",
        Math.max(0, Math.round(snap.streakDays)),
        APP_GROUP
      ),
      SharedGroupPreferences.setItem(
        "updatedAt",
        Math.floor(Date.now() / 1000),
        APP_GROUP
      ),
    ]);
  } catch {
    /* widget data write failing shouldn't affect the main app flow */
  }
}
