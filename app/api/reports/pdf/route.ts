import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One-page PDF progress summary for the last 7 days — downloadable
 * from Settings. Programmatic layout via pdf-lib (no Chromium/
 * Puppeteer; keeps the function bundle small and cold-start fast).
 *
 * Sections, top → bottom:
 *   • Header (SE7A gold, date range)
 *   • Current weight + 7d delta
 *   • Nutrition averages (kcal, P/C/F midpoints)
 *   • Activity averages (steps + burned kcal)
 *   • Streak (current + longest)
 *   • Recent badges earned (last 30d)
 *   • Footer
 *
 * All text is black ink on cream; brand colors (gold, mint, coral)
 * accent the section titles. Arabic rendering is out of scope for v1
 * (pdf-lib's standard fonts don't ship arabic shaping) — users with
 * app locale=ar still get an English PDF.
 */
export async function GET(request: Request) {
  const supabase = getRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const [
    profileRes,
    weightsRes,
    mealsRes,
    activityRes,
    cardioRes,
    badgesRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, daily_kcal_target, daily_protein_g, daily_carb_g, daily_fat_g"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .limit(500),
    supabase
      .from("meal_items")
      .select("kcal_low, kcal_high, protein_g_low, protein_g_high, carb_g_low, carb_g_high, fat_g_low, fat_g_high, eaten_at")
      .eq("user_id", user.id)
      .gte("eaten_at", start.toISOString()),
    supabase
      .from("daily_activity")
      .select("steps, active_kcal, day")
      .eq("user_id", user.id)
      .gte("day", start.toISOString().slice(0, 10)),
    supabase
      .from("cardio_sessions")
      .select("kcal_burned, duration_min, started_at")
      .eq("user_id", user.id)
      .gte("started_at", start.toISOString()),
    supabase
      .from("user_badges")
      .select("badge_key, earned_at")
      .eq("user_id", user.id)
      .gte("earned_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
      .order("earned_at", { ascending: false })
      .limit(8),
  ]);

  // Weight: current + delta over the fetched window
  const weights = (weightsRes.data ?? []) as {
    weight_kg: number;
    logged_at: string;
  }[];
  const currentKg = weights.length > 0 ? weights[weights.length - 1]!.weight_kg : null;
  const weekAgoCutoff = Date.now() - 7 * 86_400_000;
  const priorWeight = weights.find(
    (w) => new Date(w.logged_at).getTime() >= weekAgoCutoff - 86_400_000
  );
  const kgDelta =
    currentKg != null && priorWeight
      ? Math.round((currentKg - priorWeight.weight_kg) * 10) / 10
      : null;

  // Nutrition averages — meal midpoints bucketed by local day
  const meals = (mealsRes.data ?? []) as Record<string, number | string>[];
  const byDay = new Map<
    string,
    { kcal: number; p: number; c: number; f: number }
  >();
  for (const m of meals) {
    const key = String(m.eaten_at).slice(0, 10);
    const bucket = byDay.get(key) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    bucket.kcal += (Number(m.kcal_low) + Number(m.kcal_high)) / 2;
    bucket.p += (Number(m.protein_g_low) + Number(m.protein_g_high)) / 2;
    bucket.c += (Number(m.carb_g_low) + Number(m.carb_g_high)) / 2;
    bucket.f += (Number(m.fat_g_low) + Number(m.fat_g_high)) / 2;
    byDay.set(key, bucket);
  }
  const nutritionDays = byDay.size;
  const avgKcal = nutritionDays > 0
    ? Array.from(byDay.values()).reduce((s, d) => s + d.kcal, 0) / nutritionDays
    : 0;
  const avgP = nutritionDays > 0
    ? Array.from(byDay.values()).reduce((s, d) => s + d.p, 0) / nutritionDays
    : 0;
  const avgC = nutritionDays > 0
    ? Array.from(byDay.values()).reduce((s, d) => s + d.c, 0) / nutritionDays
    : 0;
  const avgF = nutritionDays > 0
    ? Array.from(byDay.values()).reduce((s, d) => s + d.f, 0) / nutritionDays
    : 0;

  // Activity averages — 7-day window
  const activity = (activityRes.data ?? []) as {
    steps: number | null;
    active_kcal: number | null;
  }[];
  const stepsTotal = activity.reduce((s, a) => s + Number(a.steps ?? 0), 0);
  const activeKcalTotal = activity.reduce(
    (s, a) => s + Number(a.active_kcal ?? 0),
    0
  );
  const cardioTotal = ((cardioRes.data ?? []) as {
    kcal_burned: number | null;
  }[]).reduce((s, c) => s + Number(c.kcal_burned ?? 0), 0);
  const avgSteps = Math.round(stepsTotal / 7);
  const avgBurn = Math.round((activeKcalTotal + cardioTotal) / 7);

  // Streak — walk backward from today
  const dayKeys = new Set(
    meals.map((m) => String(m.eaten_at).slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const k = cursor.toISOString().slice(0, 10);
    if (dayKeys.has(k)) {
      streak++;
    } else if (streak > 0) {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // ── Compose the PDF ───────────────────────────────────────────
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const gold = rgb(0.965, 0.717, 0.235);
  const ink = rgb(0.07, 0.09, 0.08);
  const dim = rgb(0.49, 0.52, 0.46);
  const mint = rgb(0.365, 0.792, 0.647);
  const coral = rgb(0.941, 0.561, 0.447);
  const line = rgb(0.74, 0.75, 0.72);

  let y = 790;

  // Header. SE7A is Helvetica-Bold at 24pt which measures ~55pt
  // wide, so "Progress Report" needs to start past x: 110 to leave
  // a clear gap. Previous x: 90 produced an "SE7Aorgress Report"
  // overlap.
  page.drawText("SE7A", {
    x: 40,
    y,
    size: 24,
    font: bold,
    color: gold,
  });
  page.drawText("Progress Report", {
    x: 115,
    y,
    size: 18,
    font: regular,
    color: ink,
  });
  const fmtDate = (d: Date): string =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  page.drawText(`${fmtDate(start)} – ${fmtDate(now)}`, {
    x: 40,
    y: y - 20,
    size: 10,
    font: mono,
    color: dim,
  });
  y -= 50;

  // Horizontal rule
  page.drawRectangle({
    x: 40,
    y: y,
    width: 515,
    height: 0.5,
    color: line,
  });
  y -= 30;

  const sectionTitle = (text: string, color = gold) => {
    page.drawText(text.toUpperCase(), {
      x: 40,
      y,
      size: 9,
      font: bold,
      color,
    });
    y -= 20;
  };

  const bigStat = (label: string, value: string, color = ink) => {
    page.drawText(value, {
      x: 40,
      y,
      size: 28,
      font: bold,
      color,
    });
    page.drawText(label, {
      x: 40,
      y: y - 14,
      size: 10,
      font: regular,
      color: dim,
    });
    y -= 50;
  };

  const kvRow = (label: string, value: string) => {
    page.drawText(label, {
      x: 40,
      y,
      size: 11,
      font: regular,
      color: ink,
    });
    page.drawText(value, {
      x: 450,
      y,
      size: 11,
      font: mono,
      color: ink,
    });
    y -= 18;
  };

  // Weight section
  sectionTitle("Weight");
  if (currentKg != null) {
    bigStat(
      kgDelta == null
        ? "current weight"
        : `${kgDelta > 0 ? "+" : ""}${kgDelta} kg over the last 7 days`,
      `${currentKg.toFixed(1)} kg`,
      kgDelta == null || Math.abs(kgDelta) < 0.1 ? ink : kgDelta > 0 ? coral : mint
    );
  } else {
    page.drawText("No weigh-ins in this period.", {
      x: 40,
      y,
      size: 11,
      font: regular,
      color: dim,
    });
    y -= 28;
  }

  // Nutrition
  sectionTitle("Nutrition averages (last 7 days)", mint);
  kvRow("Daily calories", `${Math.round(avgKcal)} kcal`);
  kvRow("Protein", `${Math.round(avgP)} g`);
  kvRow("Carbs", `${Math.round(avgC)} g`);
  kvRow("Fat", `${Math.round(avgF)} g`);
  if (profileRes.data?.daily_kcal_target) {
    kvRow("Daily target", `${profileRes.data.daily_kcal_target} kcal`);
  }
  y -= 10;

  // Activity
  sectionTitle("Activity averages (last 7 days)", coral);
  kvRow("Steps per day", avgSteps > 0 ? avgSteps.toLocaleString() : "—");
  kvRow("Burned per day", avgBurn > 0 ? `${avgBurn.toLocaleString()} kcal` : "—");
  y -= 10;

  // Streak
  sectionTitle("Streak");
  bigStat("day logging streak", `${streak}`, streak >= 7 ? gold : ink);

  // Badges
  const badges = (badgesRes.data ?? []) as {
    badge_key: string;
    earned_at: string;
  }[];
  if (badges.length > 0) {
    sectionTitle("Recent badges (last 30 days)");
    for (const b of badges.slice(0, 6)) {
      const title = b.badge_key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const dateStr = new Date(b.earned_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      kvRow(title, dateStr);
    }
  }

  // Footer
  page.drawText("se7a.app · generated " + now.toISOString().slice(0, 10), {
    x: 40,
    y: 30,
    size: 9,
    font: mono,
    color: dim,
  });

  const bytes = await pdf.save();

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="se7a-progress-${now.toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
