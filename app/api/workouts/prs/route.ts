import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Lifting PRs — for each exercise the user has logged, the heaviest set
 * (by weight_kg) they've done and the estimated 1RM of that set. If two
 * sets tie on weight, prefer the one with more reps.
 *
 * Estimated 1RM uses Epley: weight * (1 + reps/30). It's a rough guide
 * — SE7A stays honest about the estimate by labeling it "est.".
 *
 * Query params:
 *   ?period=all|month|week   — filter what counts as "recent"
 */
interface Set {
  reps?: number;
  weight_kg?: number;
  rpe?: number;
}

interface Exercise {
  name?: string;
  sets?: Set[];
}

interface Session {
  completed_at: string;
  exercises: Exercise[];
}

interface PrResult {
  exercise: string;
  best_weight_kg: number;
  best_reps: number;
  est_1rm_kg: number;
  achieved_at: string;
  set_count_ever: number;
}

export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "all") as
    | "all"
    | "month"
    | "week";

  let sinceIso: string | null = null;
  if (period !== "all") {
    const d = new Date();
    d.setDate(d.getDate() - (period === "week" ? 7 : 30));
    sinceIso = d.toISOString();
  }

  const query = supabase
    .from("workout_sessions")
    .select("completed_at, exercises")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(500);

  const { data: rows, error } = sinceIso
    ? await query.gte("completed_at", sinceIso)
    : await query;

  if (error) {
    return NextResponse.json(
      { error: "load_failed", details: error.message },
      { status: 500 }
    );
  }

  const byExercise = new Map<string, PrResult>();

  for (const s of (rows ?? []) as Session[]) {
    for (const ex of s.exercises ?? []) {
      const name = ex.name?.trim();
      if (!name) continue;
      for (const set of ex.sets ?? []) {
        const w = Number(set.weight_kg);
        const r = Number(set.reps);
        if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) {
          continue;
        }
        const est1rm = w * (1 + r / 30);
        const prior = byExercise.get(name);
        if (!prior) {
          byExercise.set(name, {
            exercise: name,
            best_weight_kg: round1(w),
            best_reps: Math.round(r),
            est_1rm_kg: round1(est1rm),
            achieved_at: s.completed_at,
            set_count_ever: 1,
          });
          continue;
        }
        prior.set_count_ever += 1;
        // Tiebreak: heavier wins, then more reps at same weight.
        if (
          w > prior.best_weight_kg ||
          (w === prior.best_weight_kg && r > prior.best_reps)
        ) {
          prior.best_weight_kg = round1(w);
          prior.best_reps = Math.round(r);
          prior.est_1rm_kg = round1(est1rm);
          prior.achieved_at = s.completed_at;
        }
      }
    }
  }

  const prs = [...byExercise.values()].sort(
    (a, b) => b.est_1rm_kg - a.est_1rm_kg
  );

  return NextResponse.json({ period, count: prs.length, prs });
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
