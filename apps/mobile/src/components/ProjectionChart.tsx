import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";
import { colors, font } from "@/lib/theme";

interface HistoryPoint {
  weight_kg: number;
  logged_at: string;
}

interface ProjectionPoint {
  at: string;
  weight_kg_mid: number;
  weight_kg_low: number;
  weight_kg_high: number;
}

export interface ProjectionResponse {
  history: HistoryPoint[];
  current?: { weight_kg: number; logged_at: string };
  regression: {
    slope_kg_per_day: number;
    slope_kg_per_week: number;
    r_squared: number;
    residual_std_kg: number;
    band95_kg: number;
    n_points: number;
  } | null;
  projection: ProjectionPoint[];
  goal: {
    direction: string | null;
    target_rate_kg_per_week: number | null;
    weight_kg: number | null;
    eta_days: number | null;
    on_pace_pct: number | null;
  };
  insufficient?: boolean;
}

/**
 * Historical weigh-ins (gold line + dots) with a dashed projection line
 * extending forward, a shaded 95% confidence band, and an optional
 * horizontal goal line. "Honest ranges" brand principle — the shaded
 * band shows the uncertainty rather than a single false-precision line.
 */
export function ProjectionChart({
  data,
  width = 320,
  height = 180,
}: {
  data: ProjectionResponse;
  width?: number;
  height?: number;
}) {
  if (data.insufficient || data.history.length < 2 || !data.regression) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>
          Log at least 2 weigh-ins to see a projection.
        </Text>
      </View>
    );
  }

  const padX = 8;
  const padTop = 16;
  const padBottom = 22;

  const history = data.history.map((h) => ({
    t: new Date(h.logged_at).getTime(),
    w: Number(h.weight_kg),
  }));
  const proj = data.projection.map((p) => ({
    t: new Date(p.at).getTime(),
    w: Number(p.weight_kg_mid),
    lo: Number(p.weight_kg_low),
    hi: Number(p.weight_kg_high),
  }));

  const allT = [...history.map((h) => h.t), ...proj.map((p) => p.t)];
  const allW = [
    ...history.map((h) => h.w),
    ...proj.map((p) => p.w),
    ...proj.map((p) => p.lo),
    ...proj.map((p) => p.hi),
  ];
  if (data.goal.weight_kg !== null) allW.push(Number(data.goal.weight_kg));

  const minT = Math.min(...allT);
  const maxT = Math.max(...allT);
  const rangeT = Math.max(1, maxT - minT);
  const minW = Math.min(...allW);
  const maxW = Math.max(...allW);
  const rangeW = Math.max(0.5, maxW - minW);
  // 5% padding above and below the data range so lines don't kiss the edges.
  const padW = rangeW * 0.08;
  const yMin = minW - padW;
  const yMax = maxW + padW;
  const yRange = yMax - yMin;

  const xAt = (t: number) =>
    padX + ((t - minT) / rangeT) * (width - padX * 2);
  const yAt = (w: number) =>
    padTop + (1 - (w - yMin) / yRange) * (height - padTop - padBottom);

  const histPath = history
    .map((h, i) => `${i === 0 ? "M" : "L"} ${xAt(h.t).toFixed(2)} ${yAt(h.w).toFixed(2)}`)
    .join(" ");
  const projPath = proj
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.t).toFixed(2)} ${yAt(p.w).toFixed(2)}`)
    .join(" ");

  // Confidence band as a closed polygon: forward along `hi`, back along `lo`.
  const bandTop = proj
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.t).toFixed(2)} ${yAt(p.hi).toFixed(2)}`)
    .join(" ");
  const bandBottom = [...proj]
    .reverse()
    .map((p) => `L ${xAt(p.t).toFixed(2)} ${yAt(p.lo).toFixed(2)}`)
    .join(" ");
  const bandPath = `${bandTop} ${bandBottom} Z`;

  const todayX = xAt(Date.now());

  return (
    <Svg width={width} height={height}>
      {/* Baseline */}
      <Line
        x1={padX}
        y1={height - padBottom}
        x2={width - padX}
        y2={height - padBottom}
        stroke={colors.line}
        strokeWidth={1}
      />
      {/* Goal line — dotted, mint */}
      {data.goal.weight_kg !== null && (
        <>
          <Line
            x1={padX}
            y1={yAt(Number(data.goal.weight_kg))}
            x2={width - padX}
            y2={yAt(Number(data.goal.weight_kg))}
            stroke={colors.mint}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <SvgText
            x={width - padX}
            y={yAt(Number(data.goal.weight_kg)) - 4}
            fill={colors.mint}
            fontSize={9}
            fontFamily={font.mono}
            textAnchor="end"
          >
            {`goal ${Number(data.goal.weight_kg).toFixed(1)}`}
          </SvgText>
        </>
      )}
      {/* Confidence band */}
      <Path d={bandPath} fill={colors.gold} opacity={0.12} stroke="none" />
      {/* History line — solid gold */}
      <Path
        d={histPath}
        stroke={colors.gold}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Projection line — dashed gold */}
      <Path
        d={projPath}
        stroke={colors.gold}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        fill="none"
        strokeLinecap="round"
      />
      {/* Today divider */}
      <Line
        x1={todayX}
        y1={padTop}
        x2={todayX}
        y2={height - padBottom}
        stroke={colors.dim}
        strokeWidth={1}
        strokeDasharray="1 3"
      />
      {/* History dots */}
      {history.map((h, i) => (
        <Circle
          key={i}
          cx={xAt(h.t)}
          cy={yAt(h.w)}
          r={2.5}
          fill={colors.gold}
        />
      ))}
      {/* Date labels */}
      <SvgText
        x={padX}
        y={height - 6}
        fill={colors.dim}
        fontSize={10}
        fontFamily={font.mono}
      >
        {shortDate(new Date(minT))}
      </SvgText>
      <SvgText
        x={todayX}
        y={height - 6}
        fill={colors.dim}
        fontSize={10}
        fontFamily={font.mono}
        textAnchor="middle"
      >
        now
      </SvgText>
      <SvgText
        x={width - padX}
        y={height - 6}
        fill={colors.dim}
        fontSize={10}
        fontFamily={font.mono}
        textAnchor="end"
      >
        {shortDate(new Date(maxT))}
      </SvgText>
    </Svg>
  );
}

function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
