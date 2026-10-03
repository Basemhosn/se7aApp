import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Record the before/after diff when a user edits plate or menu scan
 * items before saving to the ledger. Pure signal collection — rows
 * are only read by offline analytics (service role) for prompt
 * tuning. No side effects. Silent 204 on empty POSTs so the client
 * can call this fire-and-forget without caring about errors.
 */
const bodySchema = z.object({
  scan_id: z.string().uuid().optional().nullable(),
  source: z.enum(["plate_scan", "menu_scan"]),
  // We don't validate the item shape — model prompts evolve, and
  // we want to store whatever the client has even if the schema
  // shifts between builds. Bounded size via overall body cap.
  original_items: z.array(z.record(z.string(), z.unknown())).max(50),
  final_items: z.array(z.record(z.string(), z.unknown())).max(50),
});

export async function POST(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("scan_corrections").insert({
    user_id: user.id,
    scan_id: parsed.data.scan_id ?? null,
    source: parsed.data.source,
    original_items: parsed.data.original_items,
    final_items: parsed.data.final_items,
  });

  if (error) {
    return NextResponse.json(
      { error: "persist_failed", details: error.message },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
