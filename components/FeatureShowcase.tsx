import Image from "next/image";

/**
 * Feature showcase — six annotated iOS screens that walk a visitor
 * through the depth of the app. Horizontally scrollable on mobile,
 * two-column grid on desktop. Each tile has a small gold kicker + a
 * one-line punch line underneath so a scroll-reader gets the point
 * without needing to visualize what's inside the phone.
 *
 * Screenshots live in /public/screenshots/*.png — swap them out via
 * that path (don't inline the paths from the user's local Downloads).
 */

const FEATURES = [
  {
    img: "/screenshots/home.png",
    kicker: "HOME",
    headline: "Your day, in one glance",
    body: "A single ring for calories remaining, honest macro ranges below, today's meals one tap away.",
  },
  {
    img: "/screenshots/log.png",
    kicker: "LOG",
    headline: "Scan a plate. Or speak it.",
    body: "Snap a plate photo, say what you ate, or scan a barcode — SE7A does the macro math and respects what's actually knowable.",
  },
  {
    img: "/screenshots/progress.png",
    kicker: "PROGRESS",
    headline: "Honest ranges, not fake precision",
    body: "Weight changes over 7/14/30/90 days. BMI with context. Weekly energy as burned vs consumed. No vanity numbers.",
  },
  {
    img: "/screenshots/coach.png",
    kicker: "COACH",
    headline: "An AI coach that knows your week",
    body: "Chat with context — your logs, workouts, and goals are already in frame. Answers reference your actual data, not generic advice.",
  },
  {
    img: "/screenshots/achievements.png",
    kicker: "ACHIEVEMENTS",
    headline: "40 badges to unlock",
    body: "Firsts, streaks, meal counts, water, kcal-goal runs, weight-loss milestones, workouts, referrals. Earn them by using the app, not grinding.",
  },
  {
    img: "/screenshots/insights.png",
    kicker: "PATTERNS",
    headline: "What SE7A noticed — no AI, just math",
    body: "Fridays running higher? Weekend steps dropping? Deterministic detectors surface the patterns in your 60 days — then you decide.",
  },
] as const;

export function FeatureShowcase() {
  return (
    <section className="showcase">
      <div className="showcase-head">
        <div className="hero-kicker">INSIDE THE APP</div>
        <h2 className="showcase-h">
          Depth where it matters,{" "}
          <span className="gold">clarity where it counts.</span>
        </h2>
        <p className="showcase-sub">
          Six surfaces. One daily ritual. Built for the Gulf — Arabic
          and English, Ramadan-aware, no fake precision.
        </p>
      </div>

      <div className="showcase-grid">
        {FEATURES.map((f) => (
          <div className="showcase-card" key={f.img}>
            <div className="showcase-phone">
              <Image
                src={f.img}
                alt={f.headline}
                width={322}
                height={698}
                sizes="(max-width: 720px) 80vw, 320px"
                className="showcase-img"
              />
            </div>
            <div className="showcase-copy">
              <div className="showcase-kicker">{f.kicker}</div>
              <div className="showcase-headline">{f.headline}</div>
              <div className="showcase-body">{f.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
