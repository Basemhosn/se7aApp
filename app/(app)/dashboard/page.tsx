import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { computeRemaining, getDayTotals } from "@/lib/ledger";
import { signOut } from "../actions";
import WeightLogForm from "./WeightLogForm";
import DeleteAccount from "./DeleteAccount";

export const metadata = { title: "Dashboard — SE7A" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  const [todayTotals, recentWeightsRes] = await Promise.all([
    getDayTotals(supabase, user.id),
    supabase
      .from("weight_logs")
      .select("weight_kg, body_fat_pct, logged_at")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(5),
  ]);
  const recentWeights = recentWeightsRes.data ?? [];

  const remaining = computeRemaining(todayTotals, {
    daily_kcal_target: profile.daily_kcal_target,
    daily_protein_g: profile.daily_protein_g,
    daily_carb_g: profile.daily_carb_g,
    daily_fat_g: profile.daily_fat_g,
  });

  return (
    <div className="shell">
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="wordmark">
            SE<span className="seven">7</span>A
          </div>
        </a>
        <form action={signOut}>
          <button
            className="nav-tag"
            type="submit"
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit" }}
          >
            SIGN OUT
          </button>
        </form>
      </nav>

      <main className="dash">
        <header className="dash-head">
          <div className="dash-kicker">TODAY{"’"}S TARGETS</div>
          <h1 className="display dash-h1">
            {profile.display_name || user.email?.split("@")[0]}
          </h1>
        </header>

        <section className="macro-grid">
          <Macro label="Calories" value={profile.daily_kcal_target} unit="kcal" highlight />
          <Macro label="Protein" value={profile.daily_protein_g} unit="g" />
          <Macro label="Carbs" value={profile.daily_carb_g} unit="g" />
          <Macro label="Fat" value={profile.daily_fat_g} unit="g" />
        </section>

        <section className="cta-grid cta-grid-3">
          <a className="cta-card cta-plate" href="/scan/plate">
            <div className="cta-kicker">AFTER YOU EAT</div>
            <h2 className="display cta-h">Scan a plate</h2>
            <p className="dim">
              Snap your meal. Honest macro ranges, logged to today.
            </p>
            <span className="cta-arrow">{"→"}</span>
          </a>
          <a className="cta-card cta-menu" href="/scan/menu">
            <div className="cta-kicker">BEFORE YOU ORDER</div>
            <h2 className="display cta-h">Scan a menu</h2>
            <p className="dim">
              We rank dishes against your remaining budget.
            </p>
            <span className="cta-arrow">{"→"}</span>
          </a>
          <a className="cta-card cta-body" href="/scan/body">
            <div className="cta-kicker">WHERE YOU ARE</div>
            <h2 className="display cta-h">Body scan</h2>
            <p className="dim">
              Honest body-fat range and weeks-to-goal. Photo not stored.
            </p>
            <span className="cta-arrow">{"→"}</span>
          </a>
        </section>

        <section className="ledger-grid">
          <LedgerCard
            title="Eaten today"
            primary={
              <RangePair
                low={todayTotals.kcal.low}
                high={todayTotals.kcal.high}
                unit="kcal"
              />
            }
            macros={[
              { k: "P", low: todayTotals.protein_g.low, high: todayTotals.protein_g.high },
              { k: "C", low: todayTotals.carb_g.low,    high: todayTotals.carb_g.high },
              { k: "F", low: todayTotals.fat_g.low,     high: todayTotals.fat_g.high },
            ]}
          />
          <LedgerCard
            title="Remaining"
            primary={
              <RemainingValue
                low={remaining.kcal.low}
                high={remaining.kcal.high}
                unit="kcal"
              />
            }
            macros={[
              { k: "P", low: remaining.protein_g.low, high: remaining.protein_g.high, signed: true },
              { k: "C", low: remaining.carb_g.low,    high: remaining.carb_g.high, signed: true },
              { k: "F", low: remaining.fat_g.low,     high: remaining.fat_g.high, signed: true },
            ]}
          />
        </section>

        {todayTotals.items.length > 0 && (
          <section className="dash-card">
            <h2 className="display">Today{"’"}s log</h2>
            <ul className="ledger-items">
              {todayTotals.items.map((it) => (
                <li key={it.id} className="ledger-row">
                  <div>
                    <div className="ledger-name">{it.name}</div>
                    <div className="ledger-meta mono">
                      {it.portion_estimate || ""} {it.confidence ? `· ${it.confidence}` : ""}
                    </div>
                  </div>
                  <div className="mono ledger-kcal">
                    {it.kcal_low}{"–"}{it.kcal_high} kcal
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="dash-meta">
          <Meta label="Goal" value={profile.goal} />
          <Meta label="Rate" value={`${profile.goal_rate_kg_per_week} kg/wk`} />
          <Meta label="Activity" value={profile.activity_level} />
          <Meta label="Weight" value={`${profile.weight_kg} kg`} />
        </section>

        <section className="dash-card">
          <h2 className="display">Log today{"’"}s weight</h2>
          <p className="dim">
            We retune your daily targets the moment you log. Honest math, no
            magic {"—"} your numbers move when your weight does.
          </p>
          <WeightLogForm currentKg={Number(profile.weight_kg)} />
        </section>

        {recentWeights.length > 0 && (
          <section className="dash-card">
            <h2 className="display">Recent weigh-ins</h2>
            <table className="trend">
              <tbody>
                {recentWeights.map((w) => (
                  <tr key={w.logged_at}>
                    <td className="mono">
                      {new Date(w.logged_at).toLocaleDateString()}
                    </td>
                    <td>{w.weight_kg} kg</td>
                    <td className="dim">
                      {w.body_fat_pct ? `${w.body_fat_pct}% BF` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="dash-card" style={{ borderColor: "rgba(240,143,114,0.35)" }}>
          <h2 className="display">Danger zone</h2>
          <DeleteAccount email={user.email ?? ""} />
        </section>
      </main>
    </div>
  );
}

function Macro({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number | null;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className={`macro-card${highlight ? " macro-card-hi" : ""}`}>
      <div className="macro-label">{label}</div>
      <div className="macro-value">
        {value ?? "—"}
        <span className="macro-unit">{unit}</span>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="meta">
      <div className="meta-label">{label}</div>
      <div className="meta-value mono">{value}</div>
    </div>
  );
}

function LedgerCard({
  title,
  primary,
  macros,
}: {
  title: string;
  primary: React.ReactNode;
  macros: { k: string; low: number; high: number; signed?: boolean }[];
}) {
  return (
    <div className="ledger-card">
      <div className="ledger-title">{title}</div>
      <div className="ledger-primary">{primary}</div>
      <div className="ledger-macros mono">
        {macros.map((m) => (
          <span key={m.k}>
            {m.k} {fmtSigned(m.low, m.signed)}{"–"}{fmtSigned(m.high, m.signed)} g
          </span>
        ))}
      </div>
    </div>
  );
}

function RangePair({ low, high, unit }: { low: number; high: number; unit: string }) {
  return (
    <div className="ledger-range">
      <span className="ledger-num">{Math.round(low)}</span>
      <span className="ledger-dash">{"–"}</span>
      <span className="ledger-num">{Math.round(high)}</span>
      <span className="ledger-unit">{unit}</span>
    </div>
  );
}

function RemainingValue({ low, high, unit }: { low: number; high: number; unit: string }) {
  const cls = high < 0 ? "ledger-num over" : low < 0 ? "ledger-num close" : "ledger-num";
  return (
    <div className="ledger-range">
      <span className={cls}>{Math.round(low)}</span>
      <span className="ledger-dash">{"–"}</span>
      <span className={cls}>{Math.round(high)}</span>
      <span className="ledger-unit">{unit}</span>
    </div>
  );
}

function fmtSigned(n: number, signed?: boolean): string {
  const r = Math.round(n);
  if (!signed) return String(r);
  return r >= 0 ? String(r) : String(r); // negative sign comes from the value itself
}
