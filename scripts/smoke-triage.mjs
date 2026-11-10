#!/usr/bin/env node
/**
 * Smoke-test triage + email script. Run from GitHub Actions on an
 * 8-hour cron. Fetches the smoke report from /api/smoke, hands it
 * to Claude for a plain-English summary of what broke (if anything),
 * and emails the developer via Resend.
 *
 * Only emails when there are warnings or failures — a healthy run
 * exits silently so the inbox doesn't fill up with "all green" noise.
 *
 * Env vars (set as GitHub Actions secrets):
 *   SMOKE_URL         https://se7a.app/api/smoke
 *   ADMIN_SECRET      same value as in Vercel production env
 *   ANTHROPIC_API_KEY for the triage LLM call
 *   RESEND_API_KEY    for sending the email
 *   NOTIFY_EMAIL      where to send issue reports (one address)
 *   FROM_EMAIL        optional; defaults to onboarding@resend.dev
 */

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

const SMOKE_URL = requireEnv("SMOKE_URL");
const ADMIN_SECRET = requireEnv("ADMIN_SECRET");
const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
const NOTIFY_EMAIL = requireEnv("NOTIFY_EMAIL");
// GitHub Actions substitutes missing secrets as "" rather than undefined,
// so `??` won't fall through. Use truthy check instead.
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  console.log(`fetching ${SMOKE_URL}`);
  const res = await fetch(SMOKE_URL, {
    headers: { "x-admin-secret": ADMIN_SECRET },
    cache: "no-store",
  });
  if (!res.ok) {
    // The smoke endpoint itself failed — email the developer about
    // THAT because it means the whole monitor is down.
    const body = await res.text().catch(() => "no body");
    console.error(`smoke endpoint returned ${res.status}`);
    console.error(`response body: ${body.slice(0, 2000)}`);
    await sendEmail({
      subject: `SE7A smoke monitor is down (${res.status})`,
      body: `/api/smoke returned HTTP ${res.status}.\n\nResponse body:\n${body.slice(0, 2000)}\n\nCheck Vercel deployment status + ADMIN_SECRET in GitHub secrets.`,
    });
    process.exit(1);
  }

  const report = await res.json();
  const { ok, warn, fail, total } = report;
  console.log(`smoke: ${ok}/${total} ok · ${warn} warn · ${fail} fail`);

  if (fail === 0 && warn === 0) {
    console.log("all green — no email sent");
    return;
  }

  // Claude triage. Returns { subject, body }.
  const triage = await triageWithClaude(report);

  await sendEmail({
    subject: triage.subject,
    body: `${triage.body}\n\n---\n\nFull report:\n${JSON.stringify(report, null, 2)}`,
  });
  console.log(`emailed to ${NOTIFY_EMAIL}`);
}

async function triageWithClaude(report) {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const prompt = `You are SE7A's smoke-test triage bot. An automated health check just completed with ${report.fail} failures and ${report.warn} warnings. Write a short bug report email for the developer.

Smoke report JSON:
${JSON.stringify(report, null, 2)}

Format your response as a JSON object with exactly these two keys:
- "subject": one line, ≤80 chars. Lead with severity (CRITICAL / DEGRADED / WARN) and the single most important thing that broke. Example: "CRITICAL: DB connectivity down — all authenticated endpoints 500"
- "body": 3-6 lines of plain text. State (1) what broke in plain English, (2) your best guess at root cause based on the detail strings, (3) one concrete first step to check, (4) deployment context (env + git sha).

Rules:
- NO markdown, NO code fences, NO preamble. Output valid JSON only.
- Focus on failures first; warnings get a one-line mention at most.
- If every failure shares a pattern (e.g. all endpoints returning 401) point it out — it's usually ONE upstream cause, not N independent bugs.
- Be specific about the fix. "Check AI gateway" is useless; "Verify AI_GATEWAY_API_KEY is set in Vercel prod env" is actionable.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";

  // Strip accidental code fences if the model adds them anyway.
  const stripped = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
      return parsed;
    }
  } catch {
    /* fall through */
  }

  // Fallback to a raw dump so the email still goes out even if Claude
  // returns malformed JSON.
  return {
    subject: `SE7A smoke: ${report.fail} failures, ${report.warn} warnings`,
    body: `Triage LLM returned unparseable output — see full report below.\n\nRaw triage text:\n${text.slice(0, 500)}`,
  };
}

async function sendEmail({ subject, body }) {
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: NOTIFY_EMAIL,
    subject,
    text: body,
  });
  if (error) {
    console.error("resend error:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke triage failed:", err);
  process.exit(1);
});
