import { NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase/server";
import { startFastSchema } from "@/lib/schemas/fasting";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = startFastSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("fasting_windows")
    .insert({
      user_id: user.id,
      target_hours: parsed.data.target_hours,
      notes: parsed.data.notes ?? null,
    })
    .select("id, started_at, target_hours")
    .single();

  if (error) {
    // Unique-partial-index violation = already fasting.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "already_fasting", details: "End the current fast first." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, fast: data });
}
