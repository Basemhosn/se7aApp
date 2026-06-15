import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { signOut } from "../../actions";
import MenuScanFlow from "./MenuScanFlow";

export const metadata = { title: "Scan a menu — SE7A" };
export const dynamic = "force-dynamic";

export default async function ScanMenuPage() {
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
          <div className="dash-kicker">MENU SCAN</div>
          <h1 className="display dash-h1">What should you order?</h1>
          <p className="dim" style={{ marginTop: 8, maxWidth: 540 }}>
            Photograph the menu. SE7A reads it, checks what you have left for
            today, and recommends dishes that fit — before the waiter arrives.
          </p>
        </header>
        <MenuScanFlow />
      </main>
    </div>
  );
}
