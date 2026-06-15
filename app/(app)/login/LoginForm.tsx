"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "busy" | "sent" | "error";

export default function LoginForm() {
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
      setMsg("Auth isn't configured — missing Supabase env vars.");
      return;
    }
    setState("busy");
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
      setMsg(`Check ${clean} — your link is on the way.`);
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
              : "Email me a link"}
        </button>
      </div>
      <div
        className={`waitlist-note ${
          state === "sent" ? "ok" : state === "error" ? "err" : ""
        }`}
      >
        {msg || "We send a one-tap magic link. Tap the link, you're in."}
      </div>
    </div>
  );
}
