/**
 * Pricing tier cards — Free / Pro Monthly / Pro Annual + the one-time
 * 90-Day Plan as a distinct product. Prices are hardcoded here to
 * match what's shown in the mobile paywall; if you change one, change
 * the other (or wire this to a shared source of truth later).
 *
 * The annual card is featured as the recommended tier via a "SAVE 29%"
 * ribbon and a slightly stronger border. Report is a fourth block
 * shown after the tier grid, framed as an artifact not a subscription.
 */
export function Pricing() {
  return (
    <section className="pricing-band">
      <div className="pricing-header">
        <div className="feature-num">PRICING</div>
        <h2>
          Simple.{" "}
          <span className="gold">One plan tier. One optional artifact.</span>
        </h2>
      </div>

      <div className="pricing-grid">
        {/* FREE */}
        <div className="price-card">
          <div className="price-tier">FREE</div>
          <div className="price-value">
            0 <span className="price-unit">AED</span>
          </div>
          <div className="price-sub">Forever</div>
          <ul className="price-list">
            <li>Ring, log, macros, calendar</li>
            <li>5 scans / day (plate, menu, barcode, manual)</li>
            <li>Weight, streaks, wrapped, achievements</li>
            <li>Bilingual EN + AR, Ramadan mode</li>
            <li>One-time body composition scan</li>
          </ul>
        </div>

        {/* PRO MONTHLY */}
        <div className="price-card">
          <div className="price-tier">PRO · MONTHLY</div>
          <div className="price-value">
            29 <span className="price-unit">AED / mo</span>
          </div>
          <div className="price-sub">Cancel anytime</div>
          <ul className="price-list">
            <li>Everything in Free</li>
            <li><strong>Unlimited scans</strong></li>
            <li>7-day meal plans + auto grocery list</li>
            <li>AI Coach chat that reads your logs</li>
            <li>Menu scan + unlimited body composition scans</li>
            <li>All workout programs</li>
          </ul>
        </div>

        {/* PRO ANNUAL — featured */}
        <div className="price-card price-featured">
          <div className="price-ribbon">SAVE 29%</div>
          <div className="price-tier">PRO · ANNUAL</div>
          <div className="price-value">
            249 <span className="price-unit">AED / yr</span>
          </div>
          <div className="price-sub">20.75 AED / mo · effective</div>
          <ul className="price-list">
            <li>Everything in Pro Monthly</li>
            <li><strong>One 90-Day Plan every 90 days included</strong></li>
            <li>Priority coach responses</li>
            <li>Same unlimited scans</li>
            <li>Best value for someone committing to a cut / recomp</li>
          </ul>
        </div>
      </div>

      {/* 90-day plan — one-time artifact */}
      <div className="price-report">
        <div className="price-report-copy">
          <div className="feature-num">ARTIFACT</div>
          <h3>The 90-Day Plan</h3>
          <p>
            A one-shot AI-generated blueprint built from your profile and last
            30 days of logs. Nutrition, training, habits, week-by-week roadmap.
            Buy standalone or get one every 90 days included with Pro Annual.
          </p>
        </div>
        <div className="price-report-price">
          <div className="price-value">
            19 <span className="price-unit">AED once</span>
          </div>
          <div className="price-sub">Or included with Pro</div>
        </div>
      </div>
    </section>
  );
}
