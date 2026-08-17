"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

const REF_KEY = "se7a_ref_code";

type FormState = "idle" | "busy" | "sent" | "error";

/**
 * Login-form variant used on the /join/[code] landing. Stores the ref
 * code in sessionStorage before firing the magic link, so /auth/callback
 * can attach it after the user completes sign-in.
 */
export default function JoinForm({ referralCode }: { referralCode: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [msg, setMsg] = useState("");

  const send = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setState("error");
      setMsg("That doesn't look like an email — try again?");
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setState("error");
      setMsg("Auth isn't configured yet.");
      return;
    }
    try {
      sessionStorage.setItem(REF_KEY, referralCode);
    } catch {
      /* private browsing — attribution will fail silently, no user impact */
    }
    setState("busy");
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?ref=${referralCode}`,
      },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
      setMsg(`Check ${clean} — your invite link is on the way.`);
    }
  };

  return (
    <div className="waitlist">
      <div className="waitlist-row">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && state !== "busy" && send()}
          disabled={state === "busy" || state === "sent"}
          aria-label="Email address"
        />
        <button
          className="btn"
          onClick={send}
          disabled={state === "busy" || state === "sent"}
        >
          {state === "busy"
            ? "Sending…"
            : state === "sent"
              ? "✓ Sent"
              : "Get my invite"}
        </button>
      </div>
      <div
        className={`waitlist-note ${
          state === "sent" ? "ok" : state === "error" ? "err" : ""
        }`}
      >
        {msg || "One-tap link. Tap the link, you're in."}
      </div>
    </div>
  );
}
