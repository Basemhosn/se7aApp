import { Wordmark } from "@/components/Wordmark";

export const metadata = { title: "Support — SE7A" };

export default function Support() {
  return (
    <div className="shell">
      <nav className="nav">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <Wordmark />
        </a>
      </nav>
      <main className="prose">
        <h1>Support</h1>
        <div className="updated">LAST UPDATED: NOVEMBER 2026</div>

        <p>
          SE7A is built by a small team. We read every message and reply fast.
          Pick the channel that fits your question below.
        </p>

        <h2>Contact us</h2>
        <ul>
          <li>
            <strong>General support &amp; bug reports:</strong>{" "}
            <a href="mailto:hello@se7a.app">hello@se7a.app</a> — reply within 24
            hours on weekdays.
          </li>
          <li>
            <strong>Privacy, data access, or deletion requests:</strong>{" "}
            <a href="mailto:privacy@se7a.app">privacy@se7a.app</a>.
          </li>
          <li>
            <strong>Billing or subscription issues:</strong>{" "}
            <a href="mailto:hello@se7a.app">hello@se7a.app</a> — include the
            Apple order ID from your email receipt.
          </li>
        </ul>

        <h2>Common questions</h2>

        <h3>How do I cancel my Pro subscription?</h3>
        <p>
          Subscriptions are managed by Apple, not by SE7A. Open{" "}
          <strong>Settings → [your name] → Subscriptions</strong> on your iPhone,
          find SE7A, and tap <strong>Cancel</strong>. You&apos;ll keep Pro until
          the end of the current billing period. We don&apos;t process refunds
          directly — Apple handles those via{" "}
          <a href="https://reportaproblem.apple.com/" target="_blank" rel="noopener noreferrer">
            reportaproblem.apple.com
          </a>
          .
        </p>

        <h3>How do I delete my account and all my data?</h3>
        <p>
          Inside the app: <strong>More → Settings → Delete account</strong>. This
          permanently removes your profile, meal logs, weight check-ins, plans,
          chat history, and any stored photos. The action is irreversible and
          takes effect immediately. If you prefer, email{" "}
          <a href="mailto:privacy@se7a.app">privacy@se7a.app</a> from the address
          tied to your account and we&apos;ll process it for you.
        </p>

        <h3>Why are the calorie numbers shown as ranges?</h3>
        <p>
          A photo can&apos;t see the oil, the butter in the pan, or the exact
          portion weight. Every other tracking app pretends it can and shows a
          single number like &ldquo;487 kcal&rdquo; — that precision is fake.
          SE7A shows a range (&ldquo;440–560 kcal&rdquo;) so you know what&apos;s
          guesswork and what isn&apos;t. The high end of the range is treated as
          the cap for tracking purposes. This is a deliberate product principle,
          not a bug.
        </p>

        <h3>The scan got my food wrong. What do I do?</h3>
        <p>
          Tap <strong>Edit</strong> on the review screen to adjust the grammage
          or uncheck items you didn&apos;t eat. The ranges will re-scale. If a
          dish is consistently misidentified, email us a screenshot at{" "}
          <a href="mailto:hello@se7a.app">hello@se7a.app</a> — we use real
          misses to improve the vision model.
        </p>

        <h3>Apple Health steps don&apos;t match SE7A.</h3>
        <p>
          SE7A reads directly from Apple Health&apos;s daily step total, which
          already deduplicates between your iPhone and Apple Watch. If the
          numbers drift briefly, pull down to refresh the Home screen. If they
          stay off for more than a day, confirm SE7A has HealthKit permission
          enabled in <strong>iPhone Settings → Health → Data Access &amp;
          Devices → SE7A</strong>.
        </p>

        <h3>I can&apos;t sign in.</h3>
        <ul>
          <li>
            Confirm the email you&apos;re typing matches the one you used to sign
            up (we support Google and Apple sign-in in addition to email).
          </li>
          <li>
            For Google sign-in: the account must be a normal Google account, not
            a workspace account with restricted third-party access.
          </li>
          <li>
            Still stuck? Email{" "}
            <a href="mailto:hello@se7a.app">hello@se7a.app</a> from the
            address you&apos;re trying to sign in with and we&apos;ll
            investigate.
          </li>
        </ul>

        <h3>Does SE7A work in Arabic?</h3>
        <p>
          Yes. The entire app is localized in English and Arabic with native
          right-to-left layout. Switch language in{" "}
          <strong>More → Settings → Language</strong>. The AI coach responds in
          whichever language you write to it.
        </p>

        <h3>Does SE7A work offline?</h3>
        <p>
          Partially. The Home screen shows your last-cached data immediately on
          cold open, so you can review the day without a connection. Logging a
          new meal, scanning a plate, or chatting with the coach requires an
          internet connection because the AI runs server-side.
        </p>

        <h3>I lost a meal I logged.</h3>
        <p>
          Pull down on the Home screen to refresh. If a meal is still missing
          after a refresh, it may not have persisted — email us the approximate
          time and what you logged, and we&apos;ll check the server. SE7A keeps
          an audit log of every write so we can tell what happened.
        </p>

        <h2>Pro subscription</h2>
        <p>
          Pro unlocks the AI coach, personalized meal plans, menu scans, and
          body-composition analysis. Pricing:
        </p>
        <ul>
          <li>
            <strong>Monthly:</strong> 29 AED (~$8 USD)
          </li>
          <li>
            <strong>Annual:</strong> 249 AED (~$68 USD) — about 28% cheaper per
            month than monthly.
          </li>
        </ul>
        <p>
          Billing is handled by Apple. Your App Store payment method is charged
          on renewal. You can cancel at any time (see above) and keep Pro
          through the end of the current period.
        </p>

        <h2>Status &amp; outages</h2>
        <p>
          SE7A runs on Vercel and Supabase. If the app is misbehaving across the
          board (scans failing for everyone, home not loading), it&apos;s almost
          always a provider issue and usually resolves within minutes. For
          anything persistent, email{" "}
          <a href="mailto:hello@se7a.app">hello@se7a.app</a> — we monitor
          every endpoint on an 8-hour rolling health check and respond to
          incidents within the hour.
        </p>

        <h2>Legal</h2>
        <p>
          See the <a href="/privacy">Privacy Policy</a> for what we collect and
          why, and the <a href="/terms">Terms of Service</a> for the agreement
          that governs your use of SE7A.
        </p>

        <h2>Who we are</h2>
        <p>
          SE7A is operated from Dubai, United Arab Emirates. We&apos;re a small
          team building for the Gulf. If you have product feedback that
          doesn&apos;t fit any of the above, send it to{" "}
          <a href="mailto:hello@se7a.app">hello@se7a.app</a> — we read all of
          them.
        </p>
      </main>
    </div>
  );
}
