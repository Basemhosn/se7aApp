"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { BodyScanResult } from "@/lib/schemas/body";
import type { BodyProjection } from "@/lib/body";

type Phase = "idle" | "analyzing" | "result";
type Pose = "front" | "side" | "back";

interface ScanResponse {
  ok: boolean;
  scan_id: string;
  result: BodyScanResult;
  projection: BodyProjection | null;
}

export default function BodyScanFlow() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<BodyScanResult | null>(null);
  const [projection, setProjection] = useState<BodyProjection | null>(null);
  const [pose, setPose] = useState<Pose>("front");

  const onPick = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    analyze(file);
  };

  const analyze = async (file: File) => {
    setErr("");
    setPhase("analyzing");
    const form = new FormData();
    form.append("image", file);
    form.append("pose", pose);
    const res = await fetch("/api/scan/body", { method: "POST", body: form });
    const body: ScanResponse | { error: string; details?: unknown } = await res
      .json()
      .catch(() => ({ error: "bad_response" }));
    if (!res.ok || !("ok" in body) || !body.ok) {
      setErr(
        ("details" in body && typeof body.details === "string"
          ? body.details
          : null) ||
          ("error" in body ? String(body.error) : "Couldn't analyze the photo.")
      );
      setPhase("idle");
      return;
    }
    setResult(body.result);
    setProjection(body.projection);
    setPhase("result");
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setProjection(null);
    setErr("");
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="scan-flow">
      {phase === "idle" && (
        <div className="upload-card">
          <div className="pose-chips">
            {(["front", "side", "back"] as Pose[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${pose === p ? " chip-on" : ""}`}
                onClick={() => setPose(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12, marginBottom: 14 }}>
            Pick the angle of the photo you&apos;re about to upload.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          <button
            className="btn upload-btn"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            Upload {pose} photo
          </button>
          <p className="dim" style={{ marginTop: 18, fontSize: 13, maxWidth: 420 }}>
            Tight-fitting clothing, neutral lighting, and a full-body frame give
            the best estimate. Loose shirts hide the waist and widen the range.
          </p>
          {previewUrl && (
            <img src={previewUrl} alt="" className="scan-preview" />
          )}
          {err && (
            <div className="waitlist-note err" style={{ marginTop: 12 }}>
              {err}
            </div>
          )}
        </div>
      )}

      {phase === "analyzing" && (
        <div className="scan-busy">
          <div className="scan-busy-label">
            <Spinner /> Reading your physique{"…"}
            <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>
              The photo will be discarded after this call.
            </div>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <Result
          result={result}
          projection={projection}
          onReset={reset}
        />
      )}
    </div>
  );
}

function Result({
  result,
  projection,
  onReset,
}: {
  result: BodyScanResult;
  projection: BodyProjection | null;
  onReset: () => void;
}) {
  if (!result.usable) {
    return (
      <div className="upload-card">
        <h3 className="display" style={{ marginTop: 6 }}>
          Couldn{"’"}t make an honest call from this photo
        </h3>
        <p className="dim" style={{ marginTop: 8, maxWidth: 460 }}>
          {result.notes ||
            "Try a clearer, full-body photo with tight-fitting clothing in even lighting."}
        </p>
        {result.visible_issues.length > 0 && (
          <ul className="dim" style={{ marginTop: 12, paddingLeft: 18 }}>
            {result.visible_issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        )}
        <button className="btn" style={{ marginTop: 16 }} onClick={onReset}>
          Try again
        </button>
      </div>
    );
  }

  const midpoint = (result.body_fat_pct_low + result.body_fat_pct_high) / 2;

  return (
    <div className="body-result">
      <section className="body-headline">
        <div className="body-headline-label">Estimated body fat</div>
        <div className="body-headline-range">
          <span className="body-num">{round1(result.body_fat_pct_low)}</span>
          <span className="dim">{"–"}</span>
          <span className="body-num">{round1(result.body_fat_pct_high)}</span>
          <span className="body-unit">%</span>
        </div>
        <div className="body-muscle">
          Visual muscle level: <strong>{result.visual_muscle_level.replace("_", " ")}</strong>
        </div>
      </section>

      {projection && <Projection p={projection} midpoint={midpoint} />}

      {result.visible_issues.length > 0 && (
        <section className="dash-card dash-card-soft">
          <div className="dash-kicker">FACTORS WIDENING THE RANGE</div>
          <ul className="dim" style={{ marginTop: 10, paddingLeft: 18 }}>
            {result.visible_issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </section>
      )}

      {result.notes && (
        <section className="dash-card dash-card-soft">
          <div className="dash-kicker">NOTES</div>
          <p style={{ marginTop: 8 }}>{result.notes}</p>
        </section>
      )}

      <section className="dash-card dash-card-soft">
        <div className="dash-kicker">REALITY CHECK</div>
        <p className="dim" style={{ marginTop: 8 }}>
          A photo can&apos;t beat hydrostatic weighing or a DEXA scan. The honest
          range above accounts for what we can&apos;t see. Use the trend over
          weeks, not any single estimate, as your signal.
        </p>
      </section>

      <div className="menu-actions">
        <button type="button" className="btn-ghost" onClick={onReset}>
          Scan again
        </button>
        <Link href="/dashboard" className="btn">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function Projection({
  p,
  midpoint,
}: {
  p: BodyProjection;
  midpoint: number;
}) {
  if (p.status === "in_target") {
    return (
      <section className="dash-card body-status body-status-ok">
        <div className="dash-kicker">YOU{"’"}RE IN YOUR TARGET BAND</div>
        <p style={{ marginTop: 8 }}>
          Your estimated body fat overlaps your target ({p.target_bf_pct_low}{"–"}
          {p.target_bf_pct_high}%) for your current goal. Holding here is
          the work.
        </p>
        <p className="dim" style={{ fontSize: 13, marginTop: 6 }}>
          Lean mass estimate at midpoint ({round1(midpoint)}%): {p.lean_mass_kg_estimate} kg.
        </p>
      </section>
    );
  }
  if (p.status === "below_target") {
    return (
      <section className="dash-card body-status body-status-warn">
        <div className="dash-kicker">BELOW YOUR TARGET BAND</div>
        <p style={{ marginTop: 8 }}>
          You&apos;re leaner than the band for your goal ({p.target_bf_pct_low}
          {"–"}{p.target_bf_pct_high}%). Consider adjusting your goal upward
          or moving to a maintenance/recomp plan.
        </p>
      </section>
    );
  }
  if (p.status === "not_applicable" || !p.weeks_to_goal) {
    return (
      <section className="dash-card body-status body-status-info">
        <div className="dash-kicker">PROJECTION NOT APPLICABLE</div>
        <p style={{ marginTop: 8 }}>
          Your current goal doesn&apos;t involve fat loss. Weeks-to-goal only
          projects when your plan is cut or recomp.
        </p>
      </section>
    );
  }
  const w = p.weeks_to_goal;
  return (
    <section className="dash-card body-status body-status-ok">
      <div className="dash-kicker">WEEKS TO TARGET BAND</div>
      <div className="body-weeks">
        <span className="body-num">{w.weeks_low}</span>
        <span className="dim">{"–"}</span>
        <span className="body-num">{w.weeks_high}</span>
        <span className="body-unit">weeks</span>
      </div>
      <p className="dim" style={{ fontSize: 13, marginTop: 6 }}>
        At your current goal rate, to reach the top of your target band
        ({p.target_bf_pct_high}%). Lean mass estimate at midpoint ({round1(midpoint)}%):
        {" "}{p.lean_mass_kg_estimate} kg. Assumes loss is mostly fat — real life
        is messier.
      </p>
    </section>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
