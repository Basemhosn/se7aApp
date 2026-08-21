import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import {
  DEFAULT_RAMADAN_PREFS,
  computeStatus,
  type RamadanPrefs,
} from "@/lib/ramadan";

export const runtime = "nodejs";

/**
 * GET → current Ramadan status for this user (active flag, day num,
 * countdown to iftar, prefs). Auto-detects from a local date table if
 * the user hasn't overridden.
 *
 * POST → partial update of ramadan_prefs (merges into existing jsonb).
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("ramadan_prefs")
    .eq("user_id", user.id)
    .maybeSingle();

  const status = computeStatus(
    (data?.ramadan_prefs ?? DEFAULT_RAMADAN_PREFS) as RamadanPrefs
  );
  return NextResponse.json(status);
}

const patchSchema = z
  .object({
    auto_detect: z.boolean().optional(),
    enabled_override: z.boolean().nullable().optional(),
    fajr_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    maghrib_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    suhoor_reminder: z.boolean().optional(),
    iftar_reminder: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field required",
  });

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: current } = await supabase
    .from("profiles")
    .select("ramadan_prefs")
    .eq("user_id", user.id)
    .maybeSingle();
  const merged: RamadanPrefs = {
    ...DEFAULT_RAMADAN_PREFS,
    ...((current?.ramadan_prefs ?? {}) as Partial<RamadanPrefs>),
    ...parsed.data,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ ramadan_prefs: merged })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "save_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(computeStatus(merged));
}
