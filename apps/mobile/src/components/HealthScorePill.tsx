import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "@/lib/theme";
import type { HealthLabel } from "@/lib/healthScore";

/**
 * Compact "N/10" badge used inline next to meal cards and the home
 * ring. The color accent comes from the label bucket, not the raw
 * number, so threshold changes affect every call site at once.
 */
export function HealthScorePill({
  score,
  label,
  size = "md",
  isArabic,
}: {
  score: number;
  label: HealthLabel;
  size?: "sm" | "md";
  isArabic?: boolean;
}) {
  const tint = tintFor(label);
  const isSm = size === "sm";
  return (
    <View
      style={[
        styles.pill,
        { borderColor: tint, backgroundColor: tint + "16" },
        isSm ? styles.pillSm : styles.pillMd,
      ]}
    >
      <Text style={[isSm ? styles.scoreSm : styles.scoreMd, { color: tint }]}>
        {score}
        <Text
          style={[
            isSm ? styles.scoreMaxSm : styles.scoreMaxMd,
            { color: tint },
          ]}
        >
          /10
        </Text>
      </Text>
      {!isSm && (
        <Text style={[styles.label, { color: tint }]}>
          {labelCopy(label, isArabic)}
        </Text>
      )}
    </View>
  );
}

function tintFor(label: HealthLabel): string {
  switch (label) {
    case "great":
      return colors.mint;
    case "good":
      return colors.gold;
    case "fair":
      return "#D7A94A";
    case "poor":
      return colors.coral;
  }
}

function labelCopy(label: HealthLabel, isArabic?: boolean): string {
  const map: Record<HealthLabel, [string, string]> = {
    great: ["Great", "ممتاز"],
    good: ["Good", "جيد"],
    fair: ["Fair", "مقبول"],
    poor: ["Poor", "ضعيف"],
  };
  const pair = map[label];
  return isArabic ? pair[1] : pair[0];
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillSm: { paddingHorizontal: 7, paddingVertical: 2 },
  pillMd: { paddingHorizontal: 10, paddingVertical: 5 },
  scoreSm: { fontFamily: font.displayBold, fontSize: 11, lineHeight: 14 },
  scoreMd: { fontFamily: font.displayBold, fontSize: 14, lineHeight: 18 },
  scoreMaxSm: { fontFamily: font.mono, fontSize: 9, opacity: 0.7 },
  scoreMaxMd: { fontFamily: font.mono, fontSize: 11, opacity: 0.7 },
  label: {
    fontFamily: font.mono,
    letterSpacing: 1,
    fontSize: 10,
  },
});
