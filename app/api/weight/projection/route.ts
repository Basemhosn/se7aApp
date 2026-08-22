import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Weight projection — fits a linear regression to the user's recent
 * weigh-ins and projects forward. Returns:
 *   - history[]  raw weigh-ins over the lookback window
 *   - regression slope + intercept + r_squared + residual_std
 *   - projection[]  weekly forward points with a 95% confidence band
 *                    (mean ± 1.96·residual_std, so users see the
 *                    honest range instead of a single false-precision line)
 *   - goal        weight_kg (if set), direction, target rate, ETA (weeks)
 *                    to hit the goal at the current pace, and on_pace_pct
 *                    (current slope / target slope · 100)
 *
 * Regression uses ordinary least-squares on (day_offset, weight_kg).
 * When the user only has 2 data points we still fit a line — it's a
 * degenerate case with no confidence band, but a projection is more
 * useful than nothing.
 *
 * The 90-day forward horizon is capped: at typical cut/bulk rates
 * (~0.5 kg/wk), 90 days = 6.4 kg of movement, which is plenty of
 * runway to see the picture without amplifying regression noise off
 * into fantasy territory.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lookbackDays = clamp(
    Number(searchParams.get("lookback_days") ?? 56),
    14,
    180
  );
  const forwardDays = clamp(
    Number(searchParams.get("forward_days") ?? 90),
    14,
    180
  );

  const now = new Date();
  const lookbackStart = new Date(now.getTime() - lookbackDays * 86_400_000);

  const [weightRes, profileRes] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", user.id)
      .gte("logged_at", lookbackStart.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("weight_kg, goal, goal_rate_kg_per_week, goal_weight_kg")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const rawPoints = (weightRes.data ?? []).map((r) => ({
    weight_kg: Number(r.weight_kg),
    logged_at: r.logged_at as string,
    t: new Date(r.logged_at as string).getTime(),
  }));

  if (rawPoints.length < 2) {
    return NextResponse.json({
      history: rawPoints.map(({ t: _t, ...rest }) => rest),
      regression: null,
      projection: [],
      goal: goalFromProfile(profileRes.data, null),
      insufficient: true,
    });
  }

  // Fit y = slope·x + intercept where x is days since first weigh-in.
  const t0 = rawPoints[0]!.t;
  const xs = rawPoints.map((p) => (p.t - t0) / 86_400_000); // days since first
  const ys = rawPoints.map((p) => p.weight_kg);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let denX = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    denX += (xs[i]! - meanX) ** 2;
  }
  const slope = denX === 0 ? 0 : num / denX;
  const intercept = meanY - slope * meanX;

  // R² and residual std for the confidence band.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * xs[i]! + intercept;
    ssRes += (ys[i]! - yHat) ** 2;
    ssTot += (ys[i]! - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const residualStd =
    n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0; // degrees-of-freedom adjusted

  // Project 13 weekly points forward from *today*. Today's projected
  // value uses the fitted line evaluated at today's day-offset.
  const todayOffset = (now.getTime() - t0) / 86_400_000;
  const band95 = 1.96 * residualStd;
  const projection: Array<{
    at: string;
    weight_kg_mid: number;
    weight_kg_low: number;
    weight_kg_high: number;
  }> = [];
  const stepDays = 7;
  const steps = Math.ceil(forwardDays / stepDays);
  for (let i = 0; i <= steps; i++) {
    const offset = todayOffset + i * stepDays;
    const mid = slope * offset + intercept;
    const at = new Date(t0 + offset * 86_400_000).toISOString();
    projection.push({
      at,
      weight_kg_mid: round(mid, 2),
      weight_kg_low: round(mid - band95, 2),
      weight_kg_high: round(mid + band95, 2),
    });
  }

  // Goal ETA — at the current slope, how many days until the projected
  // line crosses goal_weight_kg? If the slope is heading the wrong
  // direction (e.g. slope +0.02 kg/day but goal < current), ETA is
  // unreachable (null).
  const profile = profileRes.data;
  const currentWeight = rawPoints[rawPoints.length - 1]!.weight_kg;
  let etaDays: number | null = null;
  let onPacePct: number | null = null;
  const goalWeight =
    typeof profile?.goal_weight_kg === "number"
      ? Number(profile.goal_weight_kg)
      : null;
  if (goalWeight !== null && Math.abs(slope) > 1e-6) {
    // At what day-offset does slope·x + intercept = goalWeight?
    const targetOffset = (goalWeight - intercept) / slope;
    const daysFromNow = targetOffset - todayOffset;
    if (daysFromNow > 0 && daysFromNow < 365 * 3) {
      etaDays = Math.round(daysFromNow);
    }
  }
  if (
    typeof profile?.goal_rate_kg_per_week === "number" &&
    Math.abs(profile.goal_rate_kg_per_week) > 1e-6
  ) {
    const targetSlopePerDay = profile.goal_rate_kg_per_week / 7;
    // Sign-aware ratio: if the target rate is -0.5 kg/wk (cutting)
    // and the actual slope is -0.4 kg/wk, on_pace = 80%. Same direction
    // is required to be considered "on pace" at all — opposite-sign
    // movement returns a negative percentage so the client can flag it.
    onPacePct = Math.round((slope / targetSlopePerDay) * 100);
  }

  const goal = goalFromProfile(profileRes.data, {
    eta_days: etaDays,
    on_pace_pct: onPacePct,
  });

  return NextResponse.json({
    history: rawPoints.map(({ t: _t, ...rest }) => rest),
    current: {
      weight_kg: currentWeight,
      logged_at: rawPoints[rawPoints.length - 1]!.logged_at,
    },
    regression: {
      slope_kg_per_day: round(slope, 5),
      slope_kg_per_week: round(slope * 7, 3),
      intercept_kg: round(intercept, 2),
      r_squared: round(rSquared, 3),
      residual_std_kg: round(residualStd, 3),
      band95_kg: round(band95, 3),
      n_points: n,
    },
    projection,
    goal,
  });
}

interface GoalExtras {
  eta_days: number | null;
  on_pace_pct: number | null;
}

function goalFromProfile(
  profile:
    | {
        goal?: string | null;
        goal_rate_kg_per_week?: number | null;
        goal_weight_kg?: number | null;
      }
    | null
    | undefined,
  extras: GoalExtras | null
): {
  direction: string | null;
  target_rate_kg_per_week: number | null;
  weight_kg: number | null;
  eta_days: number | null;
  on_pace_pct: number | null;
} {
  return {
    direction: profile?.goal ?? null,
    target_rate_kg_per_week:
      typeof profile?.goal_rate_kg_per_week === "number"
        ? profile.goal_rate_kg_per_week
        : null,
    weight_kg:
      typeof profile?.goal_weight_kg === "number"
        ? Number(profile.goal_weight_kg)
        : null,
    eta_days: extras?.eta_days ?? null,
    on_pace_pct: extras?.on_pace_pct ?? null,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
