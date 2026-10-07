import { NextResponse } from "next/server";
import {
  getUltrahumanShareCode,
  isUltrahumanEnabled,
} from "@/lib/ultrahuman";

export const runtime = "nodejs";

/**
 * Public config for the UH integration row in Settings. Returns the
 * share code the user needs to type into the UH app, plus whether the
 * feature is enabled server-side. The master API token is never
 * returned — only the share code (which is intended to be public).
 */
export async function GET() {
  const enabled = isUltrahumanEnabled();
  const share_code = enabled ? getUltrahumanShareCode() : null;
  return NextResponse.json({
    enabled,
    share_code,
  });
}
