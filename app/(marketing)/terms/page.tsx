export const metadata = { title: "Terms of Service — SE7A" };

export default function Terms() {
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
        <h1>Terms of Service</h1>
        <div className="updated">LAST UPDATED: AUGUST 2026</div>

        <p>
          These terms govern your use of SE7A (&quot;the app&quot;, &quot;we&quot;, &quot;us&quot;),
          an AI food and fitness application operated from Dubai, United Arab
          Emirates. By creating an account or using the app you agree to these
          terms. If you don&apos;t agree, please don&apos;t use SE7A.
        </p>

        <h2>Beta status</h2>
        <p>
          SE7A is currently in beta. Features may change, break, or be removed
          without notice as we iterate with early users. We&apos;ll do our best
          to preserve your data across changes, but we don&apos;t guarantee
          uptime, availability, or backward compatibility during beta.
        </p>

        <h2>Not medical advice</h2>
        <p>
          <strong>
            SE7A is a tracking and coaching tool, not a medical device.
          </strong>{" "}
          Nutrition estimates, body-composition ranges, and target macros are
          computer-generated approximations based on photos and self-reported
          information. They are wrong sometimes {"—"} that&apos;s why we
          publish ranges instead of point values. Do not use SE7A output to
          diagnose, treat, or make significant changes to diet, exercise, or
          medication without consulting a qualified professional. SE7A is not
          suitable for people with eating disorders, active medical conditions
          affected by diet, or during pregnancy without medical supervision.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>You must be at least 16 years old to use SE7A.</li>
          <li>
            You&apos;re responsible for the accuracy of the information you
            provide (weight, height, goals) and for keeping your login secure.
          </li>
          <li>One account per person. Don&apos;t share credentials.</li>
          <li>
            You can delete your account and all associated data at any time
            from within the app. Deletion is irreversible.
          </li>
        </ul>

        <h2>Your content</h2>
        <p>
          Photos you upload (plates, menus) and logs you create remain yours.
          You grant us a limited license to process them so we can provide the
          service {"—"} specifically, to run AI analysis, store them in
          your account, and display them back to you. We don&apos;t sell them,
          share them, or use them to train AI models. Physique photos submitted
          to the body-scan feature are processed in memory and{" "}
          <strong>never stored</strong>.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>
            Don&apos;t use SE7A for anyone other than yourself, or upload
            photos of other people without consent.
          </li>
          <li>
            Don&apos;t attempt to reverse-engineer, scrape, or overload the
            service.
          </li>
          <li>Don&apos;t use SE7A for anything illegal in your jurisdiction.</li>
          <li>
            Don&apos;t abuse the AI features (e.g. bulk-submitting unrelated
            images to test the model, or attempting prompt injection). We rate
            limit and may suspend accounts that do.
          </li>
        </ul>

        <h2>Fees</h2>
        <p>
          SE7A is free during beta. If we introduce paid tiers or subscriptions,
          existing users will be notified in advance and given a fair grace
          period before any charges apply.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using SE7A and delete your account at any time. We may
          suspend or terminate accounts that violate these terms, that are
          inactive for extended periods, or if we discontinue the service. If
          we terminate the service entirely, we&apos;ll provide reasonable
          notice and a data export option where feasible.
        </p>

        <h2>Disclaimer &amp; liability</h2>
        <p>
          SE7A is provided &quot;as is&quot; without warranties of any kind. To
          the maximum extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages arising from your use of the
          service, including but not limited to health outcomes, dietary
          decisions, or reliance on AI-generated estimates. Your total remedy
          from us in any matter is limited to what you paid us in the last
          twelve months {"—"} which during beta is zero.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms as the product evolves. Material changes
          will be announced in the app and reflected here with an updated date.
          Continued use after changes take effect means you accept the new
          terms.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of the United Arab Emirates.
          Disputes will be resolved in the courts of Dubai, unless local
          consumer-protection law in your jurisdiction requires otherwise.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:hello@se7a.app">hello@se7a.app</a>. Privacy
          questions: <a href="mailto:privacy@se7a.app">privacy@se7a.app</a>.
        </p>
      </main>
    </div>
  );
}
