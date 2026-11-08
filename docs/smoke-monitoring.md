# SE7A smoke-test monitoring

Automated 8-hour health check that exercises SE7A's core infra + API
surface and emails the developer when anything breaks.

## Architecture

```
┌─────────────────┐    GET          ┌─────────────────┐
│ GitHub Actions  │ ──────────────▶ │ /api/smoke      │
│ cron (8h)       │  x-admin-secret │ (Vercel prod)   │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
         │ JSON report                       ├── signs in as test account
         │                                   ├── pings DB, storage, AI
         │                                   ├── GETs 13 API endpoints
         │                                   └── returns summary JSON
         ▼
┌─────────────────┐                 ┌─────────────────┐
│ Claude (Sonnet) │ ◀──────────────│ triage script   │
│ summarizes      │                 │ (scripts/       │
│ what broke      │                 │  smoke-triage)  │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
         └─── {subject, body} ───────────────┘
                                             │
                                             ▼
                                   ┌─────────────────┐
                                   │ Resend → email  │
                                   │ (only on fail/  │
                                   │  warn)          │
                                   └─────────────────┘
```

Healthy runs exit silently. Only `warn` or `fail` results trigger an
email — keeps the inbox a signal channel, not a status log.

## What gets checked

Infrastructure:
- `auth_signin` — sign-in as the reviewer test account works
- `db_connectivity` — `profiles` table read via service role
- `storage_plate_scans` — bucket listable
- `storage_profile_pics` — bucket listable
- `ai_provider` — cheapest possible generateText probe against the
  Haiku model (~$0.0001/run)

Endpoint smoke (as a signed-in user):
- `GET /api/day/status`
- `GET /api/ledger/today`
- `GET /api/water/today`
- `GET /api/cardio/today`
- `GET /api/sleep/today`
- `GET /api/streaks`
- `GET /api/fasting/current`
- `GET /api/reports/current`
- `GET /api/integrations`
- `GET /api/profile/prefs`
- `GET /api/cycle/status`
- `GET /api/ramadan/status`
- `GET /api/onboarding/checklist`

## Setup (one-time)

### 1 · Resend account

1. Sign up at [resend.com](https://resend.com) (free tier: 3k emails/mo)
2. Verify a domain OR use the sandbox `onboarding@resend.dev` (free
   tier can send to any address from this)
3. API Keys → Create → copy the key (starts with `re_`)

Optional: verify `se7a.app` as a sending domain so emails come from
`smoke@se7a.app` instead of `onboarding@resend.dev`. Adds a DNS TXT
record + 2 CNAME records. Worth it for production; skip for now.

### 2 · Vercel env vars

Add in Vercel → Project → Settings → Environment Variables, Production
scope:

```
TEST_ACCOUNT_EMAIL     se7atest@gmail.com
TEST_ACCOUNT_PASSWORD  ReviewSE7a-2026!xP9    (from docs/app-review-notes.md)
```

`ADMIN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already set.

Redeploy prod so the new vars + new `/api/smoke` route take effect.

### 3 · GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository
secret. Add:

| Name | Value |
|------|-------|
| `SMOKE_URL` | `https://se7a.app/api/smoke` |
| `ADMIN_SECRET` | Same value as in Vercel |
| `ANTHROPIC_API_KEY` | Any Anthropic API key — personal or the team key |
| `RESEND_API_KEY` | From step 1 |
| `NOTIFY_EMAIL` | `basem.aboulhosn@gmail.com` (or wherever reports should land) |
| `FROM_EMAIL` | *optional* — defaults to `onboarding@resend.dev`; set to `smoke@se7a.app` if you verified the domain |

### 4 · First run

Manual trigger to verify everything works end-to-end:

1. GitHub → Actions → smoke-test → Run workflow
2. Watch the run — it should finish in <30s
3. If green across the board, no email is sent (that's correct — that's
   the "no news is good news" design)
4. To force an email: temporarily rename an env var in Vercel to break
   one check, re-run, inspect the email, restore the var

### 5 · Cadence

The workflow is set to run every 8 hours (00:00, 08:00, 16:00 UTC).
Edit the cron in `.github/workflows/smoke-test.yml` to change it —
format is standard cron (5 fields, UTC). Common alternatives:

- `0 */4 * * *` — every 4 hours
- `0 */12 * * *` — every 12 hours
- `0 9,21 * * *` — twice daily at 9am and 9pm UTC

## Reading the emails

Triage emails look like:

> **Subject:** CRITICAL: AI provider down — /api/chat and /api/meal-plan will fail
>
> **Body:**
> The ai_provider check failed with "401 Unauthorized". Four other
> checks that depend on AI calls also warned, suggesting a single
> upstream cause rather than independent bugs.
>
> Likely root cause: AI_GATEWAY_API_KEY was rotated or revoked. The
> direct-Anthropic fallback also requires ANTHROPIC_API_KEY which
> appears to still be set.
>
> Next step: Vercel → Project → Settings → Environment Variables.
> Check AI_GATEWAY_API_KEY is present on Production. If it was rotated,
> get a new one from Vercel AI Gateway dashboard and redeploy.
>
> Env: production · sha: a1b2c3d

Full raw JSON report is appended below the triage.

## Costs

- **Vercel**: /api/smoke runs on existing Hobby plan. Each run is <5s
  of compute, well under limits.
- **AI gateway**: ~$0.0001 per smoke run (Haiku ping + Claude triage
  on failure). At 3 runs/day × 365 = ~$0.11/year.
- **Resend**: free tier covers 100 emails/day, 3k/month.
- **GitHub Actions**: free for public repos; on private, this uses
  ~30s × 3/day = ~45 min/month — free tier is 2000 min/month.

Total: effectively free.

## Troubleshooting

| Email received | What it probably means |
|----------------|------------------------|
| "SE7A smoke monitor is down (401)" | ADMIN_SECRET mismatch between Vercel and GitHub |
| "SE7A smoke monitor is down (500)" | /api/smoke endpoint threw — check Vercel logs |
| "CRITICAL: auth_signin failed" | TEST_ACCOUNT_EMAIL / TEST_ACCOUNT_PASSWORD wrong in Vercel, OR the reviewer account was deleted |
| "DEGRADED: GET /api/foo returned 404" | Endpoint removed in a recent deploy; update the endpoints list in route.ts, or restore the endpoint |
| "WARN: ai_provider empty response" | Rate-limited or transient; usually self-heals on the next run |

To silence alerts during planned maintenance: disable the workflow
from GitHub → Actions → smoke-test → `...` → Disable workflow.
