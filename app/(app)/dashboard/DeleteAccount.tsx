"use client";

import { useState } from "react";

type State = "idle" | "confirming" | "deleting" | "error";

export default function DeleteAccount({ email }: { email: string }) {
  const [state, setState] = useState<State>("idle");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");

  const canConfirm = typed.trim().toLowerCase() === "delete";

  const doDelete = async () => {
    if (!canConfirm) return;
    setState("deleting");
    setErr("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
      };
      if (!res.ok) {
        setState("error");
        setErr(body.details || body.error || `HTTP ${res.status}`);
        return;
      }
      window.location.href = "/";
    } catch (e) {
      setState("error");
      setErr((e as Error).message || "Couldn't delete — try again.");
    }
  };

  if (state === "idle") {
    return (
      <div>
        <p className="dim" style={{ marginBottom: 12 }}>
          Permanently remove your profile, all logs, all scans, and every
          photo you&apos;ve uploaded. This can&apos;t be undone. Signed in as{" "}
          <span className="mono">{email}</span>.
        </p>
        <button
          className="btn"
          type="button"
          onClick={() => setState("confirming")}
          style={{
            background: "transparent",
            border: "1px solid var(--coral, #f08f72)",
            color: "var(--coral, #f08f72)",
            cursor: "pointer",
          }}
        >
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="dim" style={{ marginBottom: 12 }}>
        Type <span className="mono">DELETE</span> to confirm. This action is
        immediate and irreversible.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          disabled={state === "deleting"}
          autoCapitalize="characters"
          style={{
            flex: 1,
            minWidth: 160,
            padding: "10px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            background: "transparent",
            color: "inherit",
            border: "1px solid var(--line, #2a2f26)",
            borderRadius: 6,
          }}
        />
        <button
          className="btn"
          type="button"
          onClick={doDelete}
          disabled={!canConfirm || state === "deleting"}
          style={{
            background: canConfirm ? "var(--coral, #f08f72)" : "transparent",
            color: canConfirm ? "var(--bg, #0b0d0b)" : "var(--dim, #8a937f)",
            border: "1px solid var(--coral, #f08f72)",
            cursor: canConfirm && state !== "deleting" ? "pointer" : "not-allowed",
            opacity: state === "deleting" ? 0.6 : 1,
          }}
        >
          {state === "deleting" ? "Deleting…" : "Delete forever"}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setState("idle");
            setTyped("");
            setErr("");
          }}
          disabled={state === "deleting"}
          style={{
            background: "transparent",
            border: "1px solid var(--line, #2a2f26)",
            color: "inherit",
            cursor: state === "deleting" ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      {!!err && (
        <p style={{ color: "var(--coral, #f08f72)", marginTop: 10, fontSize: 13 }}>
          {err}
        </p>
      )}
    </div>
  );
}
