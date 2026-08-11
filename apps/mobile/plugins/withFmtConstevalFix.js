const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Xcode 26 (Apple Clang 21) enforces stricter C++20 consteval rules,
// which trip RCT-Folly's vendored `fmt`. Patches the Podfile to build
// the `fmt` pod with C++17 + FMT_USE_CONSTEVAL=0. Remove after upgrading
// past Expo SDK 56 / RN 0.83.9 where fmt is patched upstream.
const MARKER = "# fmt-consteval-fix";

const SNIPPET = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        cfg.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
      end
    end
  end
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf-8");

      if (podfile.includes(MARKER)) return config;

      const anchor = "react_native_post_install(";
      const idx = podfile.indexOf(anchor);
      if (idx === -1) {
        throw new Error(
          "withFmtConstevalFix: could not find react_native_post_install anchor in Podfile"
        );
      }

      const endOfLine = podfile.indexOf("\n", idx);
      podfile =
        podfile.slice(0, endOfLine + 1) + SNIPPET + podfile.slice(endOfLine + 1);

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
