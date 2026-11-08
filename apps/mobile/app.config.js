/**
 * Dynamic Expo config wrapper. Expo prefers app.config.js over
 * app.json when both are present; we keep app.json as the static
 * source of truth and layer env-dependent config on top here.
 *
 * Current responsibilities:
 * - Conditionally register @react-native-google-signin/google-signin
 *   with the iOS reversed client ID from GOOGLE_IOS_REVERSED_CLIENT_ID.
 *   When the env var is absent (local dev before the Google Cloud iOS
 *   OAuth client is set up) the plugin is skipped and sign-in falls
 *   back to the WebBrowser OAuth path, so builds don't break.
 */
export default ({ config }) => {
  const plugins = [...(config.plugins ?? [])];

  // Strip ALL whitespace defensively (not just edges). A URL scheme
  // is never allowed to contain whitespace anywhere, and we've seen
  // Codemagic env vars pick up stray spaces both trailing AND inside
  // the value (likely from copy/paste splitting a long client ID
  // across lines). App Store validation 90158 rejects either form —
  // easier to sanitize once here than chase whitespace in the env.
  const googleIosReversedClientId = process.env.GOOGLE_IOS_REVERSED_CLIENT_ID
    ?.replace(/\s+/g, "");
  if (googleIosReversedClientId) {
    plugins.push([
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: googleIosReversedClientId },
    ]);
  }

  return {
    ...config,
    plugins,
  };
};
