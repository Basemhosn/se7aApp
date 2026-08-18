const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// @posthog/core (transitive via posthog-react-native) uses the modern
// package `exports` field to publish `@posthog/core/surveys`. Metro's
// default resolver ignores that field — flipping this on makes it
// resolve subpaths the same way Node does. Without this, Metro fails
// with "Unable to resolve module @posthog/core/surveys" at bundle time.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
