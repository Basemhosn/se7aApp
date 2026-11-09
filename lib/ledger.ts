import type { SupabaseClient } from "@supabase/supabase-js";

export interface MealItemRow {
  id: number;
  name: string;
  portion_estimate: string | null;
  source: string;
  confidence: "low" | "medium" | "high" | null;
  eaten_at: string;
  scan_id: string | null;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  sodium_mg_low?: number | null;
  sodium_mg_high?: number | null;
  fiber_g_low?: number | null;
  fiber_g_high?: number | null;
  sugar_g_low?: number | null;
  sugar_g_high?: number | null;
  saturated_fat_g_low?: number | null;
  saturated_fat_g_high?: number | null;
  /** Populated by the API route when it enriches with signed Storage URLs. */
  photo_url?: string | null;
}

export interface MacroRange {
  low: number;
  high: number;
}

export interface DailyTotals {
  items: MealItemRow[];
  kcal: MacroRange;
  protein_g: MacroRange;
  carb_g: MacroRange;
  fat_g: MacroRange;
  sodium_mg: MacroRange;
  fiber_g: MacroRange;
  sugar_g: MacroRange;
  saturated_fat_g: MacroRange;
}

export interface RemainingBudget {
  kcal: MacroRange;
  protein_g: MacroRange;
  carb_g: MacroRange;
  fat_g: MacroRange;
}

/**
 * Pull a specific day's meal_items for a user and aggregate into ranges.
 *
 * The day boundary is the user's LOCAL midnight, not UTC midnight —
 * a UTC-only cutoff meant Gulf users (UTC+4) lost every meal logged
 * between 00:00 and 04:00 local once the clock rolled past their
 * local 4am. Callers pass tzOffsetMin (minutes east of UTC, matching
 * `-new Date().getTimezoneOffset()` on the client). When both dateIso
 * and tzOffsetMin are provided, the window is exactly the calendar
 * day named by dateIso in that timezone. Both omitted → today in UTC
 * (legacy behavior; only server-side callers without a request rely
 * on this).
 */
export async function getDayTotals(
  supabase: SupabaseClient,
  userId: string,
  dateIso?: string,
  tzOffsetMin?: number
): Promise<DailyTotals> {
  const { start, end } = dayWindow(dateIso, tzOffsetMin);
  return getRangeTotals(supabase, userId, start, end);
}

/**
 * Compute the [start, end) UTC Date window for a local calendar day.
 * - dateIso + tzOffsetMin: exactly that YYYY-MM-DD in that timezone.
 * - dateIso only: 00:00 UTC of dateIso to 00:00 UTC of the next day
 *   (legacy — callers that don't know the user's tz).
 * - Neither: today in UTC.
 */
function dayWindow(
  dateIso?: string,
  tzOffsetMin?: number
): { start: Date; end: Date } {
  if (dateIso && typeof tzOffsetMin === "number") {
    const [y, m, d] = dateIso.split("-").map(Number);
    // Local midnight at (y, m, d) expressed in UTC:
    // UTC = local - offset. tzOffsetMin is minutes EAST of UTC
    // (UAE +240), so subtract that to shift local → UTC.
    const localMidnightUtcMs =
      Date.UTC(y!, (m ?? 1) - 1, d ?? 1) - tzOffsetMin * 60_000;
    const start = new Date(localMidnightUtcMs);
    const end = new Date(localMidnightUtcMs + 24 * 60 * 60 * 1000);
    return { start, end };
  }
  const base = dateIso ? dateIsoToDate(dateIso) : new Date();
  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function dateIsoToDate(iso: string): Date {
  // YYYY-MM-DD → Date at 00:00 UTC of that day.
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return out;
}

async function getRangeTotals(
  supabase: SupabaseClient,
  userId: string,
  start: Date,
  end: Date
): Promise<DailyTotals> {
  const dayStart = start.toISOString();
  const { data, error } = await supabase
    .from("meal_items")
    .select(
      "id, name, portion_estimate, source, confidence, eaten_at, scan_id, meal_slot, kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, sodium_mg_low, sodium_mg_high, fiber_g_low, fiber_g_high, sugar_g_low, sugar_g_high, saturated_fat_g_low, saturated_fat_g_high"
    )
    .eq("user_id", userId)
    .gte("eaten_at", dayStart)
    .lt("eaten_at", end.toISOString())
    .order("eaten_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []) as MealItemRow[];
  const sum = (key: keyof MealItemRow) =>
    items.reduce((acc, it) => acc + Number(it[key] ?? 0), 0);

  return {
    items,
    kcal: { low: sum("kcal_low"), high: sum("kcal_high") },
    protein_g: { low: sum("protein_g_low"), high: sum("protein_g_high") },
    carb_g: { low: sum("carb_g_low"), high: sum("carb_g_high") },
    fat_g: { low: sum("fat_g_low"), high: sum("fat_g_high") },
    // Micronutrient sums quietly ignore null cells (sum() coerces to
    // 0), so a mixed day of new+legacy items still totals correctly
    // for the items that have data.
    sodium_mg: { low: sum("sodium_mg_low"), high: sum("sodium_mg_high") },
    fiber_g: { low: sum("fiber_g_low"), high: sum("fiber_g_high") },
    sugar_g: { low: sum("sugar_g_low"), high: sum("sugar_g_high") },
    saturated_fat_g: {
      low: sum("saturated_fat_g_low"),
      high: sum("saturated_fat_g_high"),
    },
  };
}

/**
 * Attach signed Storage URLs to any items with a scan_id + stored photo.
 * Body scans never have image_path (privacy commitment) so those stay null.
 * URLs expire in an hour — plenty for a client render cycle.
 */
export async function enrichWithPhotos(
  supabase: SupabaseClient,
  items: MealItemRow[]
): Promise<MealItemRow[]> {
  const scanIds = items
    .map((it) => it.scan_id)
    .filter((id): id is string => !!id);
  if (scanIds.length === 0) {
    return items.map((it) => ({ ...it, photo_url: null }));
  }

  const { data: scans } = await supabase
    .from("scans")
    .select("id, kind, image_path")
    .in("id", scanIds);
  const scanMap = new Map(
    (scans ?? []).map((s) => [s.id as string, s as { id: string; kind: string; image_path: string | null }])
  );

  const platePaths: string[] = [];
  const menuPaths: string[] = [];
  for (const it of items) {
    if (!it.scan_id) continue;
    const scan = scanMap.get(it.scan_id);
    if (!scan?.image_path) continue;
    if (scan.kind === "plate") platePaths.push(scan.image_path);
    else if (scan.kind === "menu") menuPaths.push(scan.image_path);
  }

  const urlMap = new Map<string, string>();
  const addSigned = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const r = row as { path?: string | null; signedUrl?: string };
      if (r.path && r.signedUrl) urlMap.set(r.path, r.signedUrl);
    }
  };
  const [plateSigned, menuSigned] = await Promise.all([
    platePaths.length
      ? supabase.storage
          .from("plate-scans")
          .createSignedUrls(platePaths, 3600)
      : { data: null },
    menuPaths.length
      ? supabase.storage.from("menu-scans").createSignedUrls(menuPaths, 3600)
      : { data: null },
  ]);
  addSigned(plateSigned.data);
  addSigned(menuSigned.data);

  return items.map((it) => {
    if (!it.scan_id) return { ...it, photo_url: null };
    const scan = scanMap.get(it.scan_id);
    const path = scan?.image_path ?? null;
    return { ...it, photo_url: path ? urlMap.get(path) ?? null : null };
  });
}

/**
 * Remaining = target − eaten. Use the midpoint of each macro range so
 * the user gets a single "remaining" number; ranges over ranges read as
 * noise. The UI still shows the eaten total as a range.
 */
export function computeRemaining(
  totals: DailyTotals,
  targets: {
    daily_kcal_target: number | null;
    daily_protein_g: number | null;
    daily_carb_g: number | null;
    daily_fat_g: number | null;
  }
): RemainingBudget {
  const mid = (r: MacroRange) => (r.low + r.high) / 2;
  const remain = (target: number | null, r: MacroRange): MacroRange => ({
    // Subtract the high from the target for the "low remaining" bound
    // (worst case: ate the most), and low from target for "high remaining"
    // (best case: ate the least). Reads honestly under uncertainty.
    low: Math.round((target ?? 0) - r.high),
    high: Math.round((target ?? 0) - r.low),
  });
  return {
    kcal: remain(targets.daily_kcal_target, totals.kcal),
    protein_g: remain(targets.daily_protein_g, totals.protein_g),
    carb_g: remain(targets.daily_carb_g, totals.carb_g),
    fat_g: remain(targets.daily_fat_g, totals.fat_g),
  };
}
