import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/**
 * Build a print-friendly HTML representation of the 90-Day Plan and
 * hand it to expo-print → expo-sharing so the user can save/AirDrop
 * the resulting PDF. Client-side generation keeps the backend simple;
 * layout is intentionally document-style (sequential sections) rather
 * than tabs-with-navigation, because a PDF is read top-to-bottom.
 */

interface Range {
  low: number;
  high: number;
}

// Loose types — we accept the whole plan blob and pull what we render.
// Kept intentionally permissive so a schema drift doesn't crash export.
type AnyPlan = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const rangeStr = (r?: Range) =>
  r ? `${esc(r.low)}–${esc(r.high)}` : "";

const ul = (items: string[] | undefined) =>
  items && items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : "";

function heroHtml(plan: AnyPlan): string {
  const h = plan.hero ?? {};
  return `
<section class="hero">
  <h1>${esc(h.headline)}</h1>
  <p class="tldr">${esc(h.tldr)}</p>
  ${
    Array.isArray(h.safety_notes) && h.safety_notes.length
      ? `<div class="safety"><h4>SAFETY NOTES</h4>${ul(h.safety_notes)}</div>`
      : ""
  }
</section>`;
}

function nutritionHtml(plan: AnyPlan): string {
  const n = plan.nutrition ?? {};
  const phases = Array.isArray(n.phases) ? n.phases : [];
  const phaseBlocks = phases
    .map(
      (p: AnyPlan) => `
    <div class="phase-card">
      <div class="phase-head">
        <span class="phase-tag">PHASE ${esc(p.phase_index)} · WEEKS ${esc(p.weeks)}</span>
        <span class="phase-name">${esc(p.name)}</span>
      </div>
      <p>${esc(p.focus)}</p>
      <div class="macros">
        <div><span>${rangeStr(p.daily_kcal)}</span><small>kcal</small></div>
        <div><span>${rangeStr(p.protein_g)}g</span><small>protein</small></div>
        <div><span>${rangeStr(p.carb_g)}g</span><small>carbs</small></div>
        <div><span>${rangeStr(p.fat_g)}g</span><small>fat</small></div>
      </div>
      ${
        Array.isArray(p.adjustment_rules) && p.adjustment_rules.length
          ? `<h5>Adjustment rules</h5>${ul(p.adjustment_rules)}`
          : ""
      }
    </div>`
    )
    .join("");
  return `
<section>
  <h2>Nutrition</h2>
  <p>${esc(n.rationale)}</p>
  ${phaseBlocks}
</section>`;
}

function mealsHtml(plan: AnyPlan): string {
  const m = plan.meals ?? {};
  const days = Array.isArray(m.days) ? m.days : [];
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayBlocks = days
    .map(
      (d: AnyPlan) => `
    <div class="day">
      <h4>${esc(dayNames[d.day_of_week] ?? `Day ${(d.day_of_week ?? 0) + 1}`)}</h4>
      ${(d.meals ?? [])
        .map(
          (meal: AnyPlan) => `
        <div class="meal">
          <div class="meal-head">
            <span class="slot">${esc(meal.slot)}</span>
            <span class="kcal">${rangeStr(meal.kcal)} kcal</span>
          </div>
          <div class="meal-name">${esc(meal.name)}</div>
          <div class="meal-portion">${esc(meal.portion)}</div>
          ${
            Array.isArray(meal.swap_ideas) && meal.swap_ideas.length
              ? `<div class="meal-swaps">Swaps: ${meal.swap_ideas.map(esc).join(" · ")}</div>`
              : ""
          }
        </div>`
        )
        .join("")}
    </div>`
    )
    .join("");
  return `
<section>
  <h2>Meals · 7-Day Sample</h2>
  ${dayBlocks}
  <h4>Grocery staples</h4>
  ${ul(m.grocery_staples ?? [])}
  <h4>Eating out</h4>
  ${ul(m.eating_out_rules ?? [])}
</section>`;
}

function trainingHtml(plan: AnyPlan): string {
  const tr = plan.training ?? {};
  const phases = Array.isArray(tr.phases) ? tr.phases : [];
  const phaseBlocks = phases
    .map(
      (p: AnyPlan) => `
    <div class="phase-card">
      <div class="phase-head">
        <span class="phase-tag">PHASE ${esc(p.phase_index)} · WEEKS ${esc(p.weeks)}</span>
        <span class="phase-name">${esc(p.name)}</span>
      </div>
      <p>${esc(p.focus)}</p>
      ${(p.weekly_sessions ?? [])
        .map(
          (s: AnyPlan) => `
        <div class="session">
          <h4>Day ${esc((s.day_index ?? 0) + 1)} · ${esc(s.focus)} <small>(~${esc(s.duration_min)} min)</small></h4>
          ${s.warmup ? `<div class="wc"><strong>Warmup:</strong> ${esc(s.warmup)}</div>` : ""}
          <table class="ex-table">
            <thead>
              <tr><th>Exercise</th><th>Sets × Reps</th><th>Rest</th><th>Notes / Substitutions</th></tr>
            </thead>
            <tbody>
              ${(s.exercises ?? [])
                .map(
                  (ex: AnyPlan) => `
                <tr>
                  <td>${esc(ex.name)}</td>
                  <td>${esc(ex.sets)} × ${esc(ex.reps)}</td>
                  <td>${esc(ex.rest_seconds)}s</td>
                  <td>${esc(ex.notes)}${
                    Array.isArray(ex.substitutions) && ex.substitutions.length
                      ? `<br><em>Alt: ${ex.substitutions.map(esc).join(" · ")}</em>`
                      : ""
                  }</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
          ${s.cooldown ? `<div class="wc"><strong>Cooldown:</strong> ${esc(s.cooldown)}</div>` : ""}
        </div>`
        )
        .join("")}
      ${
        Array.isArray(p.progression_rules) && p.progression_rules.length
          ? `<h5>Progression rules</h5>${ul(p.progression_rules)}`
          : ""
      }
    </div>`
    )
    .join("");
  return `
<section>
  <h2>Training</h2>
  ${phaseBlocks}
  <div class="block">
    <h4>General notes · Autoregulation</h4>
    <p>${esc(tr.general_notes)}</p>
    <h4>Deload rule</h4>
    <p>${esc(tr.deload_rule)}</p>
    <h4>Cardio prescription</h4>
    <p>${esc(tr.cardio_prescription)}</p>
  </div>
</section>`;
}

function habitsHtml(plan: AnyPlan): string {
  const h = plan.habits ?? {};
  const phases = Array.isArray(h.phases) ? h.phases : [];
  const scenarios = Array.isArray(h.hard_scenarios) ? h.hard_scenarios : [];
  const phaseBlocks = phases
    .map(
      (p: AnyPlan) => `
    <div class="phase-card">
      <div class="phase-head">
        <span class="phase-tag">PHASE ${esc(p.phase_index)} · WEEKS ${esc(p.weeks)}</span>
        <span class="phase-name">${esc(p.name)}</span>
      </div>
      <p>${esc(p.focus)}</p>
      <h5>Daily habits</h5>
      ${ul(p.daily_habits)}
      ${
        Array.isArray(p.sleep_recovery_rules) && p.sleep_recovery_rules.length
          ? `<h5>Sleep & recovery</h5>${ul(p.sleep_recovery_rules)}`
          : ""
      }
    </div>`
    )
    .join("");
  const scenarioBlocks = scenarios
    .map(
      (s: AnyPlan) => `
    <div class="scenario">
      <div class="scenario-head">
        <span class="cat">${esc(s.category)}</span>
        <span class="title">${esc(s.title)}</span>
      </div>
      <p>${esc(s.rule)}</p>
    </div>`
    )
    .join("");
  return `
<section>
  <h2>Habits</h2>
  ${phaseBlocks}
  <h3>Contingencies · When life happens</h3>
  ${scenarioBlocks}
  <h4>Cravings playbook</h4>
  ${ul(h.cravings_playbook)}
</section>`;
}

function trackingHtml(plan: AnyPlan): string {
  const t = plan.tracking ?? {};
  const measurements = Array.isArray(t.measurements) ? t.measurements : [];
  return `
<section>
  <h2>Tracking</h2>
  <h4>What to measure</h4>
  <table class="ex-table">
    <thead><tr><th>Metric</th><th>Frequency</th></tr></thead>
    <tbody>
      ${measurements
        .map(
          (m: AnyPlan) =>
            `<tr><td>${esc(m.name)}</td><td>${esc(m.how_often)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>
  <h4>Weekly review questions</h4>
  ${ul(t.weekly_review_questions)}
  <h4>Reading the trends</h4>
  ${ul(t.trend_interpretation_rules)}
</section>`;
}

function roadmapHtml(plan: AnyPlan): string {
  const r = plan.roadmap ?? {};
  const weeks = Array.isArray(r.weeks) ? r.weeks : [];
  const monthly = Array.isArray(r.monthly_reviews) ? r.monthly_reviews : [];
  const benchmarks = Array.isArray(r.benchmarks) ? r.benchmarks : [];
  return `
<section>
  <h2>Roadmap · Week by Week</h2>
  ${weeks
    .map(
      (w: AnyPlan) => `
    <div class="week">
      <h4>Week ${esc(w.week_index)} · ${esc(w.theme)}</h4>
      <p>${esc(w.focus)}</p>
      <p class="checkpoint"><em>Checkpoint:</em> ${esc(w.checkpoint)}</p>
    </div>`
    )
    .join("")}
  ${
    monthly.length
      ? `<h3>Monthly reviews</h3>${monthly
          .map(
            (m: AnyPlan) => `
    <div class="month-review">
      <strong>Month ${esc(m.month_index)}:</strong> ${esc(m.prompt)}
    </div>`
          )
          .join("")}`
      : ""
  }
  ${
    benchmarks.length
      ? `<h3>Benchmarks · Retests</h3>${benchmarks
          .map(
            (b: AnyPlan) => `
    <div class="benchmark">
      <h4>Week ${esc(b.week_index)} — ${esc(b.name)}</h4>
      <p>${esc(b.how)}</p>
      <p class="target"><em>Target:</em> ${esc(b.target)}</p>
    </div>`
          )
          .join("")}`
      : ""
  }
</section>`;
}

function buildHtml(plan: AnyPlan, meta: { weekIndex: number; totalWeeks: number; generatedAt: string }): string {
  const generatedDate = new Date(meta.generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>SE7A 90-Day Plan</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; line-height: 1.5; font-size: 11pt; }
  h1 { font-size: 22pt; margin: 0 0 8pt 0; color: #b9852c; }
  h2 { font-size: 16pt; margin: 24pt 0 8pt 0; color: #1a1a1a; border-bottom: 2px solid #b9852c; padding-bottom: 4pt; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 16pt 0 6pt 0; }
  h4 { font-size: 11pt; margin: 12pt 0 4pt 0; text-transform: uppercase; letter-spacing: 0.06em; color: #5a5a5a; page-break-after: avoid; }
  h5 { font-size: 10pt; margin: 10pt 0 4pt 0; text-transform: uppercase; letter-spacing: 0.08em; color: #7a7a7a; }
  p, li { margin: 4pt 0; }
  small { color: #7a7a7a; font-size: 9pt; }
  ul { padding-left: 18pt; margin: 4pt 0 8pt 0; }
  .cover { text-align: left; margin-bottom: 24pt; }
  .cover .meta { font-family: "SF Mono", Menlo, monospace; font-size: 9pt; color: #7a7a7a; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6pt; }
  .tldr { font-size: 12pt; color: #333; margin-bottom: 12pt; }
  .safety { border: 1px solid #d13b3b; background: #fdf2f2; padding: 10pt 12pt; margin-top: 12pt; border-radius: 4pt; }
  .safety h4 { color: #d13b3b; margin-top: 0; }
  section { page-break-inside: auto; margin-bottom: 18pt; }
  .phase-card { border-left: 3px solid #b9852c; padding-left: 10pt; margin: 12pt 0; page-break-inside: avoid; }
  .phase-head { display: flex; gap: 10pt; align-items: baseline; margin-bottom: 4pt; }
  .phase-tag { font-family: "SF Mono", Menlo, monospace; font-size: 8pt; letter-spacing: 0.1em; color: #b9852c; }
  .phase-name { font-weight: 700; font-size: 12pt; }
  .macros { display: flex; gap: 12pt; margin: 8pt 0; }
  .macros > div { flex: 1; border: 1px solid #ddd; padding: 6pt 8pt; border-radius: 4pt; }
  .macros span { font-weight: 700; font-size: 11pt; display: block; }
  .macros small { display: block; font-size: 8pt; color: #7a7a7a; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2pt; }
  .day { border-left: 2px solid #d9c88a; padding-left: 10pt; margin: 10pt 0; page-break-inside: avoid; }
  .day h4 { color: #333; text-transform: none; letter-spacing: 0; }
  .meal { margin: 6pt 0; padding-bottom: 6pt; border-bottom: 1px solid #eee; }
  .meal-head { display: flex; justify-content: space-between; font-family: "SF Mono", Menlo, monospace; font-size: 8pt; text-transform: uppercase; color: #7a7a7a; letter-spacing: 0.08em; }
  .meal-name { font-weight: 600; font-size: 11pt; }
  .meal-portion { color: #555; font-size: 10pt; }
  .meal-swaps { color: #7a7a7a; font-style: italic; font-size: 9pt; margin-top: 2pt; }
  .session { margin: 10pt 0; page-break-inside: avoid; }
  .wc { background: #f6f4ed; padding: 6pt 8pt; margin: 4pt 0; font-size: 10pt; border-radius: 3pt; }
  .ex-table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 9pt; }
  .ex-table th, .ex-table td { border-bottom: 1px solid #eee; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  .ex-table th { background: #f6f4ed; font-family: "SF Mono", Menlo, monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #5a5a5a; }
  .scenario { border: 1px solid #ddd; padding: 8pt 10pt; margin: 6pt 0; border-radius: 4pt; page-break-inside: avoid; }
  .scenario-head { display: flex; gap: 8pt; align-items: baseline; margin-bottom: 4pt; }
  .scenario-head .cat { font-family: "SF Mono", Menlo, monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #b9852c; }
  .scenario-head .title { font-weight: 700; }
  .week { border-left: 2px solid #b9852c; padding-left: 10pt; margin: 8pt 0; page-break-inside: avoid; }
  .week h4 { color: #333; text-transform: none; letter-spacing: 0; }
  .checkpoint { color: #7a7a7a; font-size: 10pt; }
  .month-review { padding: 6pt 0; border-bottom: 1px solid #eee; font-size: 10pt; }
  .benchmark { border: 1px solid #2e8b6b; padding: 8pt 10pt; margin: 6pt 0; border-radius: 4pt; page-break-inside: avoid; }
  .benchmark h4 { color: #2e8b6b; text-transform: none; letter-spacing: 0; margin: 0 0 4pt 0; }
  .target { font-style: italic; color: #555; font-size: 10pt; }
</style>
</head>
<body>
<div class="cover">
  <div class="meta">SE7A · 90-DAY PLAN · WEEK ${meta.weekIndex} OF ${meta.totalWeeks} · GENERATED ${generatedDate}</div>
</div>
${heroHtml(plan)}
${nutritionHtml(plan)}
${mealsHtml(plan)}
${trainingHtml(plan)}
${habitsHtml(plan)}
${trackingHtml(plan)}
${roadmapHtml(plan)}
</body>
</html>`;
}

export async function exportReportAsPdf(args: {
  plan: AnyPlan;
  weekIndex: number;
  totalWeeks: number;
  generatedAt: string;
}): Promise<{ uri: string } | { error: string }> {
  try {
    const html = buildHtml(args.plan, {
      weekIndex: args.weekIndex,
      totalWeeks: args.totalWeeks,
      generatedAt: args.generatedAt,
    });
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "SE7A · 90-Day Plan",
        UTI: "com.adobe.pdf",
      });
    }
    return { uri };
  } catch (e) {
    return { error: (e as Error).message ?? "pdf_failed" };
  }
}
