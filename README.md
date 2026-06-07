# se7a-site

Marketing site + waitlist + privacy policy for SE7A (se7a.app).
Next.js App Router. Deploys to Vercel. Waitlist writes to the
`waitlist` table in the se7a-prod Supabase project.

## Local dev
1. `npm install`
2. `cp .env.example .env.local` and fill in the two Supabase values
3. `npm run dev`

## Deploy
Connected to Vercel — push to `main` deploys automatically.
Env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
are set in Vercel → Project → Settings → Environment Variables.
