import Image from "next/image";
import Waitlist from "@/components/Waitlist";
import { Reveal } from "@/components/Reveal";
import { StickyNav } from "@/components/StickyNav";
import { PlanBandAccent } from "@/components/PlanBandAccent";
import { StaggerText } from "@/components/StaggerText";
import { CountUp } from "@/components/CountUp";
import { ScrollProgress } from "@/components/ScrollProgress";
import { Marquee } from "@/components/Marquee";
import { Particles } from "@/components/Particles";
import { FloatingCard } from "@/components/FloatingCard";
import { HowItWorks } from "@/components/HowItWorks";
import { Comparison } from "@/components/Comparison";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { getWaitlistCount } from "@/lib/waitlistCount";

export const revalidate = 300; // 5 min — waitlist count freshness

export default async function Home() {
  const waitlistCount = await getWaitlistCount();

  return (
    <>
      <ScrollProgress />

      <StickyNav>
        <div className="shell">
          <nav className="nav">
            <div className="wordmark">
              SE<span className="seven">7</span>A
              <span className="arabic">{"صحة"}</span>
            </div>
            <div className="nav-tag">EAT SMART {"·"} TRAIN SMART</div>
          </nav>
        </div>
      </StickyNav>

      <div className="shell">
        {/* ─── HERO — split layout, particles + floating cards ────── */}
        <section className="hero hero-split">
          <Particles count={22} />
          <div className="hero-copy">
            <div className="hero-kicker">GULF-FIRST · AI FOOD &amp; FITNESS COACH</div>
            <StaggerText as="h1" className="hero-h1" step={70}>
              {"Honest ranges. "}
              <span className="gold">Not fake precision.</span>
            </StaggerText>
            <p className="hero-sub">
              SE7A scans your plate, ranks a restaurant menu against what you
              have left today, and generates a personalized 90-day plan.{" "}
              <strong>Every macro is a range.</strong> A photo can&apos;t see
              the oil {"—"} we don&apos;t pretend it can.
            </p>
            <Waitlist />
            {waitlistCount !== null && waitlistCount > 0 && (
              <div className="waitlist-social">
                <span className="waitlist-dot" />
                <span>
                  Join {waitlistCount.toLocaleString()}+ others waiting
                </span>
              </div>
            )}
          </div>
          <div className="hero-shot">
            <div className="hero-shot-wrap">
              <Image
                src="/screens/home.png"
                alt="SE7A Home tab showing the calorie ring, macros, and meal slots"
                width={280}
                height={520}
                className="phone"
                unoptimized
                priority
              />
              <FloatingCard
                pos="tr"
                kicker="RING · LIVE"
                title="2,236 kcal"
                sub="Remaining today"
                delay={0.4}
                accent
              />
              <FloatingCard
                pos="bl"
                kicker="STREAK"
                title="17 days"
                sub="Longest yet"
                delay={1.1}
              />
              <FloatingCard
                pos="r"
                title="+2 meals logged"
                sub="Ring updated in 0.5s"
                delay={1.8}
              />
            </div>
          </div>
        </section>

        {/* ─── TICKER ─────────────────────────────────────────────── */}
        <section className="ticker-band">
          <Marquee duration={36}>
            <span>HONEST RANGES</span>
            <span className="dot">·</span>
            <span>BILINGUAL EN + AR</span>
            <span className="dot">·</span>
            <span>HALAL BY DEFAULT</span>
            <span className="dot">·</span>
            <span>GULF-FIRST RECIPES</span>
            <span className="dot">·</span>
            <span>RAMADAN MODE</span>
            <span className="dot">·</span>
            <span>90-DAY PLAN</span>
            <span className="dot">·</span>
            <span>AI COACH</span>
            <span className="dot">·</span>
            <span>APPLE HEALTH · WHOOP · OURA</span>
            <span className="dot">·</span>
          </Marquee>
        </section>

        {/* ─── HOW IT WORKS ───────────────────────────────────────── */}
        <Reveal>
          <HowItWorks />
        </Reveal>

        {/* ─── FEATURE: LOG ───────────────────────────────────────── */}
        <Reveal>
          <section className="feature-row reverse">
            <div className="feature-copy">
              <div className="feature-num">01 {"—"} LOG</div>
              <h2>Any meal in three taps.</h2>
              <p>
                Snap a plate for honest macro ranges. Scan a menu before you
                order. Barcode a packaged good via Open Food Facts. Or type it
                in with AI food search that knows shawarma, kabsa, and Al Baik
                meals without a USDA database in sight.
              </p>
            </div>
            <div className="feature-shot has-cards">
              <Image
                src="/screens/log.png"
                alt="SE7A Log tab"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
              <FloatingCard
                pos="tl"
                kicker="AI FOOD SEARCH"
                title="chicken shawarma"
                sub="480–540 kcal · 28g protein"
                delay={0.6}
              />
              <FloatingCard
                pos="br"
                title="Al Baik meal"
                sub="Known · gulf chains"
                delay={1.3}
                accent
              />
            </div>
          </section>
        </Reveal>

        {/* ─── COACH ──────────────────────────────────────────────── */}
        <Reveal>
          <section className="coach-band">
            <div className="coach-copy">
              <div className="feature-num">02 {"—"} AI COACH</div>
              <h2>Knows your logs. Answers in your voice.</h2>
              <p>
                Ask about your food, workouts, or progress. The coach reads
                your actual profile, this week&apos;s meals, and the PRs you
                just hit. No generic ChatGPT boilerplate.
              </p>
            </div>
            <div className="coach-chat">
              <Reveal delay={150}>
                <div className="coach-bubble user">
                  Is shawarma OK for dinner tonight?
                </div>
              </Reveal>
              <Reveal delay={350}>
                <div className="coach-bubble bot">
                  You have 780 kcal left + 34g protein. A chicken shawarma
                  wrap (~500-620 kcal, 30-38g protein) fits with room for
                  laban. Skip the fries.
                </div>
              </Reveal>
              <Reveal delay={600}>
                <div className="coach-bubble user">My bench felt heavy today.</div>
              </Reveal>
              <Reveal delay={800}>
                <div className="coach-bubble bot">
                  Sleep was 5h Tuesday + 6h Wednesday per your Whoop pull.
                  Drop top set to 90% today, deload volume 20%. Full recovery
                  by Saturday.
                </div>
              </Reveal>
            </div>
          </section>
        </Reveal>

        {/* ─── FEATURE: PROGRESS ──────────────────────────────────── */}
        <Reveal>
          <section className="feature-row">
            <div className="feature-copy">
              <div className="feature-num">03 {"—"} PROGRESS</div>
              <h2>Trend over weeks, not any single day.</h2>
              <p>
                Weekly adherence, streak, weight trend, and a projection band
                that re-tunes your targets as the scale moves. Formula-driven,
                never guessed. Weekly weigh-ins keep the plan honest.
              </p>
            </div>
            <div className="feature-shot has-cards">
              <Image
                src="/screens/progress.png"
                alt="SE7A Progress tab"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
              <FloatingCard
                pos="tr"
                kicker="30-DAY Δ"
                title="−1.0 kg"
                sub="Trend, not day-to-day"
                delay={0.5}
                accent
              />
              <FloatingCard
                pos="bl"
                title="Adherence 43%"
                sub="Under the median · log 4+ days"
                delay={1.4}
              />
            </div>
          </section>
        </Reveal>

        {/* ─── 90-DAY PLAN ────────────────────────────────────────── */}
        <Reveal>
          <section className="plan-band">
            <PlanBandAccent />
            <div className="plan-band-copy">
              <div className="plan-band-kicker">90-DAY PLAN</div>
              <div className="plan-band-rule" />
              <h2>
                A personalized transformation blueprint.
                <span className="gold"> Buy once. Follow for 90 days.</span>
              </h2>
              <p>
                One AI-generated plan built from your profile + recent logs.
                Calorie + macro targets with weekly adjustment rules. A 7-day
                sample meal week with Gulf-friendly swaps. A weekly training
                schedule matched to your equipment + days available. Habit
                rules for hard scenarios. A week-by-week roadmap with monthly
                reviews.
              </p>
              <ul className="plan-bullets">
                <li>
                  <span className="mono">01</span> Personalized nutrition
                  rationale + weekly adjustment rules
                </li>
                <li>
                  <span className="mono">02</span> 7-day meal plan with swap
                  ideas + grocery staples
                </li>
                <li>
                  <span className="mono">03</span> N-day training split matched
                  to your gym / home setup
                </li>
                <li>
                  <span className="mono">04</span> Habits playbook for Ramadan,
                  travel, dining out
                </li>
                <li>
                  <span className="mono">05</span> Week-by-week roadmap over 13
                  weeks
                </li>
                <li>
                  <span className="mono">06</span> Weekly &ldquo;how you&rsquo;re
                  doing&rdquo; check-in auto-regenerated from your logs
                </li>
              </ul>
              <div className="plan-price">
                <span className="mono dim">19 AED once</span>
                <span className="dim">{"·"}</span>
                <span className="mono">or included with Pro Annual</span>
              </div>
            </div>
            <div className="plan-band-shot">
              <Image
                src="/screens/nutrients.png"
                alt="Detailed nutrients breakdown"
                width={280}
                height={575}
                className="phone"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── WHY SE7A / DIFFERENTIATORS ─────────────────────────── */}
        <Reveal>
          <section className="diff-band">
            <div className="diff-header">
              <div className="feature-num">04 {"—"} WHY SE7A</div>
              <h2>
                Not another tracker.{" "}
                <span className="gold">
                  Four things nobody else in this market does.
                </span>
              </h2>
            </div>
            <div className="diff-grid">
              <div className="diff-card">
                <div className="diff-num">01</div>
                <h3>Menu-scan before you order.</h3>
                <p>
                  Photograph a restaurant menu and get dishes ranked against
                  what you have left today {"—"} before the waiter arrives.
                  MyFitnessPal tells you what you ate <em>after</em> the damage
                  is done. We work one step earlier.
                </p>
              </div>
              <div className="diff-card">
                <div className="diff-num">02</div>
                <h3>Honest ranges, always.</h3>
                <p>
                  Every kcal and macro is a low–high band with a confidence
                  rating. A photo can&apos;t see the oil {"—"} we don&apos;t
                  pretend it can. No fake 3-decimal precision, no phantom
                  accuracy.
                </p>
              </div>
              <div className="diff-card">
                <div className="diff-num">03</div>
                <h3>Gulf-native, not translated.</h3>
                <p>
                  Machboos, kabsa, shawarma, and every Gulf chain recognized
                  by default. Halal-only suggestions. Ramadan reshapes the
                  whole app into suhoor/iftar windows. Full Arabic RTL — not
                  a Google-translated afterthought.
                </p>
              </div>
              <div className="diff-card">
                <div className="diff-num">04</div>
                <h3>A 90-day plan you buy once.</h3>
                <p>
                  A one-shot AI blueprint {"—"} nutrition, training, habits,
                  week-by-week roadmap {"—"} grounded in your actual profile
                  and last 30 days of logs. Not a monthly upsell treadmill.
                  19 AED once. Or included with Pro Annual.
                </p>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ─── COMPARISON ─────────────────────────────────────────── */}
        <Reveal>
          <Comparison />
        </Reveal>

        {/* ─── EDITORIAL STATS ────────────────────────────────────── */}
        <Reveal>
          <section className="stats-band">
            <div className="stat">
              <div className="stat-value">
                <CountUp to={17} />
              </div>
              <div className="stat-label">Achievements to earn</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={90} suffix=" DAYS" />
              </div>
              <div className="stat-label">Plan length</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={0.5} decimals={1} suffix="s" />
              </div>
              <div className="stat-label">Ring updates on log</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">
                <CountUp to={100} suffix="% HALAL" />
              </div>
              <div className="stat-label">Every suggestion</div>
            </div>
          </section>
        </Reveal>

        {/* ─── PHONE SHOWCASE ─────────────────────────────────────── */}
        <Reveal>
          <section className="showcase-band">
            <div className="showcase-header">
              <div className="feature-num">05 {"—"} EVERY SURFACE</div>
              <h2>A calm, native experience.</h2>
              <p>
                Home, Log, Progress, Calendar {"—"} one visual language
                across the whole app.
              </p>
            </div>
            <div className="showcase-phones">
              <Image
                src="/screens/log.png"
                alt="Log"
                width={200}
                height={410}
                className="phone showcase-phone showcase-phone-1"
                unoptimized
              />
              <Image
                src="/screens/home.png"
                alt="Home"
                width={220}
                height={410}
                className="phone showcase-phone showcase-phone-2"
                unoptimized
              />
              <Image
                src="/screens/foods.png"
                alt="Foods"
                width={220}
                height={410}
                className="phone showcase-phone showcase-phone-3"
                unoptimized
              />
              <Image
                src="/screens/calendar.png"
                alt="Calendar"
                width={200}
                height={410}
                className="phone showcase-phone showcase-phone-4"
                unoptimized
              />
            </div>
          </section>
        </Reveal>

        {/* ─── WEEKLY RITUAL ──────────────────────────────────────── */}
        <Reveal>
          <section className="ritual-band">
            <div className="ritual-copy">
              <div className="ritual-kicker">WEEKLY RITUAL</div>
              <h2>A pace you can actually keep.</h2>
              <p>
                SE7A meets you twice a week {"—"} once to reflect, once to
                plan. Streaks, checkpoints, and small anniversaries mark the
                distance so 90 days feels like a story, not a slog.
              </p>
            </div>
            <div className="ritual-cards">
              <Reveal delay={120}>
                <div className="ritual-card">
                  <div className="ritual-day">SUN {"·"} 18:00</div>
                  <div className="ritual-title">Weekly Review</div>
                  <div className="ritual-sub">
                    How the past 7 days went {"—"} adherence, streak, weight
                    trend, the coach&rsquo;s take.
                  </div>
                </div>
              </Reveal>
              <Reveal delay={240}>
                <div className="ritual-card">
                  <div className="ritual-day">MON {"·"} 09:00</div>
                  <div className="ritual-title">Plan Check-In</div>
                  <div className="ritual-sub">
                    What went well, what to change, and the week ahead in your
                    90-day plan.
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        </Reveal>

        {/* ─── PRICING ────────────────────────────────────────────── */}
        <Reveal>
          <Pricing />
        </Reveal>

        {/* ─── FAQ ────────────────────────────────────────────────── */}
        <Reveal>
          <FAQ />
        </Reveal>

        {/* ─── FINAL CTA ──────────────────────────────────────────── */}
        <Reveal>
          <section className="final-cta final-cta-bg">
            <Particles count={18} variant="cta" />
            <div className="hero-kicker">EARLY ACCESS</div>
            <StaggerText as="h2" className="final-h" step={80}>
              {"Be first "}
              <span className="gold">in line.</span>
            </StaggerText>
            <p className="final-sub">
              SE7A launches soon on iOS. Get on the waitlist to be one of the
              first in when it opens.
            </p>
            <Waitlist />
            <div className="app-badges">
              <div className="app-badge">
                <div className="app-badge-tag">COMING SOON TO</div>
                <div className="app-badge-store">App Store</div>
              </div>
              <div className="app-badge">
                <div className="app-badge-tag">COMING SOON TO</div>
                <div className="app-badge-store">Google Play</div>
              </div>
            </div>
          </section>
        </Reveal>

        <footer className="footer">
          <div className="footer-left">
            <div className="mono">SE7A {"©"} 2026 {"·"} DUBAI, UAE</div>
            <div className="footer-sub">
              Eat smart · Train smart · Built in the Gulf, for the Gulf.
            </div>
          </div>
          <div className="footer-right">
            <a href="mailto:hello@se7a.app">Support</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </footer>
      </div>
    </>
  );
}
