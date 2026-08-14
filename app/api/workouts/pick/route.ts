import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { pickProgramSchema } from "@/lib/schemas/workout";
import { programById } from "@/lib/programs/select";

export const runtime = "nodejs";

/**
 * Set (or replace) the caller's active program. Idempotent — upserts one row.
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
  const parsed = pickProgramSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const program = programById(parsed.data.program_id);
  if (!program) {
    return NextResponse.json(
      { error: "unknown_program", details: parsed.data.program_id },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("user_programs")
    .upsert(
      {
        user_id: user.id,
        program_id: program.id,
        week_number: 1,
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, program });
}
