"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Sex = "male" | "female";
type Activity =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
type Goal = "cut" | "recomp" | "maintain" | "bulk";

const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: "Sedentary — desk job, little exercise",
  light: "Light — light exercise 1–3 days/wk",
  moderate: "Moderate — exercise 3–5 days/wk",
  active: "Active — hard exercise 6–7 days/wk",
  very_active: "Very active — pro athlete / physical job",
};

const GOAL_LABEL: Record<Goal, string> = {
  cut: "Cut — lose fat",
  recomp: "Recomp — lose fat + build muscle",
  maintain: "Maintain — hold current weight",
  bulk: "Bulk — gain muscle",
};

const DEFAULT_RATE: Record<Goal, number> = {
  cut: -0.5,
  recomp: -0.25,
  maintain: 0,
  bulk: 0.25,
};

export default function OnboardingForm({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [display_name, setDisplayName] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [height_cm, setHeightCm] = useState("");
  const [weight_kg, setWeightKg] = useState("");
  const [activity_level, setActivity] = useState<Activity>("moderate");
  const [goal, setGoal] = useState<Goal>("cut");
  const [goal_rate, setGoalRate] = useState<number>(DEFAULT_RATE.cut);

  const onGoalChange = (g: Goal) => {
    setGoal(g);
    setGoalRate(DEFAULT_RATE[g]);
  };

  const submit = async () => {
    setErr("");
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: display_name.trim() || undefined,
        sex,
        birthdate,
        height_cm: Number(height_cm),
        weight_kg: Number(weight_kg),
        activity_level,
        goal,
        goal_rate_kg_per_week: goal_rate,
        units: "metric",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setErr(body?.details?.formErrors?.[0] || body?.error || "Couldn't save — check the fields and try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form
      className="onboard"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit();
      }}
    >
      <div className="onboard-row">
        <label>
          <span>Display name (optional)</span>
          <input
            type="text"
            value={display_name}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={email.split("@")[0]}
          />
        </label>
      </div>

      <div className="onboard-row two">
        <label>
          <span>Sex (for BMR formula)</span>
          <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label>
          <span>Birthdate</span>
          <input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            required
          />
        </label>
      </div>

      <div className="onboard-row two">
        <label>
          <span>Height (cm)</span>
          <input
            type="number"
            min="100"
            max="250"
            step="0.5"
            value={height_cm}
            onChange={(e) => setHeightCm(e.target.value)}
            required
          />
        </label>
        <label>
          <span>Weight (kg)</span>
          <input
            type="number"
            min="30"
            max="300"
            step="0.1"
            value={weight_kg}
            onChange={(e) => setWeightKg(e.target.value)}
            required
          />
        </label>
      </div>

      <div className="onboard-row">
        <label>
          <span>Activity level</span>
          <select
            value={activity_level}
            onChange={(e) => setActivity(e.target.value as Activity)}
          >
            {(
              ["sedentary", "light", "moderate", "active", "very_active"] as Activity[]
            ).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="onboard-row two">
        <label>
          <span>Goal</span>
          <select
            value={goal}
            onChange={(e) => onGoalChange(e.target.value as Goal)}
          >
            {(["cut", "recomp", "maintain", "bulk"] as Goal[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Rate (kg / week)</span>
          <input
            type="number"
            step="0.05"
            min="-1.5"
            max="1.0"
            value={goal_rate}
            onChange={(e) => setGoalRate(Number(e.target.value))}
          />
        </label>
      </div>

      {err && <div className="waitlist-note err">{err}</div>}

      <button className="btn onboard-cta" type="submit" disabled={busy}>
        {busy ? "Calculating…" : "Compute my targets"}
      </button>
    </form>
  );
}
