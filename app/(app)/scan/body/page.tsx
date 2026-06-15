import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { signOut } from "../../actions";
import BodyScanFlow from "./BodyScanFlow";

export const metadata = { title: "Body scan — SE7A" };
export const dynamic = "force-dynamic";

export default async function ScanBodyPage() {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect("/onboarding");

  return (
    <div className="shell">
      <nav className="nav">
        <a href="/dashboard" style={{ textDecoration: "none", color: "inherit" }}>
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

      <main className="scan">
        <header className="dash-head">
          <div className="dash-kicker">BODY SCAN</div>
          <h1 className="display dash-h1">An honest read of where you are.</h1>
          <p className="dim" style={{ marginTop: 8, maxWidth: 560 }}>
            A photo can&apos;t beat a DEXA scan {"—"} we won&apos;t pretend it
            can. SE7A returns a body-fat range with the factors that limit
            confidence, plus an estimate of weeks to your goal at your current
            pace.
          </p>
        </header>

        <div className="privacy-note">
          <span className="mono">PRIVACY</span> Your photo is processed in memory
          and discarded after analysis. We do not store body-composition photos.
        </div>

        <BodyScanFlow />
      </main>
    </div>
  );
}
