import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";

export const metadata = { title: "Onboarding — SE7A" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
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
  if (profile?.onboarded_at) redirect("/dashboard");

  return (
    <div className="shell">
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="wordmark">
            SE<span className="seven">7</span>A
          </div>
        </a>
      </nav>
      <main className="auth-shell">
        <h1 className="display auth-h1">Set up your targets</h1>
        <p className="auth-sub">
          Real formulas, not vibes. We use Mifflin-St Jeor for BMR, your activity
          level for TDEE, then your goal rate to set today&apos;s calorie + macro
          targets. You can change any of this later.
        </p>
        <OnboardingForm email={user.email ?? ""} />
      </main>
    </div>
  );
}
