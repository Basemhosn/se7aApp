const { getDefaultConfig } = require("expo/metro-config");

/**
 * @posthog/core (a transitive dep via posthog-react-native) uses the
 * subpath-exports field to publish `@posthog/core/surveys`. Metro's
 * default resolver doesn't honor package `exports` — flipping this on
 * makes it resolve those subpaths the same way Node does. Without this,
 * Metro fails with "Unable to resolve module @posthog/core/surveys".
 */
const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
