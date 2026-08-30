/**
 * Three-step visual explainer for people who scan instead of read.
 * Server component — pure markup. Steps are laid out horizontally on
 * desktop, stacked on mobile. Numbered kickers + gold vertical rules
 * match the app's editorial language.
 */
export function HowItWorks() {
  return (
    <section className="how-band">
      <div className="how-header">
        <div className="feature-num">HOW IT WORKS</div>
        <h2>
          Three taps.{" "}
          <span className="gold">One decision made for you.</span>
        </h2>
      </div>
      <div className="how-steps">
        <div className="how-step">
          <div className="how-num">01</div>
          <div className="how-rule" />
          <h3>Snap</h3>
          <p>
            Point your camera at a plate or menu. AI reads every item and
            estimates portions the way food actually shows up here — kabsa,
            machboos, shawarma, Al Baik meals.
          </p>
        </div>
        <div className="how-step">
          <div className="how-num">02</div>
          <div className="how-rule" />
          <h3>Get ranges</h3>
          <p>
            Every calorie and macro is a low–high band with a confidence
            rating. A photo can&apos;t see the oil — SE7A doesn&apos;t pretend
            it can. Honest math, not fake precision.
          </p>
        </div>
        <div className="how-step">
          <div className="how-num">03</div>
          <div className="how-rule" />
          <h3>Decide</h3>
          <p>
            SE7A ranks dishes against what you have left today, or logs the
            plate straight to your ring. Nothing to search. Nothing to
            calculate.
          </p>
        </div>
      </div>
    </section>
  );
}
