/**
 * Open Food Facts client. Public, unauthenticated API.
 *
 * We hit product.openfoodfacts.org/api/v2/product/<code>.json and map
 * their nutriments object into our honest-range macro shape.
 *
 * OFF returns nutriments per 100g (or per 100mL for liquids). We store
 * both per-100 values and a computed "for <serving_size>" if OFF gives
 * us one. Confidence is our own judgment based on how complete the
 * response is — an item with only kcal + brand is "medium", full macros
 * is "high", nothing meaningful is refused with `found: false`.
 */

const BASE = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "SE7A/0.1 (https://se7a.app; hello@se7a.app)";
const TIMEOUT_MS = 5000;

export interface NormalizedProduct {
  code: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  serving_size_g: number | null;
  per_100g: {
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
  };
  confidence: "low" | "medium" | "high";
  source: "off";
}

interface OffNutriments {
  "energy-kcal_100g"?: number;
  energy_100g?: number; // kJ
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  product_name_ar?: string;
  brands?: string;
  image_front_small_url?: string;
  image_front_url?: string;
  serving_quantity?: string | number;
  nutriments?: OffNutriments;
}

interface OffResponse {
  status: 0 | 1;
  code?: string;
  product?: OffProduct;
}

export async function fetchProductByBarcode(
  code: string
): Promise<NormalizedProduct | null> {
  if (!/^\d{6,14}$/.test(code)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/${code}.json`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  if (!res.ok) return null;

  let body: OffResponse;
  try {
    body = (await res.json()) as OffResponse;
  } catch {
    return null;
  }

  if (body.status !== 1 || !body.product) return null;

  return normalize(code, body.product);
}

function normalize(code: string, p: OffProduct): NormalizedProduct | null {
  const name =
    p.product_name_en?.trim() ||
    p.product_name?.trim() ||
    p.product_name_ar?.trim() ||
    null;
  if (!name) return null;

  const n = p.nutriments ?? {};
  const kcal100 = numOr(n["energy-kcal_100g"], null) ?? kJtoKcal(n.energy_100g);
  const protein = numOr(n.proteins_100g, null);
  const carb = numOr(n.carbohydrates_100g, null);
  const fat = numOr(n.fat_100g, null);

  // If we have literally nothing macro-relevant, treat it as not found.
  if (kcal100 == null && protein == null && carb == null && fat == null) {
    return null;
  }

  const macroCount =
    (kcal100 != null ? 1 : 0) +
    (protein != null ? 1 : 0) +
    (carb != null ? 1 : 0) +
    (fat != null ? 1 : 0);
  const confidence: NormalizedProduct["confidence"] =
    macroCount >= 4 ? "high" : macroCount >= 2 ? "medium" : "low";

  return {
    code,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    image_url: p.image_front_small_url || p.image_front_url || null,
    serving_size_g: parseServingGrams(p.serving_quantity),
    per_100g: {
      kcal: round1(kcal100 ?? 0),
      protein_g: round1(protein ?? 0),
      carb_g: round1(carb ?? 0),
      fat_g: round1(fat ?? 0),
    },
    confidence,
    source: "off",
  };
}

function numOr(x: unknown, fallback: number | null): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const parsed = Number(x);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function kJtoKcal(kJ: number | undefined): number | null {
  if (typeof kJ !== "number" || !Number.isFinite(kJ) || kJ <= 0) return null;
  return kJ * 0.239006;
}

function parseServingGrams(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null;
  return Math.round(n);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Turn a per-100g normalized product into a range for a given portion.
 * The ±10% spread reflects real label-vs-scale variance — OFF numbers
 * are label-derived and labels round.
 */
export function scaleToPortion(
  p: NormalizedProduct,
  portionG: number
): {
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
} {
  const factor = portionG / 100;
  const spread = 0.1;
  const range = (mid: number) => ({
    low: Math.max(0, Math.round(mid * (1 - spread))),
    high: Math.max(0, Math.round(mid * (1 + spread))),
  });
  const rangeF = (mid: number) => ({
    low: Math.max(0, round1(mid * (1 - spread))),
    high: Math.max(0, round1(mid * (1 + spread))),
  });

  const k = range(p.per_100g.kcal * factor);
  const pr = rangeF(p.per_100g.protein_g * factor);
  const c = rangeF(p.per_100g.carb_g * factor);
  const f = rangeF(p.per_100g.fat_g * factor);

  return {
    kcal_low: k.low,
    kcal_high: k.high,
    protein_g_low: pr.low,
    protein_g_high: pr.high,
    carb_g_low: c.low,
    carb_g_high: c.high,
    fat_g_low: f.low,
    fat_g_high: f.high,
  };
}
