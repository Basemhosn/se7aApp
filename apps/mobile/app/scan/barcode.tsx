import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * TEMPORARY placeholder — expo-camera removed for TestFlight launch
 * bisect. Restore this file to its git history state once we identify
 * which native module is causing the launch crash.
 */
export default function BarcodeScan() {
  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>BARCODE</Text>
      <Text style={styles.h1}>Coming soon.</Text>
      <Text style={styles.sub}>
        Barcode scanning is temporarily disabled while we sort out a
        launch issue. Everything else works — you can add packaged food
        manually from the Log tab.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
