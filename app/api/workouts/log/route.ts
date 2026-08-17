import { NextResponse } from "next/server";
import { getAdminClient, getRouteClient } from "@/lib/supabase/server";
import { logSessionSchema } from "@/lib/schemas/workout";
import {
  claimNotification,
  loadTokensByUser,
  localDayKey,
  sendExpoPush,
  type PushMessage,
} from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Records a completed session. Client sends the exercises + sets they
 * actually did (not the target — the log is source-of-truth for progress
 * tracking).
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = logSessionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: user.id,
      program_id: parsed.data.program_id ?? null,
      session_index: parsed.data.session_index,
      session_name: parsed.data.session_name,
      exercises: parsed.data.exercises,
      duration_min: parsed.data.duration_min ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("id, completed_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  // Fire-and-forget PR celebration. We don't await the push — the user
  // shouldn't wait on a network hop for their save confirmation.
  celebratePrsIfAny(user.id, parsed.data.exercises).catch(() => {});

  return NextResponse.json({ ok: true, session: data });
}

interface ExerciseSet {
  reps?: number | null;
  weight_kg?: number | null;
}
interface Exercise {
  name?: string;
  sets?: ExerciseSet[];
}

/**
 * Compare this session's heaviest set per exercise against the user's
 * prior all-time best. Any exercise that beat its prior best fires one
 * push. Deduped per user per local day so a single-day workout with
 * multiple PRs → one notification listing them all.
 */
async function celebratePrsIfAny(userId: string, exercises: Exercise[]) {
  const admin = getAdminClient();

  // Best-in-session per exercise.
  const bestThisSession = new Map<string, { weight: number; reps: number }>();
  for (const ex of exercises ?? []) {
    const name = ex.name?.trim();
    if (!name) continue;
    for (const set of ex.sets ?? []) {
      const w = Number(set.weight_kg);
      const r = Number(set.reps);
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0)
        continue;
      const prev = bestThisSession.get(name);
      if (!prev || w > prev.weight || (w === prev.weight && r > prev.reps)) {
        bestThisSession.set(name, { weight: w, reps: r });
      }
    }
  }
  if (bestThisSession.size === 0) return;

  // Pull all prior sessions ex-this to compute pre-existing best per name.
  const { data: prior } = await admin
    .from("workout_sessions")
    .select("exercises, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(500);

  const priorBest = new Map<string, number>();
  const cutoff = Date.now();
  for (const s of prior ?? []) {
    // Exclude the session we just inserted (same second).
    if (new Date(s.completed_at as string).getTime() > cutoff - 2000) continue;
    const exs = (s.exercises as Exercise[]) ?? [];
    for (const ex of exs) {
      const name = ex.name?.trim();
      if (!name) continue;
      for (const set of ex.sets ?? []) {
        const w = Number(set.weight_kg);
        if (!Number.isFinite(w) || w <= 0) continue;
        priorBest.set(name, Math.max(priorBest.get(name) ?? 0, w));
      }
    }
  }

  const prsHit: { name: string; weight: number; reps: number }[] = [];
  for (const [name, cur] of bestThisSession.entries()) {
    const prev = priorBest.get(name) ?? 0;
    if (cur.weight > prev) {
      prsHit.push({ name, weight: cur.weight, reps: cur.reps });
    }
  }
  if (prsHit.length === 0) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("tz_offset_min, notification_prefs, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const tz = profile?.tz_offset_min ?? 0;
  const prefs = (profile?.notification_prefs ?? {}) as { pr_celebration?: boolean };
  if (prefs.pr_celebration === false) return;

  const today = localDayKey(new Date(), tz);
  const claimed = await claimNotification(admin, userId, "pr_celebration", today);
  if (!claimed) return;

  const tokensByUser = await loadTokensByUser(admin);
  const tokens = tokensByUser.get(userId) ?? [];
  if (tokens.length === 0) return;

  const summary =
    prsHit.length === 1
      ? `New ${prsHit[0]!.name} PR — ${round1(prsHit[0]!.weight)} kg × ${prsHit[0]!.reps}.`
      : `${prsHit.length} PRs today: ${prsHit
          .slice(0, 3)
          .map((p) => `${p.name} ${round1(p.weight)}kg`)
          .join(", ")}${prsHit.length > 3 ? "…" : ""}.`;

  const messages: PushMessage[] = tokens.map((tok) => ({
    to: tok.expo_token,
    title: "PR 🏋️",
    body: summary,
    data: { kind: "pr_celebration" },
  }));
  await sendExpoPush(messages);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
