import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "@/lib/theme";

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { fontSize: size }]}>SE</Text>
      <Text style={[styles.text, styles.seven, { fontSize: size }]}>7</Text>
      <Text style={[styles.text, { fontSize: size }]}>A</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline" },
  text: {
    fontFamily: font.displayBold,
    color: colors.ink,
    letterSpacing: 1,
  },
  seven: { color: colors.gold },
});
