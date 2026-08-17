/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "SE7A",
  bundleIdentifier: "app.se7a.mobile.widget",
  deploymentTarget: "17.0",
  colors: {
    $accent: "#f6b73c",
    $widgetBackground: "#0b0d0b",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.app.se7a.mobile"],
  },
};
