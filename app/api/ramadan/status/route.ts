import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";
import {
  DEFAULT_RAMADAN_PREFS,
  computeStatus,
  type RamadanPrefs,
} from "@/lib/ramadan";
import { fetchPrayerTimesForDate } from "@/lib/prayerTimes";

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
    .select("ramadan_prefs, city, country")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawPrefs = (data?.ramadan_prefs ?? DEFAULT_RAMADAN_PREFS) as RamadanPrefs;
  const prefs = await withAladhanTimes(rawPrefs, data?.city, data?.country);

  const status = computeStatus(prefs);
  return NextResponse.json({
    ...status,
    times_source: prefs === rawPrefs ? "manual" : "aladhan",
    city: data?.city ?? null,
    country: data?.country ?? null,
  });
}

/**
 * If the user has a city + country set and auto_detect is on, overlay
 * live Aladhan fajr/maghrib onto their prefs before computeStatus runs.
 * On any failure (unresolvable city, network flake, Redis down) we
 * return the original prefs so the user still gets a status back.
 */
async function withAladhanTimes(
  prefs: RamadanPrefs,
  city: string | null | undefined,
  country: string | null | undefined
): Promise<RamadanPrefs> {
  if (!prefs.auto_detect) return prefs;
  if (!city || !country) return prefs;
  const times = await fetchPrayerTimesForDate(city, country, new Date());
  if (!times) return prefs;
  return {
    ...prefs,
    fajr_time: times.fajr,
    maghrib_time: times.maghrib,
  };
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
    .select("ramadan_prefs, city, country")
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

  const withTimes = await withAladhanTimes(
    merged,
    current?.city,
    current?.country
  );
  return NextResponse.json({
    ...computeStatus(withTimes),
    times_source: withTimes === merged ? "manual" : "aladhan",
    city: current?.city ?? null,
    country: current?.country ?? null,
  });
}
