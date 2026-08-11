// @ts-check
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Xcode 26 (Apple Clang 21) tightened C++20 consteval rules, breaking
// FMT_STRING in the vendored fmt 11.0.2 that ships with RN < 0.83.9.
// The fix: patch fmt/base.h to force FMT_USE_CONSTEVAL to 0, making fmt
// validate format strings at runtime instead of compile time. Behavior
// is identical; nanosecond overhead per format call.
// Remove after upgrading past Expo SDK 56 (fmt 12.1.0 has upstream fix).
const MARKER = "fmt-consteval-fix";

function rubyPatch(installerVar) {
  return [
    "",
    `    # === ${MARKER}: disable fmt consteval for Xcode 26 (Apple Clang 21) ===`,
    `    fmt_base = File.join(${installerVar}.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')`,
    "    if File.exist?(fmt_base)",
    "      original = File.read(fmt_base)",
    "      patched = original.gsub(/^(#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1\\s*$/, '\\1 0')",
    "      if patched != original",
    "        File.chmod(0644, fmt_base)",
    "        File.write(fmt_base, patched)",
    `        Pod::UI.puts '[${MARKER}] disabled fmt consteval (Xcode 26 compatibility)'`,
    "      end",
    "    end",
  ].join("\n");
}

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(MARKER)) return cfg;

      const match = contents.match(/post_install do \|(\w+)\|/);
      if (!match) {
        throw new Error(
          `[${MARKER}] No "post_install do |installer|" block found in Podfile.`
        );
      }

      const installerVar = match[1];
      contents = contents.replace(
        match[0],
        `${match[0]}\n${rubyPatch(installerVar)}`
      );

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
