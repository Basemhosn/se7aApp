import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Simple X-of-Y progress ring used for adherence, water goals, etc.
 * Smaller sibling of CalorieRing — no ranges, just a single arc.
 */
export function AdherenceRing({
  value,
  outOf,
  kicker,
  unit,
  tint = colors.mint,
  size = 180,
}: {
  value: number;
  outOf: number;
  kicker: string;
  unit?: string;
  tint?: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / Math.max(1, outOf)));
  const offset = c * (1 - pct);
  const pctRounded = Math.round(pct * 100);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
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
          stroke={tint}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.kicker, { color: tint }]}>{kicker}</Text>
        <Text style={styles.big}>
          {value}
          <Text style={styles.of}>/{outOf}</Text>
        </Text>
        <Text style={styles.pct}>
          {pctRounded}%{unit ? ` · ${unit}` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.sm,
  },
  center: { alignItems: "center", justifyContent: "center" },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  big: {
    fontFamily: font.displayBold,
    fontSize: 44,
    color: colors.ink,
    lineHeight: 46,
  },
  of: {
    fontFamily: font.body,
    fontSize: 18,
    color: colors.dim,
  },
  pct: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
