import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import JoinForm from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code?.toLowerCase();
  if (!code || !/^[a-f0-9]{6,12}$/.test(code)) {
    notFound();
  }

  const supabase = getServerClient();
  const { data: referrer } = await supabase
    .from("profiles")
    .select("display_name, referral_code")
    .eq("referral_code", code)
    .maybeSingle();

  if (!referrer) {
    notFound();
  }

  const name = referrer.display_name || "a friend";

  return (
    <div className="shell">
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="wordmark">
            SE<span className="seven">7</span>A
          </div>
        </a>
      </nav>
      <main className="hero" style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="kicker mono">INVITED BY {name.toUpperCase()}</div>
        <h1 className="display h1" style={{ marginTop: 12 }}>
          {name} thinks SE7A is worth a look.
        </h1>
        <p
          className="dim"
          style={{ marginTop: 16, fontSize: 17, lineHeight: 1.5 }}
        >
          An AI food and fitness coach built for the Gulf. Scan a plate,
          get honest calorie ranges — not fake precision. Personalized
          workouts. A coach that knows your macros.
        </p>
        <p className="dim" style={{ marginTop: 12, fontSize: 15 }}>
          Enter your email — we&apos;ll send a one-tap link. No password.
        </p>
        <div style={{ marginTop: 24 }}>
          <JoinForm referralCode={code} />
        </div>
      </main>
    </div>
  );
}
