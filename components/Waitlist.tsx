"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

type WaitlistState = "idle" | "busy" | "done" | "error";

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<WaitlistState>("idle");
  const [msg, setMsg] = useState("");

  const join = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setState("error");
      setMsg("That doesn't look like an email \u2014 try again?");
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setState("error");
      setMsg("Waitlist isn't wired up yet \u2014 missing Supabase env vars.");
      return;
    }
    setState("busy");
    const { error } = await supabase.from("waitlist").insert({ email: clean });
    if (error && error.code === "23505") {
      setState("done");
      setMsg("You're already on the list \u2014 sahtain, we'll be in touch.");
    } else if (error) {
      setState("error");
      setMsg("Something went wrong \u2014 try again in a moment.");
    } else {
      setState("done");
      setMsg("You're in. We'll email you when the beta opens. Sahtain!");
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
          onKeyDown={(e) => e.key === "Enter" && state !== "busy" && join()}
          disabled={state === "done"}
          aria-label="Email address"
        />
        <button className="btn" onClick={join} disabled={state === "busy" || state === "done"}>
          {state === "busy" ? "Joining\u2026" : state === "done" ? "\u2713 On the list" : "Join the waitlist"}
        </button>
      </div>
      <div className={`waitlist-note ${state === "done" ? "ok" : state === "error" ? "err" : ""}`}>
        {msg || "First beta invites go out via TestFlight \u00b7 UAE first, GCC next."}
      </div>
    </div>
  );
}
