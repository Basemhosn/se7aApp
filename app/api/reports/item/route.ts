import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single endpoint for interactive report items (checkboxes + value
 * logs). One handler avoids scattering three tiny routes across the
 * tree. Actions:
 *   - toggle : flip a checkbox on/off (done=true creates the row with
 *              done_at=now(); done=false deletes it)
 *   - log    : store a value (benchmark result, note) — always sets
 *              done_at=now() alongside value_json
 *
 * RLS on the underlying table ensures a user can only affect their
 * own rows even if the mobile client sends a wrong user_id.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle"),
    report_id: z.number().int().positive(),
    item_key: z.string().min(1).max(200),
    done: z.boolean(),
  }),
  z.object({
    action: z.literal("log"),
    report_id: z.number().int().positive(),
    item_key: z.string().min(1).max(200),
    value_json: z.record(z.string(), z.unknown()),
  }),
]);

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

  if (parsed.data.action === "toggle") {
    const { report_id, item_key, done } = parsed.data;
    if (done) {
      const { error } = await supabase
        .from("report_item_completions")
        .upsert(
          {
            user_id: user.id,
            report_id,
            item_key,
            done_at: new Date().toISOString(),
          },
          { onConflict: "user_id,report_id,item_key" }
        );
      if (error) {
        return NextResponse.json(
          { error: "toggle_failed", details: error.message },
          { status: 500 }
        );
      }
    } else {
      const { error } = await supabase
        .from("report_item_completions")
        .delete()
        .eq("user_id", user.id)
        .eq("report_id", report_id)
        .eq("item_key", item_key);
      if (error) {
        return NextResponse.json(
          { error: "toggle_failed", details: error.message },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ ok: true });
  }

  // action === "log"
  const { report_id, item_key, value_json } = parsed.data;
  const { error } = await supabase
    .from("report_item_completions")
    .upsert(
      {
        user_id: user.id,
        report_id,
        item_key,
        value_json,
        done_at: new Date().toISOString(),
      },
      { onConflict: "user_id,report_id,item_key" }
    );
  if (error) {
    return NextResponse.json(
      { error: "log_failed", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
