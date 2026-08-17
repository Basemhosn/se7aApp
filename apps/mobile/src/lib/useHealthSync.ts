/**
 * DISABLED for v0.1.0 App Store submission.
 *
 * react-native-health caused Xcode 26 build errors we didn't want to
 * iterate on before shipping. HealthKit auto-import returns in v0.1.1.
 *
 * Original implementation is preserved in git history at commit f01f0fc.
 * To re-enable: re-install react-native-health, restore the config-plugin
 * block in app.json, and revert this file.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useHealthSync(_userId: string | undefined) {
  // no-op
}
