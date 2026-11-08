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

  // Trim defensively — a trailing space in the Codemagic env var would
  // get baked into Info.plist's CFBundleURLSchemes and fail App Store
  // validation 90158 ("URL schemes need to begin with an alphabetic
  // character, and be comprised of alphanumeric characters, the period,
  // the hyphen or the plus sign only"). Stripping here prevents a
  // rebuild cycle if the env var picks up invisible whitespace.
  const googleIosReversedClientId =
    process.env.GOOGLE_IOS_REVERSED_CLIENT_ID?.trim();
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
