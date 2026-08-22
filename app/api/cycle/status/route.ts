import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import {
  DEFAULT_CYCLE_PREFS,
  computeCycleStatus,
  type CyclePrefs,
} from "@/lib/cycle";

export const runtime = "nodejs";

/**
 * GET → current cycle status + prefs + recent history (last 12 entries).
 *
 * When prefs.enabled is false, the response still returns a stable
 * shape (enabled: false) so the client can render the "enable this
 * feature" state without a separate endpoint.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [profileRes, periodsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("cycle_prefs")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("cycle_periods")
      .select("id, started_on, ended_on, flow, notes")
      .eq("user_id", user.id)
      .order("started_on", { ascending: false })
      .limit(12),
  ]);

  const prefs = (profileRes.data?.cycle_prefs ??
    DEFAULT_CYCLE_PREFS) as CyclePrefs;
  const periods = periodsRes.data ?? [];
  const status = computeCycleStatus(
    prefs,
    periods.map((p) => ({
      started_on: String(p.started_on),
      ended_on: p.ended_on ? String(p.ended_on) : null,
    }))
  );

  return NextResponse.json({
    status,
    prefs: {
      ...DEFAULT_CYCLE_PREFS,
      ...prefs,
    },
    recent: periods,
  });
}

const patchPrefsSchema = z
  .object({
    enabled: z.boolean().optional(),
    avg_cycle_length_days: z.number().int().min(21).max(45).optional(),
    avg_period_length_days: z.number().int().min(2).max(10).optional(),
    share_with_coach: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field required",
  });

/**
 * POST → partial update of cycle_prefs. Turning enabled off keeps
 * history intact so re-enabling later restores it.
 */
export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchPrefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: current } = await supabase
    .from("profiles")
    .select("cycle_prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const merged: CyclePrefs = {
    ...DEFAULT_CYCLE_PREFS,
    ...((current?.cycle_prefs ?? {}) as Partial<CyclePrefs>),
    ...parsed.data,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ cycle_prefs: merged })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, prefs: merged });
}
