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
export function getRouteClient(request: Request): SupabaseClient {
  const { url, key } = readEnv();
  const authHeader = request.headers.get("authorization");
  if (authHeader && /^bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^bearer\s+/i, "").trim();
    if (token) {
      return createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
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
