import { NextResponse } from "next/server";
import { PROGRAMS } from "@/lib/programs/catalog";

export const runtime = "nodejs";

/**
 * Public catalog of all programs. Mobile fetches this on first launch
 * (and caches). Cacheable — the catalog only changes on deploy.
 */
export async function GET() {
  return NextResponse.json(
    { programs: PROGRAMS },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    }
  );
}
