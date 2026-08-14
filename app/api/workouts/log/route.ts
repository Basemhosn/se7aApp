import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { logSessionSchema } from "@/lib/schemas/workout";

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

  return NextResponse.json({ ok: true, session: data });
}
