import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { identify, resetAnalytics } from "@/lib/analytics";

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // If a stale token in AsyncStorage fails to refresh, getSession() rejects.
    // Wipe the session and continue booting rather than hanging on the loader.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
      })
      .catch(async () => {
        if (!mounted) return;
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keep PostHog's active-user identity synced with Supabase auth.
  // Previously identify() only ran once during onboarding, so a sign-
  // out → sign-in on the same device left all subsequent events tagged
  // to the first user (or anonymous after reset). Now re-identifies on
  // every session change and resets when the user signs out so
  // post-logout events don't leak into the prior profile.
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) {
      identify(uid);
    } else {
      resetAnalytics();
    }
  }, [session?.user?.id]);

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
