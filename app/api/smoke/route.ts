import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { pickModel } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Smoke-test endpoint. Called by the GitHub Actions scheduled workflow
 * every 8h; results are piped to Claude for triage + emailed on failure.
 *
 * Auth: x-admin-secret header must match ADMIN_SECRET env. NEVER expose
 * publicly — a failed check could leak internals (storage paths, auth
 * error messages).
 *
 * Each check returns {status, detail, latency_ms}. status is one of:
 *   ok    — expected behavior
 *   warn  — unexpected but non-fatal (e.g. slow latency, test creds
 *           not configured)
 *   fail  — something is broken; user-facing requests are likely
 *           affected
 *
 * Failures here don't page anyone directly — the GH Actions script
 * reads this response and decides whether to send email.
 */

type CheckStatus = "ok" | "warn" | "fail";

interface CheckResult {
  name: string;
  status: CheckStatus;
  latency_ms: number;
  detail: string | null;
}

async function runCheck(
  name: string,
  fn: () => Promise<{ status: CheckStatus; detail?: string }>
): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Each check is capped at 15s so one slow backend doesn't stall
    // the whole smoke. Timing budget: all checks run in parallel, so
    // the total endpoint duration ≈ max(check durations), well under
    // maxDuration=60.
    const res = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("check_timeout_15s")), 15000)
      ),
    ]);
    return {
      name,
      status: res.status,
      latency_ms: Date.now() - start,
      detail: res.detail ?? null,
    };
  } catch (e) {
    return {
      name,
      status: "fail",
      latency_ms: Date.now() - start,
      detail: (e as Error).message,
    };
  }
}

export async function GET(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || auth !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Supabase env vars missing" },
      { status: 500 }
    );
  }

  // Force-no-store fetch so Next.js Data Cache can't hand supabase-js
  // a stale response for the signin POST or any subsequent auth call
  // (fixes the Next.js+Supabase cache gotcha that was silently making
  // every .select() 60s stale — see feedback_nextjs_supabase_fetch_cache).
  const noStoreFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: "no-store" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });

  // Try to sign in as the reviewer account so we can exercise user-
  // scoped endpoints with a real JWT. If the sign-in fails, endpoint
  // checks still run but will mostly return 401 — that's fine, the
  // auth_signin check itself flags the real problem.
  let userToken: string | null = null;
  let signinDetail: string | null = null;
  const testEmail = process.env.TEST_ACCOUNT_EMAIL;
  const testPassword = process.env.TEST_ACCOUNT_PASSWORD;
  if (testEmail && testPassword) {
    try {
      const anon = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { fetch: noStoreFetch },
      });
      const { data, error } = await anon.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      userToken = data?.session?.access_token ?? null;
      if (error) signinDetail = `signin error: ${error.message}`;
      // Immediately validate the fresh token against auth.getUser() so
      // auth_signin reports the REAL state — previously we only checked
      // that a token string was returned, which hid the "token returned
      // but rejected on first use" symptom we hit after Token Pass.
      if (userToken) {
        const verify = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: {
            fetch: noStoreFetch,
            headers: { Authorization: `Bearer ${userToken}` },
          },
        });
        const { data: verifyData, error: verifyErr } = await verify.auth.getUser();
        if (verifyErr || !verifyData?.user) {
          signinDetail = `token rejected by getUser: ${verifyErr?.message ?? "no user returned"}`;
          userToken = null;
        }
      }
    } catch (e) {
      signinDetail = `signin threw: ${(e as Error).message}`;
    }
  }

  const origin = new URL(request.url).origin;
  const userFetch = (path: string, opts: RequestInit = {}) =>
    fetch(new URL(path, origin), {
      ...opts,
      cache: "no-store",
      headers: {
        ...(opts.headers ?? {}),
        ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
      },
    });

  // Endpoints exercised on a real sign-in. Each is a GET so no test
  // data gets written. Picked to cover the feature surface a user
  // hits on every launch (Home mount fans out to most of these).
  const endpoints = [
    "/api/day/status",
    "/api/ledger/today",
    "/api/water/today",
    "/api/cardio/today",
    "/api/sleep/today",
    "/api/streaks",
    "/api/fasting/current",
    "/api/reports/current",
    "/api/integrations",
    "/api/profile/prefs",
    "/api/cycle/status",
    "/api/ramadan/status",
    "/api/onboarding/checklist",
  ];

  const checks = await Promise.all([
    runCheck("auth_signin", async () => {
      if (!testEmail || !testPassword) {
        return {
          status: "warn",
          detail:
            "TEST_ACCOUNT_EMAIL / TEST_ACCOUNT_PASSWORD not set in Vercel env — endpoint checks will 401",
        };
      }
      if (!userToken) {
        return {
          status: "fail",
          detail: signinDetail ?? "no session returned",
        };
      }
      return { status: "ok", detail: `token_len=${userToken.length}` };
    }),
    runCheck("db_connectivity", async () => {
      const { error } = await admin
        .from("profiles")
        .select("user_id")
        .limit(1);
      if (error) return { status: "fail", detail: error.message };
      return { status: "ok" };
    }),
    runCheck("storage_plate_scans", async () => {
      const { error } = await admin.storage
        .from("plate-scans")
        .list("", { limit: 1 });
      if (error) return { status: "fail", detail: error.message };
      return { status: "ok" };
    }),
    runCheck("storage_profile_pics", async () => {
      const { error } = await admin.storage
        .from("profile-pics")
        .list("", { limit: 1 });
      if (error) return { status: "fail", detail: error.message };
      return { status: "ok" };
    }),
    runCheck("ai_provider", async () => {
      // Cheapest probe — minimal prompt + max 5 tokens out. Costs
      // fractions of a cent per run. Verifies pickModel's routing
      // (gateway vs direct Anthropic) and the API key is valid.
      try {
        const { text } = await generateText({
          model: pickModel("claude-haiku-4-5"),
          prompt: "Say 'ok' and nothing else.",
        });
        if (!text) return { status: "warn", detail: "empty response" };
        return { status: "ok", detail: `len=${text.length}` };
      } catch (e) {
        return { status: "fail", detail: (e as Error).message };
      }
    }),
    ...endpoints.map((path) =>
      runCheck(`GET ${path}`, async () => {
        const res = await userFetch(path);
        const detail = `HTTP ${res.status}`;
        if (res.status >= 500) return { status: "fail", detail };
        if (res.status >= 400) return { status: "warn", detail };
        return { status: "ok", detail };
      })
    ),
  ]);

  const summary = {
    ran_at: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? "unknown",
    git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    total: checks.length,
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    checks,
  };

  return NextResponse.json(summary);
}
