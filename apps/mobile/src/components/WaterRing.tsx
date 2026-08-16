import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Water intake card with a progress ring. Tapping the ring adds 250 ml;
 * long-pressing opens a custom-amount sheet (parent handles that path).
 */
export function WaterRing({
  totalMl,
  targetMl,
  onAdd,
}: {
  totalMl: number;
  targetMl: number;
  onAdd: (ml: number) => void;
}) {
  const size = 72;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, totalMl / Math.max(1, targetMl));
  const dashOffset = c * (1 - pct);
  const complete = totalMl >= targetMl;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onAdd(250)} style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.line}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={complete ? colors.mint : colors.gold}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.plus}>+250</Text>
        </View>
      </Pressable>
      <View style={styles.info}>
        <Text style={styles.label}>WATER</Text>
        <Text style={styles.total}>
          {(totalMl / 1000).toFixed(1)}
          <Text style={styles.unit}> L</Text>
        </Text>
        <Text style={styles.target}>
          of {(targetMl / 1000).toFixed(1)} L target
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  ringWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  plus: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.5,
  },
  info: { flex: 1 },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  total: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 2,
  },
  unit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  target: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
});
