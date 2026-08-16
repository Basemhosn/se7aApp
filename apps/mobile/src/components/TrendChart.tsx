import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { colors, font } from "@/lib/theme";

interface Point {
  weight_kg: number;
  body_fat_pct: number | null;
  logged_at: string;
}

/**
 * Compact line chart of weight over time. Body-fat overlay drawn as a
 * second faint line when data exists. Intentionally small — the trend
 * is what matters, not the axis labels.
 */
export function TrendChart({
  points,
  width = 320,
  height = 120,
}: {
  points: Point[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>
          {points.length === 0
            ? "Log two weigh-ins to see a trend."
            : "One more log and we'll draw the trend."}
        </Text>
      </View>
    );
  }

  const padX = 8;
  const padTop = 16;
  const padBottom = 22;

  const weights = points.map((p) => Number(p.weight_kg));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const rangeW = Math.max(0.5, maxW - minW);

  const bfPoints = points
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.body_fat_pct != null);
  const bfs = bfPoints.map((x) => Number(x.p.body_fat_pct));
  const minBf = bfs.length ? Math.min(...bfs) : 0;
  const maxBf = bfs.length ? Math.max(...bfs) : 0;
  const rangeBf = Math.max(0.5, maxBf - minBf);

  const times = points.map((p) => new Date(p.logged_at).getTime());
  const minT = times[0]!;
  const maxT = times[times.length - 1]!;
  const rangeT = Math.max(1, maxT - minT);

  const xAt = (t: number) =>
    padX + ((t - minT) / rangeT) * (width - padX * 2);
  const yWeight = (w: number) =>
    padTop + (1 - (w - minW) / rangeW) * (height - padTop - padBottom);
  const yBf = (b: number) =>
    padTop + (1 - (b - minBf) / rangeBf) * (height - padTop - padBottom);

  const weightPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(times[i]!).toFixed(2)} ${yWeight(Number(p.weight_kg)).toFixed(2)}`
    )
    .join(" ");

  const bfPath =
    bfPoints.length >= 2
      ? bfPoints
          .map(
            (x, i) =>
              `${i === 0 ? "M" : "L"} ${xAt(times[x.i]!).toFixed(2)} ${yBf(Number(x.p.body_fat_pct)).toFixed(2)}`
          )
          .join(" ")
      : null;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = Number(last.weight_kg) - Number(first.weight_kg);
  const deltaSign = delta > 0 ? "+" : "";
  const deltaColor = delta === 0 ? colors.dim : delta > 0 ? colors.mint : colors.gold;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.label}>
          {last.weight_kg} kg
          {last.body_fat_pct != null ? ` · ${last.body_fat_pct}% BF` : ""}
        </Text>
        <Text style={[styles.delta, { color: deltaColor }]}>
          {deltaSign}
          {delta.toFixed(1)} kg
        </Text>
      </View>
      <Svg width={width} height={height}>
        {/* Baseline (min weight line) */}
        <Line
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
          stroke={colors.line}
          strokeWidth={1}
        />
        {/* Weight path */}
        <Path
          d={weightPath}
          stroke={colors.gold}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Body fat overlay */}
        {bfPath && (
          <Path
            d={bfPath}
            stroke={colors.mint}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            fill="none"
          />
        )}
        {/* Endpoints */}
        <Circle
          cx={xAt(times[0]!)}
          cy={yWeight(Number(first.weight_kg))}
          r={3}
          fill={colors.gold}
        />
        <Circle
          cx={xAt(times[times.length - 1]!)}
          cy={yWeight(Number(last.weight_kg))}
          r={3}
          fill={colors.gold}
        />
        {/* Date labels */}
        <SvgText
          x={padX}
          y={height - 6}
          fill={colors.dim}
          fontSize={10}
          fontFamily={font.mono}
        >
          {shortDate(first.logged_at)}
        </SvgText>
        <SvgText
          x={width - padX}
          y={height - 6}
          fill={colors.dim}
          fontSize={10}
          fontFamily={font.mono}
          textAnchor="end"
        >
          {shortDate(last.logged_at)}
        </SvgText>
      </Svg>
    </View>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.ink,
  },
  delta: {
    fontFamily: font.mono,
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
  },
});
