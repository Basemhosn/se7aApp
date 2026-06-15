"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { MenuDish, MenuScanResult } from "@/lib/schemas/menu";

type Phase = "idle" | "analyzing" | "result";

interface Budget {
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

interface ScanResponse {
  ok: boolean;
  scan_id: string;
  result: MenuScanResult;
  budget: Budget;
  targets_known: boolean;
  image_stored: boolean;
}

export default function MenuScanFlow() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MenuScanResult | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [targetsKnown, setTargetsKnown] = useState(true);

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
    const res = await fetch("/api/scan/menu", { method: "POST", body: form });
    const body: ScanResponse | { error: string; details?: unknown } = await res
      .json()
      .catch(() => ({ error: "bad_response" }));
    if (!res.ok || !("ok" in body) || !body.ok) {
      setErr(
        ("details" in body && typeof body.details === "string"
          ? body.details
          : null) ||
          ("error" in body ? String(body.error) : "Couldn't read the menu.")
      );
      setPhase("idle");
      return;
    }
    setResult(body.result);
    setBudget(body.budget);
    setTargetsKnown(body.targets_known);
    setPhase("result");
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setBudget(null);
    setErr("");
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="scan-flow">
      {phase === "idle" && (
        <UploadBox
          previewUrl={previewUrl}
          onFile={onPick}
          fileRef={fileRef}
          error={err}
        />
      )}

      {phase === "analyzing" && (
        <div className="scan-busy">
          {previewUrl && <img src={previewUrl} alt="" className="scan-preview" />}
          <div className="scan-busy-label">
            <Spinner /> Reading the menu{"…"}
            <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>
              Checking what you have left for today.
            </div>
          </div>
        </div>
      )}

      {phase === "result" && result && budget && (
        <Result
          result={result}
          budget={budget}
          targetsKnown={targetsKnown}
          previewUrl={previewUrl}
          onReset={reset}
        />
      )}
    </div>
  );
}

function UploadBox({
  previewUrl,
  onFile,
  fileRef,
  error,
}: {
  previewUrl: string | null;
  onFile: (f: File) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  error: string;
}) {
  return (
    <div className="upload-card">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button
        className="btn upload-btn"
        type="button"
        onClick={() => fileRef.current?.click()}
      >
        Photograph the menu
      </button>
      <p className="dim" style={{ marginTop: 18, fontSize: 13 }}>
        On mobile this opens the camera. On desktop, pick a file.
      </p>
      {previewUrl && <img src={previewUrl} alt="" className="scan-preview" />}
      {error && (
        <div className="waitlist-note err" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Result({
  result,
  budget,
  targetsKnown,
  previewUrl,
  onReset,
}: {
  result: MenuScanResult;
  budget: Budget;
  targetsKnown: boolean;
  previewUrl: string | null;
  onReset: () => void;
}) {
  if (!result.identifiable) {
    return (
      <div className="upload-card">
        {previewUrl && <img src={previewUrl} alt="" className="scan-preview" />}
        <h3 className="display" style={{ marginTop: 16 }}>
          Couldn{"’"}t read this menu
        </h3>
        <p className="dim" style={{ marginTop: 6 }}>
          {result.notes ||
            "Try a clearer photo with the dish names in focus."}
        </p>
        <button className="btn" style={{ marginTop: 14 }} onClick={onReset}>
          Try again
        </button>
      </div>
    );
  }

  const orders = result.dishes.filter((d) => d.verdict === "order");
  const considers = result.dishes.filter((d) => d.verdict === "consider");
  const skips = result.dishes.filter((d) => d.verdict === "skip");

  return (
    <div className="menu-result">
      <BudgetBar budget={budget} targetsKnown={targetsKnown} />

      <div className="menu-meta">
        {result.restaurant_guess && (
          <span className="dim">{result.restaurant_guess}</span>
        )}
        <ConfidencePill level={result.confidence} />
      </div>

      <Section title="Order" tone="ok" emptyMsg="Nothing fits cleanly. See 'Consider' below.">
        {orders.map((d, i) => <DishCard key={`o${i}`} d={d} />)}
      </Section>

      <Section title="Consider" tone="warn" emptyMsg="">
        {considers.map((d, i) => <DishCard key={`c${i}`} d={d} />)}
      </Section>

      <Section title="Skip" tone="muted" emptyMsg="">
        {skips.map((d, i) => <DishCard key={`s${i}`} d={d} />)}
      </Section>

      <div className="menu-actions">
        <button type="button" className="btn-ghost" onClick={onReset}>
          Scan another
        </button>
        <Link href="/dashboard" className="btn">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  emptyMsg,
  children,
}: {
  title: string;
  tone: "ok" | "warn" | "muted";
  emptyMsg: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.filter(Boolean).length > 0;
  if (!has && !emptyMsg) return null;
  return (
    <section className={`menu-section menu-section-${tone}`}>
      <h2 className={`display menu-section-h2 menu-section-h2-${tone}`}>
        {title}
        <span className="menu-section-count mono">{arr.length}</span>
      </h2>
      {has ? (
        <div className="dishes">{children}</div>
      ) : (
        <p className="dim">{emptyMsg}</p>
      )}
    </section>
  );
}

function DishCard({ d }: { d: MenuDish }) {
  return (
    <div className={`dish-card dish-${d.verdict}`}>
      <div className="dish-head">
        <div className="dish-name">{d.name}</div>
        <div className="dish-kcal mono">
          {d.kcal_low}{"–"}{d.kcal_high} kcal
        </div>
      </div>
      <div className="dish-reason">{d.reason}</div>
      <div className="dish-macros mono">
        <span>P {fmt(d.protein_g_low)}{"–"}{fmt(d.protein_g_high)}</span>
        <span className="dim">{"·"}</span>
        <span>C {fmt(d.carb_g_low)}{"–"}{fmt(d.carb_g_high)}</span>
        <span className="dim">{"·"}</span>
        <span>F {fmt(d.fat_g_low)}{"–"}{fmt(d.fat_g_high)}</span>
      </div>
    </div>
  );
}

function BudgetBar({
  budget,
  targetsKnown,
}: {
  budget: Budget;
  targetsKnown: boolean;
}) {
  return (
    <div className="budget-bar">
      <div className="budget-label">
        {targetsKnown ? "Your remaining budget" : "Using default budget"}
      </div>
      <div className="budget-vals mono">
        <span>
          <strong>{Math.round(budget.kcal_low)}{"–"}{Math.round(budget.kcal_high)}</strong> kcal
        </span>
        <span className="dim">{"·"}</span>
        <span>
          P {Math.round(budget.protein_g_low)}{"–"}{Math.round(budget.protein_g_high)} g
        </span>
        <span className="dim">{"·"}</span>
        <span>
          C {Math.round(budget.carb_g_low)}{"–"}{Math.round(budget.carb_g_high)} g
        </span>
        <span className="dim">{"·"}</span>
        <span>
          F {Math.round(budget.fat_g_low)}{"–"}{Math.round(budget.fat_g_high)} g
        </span>
      </div>
      {!targetsKnown && (
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
          Set your targets in onboarding for personalized recommendations.
        </div>
      )}
    </div>
  );
}

function ConfidencePill({ level }: { level: "low" | "medium" | "high" }) {
  return <span className={`conf conf-${level}`}>Confidence: {level}</span>;
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}
