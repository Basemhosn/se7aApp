/**
 * Read the caller's local timezone offset in minutes east of UTC.
 *
 * Prefers the X-Tz-Offset-Min header (set on every mobile api()/
 * apiUpload() call), falls back to a ?tz_offset_min=N query param for
 * clients that don't go through the JS client (iOS widget, external
 * callers), and returns undefined when neither is present — server
 * code should treat that as "assume UTC" for legacy safety.
 */
export function tzOffsetFromRequest(request: Request): number | undefined {
  const header = request.headers.get("x-tz-offset-min");
  if (header) {
    const n = Number.parseInt(header, 10);
    if (Number.isFinite(n) && Math.abs(n) <= 24 * 60) return n;
  }
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("tz_offset_min");
    if (q) {
      const n = Number.parseInt(q, 10);
      if (Number.isFinite(n) && Math.abs(n) <= 24 * 60) return n;
    }
  } catch {
    /* URL parse failed — treat as no override */
  }
  return undefined;
}

/**
 * Given a moment and a timezone offset (minutes east of UTC), return
 * the YYYY-MM-DD of the local calendar day at that moment.
 */
export function localDateIso(instant: Date, tzOffsetMin: number): string {
  const shifted = new Date(instant.getTime() + tzOffsetMin * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}
