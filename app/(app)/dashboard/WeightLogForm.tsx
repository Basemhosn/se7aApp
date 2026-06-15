"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WeightLogForm({ currentKg }: { currentKg: number }) {
  const router = useRouter();
  const [weight, setWeight] = useState(String(currentKg));
  const [bf, setBf] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weight_kg: Number(weight),
        body_fat_pct: bf ? Number(bf) : undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(body?.error || "Couldn't save — try again.");
      return;
    }
    setMsg("Saved. Targets retuned.");
    router.refresh();
  };

  return (
    <form
      className="weigh"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit();
      }}
    >
      <label>
        <span>Weight (kg)</span>
        <input
          type="number"
          step="0.1"
          min="30"
          max="300"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
        />
      </label>
      <label>
        <span>Body fat % (optional)</span>
        <input
          type="number"
          step="0.1"
          min="3"
          max="60"
          value={bf}
          onChange={(e) => setBf(e.target.value)}
          placeholder="—"
        />
      </label>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Log + retune"}
      </button>
      {msg && <div className="waitlist-note ok">{msg}</div>}
    </form>
  );
}
