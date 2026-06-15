# SE7A

AI food & fitness coach — marketing site, waitlist, web product, and a
native iOS/Android app via Expo. All three vision features are live
(plate / menu / body) on both surfaces.

Built on Next.js App Router. Deployed to Vercel. Data + auth in Supabase.
Vision via Vercel AI Gateway → Anthropic Claude.

## Repo layout

```
/                          ← Next.js web app (marketing + product)
apps/
  mobile/                  ← Expo native app (see apps/mobile/README.md)
supabase/migrations/       ← SQL — shared between web and mobile
```

The web's `/api/*` routes accept either session cookies (web caller) or
`Authorization: Bearer <access_token>` (mobile caller), so the two
surfaces share the same backend.

## Routes

```
/                       ← marketing landing + waitlist
/privacy                ← privacy policy
/login                  ← magic-link sign in
/onboarding             ← first-login profile form (gated)
/dashboard              ← targets + today's ledger + weight log (gated)
/scan/plate             ← camera upload + macro review + add-to-log (gated)
/scan/menu              ← menu photo + dish ranking against today's budget (gated)
/scan/body              ← body-fat range + weeks-to-goal; photo NOT stored (gated)
/auth/callback          ← Supabase magic-link return
/api/profile            ← POST onboarding, computes + saves targets
/api/weight             ← POST weight log, retunes targets
/api/scan/plate         ← POST plate image, runs vision, persists scan
/api/scan/menu          ← POST menu image, runs vision + budget-aware ranking
/api/scan/body          ← POST body image, runs vision; image NEVER stored
/api/ledger/add         ← POST selected items to today's log
/api/ledger/today       ← GET today's totals + remaining vs targets
```

Route groups: `app/(marketing)` holds the public site, `app/(app)` holds the
gated product surface. Both render at the root URL — route groups don't add
URL segments.

## Local dev

```bash
npm install
cp .env.example .env.local       # fill in Supabase + AI Gateway keys
npm run dev
```

Requires **Node ≥ 20.6**.

Run the migrations once against your Supabase project (paste into SQL editor):

```
supabase/migrations/0001_phase0.sql   ← profiles, weight_logs, RLS, triggers
supabase/migrations/0002_phase1.sql   ← scans, meal_items, plate-scans bucket
supabase/migrations/0003_phase2.sql   ← menu-scans bucket
```

Enable magic-link auth in Supabase: **Auth → Providers → Email → Magic Link**.
Add redirect URLs (**Auth → URL Configuration → Redirect URLs**) for both
`http://localhost:3000/auth/callback` and `https://se7a.app/auth/callback`.

Get an AI Gateway key from **vercel.com/dashboard → AI Gateway → API Keys**
and put it in `.env.local` as `AI_GATEWAY_API_KEY`. On Vercel deployments this
is automatic via OIDC — no key needed in env vars.

## Tests

```bash
npm test            # node --test, tsx loader — macro math coverage
npm run typecheck   # tsc --noEmit
npm run build       # production compile
```

`lib/macros.ts` is pure functions; `lib/macros.test.ts` covers BMR
(Mifflin-St Jeor), TDEE multipliers, kcal-floor clamps, lean-mass refinement,
and the full `computeTargets` integration. **18 tests, all green.**

## Deploy

Push to `main` → Vercel auto-deploys.

Required env vars on Vercel (Production + Preview):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`AI_GATEWAY_API_KEY` is auto-injected on Vercel; no manual config needed.

## Project shape

```
app/
  (marketing)/                public landing + privacy
  (app)/                      gated: /login, /onboarding, /dashboard, /scan/plate
  auth/callback/              magic-link return
  api/
    profile/                  POST onboarding
    weight/                   POST weight log + retune
    scan/plate/               POST plate image → AI → persist
    ledger/{add,today}/       POST log items, GET today's totals
components/                   shared (Waitlist)
lib/
  supabase/                   SSR + browser + middleware clients
  schemas/                    Zod input + scan-result schemas
  prompts/                    versioned prompt strings (plate.v1, …)
  macros.ts                   BMR, TDEE, macro split, age math
  macros.test.ts              node:test coverage
  ai.ts                       AI Gateway model registry + prompt versions
  ledger.ts                   today's totals + remaining-budget helpers
middleware.ts                 refreshes Supabase session each request
supabase/migrations/          SQL — run against the prod Supabase project
```

## Brand rule, baked into every scan

Outputs are **ranges**, never point values. Every macro returned from a
vision scan has a `_low` and `_high`. The model is prompted to surface
"invisible costs" (oil, butter, hidden sugars). Confidence is enforced as
`low | medium | high`. A photo can't see the oil; we don't pretend it can.

## Roadmap

- ✅ Phase 0 — auth, profile, macro math, dashboard skeleton.
- ✅ Phase 1 — plate scan: image upload → AI Gateway → ledger entry.
- ✅ Phase 2 — menu scan: OCR + budget-aware ranking (order/consider/skip).
- ✅ Phase 3 — body composition scan: honest BF range + weeks-to-goal. Photo analyzed in memory and discarded — never stored (privacy policy commitment).
- ✅ Phase 4 — Expo native app (`apps/mobile`). Same backend, native camera, magic-link via `se7a://` deep links. EAS-ready for TestFlight; see `apps/mobile/README.md`.
