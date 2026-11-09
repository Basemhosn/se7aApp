import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function readEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return { url, key };
}

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Safe to call from Server Components, Route Handlers, and Server Actions.
 * Session is refreshed by the root middleware; this client just reads it.
 */
export function getServerClient(): SupabaseClient {
  const { url, key } = readEnv();
  const cookieStore = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — Next.js disallows mutating
          // cookies here. The middleware will refresh on the next request.
        }
      },
    },
    // Opt out of Next.js Data Cache — see noStoreFetch comment above.
    global: { fetch: noStoreFetch },
  });
}

/**
 * Route-handler client that authenticates from EITHER:
 *   - Authorization: Bearer <access_token>  (native / mobile callers)
 *   - the session cookie                    (web callers)
 *
 * Bearer wins when present. The Supabase client runs with RLS bound to
 * the user identified by the JWT, so all existing row-level policies
 * continue to enforce ownership the same way.
 */
/**
 * Supabase's client uses the global `fetch` under the hood. On Vercel
 * / Next.js 14, that fetch is instrumented with the Data Cache — so
 * every `select()` call to PostgREST gets cached unless we opt out
 * explicitly. Route-level `export const dynamic = "force-dynamic"` is
 * NOT enough; it disables route output caching but leaves fetch-level
 * caching intact. Result: after an INSERT / UPDATE / DELETE commits,
 * subsequent reads keep returning the pre-write snapshot for minutes.
 *
 * Wrapping the client's fetch to always pass `cache: "no-store"` forces
 * every request to bypass the Data Cache. This was the root cause of
 * the "items reappear / deleted items still show / optimistic UI never
 * reconciles with server" bugs we've been chasing.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export function getRouteClient(request: Request): SupabaseClient {
  const { url, key } = readEnv();
  const authHeader = request.headers.get("authorization");
  if (authHeader && /^bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^bearer\s+/i, "").trim();
    if (token) {
      return createClient(url, key, {
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: noStoreFetch,
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    }
  }
  return getServerClient();
}

/**
 * Admin client — bypasses RLS. Only use inside server-only paths that
 * genuinely need cross-user or service-only writes (e.g. RC webhook,
 * weekly cron, delete_current_user RPC). Never expose to route handlers
 * that a user calls directly without independent auth.
 */
export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Opt out of Next.js Data Cache — see noStoreFetch comment above.
    global: { fetch: noStoreFetch },
  });
}
