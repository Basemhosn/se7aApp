"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlateItem, PlateScanResult } from "@/lib/schemas/scan";

type Phase = "idle" | "analyzing" | "review" | "saving";
type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

interface ScanResponse {
  ok: boolean;
  scan_id: string;
  result: PlateScanResult;
  image_stored: boolean;
}

export default function PlateScanFlow() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [result, setResult] = useState<PlateScanResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mealSlot, setMealSlot] = useState<MealSlot>(currentSlot());

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
    const res = await fetch("/api/scan/plate", { method: "POST", body: form });
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
    setScanId(body.scan_id);
    setResult(body.result);
    // Pre-select everything identified, by default.
    setSelected(new Set(body.result.items.map((_, i) => i)));
    setPhase("review");
  };

  const toggle = (i: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanId(null);
    setResult(null);
    setSelected(new Set());
    setErr("");
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    if (!result || !scanId) return;
    const chosen = result.items.filter((_, i) => selected.has(i));
    if (chosen.length === 0) {
      setErr("Pick at least one item to log.");
      return;
    }
    setPhase("saving");
    setErr("");
    const res = await fetch("/api/ledger/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scan_id: scanId,
        source: "plate_scan",
        meal_slot: mealSlot,
        items: chosen.map((it) => ({
          ...it,
          confidence: result.confidence,
        })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setErr(body.error || "Couldn't save — try again.");
      setPhase("review");
      return;
    }
    router.push("/dashboard");
    router.refresh();
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
          {previewUrl && (
            <img src={previewUrl} alt="" className="scan-preview" />
          )}
          <div className="scan-busy-label">
            <Spinner /> Analyzing your plate{"…"}
            <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>
              Honest ranges, not magic numbers. Takes ~10s.
            </div>
          </div>
        </div>
      )}

      {phase === "review" && result && (
        <Review
          previewUrl={previewUrl}
          result={result}
          selected={selected}
          onToggle={toggle}
          mealSlot={mealSlot}
          setMealSlot={setMealSlot}
          onSave={save}
          onDiscard={reset}
          error={err}
          saving={false}
        />
      )}

      {phase === "saving" && result && (
        <Review
          previewUrl={previewUrl}
          result={result}
          selected={selected}
          onToggle={toggle}
          mealSlot={mealSlot}
          setMealSlot={setMealSlot}
          onSave={save}
          onDiscard={reset}
          error={err}
          saving={true}
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
        Take a photo
      </button>
      <p className="dim" style={{ marginTop: 18, fontSize: 13 }}>
        On mobile this opens the camera. On desktop, pick a file.
      </p>
      {previewUrl && (
        <img src={previewUrl} alt="" className="scan-preview" />
      )}
      {error && <div className="waitlist-note err" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function Review({
  previewUrl,
  result,
  selected,
  onToggle,
  mealSlot,
  setMealSlot,
  onSave,
  onDiscard,
  error,
  saving,
}: {
  previewUrl: string | null;
  result: PlateScanResult;
  selected: Set<number>;
  onToggle: (i: number) => void;
  mealSlot: MealSlot;
  setMealSlot: (m: MealSlot) => void;
  onSave: () => void;
  onDiscard: () => void;
  error: string;
  saving: boolean;
}) {
  if (!result.identifiable) {
    return (
      <div className="upload-card">
        {previewUrl && <img src={previewUrl} alt="" className="scan-preview" />}
        <h3 className="display" style={{ marginTop: 16 }}>
          Couldn{"’"}t read this plate
        </h3>
        <p className="dim" style={{ marginTop: 6 }}>
          {result.notes ||
            "Try a clearer, well-lit photo with the whole plate in frame."}
        </p>
        <button className="btn" style={{ marginTop: 14 }} onClick={onDiscard}>
          Try again
        </button>
      </div>
    );
  }

  const totals = sumSelected(result.items, selected);

  return (
    <div className="review">
      <div className="review-grid">
        <div className="review-photo">
          {previewUrl && <img src={previewUrl} alt="" className="scan-preview" />}
          <div className="review-conf">
            <ConfidencePill level={result.confidence} />
          </div>
        </div>
        <div>
          <h2 className="display review-h2">What we see</h2>
          <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
            Uncheck anything you didn{"’"}t eat. Macros are ranges, not
            point estimates {"—"} the high end is the honest cap.
          </p>
          <div className="items">
            {result.items.map((it, i) => (
              <ItemRow
                key={i}
                item={it}
                checked={selected.has(i)}
                onToggle={() => onToggle(i)}
              />
            ))}
          </div>

          {result.invisible_costs.length > 0 && (
            <div className="invisible">
              <div className="invisible-label">Hidden costs we accounted for</div>
              <ul>
                {result.invisible_costs.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="review-footer">
        <div className="review-totals">
          <Total label="kcal" range={totals.kcal} highlight />
          <Total label="P" range={totals.protein_g} />
          <Total label="C" range={totals.carb_g} />
          <Total label="F" range={totals.fat_g} />
        </div>
        <div className="review-actions">
          <select
            value={mealSlot}
            onChange={(e) => setMealSlot(e.target.value as MealSlot)}
            className="slot-select"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
          <button
            type="button"
            onClick={onDiscard}
            className="btn-ghost"
            disabled={saving}
          >
            Discard
          </button>
          <button type="button" onClick={onSave} className="btn" disabled={saving}>
            {saving ? "Saving…" : "Add to today"}
          </button>
        </div>
        {error && <div className="waitlist-note err" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: PlateItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className={`item${checked ? " item-on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <div className="item-body">
        <div className="item-head">
          <span className="item-name">{item.name}</span>
          <span className="item-portion mono">{item.portion_estimate}</span>
        </div>
        <div className="item-macros mono">
          <span>
            {item.kcal_low}{"–"}{item.kcal_high} kcal
          </span>
          <span className="dim">{"·"}</span>
          <span>
            P {fmt(item.protein_g_low)}{"–"}{fmt(item.protein_g_high)}
          </span>
          <span className="dim">{"·"}</span>
          <span>
            C {fmt(item.carb_g_low)}{"–"}{fmt(item.carb_g_high)}
          </span>
          <span className="dim">{"·"}</span>
          <span>
            F {fmt(item.fat_g_low)}{"–"}{fmt(item.fat_g_high)}
          </span>
        </div>
      </div>
    </label>
  );
}

function Total({
  label,
  range,
  highlight,
}: {
  label: string;
  range: { low: number; high: number };
  highlight?: boolean;
}) {
  return (
    <div className={`total${highlight ? " total-hi" : ""}`}>
      <div className="total-label">{label}</div>
      <div className="total-range mono">
        {fmt(range.low)}{"–"}{fmt(range.high)}
      </div>
    </div>
  );
}

function ConfidencePill({ level }: { level: "low" | "medium" | "high" }) {
  return (
    <span className={`conf conf-${level}`}>
      Confidence: {level}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

function currentSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

function sumSelected(items: PlateItem[], selected: Set<number>) {
  const init = { kcal: r(), protein_g: r(), carb_g: r(), fat_g: r() };
  return items.reduce((acc, it, i) => {
    if (!selected.has(i)) return acc;
    acc.kcal.low += it.kcal_low;
    acc.kcal.high += it.kcal_high;
    acc.protein_g.low += it.protein_g_low;
    acc.protein_g.high += it.protein_g_high;
    acc.carb_g.low += it.carb_g_low;
    acc.carb_g.high += it.carb_g_high;
    acc.fat_g.low += it.fat_g_low;
    acc.fat_g.high += it.fat_g_high;
    return acc;
  }, init);
}

function r() {
  return { low: 0, high: 0 };
}
