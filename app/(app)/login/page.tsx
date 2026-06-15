import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — SE7A" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

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
        <h1 className="display auth-h1">Sign in</h1>
        <p className="auth-sub">
          We&apos;ll email you a one-tap link. No password to remember.
        </p>
        <LoginForm />
      </main>
    </div>
  );
}
