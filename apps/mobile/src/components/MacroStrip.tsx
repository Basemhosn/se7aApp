import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/lib/theme";

/**
 * SE7A shared 4-column macro strip.
 *
 * Icon/letter badge → big range value → tiny unit label per column,
 * divided by thin vertical rules. Introduced with the plate review
 * redesign (build 66) and reused across scanner screens for visual
 * consistency.
 *
 * Values are pre-formatted strings so the caller controls "665–845"
 * vs "665 — 845" vs a single "665" — the component just renders.
 */
export function MacroStrip({
  kcal,
  protein,
  carbs,
  fat,
  kcalLabel = "kcal",
  gramLabel = "g",
}: {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  kcalLabel?: string;
  gramLabel?: string;
}) {
  return (
    <View style={styles.strip}>
      <MacroCol icon="flame" value={kcal} label={kcalLabel} />
      <View style={styles.divider} />
      <MacroCol letter="P" value={protein} label={gramLabel} />
      <View style={styles.divider} />
      <MacroCol letter="C" value={carbs} label={gramLabel} />
      <View style={styles.divider} />
      <MacroCol letter="F" value={fat} label={gramLabel} />
    </View>
  );
}

function MacroCol({
  icon,
  letter,
  value,
  label,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  letter?: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.col}>
      <View style={styles.badge}>
        {icon ? (
          <Ionicons name={icon} size={14} color={colors.gold} />
        ) : (
          <Text style={styles.badgeLetter}>{letter}</Text>
        )}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  col: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLetter: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.gold,
    lineHeight: 15,
  },
  value: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  label: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: colors.line,
  },
});
