export const metadata = { title: "Privacy Policy — SE7A" };

export default function Privacy() {
  return (
    <div className="shell">
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="wordmark">
            SE<span className="seven">7</span>A
          </div>
        </a>
      </nav>
      <main className="prose">
        <h1>Privacy Policy</h1>
        <div className="updated">LAST UPDATED: JUNE 2026</div>

        <p>
          SE7A (&quot;we&quot;, &quot;us&quot;) is an AI food and fitness application operated from Dubai,
          United Arab Emirates. This policy explains what we collect, why, and what control
          you have. The short version: <strong>we collect the minimum needed to coach you,
          we don&apos;t sell your data, and you can delete everything at any time.</strong>
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account data:</strong> email address and authentication identifiers.</li>
          <li>
            <strong>Profile data you provide:</strong> name, birth year, sex, height, weight,
            activity level, fitness goal, and optional notes (e.g. injuries, equipment).
          </li>
          <li>
            <strong>Logs you create:</strong> meals, nutrition estimates, and weight check-ins.
          </li>
          <li>
            <strong>Photos you choose to submit:</strong> menu photos and food photos for
            analysis. Physique photos, if you provide one for plan personalization, are
            processed and <strong>not stored</strong>.
          </li>
          <li><strong>Waitlist:</strong> email address only, used to invite you to the beta.</li>
        </ul>

        <h2>AI processing</h2>
        <p>
          Photos and relevant profile context are sent to Anthropic&apos;s Claude API to generate
          plans, read menus, and estimate nutrition. This processing happens server-side; our
          AI provider does not use these requests to train its models per our API terms.
          Nutrition and fitness outputs are <strong>estimates, not medical advice</strong> {"\u2014"}
          consult a qualified professional before significant changes to diet or exercise.
        </p>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We do not sell or rent your personal data.</li>
          <li>We do not run third-party advertising or tracking in the app.</li>
          <li>We do not store physique photos in version 1 of the product.</li>
        </ul>

        <h2>Storage &amp; security</h2>
        <p>
          Data is stored with Supabase (hosted Postgres) with row-level security so that your
          records are accessible only to your authenticated account. Photos you log are kept
          in private storage accessible only via short-lived signed links tied to your account.
        </p>

        <h2>Retention &amp; deletion</h2>
        <p>
          Your data is retained while your account is active. You can delete your account from
          within the app at any time, which permanently removes your profile, logs, check-ins,
          plans, and stored photos. Waitlist emails are deleted after launch invitations
          conclude, or earlier on request.
        </p>

        <h2>Your rights</h2>
        <p>
          In line with the UAE Personal Data Protection Law and applicable regional laws, you
          may request access to, correction of, or deletion of your personal data at any time
          by emailing <a href="mailto:privacy@se7a.app">privacy@se7a.app</a>.
        </p>

        <h2>Children</h2>
        <p>SE7A is not intended for use by anyone under 16, and we do not knowingly collect their data.</p>

        <h2>Changes</h2>
        <p>
          We&apos;ll post any changes to this policy on this page and update the date above.
          Material changes will be announced in the app.
        </p>
      </main>
    </div>
  );
}
