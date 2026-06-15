import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { signOut } from "../../actions";
import PlateScanFlow from "./PlateScanFlow";

export const metadata = { title: "Scan a plate — SE7A" };
export const dynamic = "force-dynamic";

export default async function ScanPlatePage() {
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
          <div className="dash-kicker">PLATE SCAN</div>
          <h1 className="display dash-h1">What did you just eat?</h1>
          <p className="dim" style={{ marginTop: 8, maxWidth: 540 }}>
            Snap a photo of your meal. SE7A returns honest ranges for calories
            and macros — not point values. A photo can&apos;t see the oil, so
            we won&apos;t pretend it can.
          </p>
        </header>
        <PlateScanFlow />
      </main>
    </div>
  );
}
