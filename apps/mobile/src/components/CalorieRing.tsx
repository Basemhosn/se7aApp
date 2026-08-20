import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Central calorie ring for the Home tab hero.
 *
 * Because SE7A macros are ranges (kcalLow–kcalHigh) rather than point
 * values, the ring uses two overlaid arcs:
 *   • solid gold arc up to eatenLow  — "at least this much consumed"
 *   • faded gold arc from eatenLow to eatenHigh — "possibly up to here"
 *
 * The number in the middle is the mid remaining kcal (avg of both
 * remaining bounds) with the low–high range as a smaller line below.
 * If the user has overshot the target, the ring turns coral.
 */
export function CalorieRing({
  target,
  eatenLow,
  eatenHigh,
  size = 240,
}: {
  target: number;
  eatenLow: number;
  eatenHigh: number;
  size?: number;
}) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const denom = Math.max(1, target);
  const pctLow = clamp01(eatenLow / denom);
  const pctHigh = clamp01(eatenHigh / denom);

  const dashOffsetLow = c * (1 - pctLow);
  const dashOffsetHigh = c * (1 - pctHigh);

  const remainingLow = Math.max(0, target - eatenHigh);
  const remainingHigh = Math.max(0, target - eatenLow);
  const remainingMid = Math.round((remainingLow + remainingHigh) / 2);
  const over = eatenLow > target;

  const ringColor = over ? colors.coral : colors.gold;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.line}
          strokeWidth={stroke}
          fill="none"
        />
        {/* High-bound arc: dim shadow of the range */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeOpacity={0.28}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={dashOffsetHigh}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Low-bound arc: solid confidence */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={dashOffsetLow}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.kicker}>
          {over ? "OVER TODAY" : "REMAINING"}
        </Text>
        <Text style={[styles.big, over && { color: colors.coral }]}>
          {over ? Math.round(eatenLow - target) : remainingMid}
        </Text>
        <Text style={styles.unit}>kcal</Text>
        <Text style={styles.range}>
          {over
            ? `+${Math.round(eatenLow - target)}–${Math.round(eatenHigh - target)}`
            : `${remainingLow}–${remainingHigh}`}
        </Text>
      </View>
    </View>
  );
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  big: {
    fontFamily: font.displayBold,
    fontSize: 60,
    color: colors.ink,
    lineHeight: 62,
  },
  unit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  range: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    marginTop: 6,
    letterSpacing: 0.5,
  },
});
