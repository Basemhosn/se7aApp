import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "@/lib/theme";

export function ConfidencePill({
  level,
}: {
  level: "low" | "medium" | "high";
}) {
  const color =
    level === "low" ? colors.coral : level === "high" ? colors.mint : colors.gold;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>Confidence: {level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  text: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
