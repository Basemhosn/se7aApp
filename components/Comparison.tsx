/**
 * Feature comparison vs MyFitnessPal / Yazio / Cal AI. Static server
 * component — table with checkmark/dash cells to make differentiation
 * undeniable. Reasonably honest: "partial" cells are marked separately
 * from "missing" so the table doesn't feel like slander.
 */
type Cell = "yes" | "no" | "partial";
type Row = { label: string; se7a: Cell; mfp: Cell; yazio: Cell; cal: Cell };

const ROWS: Row[] = [
  { label: "Honest low–high ranges (no fake precision)", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "Menu scan → dish ranking before you order", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "Gulf food + regional chains (Al Baik, kabsa, etc.)", se7a: "yes", mfp: "partial", yazio: "no", cal: "partial" },
  { label: "Halal-only suggestions by default", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "Full Arabic + RTL (not machine-translated)", se7a: "yes", mfp: "no", yazio: "partial", cal: "no" },
  { label: "Ramadan mode (suhoor + iftar windows)", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "AI coach that reads your actual logs", se7a: "yes", mfp: "no", yazio: "no", cal: "partial" },
  { label: "One-time 90-day plan artifact (not subscription upsell)", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "Weekly check-in from your real data", se7a: "yes", mfp: "no", yazio: "no", cal: "no" },
  { label: "Free tier includes photo scans", se7a: "yes", mfp: "no", yazio: "no", cal: "yes" },
];

function Cell({ v }: { v: Cell }) {
  if (v === "yes") return <span className="cmp-yes">●</span>;
  if (v === "partial") return <span className="cmp-partial">◐</span>;
  return <span className="cmp-no">–</span>;
}

export function Comparison() {
  return (
    <section className="cmp-band">
      <div className="cmp-header">
        <div className="feature-num">VS THE FIELD</div>
        <h2>
          What the others don&apos;t do.{" "}
          <span className="gold">Line by line.</span>
        </h2>
      </div>
      <div className="cmp-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th></th>
              <th className="cmp-brand cmp-brand-us">SE7A</th>
              <th>MyFitnessPal</th>
              <th>Yazio</th>
              <th>Cal AI</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td className="cmp-label">{r.label}</td>
                <td className="cmp-cell cmp-cell-us">
                  <Cell v={r.se7a} />
                </td>
                <td className="cmp-cell">
                  <Cell v={r.mfp} />
                </td>
                <td className="cmp-cell">
                  <Cell v={r.yazio} />
                </td>
                <td className="cmp-cell">
                  <Cell v={r.cal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cmp-legend">
        <span><span className="cmp-yes">●</span> Yes</span>
        <span><span className="cmp-partial">◐</span> Partial</span>
        <span><span className="cmp-no">–</span> No</span>
      </div>
    </section>
  );
}
