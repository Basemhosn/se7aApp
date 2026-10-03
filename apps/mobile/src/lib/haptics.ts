import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Thin wrappers over expo-haptics so call sites read intent-first
 * ("success / warning / tap") instead of API-first (ImpactLight,
 * NotificationFeedbackType.Success). Keeps the semantic contract
 * stable even if we swap the underlying library later.
 *
 * All functions are fire-and-forget — expo-haptics on Android
 * sometimes rejects silently; swallowing avoids noisy warnings on
 * dev builds. iOS is where the perceptual lift lives anyway.
 */

const safe = (fn: () => Promise<unknown>) => {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
};

/** Light tap — buttons, chips, toggles. The subtle one. */
export function tap(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium tap — more consequential presses (log, confirm). */
export function tapMedium(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Success — meal logged, badge unlocked, streak kept. */
export function success(): void {
  safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

/** Warning — soft errors ("over budget", "already saved"). */
export function warning(): void {
  safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  );
}

/** Error — hard errors (couldn't save, upload failed). */
export function errorHaptic(): void {
  safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  );
}

/** Selection change — chip switches, tab taps. The most subtle. */
export function selection(): void {
  safe(() => Haptics.selectionAsync());
}
